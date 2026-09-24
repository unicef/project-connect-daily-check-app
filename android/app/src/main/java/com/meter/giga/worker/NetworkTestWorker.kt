package com.meter.giga.worker

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import android.location.Location
import androidx.core.app.ActivityCompat
import androidx.work.CoroutineWorker
import androidx.work.ForegroundInfo
import androidx.work.WorkerParameters
import com.google.android.gms.location.FusedLocationProviderClient
import com.google.android.gms.location.LocationServices
import com.google.gson.Gson
import com.google.gson.JsonObject
import com.google.gson.JsonParser
import com.meter.giga.domain.entity.history.Geo
import com.meter.giga.domain.entity.history.GeoLocation
import com.meter.giga.domain.entity.request.ClientInfoRequestEntity
import com.meter.giga.domain.entity.response.ClientInfoResponseEntity
import com.meter.giga.domain.usecases.GetClientInfoUseCase
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
import com.meter.giga.utils.GigaUtil
import com.meter.giga.utils.NotificationHelper
import com.meter.giga.utils.ResultState
import io.sentry.Sentry
import io.sentry.SentryLevel
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.withContext
import ndt7client.Callbacks
import ndt7client.Ndt7client
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicReference

/**
 * WorkManager-based replacement for NetworkTestService.
 *
 * Executes scheduled/manual speed tests as a foreground worker:
 * - Shows foreground notification
 * - Runs ndt7 download/upload via the Go client
 * - Collects client info
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
  val notificationHelper = NotificationHelper(context)

  override suspend fun doWork(): Result = withContext(Dispatchers.IO) {
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

      GigaAppPlugin.sendSpeedTestStarted()

      val downloadComplete = AtomicReference<String>()
      val uploadComplete = AtomicReference<String>()
      val serverChosen = AtomicReference<String>()
      val error = AtomicReference<String>()
      val s2cRate = arrayListOf<Double>()
      val c2sRate = arrayListOf<Double>()
      val done = CountDownLatch(1)

      var downloadSpeed = 0.0
      var uploadSpeed = 0.0

      Ndt7client.run(
        appVersion,
        object : Callbacks {
          override fun onServerDiscovery() {
            AppLogger.d("GIGA NetworkTestWorker", "Server Discovery in progress")
            GigaAppPlugin.sendServerDiscoveryStarted()
          }

          override fun onServerChosen(serverJSON: String) {
            AppLogger.d("GIGA NetworkTestWorker", "Server Discovered: $serverJSON")
            serverChosen.set(serverJSON)
            GigaAppPlugin.sendServerDiscoveryCompleted()
          }

          override fun onDownloadProgress(clientJSON: String) {
            val progress = JsonParser.parseString(clientJSON).asJsonObject
            downloadSpeed = progress.get("MeanClientMbps")?.asDouble ?: downloadSpeed
            s2cRate.add(downloadSpeed)
            val msg = "DL: %.2f Mbps | UL: %.2f Mbps".format(downloadSpeed, uploadSpeed)
            updateNotification(msg)
            GigaAppPlugin.sendSpeedUpdate(downloadSpeed, uploadSpeed, "download")
          }

          override fun onUploadProgress(clientJSON: String) {
            val progress = JsonParser.parseString(clientJSON).asJsonObject
            uploadSpeed = progress.get("MeanClientMbps")?.asDouble ?: uploadSpeed
            c2sRate.add(uploadSpeed)
            val msg = "DL: %.2f Mbps | UL: %.2f Mbps".format(downloadSpeed, uploadSpeed)
            updateNotification(msg)
            GigaAppPlugin.sendSpeedUpdate(downloadSpeed, uploadSpeed, "upload")
          }

          override fun onDownloadComplete(summaryJSON: String) {
            AppLogger.d("GIGA NetworkTestWorker", "Download complete")
            downloadComplete.set(summaryJSON)
          }

          override fun onUploadComplete(summaryJSON: String) {
            AppLogger.d("GIGA NetworkTestWorker", "Upload complete")
            uploadComplete.set(summaryJSON)
            done.countDown()
          }

          override fun onError(direction: String, message: String) {
            AppLogger.d("GIGA NetworkTestWorker", "ndt7 error $direction: $message")
            error.set("$direction: $message")
            Sentry.captureMessage("ndt7 $direction failed: $message", SentryLevel.ERROR)
            done.countDown()
          }
        }
      )

      val finished = done.await(2, TimeUnit.MINUTES)
      if (!finished) {
        prefs.isTestRunning = false
        Sentry.captureMessage("Speed test timed out", SentryLevel.ERROR)
        updateNotification("Speed test timed out, please try again.")
        GigaAppPlugin.sendSpeedTestCompletedWithError(null, null)
        return@withContext Result.failure()
      }

      if (error.get() != null ||
        downloadComplete.get() == null ||
        uploadComplete.get() == null
      ) {
        prefs.isTestRunning = false
        updateNotification("Speed test measurements not available, please try again.")
        GigaAppPlugin.sendSpeedTestCompletedWithError(null, null)
        return@withContext Result.failure()
      }

      publishAndUpload(
        scheduleType = scheduleType,
        appVersion = appVersion,
        isRunningOnChromebook = isRunningOnChromebook,
        deviceInfo = deviceInfo,
        downloadCompleteJson = downloadComplete.get()!!,
        uploadCompleteJson = uploadComplete.get()!!,
        serverChosenJson = serverChosen.get(),
        s2cRate = s2cRate,
        c2sRate = c2sRate
      )

      Result.success()
    } catch (e: Exception) {
      prefs.isTestRunning = false
      Sentry.captureException(e)
      GigaAppPlugin.sendSpeedTestCompletedWithError(null, null)
      Result.failure()
    }
  }

  override suspend fun getForegroundInfo(): ForegroundInfo {
    val notification = notificationHelper.createNotification("Starting speed test...")
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

  private suspend fun publishAndUpload(
    scheduleType: String,
    appVersion: String,
    isRunningOnChromebook: Boolean,
    deviceInfo: com.meter.giga.utils.DeviceInfo,
    downloadCompleteJson: String,
    uploadCompleteJson: String,
    serverChosenJson: String?,
    s2cRate: ArrayList<Double>,
    c2sRate: ArrayList<Double>,
  ) {
    AppLogger.d("GIGA NetworkTestWorker", "publishSpeedTestData invoked")
    try {
      val clientInfoState = runCatching {
        GetClientInfoUseCase().invoke(prefs.ipInfoToken, prefs.mlabUploadKey, prefs.baseUrl)
      }.getOrNull()

      var clientInfoResponse: ClientInfoResponseEntity? = null
      var clientInfoRequest: ClientInfoRequestEntity? = null

      when (clientInfoState) {
        is ResultState.Success<*> -> {
          clientInfoResponse = clientInfoState.data as ClientInfoResponseEntity
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
            "Get Client Info API Failed: ${clientInfoState.error}"
          )
        }

        else -> {}
      }

      val downloadComplete: JsonObject =
        JsonParser.parseString(downloadCompleteJson).asJsonObject
      val uploadComplete: JsonObject =
        JsonParser.parseString(uploadCompleteJson).asJsonObject
      val serverInfo = GigaUtil.serverInfoFromLocate(serverChosenJson)

      val speedTestResultRequestEntity = GigaUtil.createSpeedTestPayload(
        downloadCompleteJson = downloadCompleteJson,
        uploadCompleteJson = uploadCompleteJson,
        serverChosenJson = serverChosenJson,
        clientInfoRequestEntity = clientInfoRequest,
        schoolId = prefs.schoolId,
        gigaSchoolId = prefs.gigaSchoolId,
        appVersion = appVersion,
        scheduleType = scheduleType,
        deviceType = if (isRunningOnChromebook) DEVICE_TYPE_CHROMEBOOK else DEVICE_TYPE_ANDROID,
        browserId = prefs.browserId,
        countryCode = prefs.countryCode,
        ipAddress = prefs.ipAddress,
        deviceHardwareId = prefs.deviceHardwareId,
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
        deviceInfo = deviceInfo
      )

      val existingSpeedTestData = prefs.oldSpeedTestData
      val historyDataIndex = prefs.historyDataIndex

      val measurementsItem = GigaUtil.getMeasurementItem(
        clientInfoResponse = clientInfoResponse,
        downloadComplete = downloadComplete,
        uploadComplete = uploadComplete,
        serverInfo = serverInfo,
        scheduleType = scheduleType,
        results = speedTestResultRequestEntity?.results,
        c2sRate = c2sRate,
        s2cRate = s2cRate,
        historyDataIndex = historyDataIndex,
        currentLocation = currentLocation,
        deviceHardwareId = prefs.deviceHardwareId,
        deviceInfo = deviceInfo
      )

      prefs.historyDataIndex = historyDataIndex + 1

      val postSpeedTestUseCase = PostSpeedTestUseCase()

      if (speedTestResultRequestEntity != null) {
        try {
          val postSpeedTestResultState = postSpeedTestUseCase.invoke(
            speedTestResultRequestEntity,
            prefs.mlabUploadKey,
            prefs.baseUrl
          )

          when (postSpeedTestResultState) {
            is ResultState.Failure -> {
              AppLogger.d(
                "GIGA NetworkTestWorker",
                "Speed Test Not Published Successfully Due to ${postSpeedTestResultState.error}"
              )
              measurementsItem.uploaded = false
              measurementsItem.synced = false
              prefs.oldSpeedTestData = GigaUtil.addJsonItem(
                existingSpeedTestData,
                Gson().toJson(measurementsItem)
              )
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
              prefs.oldSpeedTestData = GigaUtil.addJsonItem(
                existingSpeedTestData,
                Gson().toJson(measurementsItem)
              )
              GigaAppPlugin.sendSpeedTestCompleted(
                speedTestResultRequestEntity,
                measurementsItem
              )
              updateNotification("Speed test completed")
            }
          }
        } catch (e: Exception) {
          measurementsItem.uploaded = false
          measurementsItem.synced = false
          prefs.oldSpeedTestData = GigaUtil.addJsonItem(
            existingSpeedTestData,
            Gson().toJson(measurementsItem)
          )
          GigaAppPlugin.sendSpeedTestCompletedWithError(
            speedTestResultRequestEntity,
            measurementsItem
          )
          updateNotification("Failed to sync speed test data.")
          Sentry.captureException(e)
        }
      } else {
        measurementsItem.uploaded = false
        measurementsItem.synced = false
        prefs.oldSpeedTestData = GigaUtil.addJsonItem(
          existingSpeedTestData,
          Gson().toJson(measurementsItem)
        )
        GigaAppPlugin.sendSpeedTestCompletedWithError(
          speedTestResultRequestEntity,
          measurementsItem
        )
        updateNotification("Failed to generate the speed test upload payload")
        Sentry.captureMessage(
          "Failed to generate the speed test upload payload",
          SentryLevel.ERROR
        )
      }

      prefs.isTestRunning = false
      delay(5000)
      AppLogger.d("GIGA NetworkTestWorker", "Speed Test Completed")
    } catch (e: Exception) {
      Sentry.captureException(e)
      updateNotification("Speed test measurements not available, please try again.")
      GigaAppPlugin.sendSpeedTestCompletedWithError(null, null)
      prefs.isTestRunning = false
    }
  }

  private fun updateNotification(content: String) {
    notificationHelper.showOrUpdateNotification(content)
  }
}
