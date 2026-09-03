package com.meter.giga.worker

import android.Manifest
import android.app.Notification
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.pm.PackageManager
import android.location.Location
import androidx.core.app.ActivityCompat
import androidx.core.app.NotificationCompat
import androidx.work.CoroutineWorker
import androidx.work.ForegroundInfo
import androidx.work.WorkerParameters
import com.google.android.gms.location.FusedLocationProviderClient
import com.google.android.gms.location.LocationServices
import com.google.gson.Gson
import com.meter.giga.MainActivity
import com.meter.giga.R
import com.meter.giga.domain.entity.history.Geo
import com.meter.giga.domain.entity.history.GeoLocation
import com.meter.giga.domain.entity.request.ClientInfoRequestEntity
import com.meter.giga.domain.entity.request.ServerInfoRequestEntity
import com.meter.giga.domain.entity.response.ClientInfoResponseEntity
import com.meter.giga.domain.entity.response.ServerInfoResponseEntity
import com.meter.giga.domain.usecases.GetClientInfoUseCase
import com.meter.giga.domain.usecases.GetServerInfoUseCase
import com.meter.giga.domain.usecases.PostSpeedTestUseCase
import com.meter.giga.ionic_plugin.GigaAppPlugin
import com.meter.giga.network.util.NetworkCheckerImpl
import com.meter.giga.prefrences.AlarmSharedPref
import com.meter.giga.utils.AppLogger
import com.meter.giga.utils.Constants.DEVICE_TYPE_ANDROID
import com.meter.giga.utils.Constants.DEVICE_TYPE_CHROMEBOOK
import com.meter.giga.utils.Constants.NOTIFICATION_ID
import com.meter.giga.utils.Constants.SCHEDULE_TYPE
import com.meter.giga.utils.Constants.SCHEDULE_TYPE_DAILY
import com.meter.giga.utils.Constants.SPEED_TEST_CHANNEL_ID
import com.meter.giga.utils.DeviceInfo
import com.meter.giga.utils.GigaUtil
import com.meter.giga.utils.ResultState
import io.sentry.Sentry
import io.sentry.SentryLevel
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.async
import kotlinx.coroutines.delay
import kotlinx.coroutines.withContext
import net.measurementlab.ndt7.android.NDTTest
import net.measurementlab.ndt7.android.ServerDiscoveryHelper
import net.measurementlab.ndt7.android.models.ClientResponse
import net.measurementlab.ndt7.android.models.Measurement
import net.measurementlab.ndt7.android.utils.DataConverter
import okhttp3.OkHttpClient
import okhttp3.logging.HttpLoggingInterceptor
import java.util.concurrent.TimeUnit

/**
 * WorkManager-based replacement for NetworkTestService.
 *
 * Executes scheduled/manual speed tests as a foreground worker:
 * - Shows foreground notification
 * - Runs NDT7 download/upload test
 * - Collects client/server info
 * - Uploads result to backend
 * - Persists offline history
 * - Notifies Capacitor/Ionic UI
 */
