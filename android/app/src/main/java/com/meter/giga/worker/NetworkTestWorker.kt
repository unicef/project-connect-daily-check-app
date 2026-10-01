package com.meter.giga.worker

import android.Manifest
import android.app.ActivityManager
import android.app.usage.UsageStatsManager
import android.content.Context
import android.content.pm.PackageManager
import android.location.Location
import android.net.ConnectivityManager
import android.net.NetworkCapabilities
import android.os.Build
import android.os.PowerManager
import androidx.core.app.ActivityCompat
import androidx.work.CoroutineWorker
import androidx.work.ForegroundInfo
import androidx.work.WorkInfo
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
import com.meter.giga.utils.Constants.BACKGROUND_RETRY_DELAY_MIN
import com.meter.giga.utils.Constants.MAX_BACKGROUND_RETRIES
import com.meter.giga.utils.Constants.NOTIFICATION_ID
import com.meter.giga.utils.Constants.SCHEDULE_TYPE
import com.meter.giga.utils.Constants.SCHEDULE_TYPE_DAILY
import com.meter.giga.utils.Constants.SCHEDULE_TYPE_FIRST
import com.meter.giga.utils.Constants.SCHEDULE_TYPE_MANUAL
import com.meter.giga.utils.Constants.SCHEDULE_TYPE_START
import com.meter.giga.utils.Constants.SLOT_END_TIME
import com.meter.giga.utils.DeviceInfo
import com.meter.giga.utils.GigaUtil
import com.meter.giga.utils.NotificationHelper
import com.meter.giga.utils.ResultState
import io.sentry.IScope
import io.sentry.Sentry
import io.sentry.SentryLevel
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.withContext
import kotlinx.coroutines.withTimeoutOrNull
import ndt7client.Callbacks
import ndt7client.Ndt7client
import java.util.Collections
import java.util.Locale
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicBoolean
import java.util.concurrent.atomic.AtomicReference
import kotlin.concurrent.thread

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
    val isBackground = scheduleType == SCHEDULE_TYPE_DAILY || scheduleType == SCHEDULE_TYPE_START
    val slotEnd = inputData.getLong(SLOT_END_TIME, 0L)

    if (!isBackground && prefs.stoppedTestWorkId == id.toString()) {
      prefs.stoppedTestWorkId = ""
      AppLogger.d("GIGA NetworkTestWorker", "Skipping re-run of stopped $scheduleType test")
      return@withContext Result.success()
    }

    // Work held back by Doze or the network constraint can run long after its slot.
    if (isBackground && slotEnd > 0 && System.currentTimeMillis() > slotEnd) {
      AppLogger.d("GIGA NetworkTestWorker", "Slot ended, skipping $scheduleType test")
      Sentry.captureMessage("Speed test skipped, slot ended", SentryLevel.INFO) { scope ->
        applyConnectionContext(scope)
        scope.setTag("run_attempt", "$runAttemptCount")
      }
      return@withContext Result.success()
    }

    if (!networkChecker.isNetworkAvailable()) {
      val willRetry = isBackground && canRetryInSlot()

      AppLogger.d("GIGA NetworkTestWorker", "Device is offline, retry: $willRetry")
      Sentry.captureMessage("Device is offline, speed test skipped", SentryLevel.WARNING) { scope ->
        applyConnectionContext(scope)
        scope.setTag("run_attempt", "$runAttemptCount")
        scope.setTag("will_retry", "$willRetry")
      }

      if (isBackground) {
        return@withContext if (willRetry) Result.retry() else Result.failure()
      }
      GigaAppPlugin.sendNoNetworkError()
      return@withContext Result.failure()
    }

    if (prefs.isTestInProgress()) {
      AppLogger.d("GIGA NetworkTestWorker", "Speed test already running, skipping")
      Sentry.captureMessage("Speed test skipped, another test is running", SentryLevel.INFO)
      // A background daily or startup run must not replace the test already on screen.
      if (scheduleType == SCHEDULE_TYPE_MANUAL || scheduleType == SCHEDULE_TYPE_FIRST) {
        GigaAppPlugin.sendSpeedTestCompletedWithError(null, null)
      }
      return@withContext Result.success()
    }

    prefs.isTestRunning = true
    var activeCallbacks: GoClientCallbacks? = null

    try {
      val appVersion = GigaUtil.getAppVersionName(context)
      val deviceInfo = GigaUtil.getDeviceInfo(context)
      val isRunningOnChromebook = GigaUtil.isRunningOnChromebook(context)

      GigaAppPlugin.sendSpeedTestStarted()

      val callbacks = GoClientCallbacks().also { activeCallbacks = it }
      // Ndt7client.run blocks until the test ends. Running it on its own thread
      // keeps this coroutine free to time out or be cancelled.
      thread(name = "ndt7-go-client", isDaemon = true) {
        Ndt7client.run(appVersion, callbacks)
      }

      val finished = withTimeoutOrNull(TEST_TIMEOUT_MS) {
        while (callbacks.done.count > 0) {
          delay(250)
        }
        true
      } ?: false
      if (!finished) {
        callbacks.stop()
        Ndt7client.cancel()
        prefs.isTestRunning = false
        Sentry.captureMessage("Speed test timed out", SentryLevel.ERROR) { scope ->
          applyConnectionContext(scope)
        }
        updateNotification("Speed test timed out, please try again.")
        GigaAppPlugin.sendSpeedTestCompletedWithError(null, null)
        return@withContext Result.failure()
      }

      if (callbacks.serverLookupFailed.get()) {
        val willRetry = isBackground && canRetryInSlot()
        AppLogger.d("GIGA NetworkTestWorker", "Server lookup failed, retry: $willRetry")
        prefs.isTestRunning = false
        updateNotification("Could not reach the speed test server, please try again.")
        GigaAppPlugin.sendSpeedTestCompletedWithError(null, null)
        return@withContext if (willRetry) Result.retry() else Result.failure()
      }

      val downloadCompleteJson = callbacks.downloadComplete.get()
      val uploadCompleteJson = callbacks.uploadComplete.get()
      if (callbacks.error.get() != null ||
        downloadCompleteJson == null ||
        uploadCompleteJson == null
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
        downloadCompleteJson = downloadCompleteJson,
        uploadCompleteJson = uploadCompleteJson,
        serverChosenJson = callbacks.serverChosen.get(),
        s2cRate = ArrayList(callbacks.s2cRate),
        c2sRate = ArrayList(callbacks.c2sRate)
      )

      Result.success()
    } catch (e: CancellationException) {
      // WorkManager stopped the worker. It ignores the result and re-runs the work later.
      activeCallbacks?.stop()
      Ndt7client.cancel()
      prefs.isTestRunning = false
      val reason = stopReasonName(stopReason)
      AppLogger.d("GIGA NetworkTestWorker", "Speed test stopped by the system: $reason")
      Sentry.captureMessage("Speed test stopped by the system", SentryLevel.WARNING) { scope ->
        applyConnectionContext(scope)
        scope.setTag("stop_reason", reason)
        scope.setTag("run_attempt", "$runAttemptCount")
      }
      if (!isBackground) {
        prefs.stoppedTestWorkId = id.toString()
        GigaAppPlugin.sendSpeedTestCompletedWithError(null, null)
      }
      throw e
    } catch (e: Exception) {
      activeCallbacks?.stop()
      Ndt7client.cancel()
      prefs.isTestRunning = false
      Sentry.captureException(e)
      GigaAppPlugin.sendSpeedTestCompletedWithError(null, null)
      Result.failure()
    }
  }

  /**
   * Battery restriction and network power-save state at the moment of a failure.
   * Android does not expose the 802.11 power-save flag. A suspended network is
   * the public signal that the system has paused it to save power.
   */
  private fun applyConnectionContext(scope: IScope) {
    scope.setTag("schedule_type", inputData.getString(SCHEDULE_TYPE) ?: SCHEDULE_TYPE_DAILY)
    try {
      val powerManager = context.getSystemService(PowerManager::class.java)
      val connectivityManager = context.getSystemService(ConnectivityManager::class.java)
      val capabilities = connectivityManager?.activeNetwork?.let {
        connectivityManager.getNetworkCapabilities(it)
      }

      scope.setTag("has_network", "${capabilities != null}")
      scope.setTag("network_validated", "${capabilities?.hasCapability(NetworkCapabilities.NET_CAPABILITY_VALIDATED) == true}")
      scope.setTag("network_transport", networkTransport(capabilities))
      scope.setTag("network_suspended", "${capabilities?.let { !it.hasCapability(NetworkCapabilities.NET_CAPABILITY_NOT_SUSPENDED) }}")
      scope.setTag("background_restricted", "${isBackgroundRestricted()}")
      scope.setTag("ignoring_battery_optimizations", "${powerManager?.isIgnoringBatteryOptimizations(context.packageName)}")
      scope.setTag("power_save_mode", "${powerManager?.isPowerSaveMode}")
      scope.setTag("device_idle_mode", "${powerManager?.isDeviceIdleMode}")
      scope.setTag("screen_interactive", "${powerManager?.isInteractive}")
      scope.setTag("standby_bucket", standbyBucket())
    } catch (e: Exception) {
      AppLogger.d("GIGA NetworkTestWorker", "Failed to read connection context: ${e.message}")
    }
  }

  private fun networkTransport(capabilities: NetworkCapabilities?): String {
    if (capabilities == null) return "none"
    return when {
      capabilities.hasTransport(NetworkCapabilities.TRANSPORT_WIFI) -> "wifi"
      capabilities.hasTransport(NetworkCapabilities.TRANSPORT_CELLULAR) -> "cellular"
      capabilities.hasTransport(NetworkCapabilities.TRANSPORT_ETHERNET) -> "ethernet"
      else -> "other"
    }
  }

  private fun isBackgroundRestricted(): Boolean? {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.P) return null
    return context.getSystemService(ActivityManager::class.java)?.isBackgroundRestricted
  }

  private fun standbyBucket(): String {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.P) return "unsupported"
    val bucket = try {
      context.getSystemService(UsageStatsManager::class.java)?.appStandbyBucket
    } catch (e: SecurityException) {
      return "unavailable"
    } ?: return "unknown"
    return when {
      bucket == UsageStatsManager.STANDBY_BUCKET_ACTIVE -> "active"
      bucket == UsageStatsManager.STANDBY_BUCKET_WORKING_SET -> "working_set"
      bucket == UsageStatsManager.STANDBY_BUCKET_FREQUENT -> "frequent"
      bucket == UsageStatsManager.STANDBY_BUCKET_RARE -> "rare"
      Build.VERSION.SDK_INT >= Build.VERSION_CODES.R &&
        bucket == UsageStatsManager.STANDBY_BUCKET_RESTRICTED -> "restricted"
      else -> "unknown"
    }
  }

  /**
   * WorkManager spaces retries linearly (15, 30, then 45 minutes), so a retry
   * is only worth scheduling if it still starts inside the slot.
   */
  private fun canRetryInSlot(): Boolean {
    val nextRetryAt = System.currentTimeMillis() +
      TimeUnit.MINUTES.toMillis(BACKGROUND_RETRY_DELAY_MIN * (runAttemptCount + 1))
    return runAttemptCount < MAX_BACKGROUND_RETRIES &&
      nextRetryAt < inputData.getLong(SLOT_END_TIME, 0L)
  }

  private fun stopReasonName(reason: Int): String = when (reason) {
    WorkInfo.STOP_REASON_CANCELLED_BY_APP -> "cancelled_by_app"
    WorkInfo.STOP_REASON_PREEMPT -> "preempt"
    WorkInfo.STOP_REASON_TIMEOUT -> "timeout"
    WorkInfo.STOP_REASON_DEVICE_STATE -> "device_state"
    WorkInfo.STOP_REASON_CONSTRAINT_CONNECTIVITY -> "constraint_connectivity"
    WorkInfo.STOP_REASON_QUOTA -> "quota"
    WorkInfo.STOP_REASON_BACKGROUND_RESTRICTION -> "background_restriction"
    WorkInfo.STOP_REASON_APP_STANDBY -> "app_standby"
    WorkInfo.STOP_REASON_USER -> "user"
    WorkInfo.STOP_REASON_SYSTEM_PROCESSING -> "system_processing"
    WorkInfo.STOP_REASON_FOREGROUND_SERVICE_TIMEOUT -> "foreground_service_timeout"
    WorkInfo.STOP_REASON_NOT_STOPPED -> "not_stopped"
    else -> "other_$reason"
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
    deviceInfo: DeviceInfo,
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

  /**
   * Receives the Go client's events and holds the results for the worker.
   *
   * Callbacks run on a Go thread, outside the worker's try/catch, and an
   * exception thrown back into Go crashes the process, so each one is guarded.
   * After [stop], late events from a test that is shutting down are ignored.
   */
  private inner class GoClientCallbacks : Callbacks {
    val done = CountDownLatch(1)
    val downloadComplete = AtomicReference<String>()
    val uploadComplete = AtomicReference<String>()
    val serverChosen = AtomicReference<String>()
    val error = AtomicReference<String>()
    val serverLookupFailed = AtomicBoolean(false)
    val s2cRate: MutableList<Double> = Collections.synchronizedList(ArrayList())
    val c2sRate: MutableList<Double> = Collections.synchronizedList(ArrayList())

    @Volatile
    private var downloadSpeed = 0.0

    @Volatile
    private var uploadSpeed = 0.0

    private val stopped = AtomicBoolean(false)

    fun stop() = stopped.set(true)

    override fun onServerDiscovery() = guard("onServerDiscovery") {
      AppLogger.d("GIGA NetworkTestWorker", "Server Discovery in progress")
      GigaAppPlugin.sendServerDiscoveryStarted()
    }

    override fun onServerChosen(serverJSON: String) = guard("onServerChosen") {
      serverChosen.set(serverJSON)
      // The target's URLs carry an access token, so log only the server name.
      AppLogger.d(
        "GIGA NetworkTestWorker",
        "Server Discovered: ${GigaUtil.serverInfoFromLocate(serverJSON)?.fQDN}"
      )
      GigaAppPlugin.sendServerDiscoveryCompleted()
    }

    override fun onDownloadProgress(clientJSON: String) = guard("onDownloadProgress") {
      downloadSpeed = GigaUtil.progressMbps(clientJSON) ?: downloadSpeed
      s2cRate.add(downloadSpeed)
      showProgress("download")
    }

    override fun onUploadProgress(clientJSON: String) = guard("onUploadProgress") {
      uploadSpeed = GigaUtil.progressMbps(clientJSON) ?: uploadSpeed
      c2sRate.add(uploadSpeed)
      showProgress("upload")
    }

    override fun onDownloadComplete(summaryJSON: String) = guard("onDownloadComplete") {
      AppLogger.d("GIGA NetworkTestWorker", "Download complete")
      downloadComplete.set(summaryJSON)
    }

    override fun onUploadComplete(summaryJSON: String) {
      uploadComplete.set(summaryJSON)
      done.countDown()
      guard("onUploadComplete") {
        AppLogger.d("GIGA NetworkTestWorker", "Upload complete")
      }
    }

    override fun onError(direction: String, message: String) {
      error.set("$direction: $message")
      if (direction == "locate") serverLookupFailed.set(true)
      done.countDown()
      guard("onError") {
        AppLogger.d("GIGA NetworkTestWorker", "ndt7 error $direction: $message")
        Sentry.captureMessage("ndt7 $direction failed: $message", SentryLevel.ERROR) { scope ->
          applyConnectionContext(scope)
          scope.setTag("test_type", direction)
        }
      }
    }

    private fun showProgress(testType: String) {
      val download = downloadSpeed
      val upload = uploadSpeed
      updateNotification("DL: %.2f Mbps | UL: %.2f Mbps".format(Locale.US, download, upload))
      GigaAppPlugin.sendSpeedUpdate(download, upload, testType)
    }

    private inline fun guard(callback: String, block: () -> Unit) {
      if (stopped.get()) return
      try {
        block()
      } catch (e: Exception) {
        AppLogger.d("GIGA NetworkTestWorker", "$callback failed: ${e.message}")
        Sentry.captureException(e)
      }
    }
  }

  private companion object {
    // Backstop for the Go client's own 2-minute limit on the whole test.
    const val TEST_TIMEOUT_MS = 150_000L
  }
}
