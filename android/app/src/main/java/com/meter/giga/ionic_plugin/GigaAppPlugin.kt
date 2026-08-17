package com.meter.giga.ionic_plugin


import android.Manifest
import android.annotation.SuppressLint
import android.app.AlarmManager
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import android.provider.Settings
import androidx.core.content.ContextCompat
import androidx.core.net.toUri
import com.getcapacitor.JSArray
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import com.google.android.play.core.appupdate.AppUpdateManagerFactory
import com.google.android.play.core.install.model.AppUpdateType
import com.google.android.play.core.install.model.UpdateAvailability
import com.google.gson.GsonBuilder
import com.meter.giga.alarm_scheduler.AlarmHelper
import com.meter.giga.alarm_scheduler.AlarmHelper.getNextSlotRange
import com.meter.giga.alarm_scheduler.AlarmHelper.getSlotStartHour
import com.meter.giga.domain.entity.SpeedTestResultEntity
import com.meter.giga.domain.entity.history.MeasurementsItem
import com.meter.giga.domain.entity.request.SpeedTestResultRequestEntity
import com.meter.giga.prefrences.AlarmSharedPref
import com.meter.giga.utils.AppLogger
import com.meter.giga.utils.AppUpdateCheckEventBus
import com.meter.giga.utils.Constants.BASE_URL
import com.meter.giga.utils.Constants.ENV_TYPE
import com.meter.giga.utils.Constants.FIRST_15_MIN
import com.meter.giga.utils.Constants.IP_INFO_TOKEN
import com.meter.giga.utils.Constants.MLAB_UPLOAD_KEY
import com.meter.giga.utils.Constants.REGISTRATION_BROWSER_ID
import com.meter.giga.utils.Constants.REGISTRATION_COUNTRY_CODE
import com.meter.giga.utils.Constants.REGISTRATION_GIGA_SCHOOL_ID
import com.meter.giga.utils.Constants.REGISTRATION_IP_ADDRESS
import com.meter.giga.utils.Constants.REGISTRATION_SCHOOL_ID
import com.meter.giga.utils.Constants.SCHEDULE_TYPE
import com.meter.giga.utils.Constants.SCHEDULE_TYPE_DAILY
import com.meter.giga.utils.Constants.SCHEDULE_TYPE_START
import com.meter.giga.utils.GigaUtil
import com.meter.giga.utils.PluginEvent
import com.meter.giga.worker.await
import io.sentry.Sentry
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import org.json.JSONArray
import org.json.JSONException
import org.json.JSONObject

/**
 * Capacitor plugin implementation used as a bridge between
 * the Ionic UI layer and Android native components.
 *
 * <p>This plugin provides functionalities such as:
 * <ul>
 *   <li>Starting manual speed tests.</li>
 *   <li>Scheduling background speed test alarms.</li>
 *   <li>Managing registration and environment data.</li>
 *   <li>Returning historical speed test data.</li>
 *   <li>Checking Google Play app updates.</li>
 *   <li>Sending real-time speed test updates to the UI.</li>
 * </ul>
 */
@CapacitorPlugin(name = "GigaAppPlugin")
open class GigaAppPlugin : Plugin() {

