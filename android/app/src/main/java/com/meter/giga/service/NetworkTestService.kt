package com.meter.giga.service

import android.Manifest
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.BitmapFactory
import android.location.Location
import android.util.Log
import androidx.core.app.ActivityCompat
import androidx.core.app.NotificationCompat
import androidx.lifecycle.LifecycleService
import androidx.lifecycle.lifecycleScope
import com.google.android.gms.location.FusedLocationProviderClient
import com.google.android.gms.location.LocationServices
import com.google.gson.Gson
import com.meter.giga.MainActivity
import com.meter.giga.R
import com.meter.giga.domain.entity.history.Geo
import com.meter.giga.domain.entity.history.GeoLocation
import com.meter.giga.domain.entity.request.ClientInfoRequestEntity
import com.meter.giga.domain.entity.request.ServerInfoRequestEntity
import com.meter.giga.domain.entity.request.SpeedTestResultRequestEntity
import com.meter.giga.domain.entity.response.ClientInfoResponseEntity
import com.meter.giga.domain.entity.response.ServerInfoResponseEntity
import com.meter.giga.domain.usecases.GetClientInfoUseCase
import com.meter.giga.domain.usecases.GetServerInfoUseCase
import com.meter.giga.domain.usecases.PostSpeedTestUseCase
import com.meter.giga.ionic_plugin.GigaAppPlugin
import com.meter.giga.network.util.NetworkCheckerImpl
import com.meter.giga.prefrences.AlarmSharedPref
// import com.meter.giga.prefrences.AlarmSharedPref
//import com.meter.giga.prefrences.SecureDataStore
import com.meter.giga.utils.AppLogger
import com.meter.giga.utils.Constants.DEVICE_TYPE_ANDROID
import com.meter.giga.utils.Constants.DEVICE_TYPE_CHROMEBOOK
import com.meter.giga.utils.Constants.FOREGROUND_SERVICE_TAG
import com.meter.giga.utils.Constants.NOTIFICATION_ID
import com.meter.giga.utils.Constants.SCHEDULE_TYPE
import com.meter.giga.utils.Constants.SCHEDULE_TYPE_DAILY
import com.meter.giga.utils.Constants.SPEED_TEST_CHANNEL_ID
import com.meter.giga.utils.GigaUtil
import com.meter.giga.utils.ResultState
import io.sentry.Sentry
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.async
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import net.measurementlab.ndt7.android.NDTTest
import net.measurementlab.ndt7.android.ServerDiscoveryHelper
import net.measurementlab.ndt7.android.models.ClientResponse
import net.measurementlab.ndt7.android.models.Measurement
import net.measurementlab.ndt7.android.utils.DataConverter
import okhttp3.OkHttpClient
import okhttp3.logging.HttpLoggingInterceptor
import java.util.concurrent.TimeUnit
import kotlin.jvm.java
import kotlin.let
import kotlin.text.format
import kotlin.text.toDouble

/**
 * NetworkTestService is a foreground service responsible for executing
 * scheduled and manual internet speed tests using the NDT7 library.
 *
 * Responsibilities:
 * - Execute upload/download speed tests
 * - Maintain foreground execution
 * - Publish real-time progress updates
 * - Upload measurements to backend APIs
 * - Persist offline measurement history
 * - Send updates to Capacitor/Ionic UI
 * - Collect client/server metadata
 *
 * The service uses Kotlin coroutines, Retrofit, OkHttp,
 * and Android lifecycle-aware components.
 */
class NetworkTestService : LifecycleService() {
  /**
   * Class level boolean variable, keeps state as Foreground service is running
   */
  private var isRunning = true

  /**
   * SupervisorJob instance used to execute multiple api calls in parallel without
   * terminating any api call if any other api call fails
   */
  private val serviceJob = SupervisorJob()

  /**
   * CoroutineScope instance used to define the thread on which the api calls
   * should execute, standard is perform api calls on IO thread, avoid Main thread
   */
  private val serviceScope = CoroutineScope(Dispatchers.IO + serviceJob)

  private lateinit var fusedLocationClient: FusedLocationProviderClient
  private var currentLocation: Location? = null