class NetworkTestWorker(
  appContext: Context,
  params: WorkerParameters
) : CoroutineWorker(appContext, params) {

  private val context: Context = appContext
  private val prefs = AlarmSharedPref(context)

  private lateinit var fusedLocationClient: FusedLocationProviderClient
  private var currentLocation: Location? = null

  override suspend fun doWork(): Result = withContext(Dispatchers.IO) {
    // Initialize location client
    fusedLocationClient = LocationServices.getFusedLocationProviderClient(context)
    getLocation()

    val networkChecker = NetworkCheckerImpl(context)
    val scheduleType = inputData.getString(SCHEDULE_TYPE) ?: SCHEDULE_TYPE_DAILY

    if (!networkChecker.isNetworkAvailable()) {
      AppLogger.d("GIGA NetworkTestWorker", "Device is offline")
      Sentry.captureMessage("Device is offline, speed test skipped", SentryLevel.ERROR)
      GigaAppPlugin.sendNoNetworkError()
      return@withContext Result.failure()
    }

    if (prefs.isTestRunning) {
      AppLogger.d("GIGA NetworkTestWorker", "Speed test already running, skipping")
      return@withContext Result.success()
    }

    prefs.isTestRunning = true

    try {
      val appVersion = GigaUtil.getAppVersionName(context)
      val deviceInfo = GigaUtil.getDeviceInfo(context)
      val isRunningOnChromebook = GigaUtil.isRunningOnChromebook(context)

      val client = NDTTestImpl(
        createHttpClient(),
        scheduleType,
        appVersion,
        isRunningOnChromebook,
        prefs,
        deviceInfo
      )

      GigaAppPlugin.sendSpeedTestStarted()

      client.setServerDiscoveryHelper(object : ServerDiscoveryHelper {
        override fun onServerDiscovery() {
          AppLogger.d("GIGA NetworkTestWorker", "Server Discovery in progress")
          GigaAppPlugin.sendServerDiscoveryStarted()
        }

        override fun onServerChosen() {
          AppLogger.d("GIGA NetworkTestWorker", "Server Discovered")
          GigaAppPlugin.sendServerDiscoveryCompleted()
        }
      })

      client.startTest(NDTTest.TestType.DOWNLOAD_AND_UPLOAD)

      // The actual test runs in callbacks; we wait until test completes via flags
      // NDTTestImpl will call publishSpeedTestData() and then stop itself.
      // Here we just wait for completion via prefs or internal flags.
      // For simplicity, we assume when publishSpeedTestData finishes, it sets isTestRunning = false.

      // Wait until test completes (with timeout)
      val timeout = 2 * 60 * 1000L // 2 minutes max
      val start = System.currentTimeMillis()
      while (prefs.isTestRunning && (System.currentTimeMillis() - start) < timeout) {
        delay(500)
      }

      if (prefs.isTestRunning) {
        // Timeout: force mark as done
        prefs.isTestRunning = false
        Sentry.captureMessage("Speed test timed out", SentryLevel.ERROR)
      }

      Result.success()
    } catch (e: Exception) {
      prefs.isTestRunning = false
      Sentry.captureException(e)
      GigaAppPlugin.sendSpeedTestCompletedWithError(null, null)
      Result.failure()
    }
  }

  override suspend fun getForegroundInfo(): ForegroundInfo {
    val notification = createNotification("Starting speed test...")
    return ForegroundInfo(NOTIFICATION_ID, notification)
  }

  private fun getLocation() {
    if (ActivityCompat.checkSelfPermission(
        context,
        Manifest.permission.ACCESS_FINE_LOCATION
      ) != PackageManager.PERMISSION_GRANTED
    ) {
      AppLogger.d("LOCATION", "No Permissions in Worker")
      return
    }

    fusedLocationClient.lastLocation
      .addOnSuccessListener { location: Location? ->
        location?.let {
          currentLocation = it
          AppLogger.d(
            "LOCATION",
            "Worker Lat: ${it.latitude} Lng: ${it.longitude}"
          )
        }
      }
  }

  private fun createNotification(content: String): Notification {


    val intent = android.content.Intent(context, MainActivity::class.java).apply {
      flags = android.content.Intent.FLAG_ACTIVITY_NEW_TASK or
        android.content.Intent.FLAG_ACTIVITY_CLEAR_TASK
    }

    val pendingIntent = PendingIntent.getActivity(
      context,
      0,
      intent,
      PendingIntent.FLAG_UPDATE_CURRENT or
        PendingIntent.FLAG_IMMUTABLE
    )

    val largeBitmap = android.graphics.BitmapFactory.decodeResource(
      context.resources,
      R.mipmap.ic_launcher_round
    )

    return NotificationCompat.Builder(context, SPEED_TEST_CHANNEL_ID)
      .setContentTitle(context.getString(R.string.notification_header))
      .setContentText(content)
      .setSmallIcon(R.mipmap.ic_launcher_round)
      .setLargeIcon(largeBitmap)
      .setOngoing(true)
      .setOnlyAlertOnce(true)
      .setPriority(NotificationCompat.PRIORITY_HIGH)
      .setContentIntent(pendingIntent)
      .build()
  }

  private fun createHttpClient(
    connectTimeout: Long = 12,
    readTimeout: Long = 12,
    writeTimeout: Long = 12
  ): OkHttpClient {
    val interceptor = HttpLoggingInterceptor()
    interceptor.level = HttpLoggingInterceptor.Level.NONE
    return OkHttpClient.Builder()
      .connectTimeout(connectTimeout, TimeUnit.SECONDS)
      .readTimeout(readTimeout, TimeUnit.SECONDS)
      .writeTimeout(writeTimeout, TimeUnit.SECONDS)
      .addInterceptor(interceptor)
      .build()
  }

  /**
   * Inner NDTTest implementation, same logic as in NetworkTestService,
   * but adapted to Worker (no LifecycleService, no lifecycleScope).
   */
  inner class NDTTestImpl(
    okHttpClient: OkHttpClient?,
    private val scheduleType: String,
    private val appVersion: String,
    private val isRunningOnChromebook: Boolean,
    private val prefs: AlarmSharedPref,
    private val deviceInfo: DeviceInfo,
  ) : NDTTest(okHttpClient) {

    var downloadSpeed = 0.0
    var uploadSpeed = 0.0
    var lastDownloadMeasurement: Measurement? = null
    var lastUploadMeasurement: Measurement? = null
    var lastDownloadResponse: ClientResponse? = null
    var lastUploadResponse: ClientResponse? = null
    var allDoneInvoked = 0

    private val schoolId = prefs.schoolId
    private val deviceHardwareId = prefs.deviceHardwareId
    private val gigaSchoolId = prefs.gigaSchoolId
    private val browserId = prefs.browserId
    private val ipAddress = prefs.ipAddress
    private val countryCode = prefs.countryCode
    private val baseUrl = prefs.baseUrl
    private val uploadKey = prefs.mlabUploadKey
    private val ipInfoToken = prefs.ipInfoToken

    private val s2cRate = arrayListOf<Double>()
    private val c2sRate = arrayListOf<Double>()

    override fun onMeasurementDownloadProgress(measurement: Measurement) {
      super.onMeasurementDownloadProgress(measurement)
      AppLogger.d("GIGA NetworkTestWorker", "Download progress: $measurement")
      lastDownloadMeasurement = measurement
    }

    override fun onMeasurementUploadProgress(measurement: Measurement) {
      super.onMeasurementUploadProgress(measurement)
      AppLogger.d("GIGA NetworkTestWorker", "Upload progress: $measurement")
      lastUploadMeasurement = measurement
    }

    override fun onDownloadProgress(clientResponse: ClientResponse) {
      super.onDownloadProgress(clientResponse)
      val speed = DataConverter.convertToMbps(clientResponse)
      downloadSpeed = speed.toDouble()

      val msg = "DL: %.2f Mbps | UL: %.2f Mbps".format(downloadSpeed, uploadSpeed)
      lastDownloadResponse = clientResponse

      updateNotification(msg)
      GigaAppPlugin.sendSpeedUpdate(downloadSpeed, uploadSpeed, "download")

      var meanDownloadClientMbps: Double? = null
      clientResponse.appInfo.let {
        meanDownloadClientMbps = if (it.elapsedTime == 0L) {
          0.0
        } else {
          val value = (it.numBytes / (it.elapsedTime / 1000)) * 0.008
          if (value.isInfinite()) {
            AppLogger.d("GIGA", "Got infinite value in download")
            0.0
          } else {
            value
          }
        }
      }
      meanDownloadClientMbps?.let { s2cRate.add(it) }
    }

    override fun onUploadProgress(clientResponse: ClientResponse) {
      super.onUploadProgress(clientResponse)
      val speed = DataConverter.convertToMbps(clientResponse)
      uploadSpeed = speed.toDouble()

      val msg = "DL: %.2f Mbps | UL: %.2f Mbps".format(downloadSpeed, uploadSpeed)
      lastUploadResponse = clientResponse

      updateNotification(msg)
      GigaAppPlugin.sendSpeedUpdate(downloadSpeed, uploadSpeed, "upload")

      var meanUploadClientMbps: Double? = null
      clientResponse.appInfo.let {
        meanUploadClientMbps = if (it.elapsedTime == 0L) {
          0.0
        } else {
          val value = (it.numBytes / (it.elapsedTime / 1000)) * 0.008
          if (value.isInfinite()) {
            AppLogger.d("GIGA", "Got infinite value in upload")
            0.0
          } else {
            value
          }
        }
      }
      meanUploadClientMbps?.let { c2sRate.add(it) }
    }

    override fun onFinished(
      clientResponse: ClientResponse?,
      error: Throwable?,
      testType: TestType
    ) {
      super.onFinished(clientResponse, error, testType)

      if (error != null && error.message != null) {
        Sentry.captureMessage("$testType Failed Message: ${error.message}", SentryLevel.ERROR)
        Sentry.captureMessage("$testType Failed Cause: ${error.cause}", SentryLevel.ERROR)
      }

      try {
        val speed = clientResponse?.let { DataConverter.convertToMbps(it) }
        AppLogger.d("GIGA NetworkTestWorker", "ALL DONE: $speed")
        allDoneInvoked++
        AppLogger.d("GIGA NetworkTestWorker", "ALL DONE count: $allDoneInvoked")

        if (allDoneInvoked == 2) {
          publishSpeedTestData(scheduleType, appVersion, isRunningOnChromebook)
          // isTestRunning will be set to false inside uploadSpeedTestData paths
        }
      } catch (e: Exception) {
        Sentry.captureException(e)
      }
    }

    private fun publishSpeedTestData(
      scheduleType: String,
      appVersion: String,
      isRunningOnChromebook: Boolean
    ) {
      AppLogger.d("GIGA NetworkTestWorker", "publishSpeedTestData invoked")

      kotlinx.coroutines.runBlocking {
        try {
          val getClientInfoUseCase = GetClientInfoUseCase()
          val clientInfoState = async {
            runCatching {
              getClientInfoUseCase.invoke(ipInfoToken, uploadKey, baseUrl)
            }.getOrNull()
          }

          val getServerInfoUseCase = GetServerInfoUseCase()
          val serverInfoState = async {
            runCatching { getServerInfoUseCase.invoke(null) }.getOrNull()
          }

          val clientInfo = clientInfoState.await()
          val serverInfo = serverInfoState.await()

          var clientInfoResponse: ClientInfoResponseEntity? = null
          var serverInfoResponse: ServerInfoResponseEntity? = null
          var clientInfoRequest: ClientInfoRequestEntity? = null
          var serverInfoRequest: ServerInfoRequestEntity? = null

          if (clientInfo != null) {
            when (clientInfo) {
              is ResultState.Success<*> -> {
                clientInfoResponse = clientInfo.data as ClientInfoResponseEntity
                val location = clientInfoResponse.loc?.split(",")
                var latitude = 0.0
                var longitude = 0.0

                if (location?.isNotEmpty() == true && location.size > 1) {
                  latitude = location[0].toDouble()
                  longitude = location[1].toDouble()
                }

                clientInfoRequest = ClientInfoRequestEntity(
                  asn = clientInfoResponse.asn,
                  city = clientInfoResponse.city,
                  country = clientInfoResponse.country,
                  hostname = clientInfoResponse.ip,
                  ip = clientInfoResponse.ip,
                  isp = clientInfoResponse.isp,
                  latitude = latitude,
                  longitude = longitude,
                  postal = clientInfoResponse.postal,
                  region = clientInfoResponse.region,
                  timezone = clientInfoResponse.timezone
                )
              }

              is ResultState.Failure -> {
                AppLogger.d(
                  "GIGA NetworkTestWorker",
                  "Get Client Info API Failed: ${clientInfo.error}"
                )
                Sentry.captureMessage("Client Info Fetch Failed", SentryLevel.ERROR)
              }

              ResultState.Loading -> {}
            }
          }

          if (serverInfo != null) {
            when (serverInfo) {
              is ResultState.Success<*> -> {
                serverInfoResponse = serverInfo.data as ServerInfoResponseEntity
                serverInfoRequest = ServerInfoRequestEntity(
                  city = serverInfoResponse.city?.replace('_', ' ') ?: "",
                  country = serverInfoResponse.country,
                  fQDN = serverInfoResponse.fqdn,
                  iPv4 = serverInfoResponse.ipv4,
                  iPv6 = serverInfoResponse.ipv6,
                  label = serverInfoResponse.label,
                  metro = serverInfoResponse.metro,
                  site = serverInfoResponse.site,
                  uRL = serverInfoResponse.url
                )
              }

              is ResultState.Failure -> {
                AppLogger.d(
                  "GIGA NetworkTestWorker",
                  "Get Server Info API Failed: ${serverInfo.error}"
                )
                Sentry.captureMessage("Server Info Fetch Failed", SentryLevel.ERROR)
              }

              ResultState.Loading -> {}
            }
          }

          uploadSpeedTestData(
            clientInfoRequest,
            serverInfoRequest,
            clientInfoResponse,
            serverInfoResponse
          )
        } catch (e: Exception) {
          Sentry.captureException(e)
          if (lastUploadMeasurement != null &&
            lastDownloadMeasurement != null &&
            lastUploadResponse != null &&
            lastDownloadResponse != null
          ) {
            uploadSpeedTestData(null, null, null, null)
          } else {
            Sentry.captureException(e)
            updateNotification("Speed test measurements not available, please try again.")
            GigaAppPlugin.sendSpeedTestCompletedWithError(null, null)
            prefs.isTestRunning = false
          }
        }
      }
    }

    private suspend fun uploadSpeedTestData(
      clientInfoRequest: ClientInfoRequestEntity?,
      serverInfoRequest: ServerInfoRequestEntity?,
      clientInfoResponse: ClientInfoResponseEntity?,
      serverInfoResponse: ServerInfoResponseEntity?
    ) {
      if (lastUploadMeasurement == null ||
        lastDownloadMeasurement == null ||
        lastUploadResponse == null ||
        lastDownloadResponse == null
      ) {
        Sentry.captureMessage(
          "Speed Test Failed with Download Measurements: $lastDownloadMeasurement " +
            "and Upload Measurements: $lastUploadMeasurement",
          SentryLevel.ERROR
        )
        updateNotification("Speed test measurements not available, please try again.")
        GigaAppPlugin.sendSpeedTestCompletedWithError(null, null)
        prefs.isTestRunning = false
        return
      }

      val speedTestResultRequestEntity = GigaUtil.createSpeedTestPayload(
        lastUploadMeasurement,
        lastDownloadMeasurement,
        clientInfoRequest,
        serverInfoRequest,
        schoolId,
        gigaSchoolId,
        appVersion,
        scheduleType,
        if (isRunningOnChromebook) DEVICE_TYPE_CHROMEBOOK else DEVICE_TYPE_ANDROID,
        browserId,
        countryCode,
        ipAddress,
        lastDownloadResponse,
        lastUploadResponse,
        deviceHardwareId,
        geo = if (currentLocation != null) {
          Geo(
            geoLocation = GeoLocation(
              lat = currentLocation!!.latitude,
              lng = currentLocation!!.longitude
            ),
            accuracy = currentLocation!!.accuracy,
            timestamp = currentLocation!!.time
          )
        } else null,
        deviceInfo
      )

      val existingSpeedTestData = prefs.oldSpeedTestData
      val historyDataIndex = prefs.historyDataIndex
      val deviceId = prefs.deviceHardwareId

      val measurementsItem = GigaUtil.getMeasurementItem(
        clientInfoResponse = clientInfoResponse,
        c2sLastServerManagement = lastUploadMeasurement,
        s2cLastServerManagement = lastDownloadMeasurement,
        serverInfoResponse = serverInfoResponse,
        scheduleType = scheduleType,
        results = speedTestResultRequestEntity?.results,
        c2sRate = c2sRate,
        s2cRate = s2cRate,
        historyDataIndex,
        currentLocation,
        deviceId,
        deviceInfo
      )

      prefs.historyDataIndex = historyDataIndex + 1

      val postSpeedTestUseCase = PostSpeedTestUseCase()

      if (speedTestResultRequestEntity != null) {
        try {
          val postSpeedTestResultState =
            postSpeedTestUseCase.invoke(speedTestResultRequestEntity, uploadKey, baseUrl)

          when (postSpeedTestResultState) {
            is ResultState.Failure -> {
              AppLogger.d(
                "GIGA NetworkTestWorker",
                "Speed Test Not Published Successfully Due to ${postSpeedTestResultState.error}"
              )
              measurementsItem.uploaded = false
              measurementsItem.synced = false

              val updateSpeedTestData = GigaUtil.addJsonItem(
                existingSpeedTestData,
                Gson().toJson(measurementsItem)
              )
              prefs.oldSpeedTestData = updateSpeedTestData

              Sentry.captureMessage("Failed to sync speed test data", SentryLevel.ERROR)
              updateNotification("Failed to sync speed test data.")
              GigaAppPlugin.sendSpeedTestCompletedWithError(
                speedTestResultRequestEntity,
                measurementsItem
              )
            }

            ResultState.Loading -> {}

            is ResultState.Success<*> -> {
              AppLogger.d(
                "GIGA NetworkTestWorker",
                "Speed Test Data Published Successfully"
              )
              measurementsItem.uploaded = true
              measurementsItem.synced = true

              val updateSpeedTestData = GigaUtil.addJsonItem(
                existingSpeedTestData,
                Gson().toJson(measurementsItem)
              )
              prefs.oldSpeedTestData = updateSpeedTestData

              GigaAppPlugin.sendSpeedTestCompleted(
                speedTestResultRequestEntity,
                measurementsItem
              )
            }
          }
        } catch (e: Exception) {
          measurementsItem.uploaded = false
          measurementsItem.synced = false
          val updateSpeedTestData = GigaUtil.addJsonItem(
            existingSpeedTestData,
            Gson().toJson(measurementsItem)
          )
          prefs.oldSpeedTestData = updateSpeedTestData

          GigaAppPlugin.sendSpeedTestCompletedWithError(
            speedTestResultRequestEntity,
            measurementsItem
          )
          Sentry.captureException(e)
        }
      } else {
        measurementsItem.uploaded = false
        measurementsItem.synced = false
        val updateSpeedTestData = GigaUtil.addJsonItem(
          existingSpeedTestData,
          Gson().toJson(measurementsItem)
        )
        prefs.oldSpeedTestData = updateSpeedTestData

        GigaAppPlugin.sendSpeedTestCompletedWithError(
          speedTestResultRequestEntity,
          measurementsItem
        )
        Sentry.captureMessage(
          "Failed to generate the speed test upload payload",
          SentryLevel.ERROR
        )
      }

      prefs.isTestRunning = false
      updateNotification("Speed test completed")
      delay(5000)
      AppLogger.d("GIGA NetworkTestWorker", "Speed Test Completed")
    }

    private fun updateNotification(content: String) {
      val manager = context.getSystemService(Context.NOTIFICATION_SERVICE)
        as NotificationManager
      manager.notify(NOTIFICATION_ID, createNotification(content))
    }
  }
}