  // Create singleton instance of Giga App Plugin
  companion object {
    /**
     * Singleton instance of the plugin used for
     * sending events to the Capacitor UI layer.
     */
    private var pluginInstance: GigaAppPlugin? = null

    /**
     * Sends real-time speed test progress updates to the Ionic UI.
     *
     * <p>The event includes:
     * <ul>
     *   <li>Current download speed.</li>
     *   <li>Current upload speed.</li>
     *   <li>Current speed test status.</li>
     * </ul>
     *
     * @param downloadSpeed current download speed value.
     * @param uploadSpeed current upload speed value.
     * @param testStatus current speed test state.
     */
    fun sendSpeedUpdate(downloadSpeed: Double, uploadSpeed: Double, testStatus: String) {
      pluginInstance?.let {
        val data = JSObject().apply {
          put("downloadSpeed", downloadSpeed)
          put("uploadSpeed", uploadSpeed)
          put("testStatus", testStatus)
        }
        AppLogger.d("GIGA NetworkTestService", "sendSpeedUpdate: $data")
        it.notifyListeners("speedTestUpdate", data)
      }
    }

    /**
     * Sends an offline/no-network state update to the Ionic UI.
     *
     * <p>This event is emitted when internet connectivity
     * is unavailable during speed test execution.
     */
    fun sendNoNetworkError() {
      pluginInstance?.let {
        val data = JSObject().apply {
          put("testStatus", "offline")
        }
        AppLogger.d("GIGA NetworkTestService", "sendSpeedUpdate: $data")
        it.notifyListeners("speedTestUpdate", data)
      }
    }

    /**
     * Sends completed speed test results to the Ionic UI.
     *
     * <p>The result payload contains:
     * <ul>
     *   <li>Speed test response data.</li>
     *   <li>Measurement details.</li>
     *   <li>Completion status.</li>
     * </ul>
     *
     * @param speedTestData final speed test response data.
     * @param measurementsItem measurement metadata/details.
     */
    fun sendSpeedTestCompleted(
      speedTestData: SpeedTestResultRequestEntity,
      measurementsItem: MeasurementsItem
    ) {
      pluginInstance?.let {
        AppLogger.d("GIGA NetworkTestService", "sendSpeedTestCompleted")
        val speedTestResultEntity = SpeedTestResultEntity(
          speedTestData = speedTestData,
          testStatus = "complete",
          measurementsItem = measurementsItem
        )
        val jsonString = GsonBuilder()
          .serializeNulls()
          .create().toJson(speedTestResultEntity)
        val data = JSObject(jsonString)
        AppLogger.d("GIGA NetworkTestService", "sendSpeedTestCompleted $data")
        it.notifyListeners("speedTestUpdate", data as JSObject?)
      }
    }

    /**
     * Sends failed speed test details to the Ionic UI.
     *
     * <p>This method is invoked when the speed test
     * execution ends with an error.
     *
     * @param speedTestData optional partial speed test result.
     * @param measurementsItem optional measurement metadata.
     */
    fun sendSpeedTestCompletedWithError(
      speedTestData: SpeedTestResultRequestEntity?,
      measurementsItem: MeasurementsItem?
    ) {
      pluginInstance?.let {
        AppLogger.d("GIGA NetworkTestService", "sendSpeedTestCompletedWithError")
        val speedTestResultEntity = SpeedTestResultEntity(
          speedTestData = speedTestData,
          testStatus = "onerror",
          measurementsItem = measurementsItem
        )
        val jsonString = GsonBuilder()
          .serializeNulls()
          .create().toJson(speedTestResultEntity)
        val data = JSObject(jsonString)
        AppLogger.d("GIGA NetworkTestService", "sendSpeedTestCompletedWithError $data")
        it.notifyListeners("speedTestUpdate", data as JSObject?)
      }
    }

    /**
     * Sends a speed test started event to the Ionic UI.
     *
     * <p>This indicates that the network test process
     * has started execution.
     */
    fun sendSpeedTestStarted() {
      pluginInstance?.let {
        AppLogger.d("GIGA NetworkTestService", "sendSpeedTestStarted")
        val data = JSObject().apply {
          put("testStatus", "onstart")
        }
        it.notifyListeners("speedTestUpdate", data)
      }
    }

    /**
     * Sends an event indicating server discovery has started.
     *
     * <p>This occurs before selecting the optimal
     * speed test server.
     */
    fun sendServerDiscoveryStarted() {
      pluginInstance?.let {
        AppLogger.d("GIGA NetworkTestService", "server_discovery")
        val data = JSObject().apply {
          put("testStatus", "server_discovery")
        }
        it.notifyListeners("speedTestUpdate", data)
      }
    }

    /**
     * Sends an event indicating server discovery
     * and selection is completed.
     */
    fun sendServerDiscoveryCompleted() {
      pluginInstance?.let {
        AppLogger.d("GIGA NetworkTestService", "server_chosen")
        val data = JSObject().apply {
          put("testStatus", "server_chosen")
        }
        it.notifyListeners("speedTestUpdate", data)
      }
    }
  }

  /**
   * Called when the Capacitor plugin is loaded.
   *
   * <p>This stores the plugin instance for later use
   * in sending events back to the UI layer.
   */
  override fun load() {
    pluginInstance = this
  }

