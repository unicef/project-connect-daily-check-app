package com.meter.giga.service

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Intent
import android.util.Log
import androidx.core.app.NotificationCompat
import androidx.lifecycle.LifecycleService
import androidx.lifecycle.lifecycleScope
import com.google.gson.Gson
import com.meter.giga.MainActivity
import com.meter.giga.R
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
 * NetworkTestService is Foreground service used to execute in background
 * when scheduled speed test gets execute.
 * This service shows notification and performs the speed test
 * and publish the speed test result on backend
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

  //  private lateinit var secureDataStore: SecureDataStore
  override fun onCreate() {
    super.onCreate()
    createNotificationChannel()
  }

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    super.onStartCommand(intent, flags, startId)
    startForeground(NOTIFICATION_ID, createNotification("Starting speed test..."))
    val networkChecker = NetworkCheckerImpl(this)
    val prefs = AlarmSharedPref(this)
    if (networkChecker.isNetworkAvailable() && !prefs.isTestRunning) {
      AppLogger.d("GIGA NetworkTestService ", "Device is online")

      try {
        // Example logging
        Sentry.capture("Foreground Service started")

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
          //secureDataStore
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
        Sentry.capture(e)
      }
    } else {
      if (!networkChecker.isNetworkAvailable()) {
        AppLogger.d("GIGA NetworkTestService ", "Device is offline")
        Sentry.capture("Device is offline, speed test skipped")
        updateNotification("Device is offline, please check internet connectivity")
        GigaAppPlugin.sendNoNetworkError()
      } else if (prefs.isTestRunning) {
        AppLogger.d("GIGA NetworkTestService ", "Already Speed Test Executing")
        Sentry.capture("Already Speed Test Executing")
      } else {
        AppLogger.d("GIGA NetworkTestService ", "Device is offline")
        Sentry.capture("speed test skipped")
        updateNotification("Speed test skipped")
      }
    }
    return START_STICKY
  }

  /**
   * This function creates the notification which user can see
   * while performing the speed test in background, this is mandatory to
   * show if any task is getting executing in background
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
    return NotificationCompat.Builder(this, SPEED_TEST_CHANNEL_ID)
      .setContentTitle(this.applicationContext.getString(R.string.notification_header))
      .setContentText(content)
      .setSmallIcon(R.mipmap.ic_launcher_round)
      .setOngoing(true)
      .setOnlyAlertOnce(true)
      .setPriority(NotificationCompat.PRIORITY_HIGH)
      .setContentIntent(pendingIntent)
      .build()
  }

  /**
   * This function update the notification content
   * during the speed test in background
   */
  private fun updateNotification(content: String) {
    val manager = getSystemService(NOTIFICATION_SERVICE) as NotificationManager
    manager.notify(NOTIFICATION_ID, createNotification(content))
  }

  /**
   * This function creates the notification channel
   * defines the unique id and used to update the content
   * in existing notification
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
   * This create the http client used for ndt7 library to perform the
   * speed test
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
   * Inner class implementation of NDTTest class this provides
   * the callback implementation for the download, upload progress
   */
  inner class NDTTestImpl(
    okHttpClient: OkHttpClient?,
    private val scheduleType: String,
    private val appVersion: String,
    private val isRunningOnChromebook: Boolean,
    private val prefs: AlarmSharedPref,
    // private val secureDataStore: SecureDataStore
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
     * Callback function implementation for download progress
     * @param clientResponse : ClientResponse instance contains data related to download progress
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
     * Callback function implementation for upload progress
     * @param clientResponse : ClientResponse instance contains data related to upload progress
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
     * Callback function implementation when speed test completed
     * @param clientResponse : ClientResponse instance
     * @param error : Throwable instance
     * @param testType : Upload/Download type
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
        Sentry.capture(e)
      }
    }

    /**
     * This function is used to create the speed test result payload and
     * fetch the required data to create the post payload
     * @param scheduleType
     * @param schoolId
     * @param gigaSchoolId
     * @param appVersion
     * @param browserId
     * @param isRunningOnChromebook
     * @param countryCode
     * @param ipAddress
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
          var speedTestResultRequestEntity: SpeedTestResultRequestEntity? = null
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
                Sentry.capture("Client Info Fetch Failed")
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
                Sentry.capture("Server Info Fetch Failed")
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
            Sentry.capture(e)
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
          deviceHardwareId
        )
        val existingSpeedTestData = prefs.oldSpeedTestData
        val historyDataIndex = prefs.historyDataIndex
        val measurementsItem = GigaUtil.getMeasurementItem(
          clientInfoResponse = clientInfoResponse,
          c2sLastServerManagement = lastUploadMeasurement,
          s2cLastServerManagement = lastDownloadMeasurement,
          serverInfoResponse = serverInfoResponse,
          scheduleType = scheduleType,
          results = speedTestResultRequestEntity?.results,
          c2sRate = c2sRate,
          s2cRate = s2cRate,
          historyDataIndex
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
                val updateSpeedTestData = GigaUtil.addJsonItem(
                  existingSpeedTestData,
                  Gson().toJson(measurementsItem)
                )
                AppLogger.d(
                  "GIGA NetworkTestService",
                  "Updated Speed Test Data $updateSpeedTestData"
                )
                prefs.oldSpeedTestData = updateSpeedTestData
                Sentry.capture("Failed to sync speed test data")
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
                Sentry.capture("Synced speed test data successfully")
              }
            }
          } catch (e: Exception) {
            measurementsItem.uploaded = false
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
            Sentry.capture(e)
            stopForeground(STOP_FOREGROUND_DETACH)
            stopSelf()
          }
        } else {
          measurementsItem.uploaded = false
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
          Sentry.capture("Failed to generate the speed test upload payload")
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