  /**
   * Initializes the foreground service.
   *
   * Responsibilities:
   * - Initialize fused location provider
   * - Retrieve last known location
   * - Create notification channel
   */
  override fun onCreate() {
    super.onCreate()
    fusedLocationClient = LocationServices.getFusedLocationProviderClient(this)
    getLocation()
    createNotificationChannel()
  }

  /**
   * Retrieves the device's last known location.
   *
   * Uses FusedLocationProviderClient to obtain
   * latitude and longitude if location permissions
   * are granted.
   */
  private fun getLocation() {

    if (ActivityCompat.checkSelfPermission(
        this,
        Manifest.permission.ACCESS_FINE_LOCATION
      ) != PackageManager.PERMISSION_GRANTED
    ) {
      AppLogger.d("LOCATION", "No Permissions")

      return
    }

    fusedLocationClient.lastLocation
      .addOnSuccessListener { location: Location? ->
        location?.let {
          val latitude = it.latitude
          val longitude = it.longitude
          currentLocation = location
          AppLogger.d("LOCATION", "Lat: $latitude Lng: $longitude")
        }
      }
  }

  /**
   * Entry point of the foreground service.
   *
   * Starts the NDT7 speed test after validating:
   * - Internet connectivity
   * - Existing running state
   *
   * Also initializes notifications and registers
   * speed test callbacks.
   *
   * @param intent Intent containing schedule type
   * @param flags Service flags
   * @param startId Unique start request id
   *
   * @return START_STICKY to allow Android to recreate service
   */
  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    super.onStartCommand(intent, flags, startId)
    startForeground(NOTIFICATION_ID, createNotification("Starting speed test..."))
    val networkChecker = NetworkCheckerImpl(this)
    val prefs = AlarmSharedPref(this)
    if (networkChecker.isNetworkAvailable() && !prefs.isTestRunning) {
      AppLogger.d("GIGA NetworkTestService ", "Device is online")

      try {
        // Example logging
        Sentry.captureMessage("Foreground Service started")

//        secureDataStore = SecureDataStore(this)
        val scheduleType = intent?.getStringExtra(SCHEDULE_TYPE) ?: SCHEDULE_TYPE_DAILY
        AppLogger.d("GIGA NetworkTestService SCHEDULE_TYPE", scheduleType)
        val appVersion = GigaUtil.getAppVersionName(this)
        val isRunningOnChromebook = GigaUtil.isRunningOnChromebook(this)
        prefs.isTestRunning = true
        val client = NDTTestImpl(
          createHttpClient(),
          scheduleType,
          appVersion,
          isRunningOnChromebook,
          prefs
        )
        GigaAppPlugin.sendSpeedTestStarted()
        client.setServerDiscoveryHelper(object : ServerDiscoveryHelper {
          override fun onServerDiscovery() {
            AppLogger.d("GIGA NetworkTestService Server Discovery", "Server Discovery in progress")
            GigaAppPlugin.sendServerDiscoveryStarted()
          }

          override fun onServerChosen() {
            AppLogger.d("GIGA NetworkTestService Server Discovery", "Server Discovered")
            GigaAppPlugin.sendServerDiscoveryCompleted()
          }

        })
        client.startTest(NDTTest.TestType.DOWNLOAD_AND_UPLOAD)
      } catch (e: Exception) {
        Sentry.captureException(e)
      }
    } else {
      if (!networkChecker.isNetworkAvailable()) {
        AppLogger.d("GIGA NetworkTestService ", "Device is offline")
        Sentry.captureMessage("Device is offline, speed test skipped")
        updateNotification("Device is offline, please check internet connectivity")
        GigaAppPlugin.sendNoNetworkError()
      } else if (prefs.isTestRunning) {
        AppLogger.d("GIGA NetworkTestService ", "Already Speed Test Executing")
        Sentry.captureMessage("Already Speed Test Executing")
      } else {
        AppLogger.d("GIGA NetworkTestService ", "Device is offline")
        Sentry.captureMessage("speed test skipped")
        updateNotification("Speed test skipped")
      }
    }
    return START_STICKY
  }

  /**
   * Creates foreground service notification.
   *
   * @param content Dynamic notification message
   * @return Configured Notification instance
   */
  private fun createNotification(content: String): Notification {
    val intent = Intent(this, MainActivity::class.java).apply {
      flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TASK
    }

    val pendingIntent = PendingIntent.getActivity(
      this,
      0,
      intent,
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
    )
    val largeBitmap = BitmapFactory.decodeResource(
      resources,
      R.mipmap.ic_launcher_round
    )
    return NotificationCompat.Builder(this, SPEED_TEST_CHANNEL_ID)
      .setContentTitle(this.applicationContext.getString(R.string.notification_header))
      .setContentText(content)
      .setSmallIcon(R.mipmap.ic_launcher_round)
      .setLargeIcon(largeBitmap)
      .setOngoing(true)
      .setOnlyAlertOnce(true)
      .setPriority(NotificationCompat.PRIORITY_HIGH)
      .setContentIntent(pendingIntent)
      .build()
  }

  /**
   * Updates the foreground notification content.
   *
   * Used to display live speed test progress.
   *
   * @param content Notification message
   */
  private fun updateNotification(content: String) {
    val manager = getSystemService(NOTIFICATION_SERVICE) as NotificationManager
    manager.notify(NOTIFICATION_ID, createNotification(content))
  }

  /**
   * Creates notification channel required for
   * Android foreground service notifications.
   */
  private fun createNotificationChannel() {
    val channel = NotificationChannel(
      SPEED_TEST_CHANNEL_ID, FOREGROUND_SERVICE_TAG,
      NotificationManager.IMPORTANCE_LOW
    )
    val manager = getSystemService(NotificationManager::class.java)
    manager.createNotificationChannel(channel)
  }

  override fun onDestroy() {
    isRunning = false
    AppLogger.d("GIGA NetworkTestService", "Stop Command")

    super.onDestroy()
  }


  /**
   * Creates configured OkHttp client instance
   * used by NDT7 library.
   *
   * @param connectTimeout Connection timeout in seconds
   * @param readTimeout Read timeout in seconds
   * @param writeTimeout Write timeout in seconds
   *
   * @return Configured OkHttpClient
   */
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
   * Custom implementation of NDTTest.
   *
   * Handles:
   * - Download/upload callbacks
   * - Measurement tracking
   * - Speed calculations
   * - Backend synchronization
   * - UI event communication
   */
  inner class NDTTestImpl(
    okHttpClient: OkHttpClient?,
    private val scheduleType: String,
    private val appVersion: String,
    private val isRunningOnChromebook: Boolean,
    private val prefs: AlarmSharedPref,
  ) :
    NDTTest(okHttpClient) {
    var downloadSpeed = 0.0;
    var uploadSpeed = 0.0;
    var lastDownloadMeasurement: Measurement? = null//GigaUtil.getDefaultMeasurements()
    var lastUploadMeasurement: Measurement? = null//GigaUtil.getDefaultMeasurements()
    var lastDownloadResponse: ClientResponse? = null//GigaUtil.getDefaultClientInfo("download")
    var lastUploadResponse: ClientResponse? = null//GigaUtil.getDefaultClientInfo("upload")
    var allDoneInvoked: Int = 0
    var schoolId = prefs.schoolId
    var deviceHardwareId = prefs.deviceHardwareId
    var gigaSchoolId = prefs.gigaSchoolId
    var browserId = prefs.browserId
    var ipAddress = prefs.ipAddress
    var countryCode = prefs.countryCode
    var baseUrl = prefs.baseUrl
    val uploadKey = prefs.mlabUploadKey
    var ipInfoToken = prefs.ipInfoToken
    val s2cRate = arrayListOf<Double>()
    val c2sRate = arrayListOf<Double>()

    /**
     * Callback function implementation when download measurement are available
     * @param measurement : Measurement instance contains data related to DOWNLOAD measurement
     */
    override fun onMeasurementDownloadProgress(measurement: Measurement) {
      super.onMeasurementDownloadProgress(measurement)
      AppLogger.d(
        "GIGA NetworkTestService",
        "DownLoad progress onMeasurementDownloadProgress: $measurement"
      )
      lastDownloadMeasurement = measurement
    }

    /**
     * Callback function implementation for upload measurement are available
     * @param measurement : Measurement instance contains data related to UPLOAD measurement
     */
    override fun onMeasurementUploadProgress(measurement: Measurement) {
      super.onMeasurementUploadProgress(measurement)
      AppLogger.d(
        "GIGA NetworkTestService",
        "Upload progress onMeasurementUploadProgress: $measurement"
      )
      lastUploadMeasurement = measurement
    }

    /**
     * Called continuously during download test.
     *
     * Calculates current download speed,
     * updates foreground notification,
     * and notifies Ionic UI.
     *
     * @param clientResponse Current client response snapshot
     */
    override fun onDownloadProgress(clientResponse: ClientResponse) {
      super.onDownloadProgress(clientResponse)
      AppLogger.d("GIGA NetworkTestService", "download progress: $clientResponse")

      val speed = DataConverter.convertToMbps(clientResponse)
      downloadSpeed = speed.toDouble()
      AppLogger.d("GIGA NetworkTestService", "uploadSpeed speed: $uploadSpeed")
      AppLogger.d("GIGA NetworkTestService", "downloadSpeed speed: $downloadSpeed")
      val msg = "DL: %.2f Mbps | UL: %.2f Mbps".format(downloadSpeed, uploadSpeed)
      lastDownloadResponse = clientResponse
      updateNotification(msg)
      var meanDownloadClientMbps: Double? = null
      clientResponse.appInfo.let {
        meanDownloadClientMbps = if (it.elapsedTime == 0L) {
          0.0
        } else {
          if ((it.numBytes / (it.elapsedTime / 1000)).isInfinite()) {
            AppLogger.d("GIGA", "Got infinite value")
            0.0
          } else {
            (it.numBytes / (it.elapsedTime / 1000)) * 0.008
          }
        }
      }
      meanDownloadClientMbps?.let {
        s2cRate.add(meanDownloadClientMbps)
      }
      GigaAppPlugin.sendSpeedUpdate(downloadSpeed, uploadSpeed, "download")
    }

    /**
     * Called continuously during upload test.
     *
     * Calculates upload speed,
     * updates foreground notification,
     * and publishes progress to UI.
     *
     * @param clientResponse Current upload response snapshot
     */
    override fun onUploadProgress(clientResponse: ClientResponse) {
      super.onUploadProgress(clientResponse)
      AppLogger.d("GIGA NetworkTestService", "upload stuff: $clientResponse")

      val speed = DataConverter.convertToMbps(clientResponse)
      uploadSpeed = speed.toDouble();
      AppLogger.d("GIGA NetworkTestService", "uploadSpeed speed: $uploadSpeed")
      AppLogger.d("GIGA NetworkTestService", "downloadSpeed speed: $downloadSpeed")
      val msg = "DL: %.2f Mbps | UL: %.2f Mbps".format(downloadSpeed, uploadSpeed)
      lastUploadResponse = clientResponse
      updateNotification(msg)
      var meanUploadClientMbps: Double? = null
      clientResponse.appInfo.let {
        meanUploadClientMbps = if (it.elapsedTime == 0L) {
          0.0
        } else {
          if ((it.numBytes / (it.elapsedTime / 1000)).isInfinite()) {
            AppLogger.d("GIGA", "Got infinite value")
            0.0
          } else {
            (it.numBytes / (it.elapsedTime / 1000)) * 0.008
          }
        }
      }
      meanUploadClientMbps?.let {
        c2sRate.add(meanUploadClientMbps)
      }
      GigaAppPlugin.sendSpeedUpdate(downloadSpeed, uploadSpeed, "upload")
    }

    /**
     * Called when upload/download test finishes.
     *
     * Once both tests complete, triggers
     * result payload generation and backend upload.
     *
     * @param clientResponse Final response
     * @param error Throwable if failure occurs
     * @param testType Upload or Download test type
     */
    override fun onFinished(
      clientResponse: ClientResponse?,
      error: Throwable?,
      testType: TestType
    ) {
      super.onFinished(clientResponse, error, testType)
      try {
        val speed = clientResponse?.let { DataConverter.convertToMbps(it) }
        AppLogger.d("GIGA NetworkTestService", "ALL DONE: $speed ")
        allDoneInvoked = allDoneInvoked + 1
        AppLogger.d("GIGA NetworkTestService", "ALL DONE: $allDoneInvoked ")
        if (allDoneInvoked == 2) {
          publishSpeedTestData(
            scheduleType,
            appVersion,
            isRunningOnChromebook,
          )
          prefs.isTestRunning = false
          allDoneInvoked = 0
        }
      } catch (e: Exception) {
        Sentry.captureException(e)
      }
    }

    /**
     * Fetches required metadata and prepares
     * speed test payload for backend upload.
     *
     * Retrieves:
     * - Client information
     * - Server information
     * - Device metadata
     * - Measurement statistics
     *
     * @param scheduleType Trigger source type
     * @param appVersion Current application version
     * @param isRunningOnChromebook Chromebook state flag
     */
    private fun publishSpeedTestData(
      scheduleType: String,
      appVersion: String,
      isRunningOnChromebook: Boolean,
    ) {
      AppLogger.d("GIGA NetworkTestService", "publishSpeedTestData Invoked")
      lifecycleScope.launch(Dispatchers.IO) {
        try {
          val getClientInfoUseCase = GetClientInfoUseCase()
          val clientInfoState = serviceScope.async {
            runCatching {
              getClientInfoUseCase.invoke(ipInfoToken, uploadKey, baseUrl)
            }.getOrNull()
          }
          val getServerInfoUseCase = GetServerInfoUseCase()
          val serverInfoState = serviceScope.async {
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
                  "GIGA NetworkTestService",
                  "Get Client Info API Failed: ${clientInfo.error}"
                )
                Sentry.captureMessage("Client Info Fetch Failed")
              }

              ResultState.Loading -> {
                AppLogger.d(
                  "GIGA NetworkTestService",
                  "Fetching Client Info"
                )
              }
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
                  "GIGA NetworkTestService",
                  "Get Client Info API Failed: ${serverInfo.error}"
                )
                Sentry.captureMessage("Server Info Fetch Failed")
              }

              ResultState.Loading -> {
                AppLogger.d(
                  "GIGA NetworkTestService",
                  "Fetching Client Info"
                )
              }
            }
          }
          uploadSpeedTestData(
            clientInfoRequest,
            serverInfoRequest,
            clientInfoResponse,
            serverInfoResponse
          )
        } catch (e: Exception) {
          if (lastUploadMeasurement != null
            && lastDownloadMeasurement != null && lastUploadResponse != null && lastDownloadResponse != null
          ) {
            uploadSpeedTestData(
              null,
              null,
              null,
              null
            )
          } else {
            Sentry.captureException(e)
            updateNotification("Speed test measurements not available, please try again.")
            Log.e("GIGA NetworkTestService", "Error: ${e.message}")
            GigaAppPlugin.sendSpeedTestCompletedWithError(
              null,
              null
            )
          }

        } finally {
          delay(5000)
          AppLogger.d("GIGA NetworkTestService", "Speed Test Completed}")
        }
      }
    }

    /**
     * Uploads generated speed test result to backend.
     *
     * Handles:
     * - Payload generation
     * - Offline persistence
     * - Success/failure tracking
     * - Historical data storage
     * - UI notifications
     *
     * @param clientInfoRequest Client metadata
     * @param serverInfoRequest Server metadata
     * @param clientInfoResponse Raw client response
     * @param serverInfoResponse Raw server response
     */
    private suspend fun uploadSpeedTestData(
      clientInfoRequest: ClientInfoRequestEntity?,
      serverInfoRequest: ServerInfoRequestEntity?,
      clientInfoResponse: ClientInfoResponseEntity?,
      serverInfoResponse: ServerInfoResponseEntity?
    ) {
      if (lastUploadMeasurement != null
        && lastDownloadMeasurement != null && lastUploadResponse != null && lastDownloadResponse != null
      ) {
        val speedTestResultRequestEntity = GigaUtil.createSpeedTestPayload(
          lastUploadMeasurement,
          lastDownloadMeasurement,
          clientInfoRequest,
          serverInfoRequest,
          schoolId,
          gigaSchoolId,
          appVersion,
          scheduleType,
          if (isRunningOnChromebook) {
            DEVICE_TYPE_CHROMEBOOK
          } else {
            DEVICE_TYPE_ANDROID
          },
          browserId,
          countryCode,
          ipAddress,
          lastDownloadResponse,
          lastUploadResponse,
          deviceHardwareId,
          geo = if (currentLocation !== null) {
            Geo(
              geoLocation = GeoLocation(
                lat = currentLocation!!.latitude,
                lng = currentLocation!!.longitude
              ),
              accuracy = currentLocation!!.accuracy,
              timestamp = currentLocation!!.time
            )
          } else null
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
          deviceId
        )
        prefs.historyDataIndex = historyDataIndex + 1
        AppLogger.d(
          "GIGA NetworkTestService",
          "Existing Speed Test Data $existingSpeedTestData"
        )
        val postSpeedTestUseCase = PostSpeedTestUseCase()
        if (speedTestResultRequestEntity != null) {
          try {
            val postSpeedTestResultState =
              postSpeedTestUseCase.invoke(speedTestResultRequestEntity, uploadKey, baseUrl)
            when (postSpeedTestResultState) {
              is ResultState.Failure -> {
                AppLogger.d(
                  "GIGA NetworkTestService",
                  "Speed Test Not Published Successfully Due to ${postSpeedTestResultState.error}"
                )
                measurementsItem.uploaded = false
                measurementsItem.synced = false
                val updateSpeedTestData = GigaUtil.addJsonItem(
                  existingSpeedTestData,
                  Gson().toJson(measurementsItem)
                )
                AppLogger.d(
                  "GIGA NetworkTestService",
                  "Updated Speed Test Data $updateSpeedTestData"
                )
                prefs.oldSpeedTestData = updateSpeedTestData
                Sentry.captureMessage("Failed to sync speed test data")
                updateNotification("Failed to sync speed test data.")
                GigaAppPlugin.sendSpeedTestCompletedWithError(
                  speedTestResultRequestEntity,
                  measurementsItem
                )
                stopForeground(STOP_FOREGROUND_DETACH)
                stopSelf()
              }

              ResultState.Loading -> {
                AppLogger.d(
                  "GIGA NetworkTestService",
                  "Uploading Speed Test Data"
                )
              }

              is ResultState.Success<*> -> {
                AppLogger.d(
                  "GIGA NetworkTestService",
                  "Speed Test Data Published Successfully"
                )
                AppLogger.d(
                  "GIGA NetworkTestService",
                  "Measurement Instance : ${measurementsItem}"
                )
                measurementsItem.uploaded = true
                measurementsItem.synced = true

                val updateSpeedTestData = GigaUtil.addJsonItem(
                  existingSpeedTestData,
                  Gson().toJson(measurementsItem)
                )
                AppLogger.d(
                  "GIGA NetworkTestService",
                  "Updated Speed Test Data $updateSpeedTestData"
                )
                prefs.oldSpeedTestData = updateSpeedTestData
                GigaAppPlugin.sendSpeedTestCompleted(
                  speedTestResultRequestEntity,
                  measurementsItem
                )
                stopForeground(STOP_FOREGROUND_DETACH)
                stopSelf()
                Sentry.captureMessage("Synced speed test data successfully")
              }
            }
          } catch (e: Exception) {
            measurementsItem.uploaded = false
            measurementsItem.synced = false
            val updateSpeedTestData = GigaUtil.addJsonItem(
              existingSpeedTestData,
              Gson().toJson(measurementsItem)
            )
            AppLogger.d(
              "GIGA NetworkTestService",
              "Updated Speed Test Data $updateSpeedTestData"
            )
            prefs.oldSpeedTestData = updateSpeedTestData
            GigaAppPlugin.sendSpeedTestCompletedWithError(
              speedTestResultRequestEntity,
              measurementsItem
            )
            Sentry.captureException(e)
            stopForeground(STOP_FOREGROUND_DETACH)
            stopSelf()
          }
        } else {
          measurementsItem.uploaded = false
          measurementsItem.synced = false
          val updateSpeedTestData = GigaUtil.addJsonItem(
            existingSpeedTestData,
            Gson().toJson(measurementsItem)
          )
          AppLogger.d(
            "GIGA NetworkTestService",
            "Updated Speed Test Data $updateSpeedTestData"
          )
          prefs.oldSpeedTestData = updateSpeedTestData
          GigaAppPlugin.sendSpeedTestCompletedWithError(
            speedTestResultRequestEntity,
            measurementsItem
          )
          Sentry.captureMessage("Failed to generate the speed test upload payload")
          stopForeground(STOP_FOREGROUND_DETACH)
          stopSelf()
        }
      } else {
        updateNotification("Speed test measurements not available, please try again.")
        GigaAppPlugin.sendSpeedTestCompletedWithError(
          null,
          null
        )
        stopForeground(STOP_FOREGROUND_DETACH)
        stopSelf()
      }
    }
  }
}