  /**
   * Retrieves the Android device ID and returns it
   * to the Ionic UI layer.
   *
   * <p>The device ID is also persisted in shared preferences.
   *
   * @param call Capacitor plugin call instance.
   */
  @SuppressLint("HardwareIds")
  @PluginMethod
  fun getAndroidId(call: PluginCall) {
    val androidId = Settings.Secure.getString(
      context.contentResolver,
      Settings.Secure.ANDROID_ID
    )
    AppLogger.d("GIGA Android", androidId)
    val ret = JSObject()
    try {
      val context = context
      val alarmPrefs = AlarmSharedPref(context)
      alarmPrefs.deviceHardwareId = androidId
      ret.put("androidId", androidId)
    } catch (e: JSONException) {
      call.reject("Error getting Android ID")
      return
    }
    call.resolve(ret)
  }

  /**
   * Starts a manual speed test execution initiated
   * by the user from the Ionic UI.
   *
   * <p>This method:
   * <ul>
   *   <li>Starts the foreground speed test service.</li>
   *   <li>Checks whether future alarms already exist.</li>
   *   <li>Schedules a fallback alarm if required.</li>
   * </ul>
   *
   * @param call Capacitor plugin call containing schedule details.
   */
  @PluginMethod
  fun executeManualSpeedTest(call: PluginCall) {
    val context = context
    val scheduleType = call.getString(SCHEDULE_TYPE)
    AppLogger.d("GIGA GigaAppPlugin", "Manual Speed Test ${scheduleType}")
    val hasNotificationPermission = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
      ContextCompat.checkSelfPermission(
        context,
        Manifest.permission.POST_NOTIFICATIONS
      ) == PackageManager.PERMISSION_GRANTED
    } else true
    if (hasNotificationPermission) {
      val alarmPrefs = AlarmSharedPref(context)
      if (GigaUtil.checkIfFutureAlarmScheduled(alarmPrefs)) {
        AppLogger.d("GIGA GigaAppPlugin", "Alarm is already scheduled")
      } else {
        AppLogger.d(
          "GIGA GigaAppPlugin",
          "Schedule the next alarm as fallback if no future scheduled speed test."
        )
        scheduleAlarm(context, alarmPrefs)
      }
    }
    call.resolve()
  }

  /**
   * Returns historical speed test measurement data
   * stored in shared preferences.
   *
   * <p>The data is converted into a format compatible
   * with the Capacitor JavaScript layer.
   *
   * @param call Capacitor plugin call instance.
   */
  @PluginMethod
  fun getHistoricalSpeedTestData(call: PluginCall) {
    try {
      val context = context
      val alarmPrefs = AlarmSharedPref(context)
      val speedTestHistoricalData = alarmPrefs.oldSpeedTestData
      val jsonArray = JSONArray(speedTestHistoricalData)
      AppLogger.d("GIGA GigaAppPlugin jsonArray", "$jsonArray")
      // Convert JSONArray to JSArray
      val jsArray = JSArray()
      for (i in 0 until jsonArray.length()) {
        val jsonObjectString = jsonArray.getString(i)
        val innerJsonObject = JSONObject(jsonObjectString)
        AppLogger.d("GIGA GigaAppPlugin jsonArray", "$innerJsonObject")
        jsArray.put(innerJsonObject)
      }
      val measurements = JSObject()
      measurements.put("measurements", jsArray)
      val result = JSObject()
      result.put("historicalData", measurements)
      call.resolve(result)
    } catch (e: JSONException) {
      call.reject("Failed to parse JSON array", e)
    }
  }

  /**
   * Stores registration and scheduling data received
   * from the Ionic UI layer.
   *
   * <p>This method:
   * <ul>
   *   <li>Resets existing stored data.</li>
   *   <li>Saves new school/device registration details.</li>
   *   <li>Schedules background alarms for speed tests.</li>
   * </ul>
   *
   * @param call Capacitor plugin call containing registration data.
   */
  @PluginMethod
  fun storeAndScheduleSpeedTest(call: PluginCall) {
    AppLogger.d("GIGA GigaAppPlugin", "Start Command Via Plugin")
    val context = context
    val browserId = call.getString(REGISTRATION_BROWSER_ID)
    val schoolId = call.getString(REGISTRATION_SCHOOL_ID)
    val gigaSchoolId = call.getString(REGISTRATION_GIGA_SCHOOL_ID)
    val countryCode = call.getString(REGISTRATION_COUNTRY_CODE)
    val ipAddress = call.getString(REGISTRATION_IP_ADDRESS)
    val mlabUploadKey = call.getString(MLAB_UPLOAD_KEY)
    val baseUrl = call.getString(BASE_URL)
    val ipInfoToken = call.getString(IP_INFO_TOKEN)
    AppLogger.d("GIGA GigaAppPlugin mlabUploadKey", "$mlabUploadKey")
    val alarmPrefs = AlarmSharedPref(context)
    //Reset the existing stored data from shared preferences
    alarmPrefs.resetAllData()
    //Set the new registration data in shared preferences
    alarmPrefs.countryCode = countryCode ?: ""
    alarmPrefs.schoolId = schoolId ?: ""
    alarmPrefs.gigaSchoolId = gigaSchoolId ?: ""
    alarmPrefs.ipAddress = ipAddress ?: ""
    alarmPrefs.baseUrl = baseUrl ?: ""
    alarmPrefs.ipInfoToken = ipInfoToken ?: " "
    alarmPrefs.browserId = browserId ?: ""
    alarmPrefs.mlabUploadKey = mlabUploadKey ?: ""
    scheduleAlarm(context, alarmPrefs)
    Sentry.configureScope { scope ->
      scope.setTag(
        "School ID", schoolId
      )
      scope.setTag(
        "School GIGA ID", gigaSchoolId
      )
    }
    call.resolve()
  }

  /**
   * Stores the selected application environment
   * in shared preferences.
   *
   * <p>Examples:
   * <ul>
   *   <li>development</li>
   *   <li>staging</li>
   *   <li>production</li>
   * </ul>
   *
   * @param call Capacitor plugin call containing environment details.
   */
  @PluginMethod
  fun storeEnvironment(call: PluginCall) {
    AppLogger.d("GIGA GigaAppPlugin", "Start Command Via Plugin")
    val context = context
    val env = call.getString(ENV_TYPE)
    val alarmPrefs = AlarmSharedPref(context)
    alarmPrefs.environment = env ?: "development"
    call.resolve()
  }

  /**
   * Checks whether a new application update
   * is available in Google Play Store.
   *
   * <p>This method:
   * <ul>
   *   <li>Fetches Play Store update information.</li>
   *   <li>Validates flexible update availability.</li>
   *   <li>Posts update events to the event bus.</li>
   *   <li>Logs update details into Sentry.</li>
   * </ul>
   *
   * @return update status message.
   */
  private suspend fun checkAppUpdate(): String {
    return withContext(Dispatchers.IO) {
      try {
        val appUpdateManager =
          AppUpdateManagerFactory.create(context)

        // WAIT for Play Store response
        val info = appUpdateManager.appUpdateInfo.await()
        if (info.updateAvailability() == UpdateAvailability.UPDATE_AVAILABLE &&
          info.isUpdateTypeAllowed(AppUpdateType.FLEXIBLE)
        ) {
          AppLogger.d("Update", "Update available and allowed")
          AppUpdateCheckEventBus.post(
            PluginEvent(PluginEvent.ACTION_APP_CHECK_AVAILABLE, "Update available and allowed")
          )
        } else {
          AppLogger.d("Update", "No update OR not allowed")
          AppUpdateCheckEventBus.post(
            PluginEvent(PluginEvent.ACTION_APP_CHECK_NOT_AVAILABLE, "No update available")
          )
          return@withContext "No update available"
        }
        return@withContext "Done"
      } catch (e: Exception) {
        Sentry.captureMessage("Updated Checker Failed due to ${e.message}")
        AppUpdateCheckEventBus.post(
          PluginEvent(PluginEvent.ACTION_APP_CHECK_NOT_AVAILABLE, "No update available")
        )
        return@withContext "App update is not allowed"
      }
    }
  }

  /**
   * Invokes asynchronous app update validation
   * from the Ionic UI layer.
   *
   * <p>The final update status result is returned
   * back to the Capacitor UI layer.
   *
   * @param call Capacitor plugin call instance.
   */
  @PluginMethod
  fun checkAppUpdateAvailable(call: PluginCall) {
    AppLogger.d("GIGA GigaAppPlugin", "Start Command Via Plugin")
    val context = context
    CoroutineScope(Dispatchers.IO).launch {
      try {
        val result = checkAppUpdate()
        val ret = JSObject()
        ret.put("value", result)
        call.resolve(ret)
      } catch (e: Exception) {
        call.reject(e.message)
      }
    }
  }


  /**
   * Clears all stored registration and scheduling data
   * from shared preferences.
   *
   * @param call Capacitor plugin call instance.
   */
  @PluginMethod
  fun clearStoredData(call: PluginCall) {
    val context = context
    val alarmPrefs = AlarmSharedPref(context)
    alarmPrefs.resetAllData()
    val tags = listOf(
      SCHEDULE_TYPE_DAILY,
      SCHEDULE_TYPE_START,
      FIRST_15_MIN
    )
    tags.forEach { tag ->
      AlarmHelper.cancelExactAlarm(context, tag)
    }
    Sentry.removeTag("School ID")
    Sentry.removeTag("School GIGA ID")
    call.resolve()
  }

  /**
   * Schedules background alarms for automatic speed tests.
   *
   * <p>The scheduling logic:
   * <ul>
   *   <li>Validates exact alarm permission availability.</li>
   *   <li>Schedules first execution within 15 minutes.</li>
   *   <li>Schedules future executions within generated time slots.</li>
   *   <li>Requests exact alarm permission if unavailable.</li>
   * </ul>
   *
   * @param context application context.
   * @param alarmPrefs shared preference manager containing scheduling data.
   */
  @SuppressLint("ScheduleExactAlarm")
  private fun scheduleAlarm(context: Context, alarmPrefs: AlarmSharedPref) {
    var canScheduleAlarm = true
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
      val alarmManager = context.getSystemService(AlarmManager::class.java)
      canScheduleAlarm = alarmManager.canScheduleExactAlarms()
    }

    if (canScheduleAlarm) {
      val now = System.currentTimeMillis()
      val lastExecutionDate = alarmPrefs.lastExecutionDay

      if (alarmPrefs.isNewDay()) {
        alarmPrefs.resetForNewDay()
        val randomIn15Min = now + (Math.random() * (15 * 60 * 1000L)).toLong()
        alarmPrefs.first15ScheduledTime = randomIn15Min
        AppLogger.d("GIGA GigaAppPlugin", "On New Registraion New Day 15 Min $randomIn15Min")
        alarmPrefs.nextExecutionTime = randomIn15Min
        AlarmHelper.scheduleExactAlarm(context, randomIn15Min, "FIRST_15_MIN")
      } else if (alarmPrefs.first15ExecutedTime == -1L) {
        val randomIn15Min = now + (Math.random() * (15 * 60 * 1000L)).toLong()
        alarmPrefs.first15ScheduledTime = randomIn15Min
        AppLogger.d("GIGA GigaAppPlugin", "Not Executed 15 Min $randomIn15Min")
        alarmPrefs.nextExecutionTime = randomIn15Min
        AlarmHelper.scheduleExactAlarm(context, randomIn15Min, "FIRST_15_MIN")
      } else {
        val executedTime = alarmPrefs.first15ExecutedTime
        val currentSlotStartHour = getSlotStartHour(executedTime)
        val range: Pair<Long?, Long?> =
          getNextSlotRange(executedTime, currentSlotStartHour, lastExecutionDate)
        val start: Long = range.first!!
        val end: Long = range.second!!
        val nextAlarmTime = start + (Math.random() * (end - start)).toLong()
        AppLogger.d("GIGA GigaAppPlugin", "For New Slot $nextAlarmTime")
        alarmPrefs.nextExecutionTime = nextAlarmTime
        AlarmHelper.scheduleExactAlarm(context, nextAlarmTime, "NEXT_SLOT")
      }
    } else {
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
        val intent = Intent(Settings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM)
        intent.data = "package:${context.packageName}".toUri()
        context.startActivity(intent)
      }
    }
  }
}
