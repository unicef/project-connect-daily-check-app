package com.meter.giga.ionic_plugin


import android.annotation.SuppressLint
import android.app.AlarmManager
import android.content.Context
import android.content.Intent
import android.os.Build
import android.provider.Settings
import android.widget.Toast
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
import com.meter.giga.ararm_scheduler.AlarmHelper
import com.meter.giga.ararm_scheduler.AlarmHelper.getNextSlotRange
import com.meter.giga.ararm_scheduler.AlarmHelper.getSlotStartHour
import com.meter.giga.domain.entity.SpeedTestResultEntity
import com.meter.giga.domain.entity.history.MeasurementsItem
import com.meter.giga.domain.entity.request.SpeedTestResultRequestEntity
import com.meter.giga.prefrences.AlarmSharedPref
import com.meter.giga.service.NetworkTestService
import com.meter.giga.utils.AppLogger
import com.meter.giga.utils.Constants.BASE_URL
import com.meter.giga.utils.Constants.ENV_TYPE
import com.meter.giga.utils.Constants.IP_INFO_TOKEN
import com.meter.giga.utils.Constants.MLAB_UPLOAD_KEY
import com.meter.giga.utils.Constants.REGISTRATION_BROWSER_ID
import com.meter.giga.utils.Constants.REGISTRATION_COUNTRY_CODE
import com.meter.giga.utils.Constants.REGISTRATION_GIGA_SCHOOL_ID
import com.meter.giga.utils.Constants.REGISTRATION_IP_ADDRESS
import com.meter.giga.utils.Constants.REGISTRATION_SCHOOL_ID
import com.meter.giga.utils.Constants.SCHEDULE_TYPE
import com.meter.giga.utils.GigaUtil
import com.meter.giga.worker.await
import io.sentry.Sentry
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import org.json.JSONArray
import org.json.JSONException
import org.json.JSONObject

@CapacitorPlugin(name = "GigaAppPlugin")
open class GigaAppPlugin : Plugin() {

  // Create singleton instance of Giga App Plugin
  companion object {
    private var pluginInstance: GigaAppPlugin? = null

    /**
     * This function used to pass the last speed test measurements
     * TO UI
     * @param downloadSpeed : Download Speed
     * @param uploadSpeed : Upload Speed
     * @param testStatus : upload/download
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
     * This function used to pass the last speed test measurements
     * TO UI
     * @param downloadSpeed : Download Speed
     * @param uploadSpeed : Upload Speed
     * @param testStatus : upload/download
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
     * This function used to pass the final speed test measurements
     * TO UI
     * @param speedTestData : Speed Test Result Entity contains all
     * speed test details
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
     * This function used to pass the speed test measurements failed
     * TO UI
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
     * This function used to pass the speed test measurements started
     * TO UI
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
     * This function used to pass the speed test measurements started
     * TO UI
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
     * This function used to pass the speed test measurements started
     * TO UI
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

  override fun load() {
    pluginInstance = this
  }

  /**
   * This function is invoked from ionic app UI
   * to get the Android ID
   * @param call : This contains all the passed params
   * as key value pair
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
   * This function is invoked from ionic app UI
   * to start the manual speed test on user button click
   * @param call : This contains all the passed params
   * as key value pair
   */
  @PluginMethod
  fun executeManualSpeedTest(call: PluginCall) {
    val context = context
    val scheduleType = call.getString(SCHEDULE_TYPE)
    AppLogger.d("GIGA GigaAppPlugin", "Manual Speed Test ${scheduleType}")

    val intent = Intent(context, NetworkTestService::class.java)
    intent.putExtra(SCHEDULE_TYPE, scheduleType)
    context.startForegroundService(intent)
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
    call.resolve()
  }

  /**
   * This function is getting used to return the historical data persisted in the
   * shared preferences while performing speed test in background.
   * @param call: PluginCall instance to pass the data on Capacitor
   * UI layer
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
   * This function is invoked from ionic app UI
   * to pass the data from UI to Android Native
   * Components
   * @param call : This contains all the passed params
   * as key value pair
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
    call.resolve()
  }

  /**
   * This function is invoked from ionic app UI
   * to pass the data from UI to Android Native
   * Components
   * @param call : This contains all the passed params
   * as key value pair
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

  private suspend fun checkAppUpdate(): String {
    return withContext(Dispatchers.IO) {
      Sentry.captureMessage("Updated Checker executed")
      try {
        Sentry.captureMessage("Updated Checker executed before play store check")

        val appUpdateManager =
          AppUpdateManagerFactory.create(context)

        // WAIT for Play Store response
        val info = appUpdateManager.appUpdateInfo.await()
        if (info.updateAvailability() == UpdateAvailability.UPDATE_AVAILABLE &&
          info.isUpdateTypeAllowed(AppUpdateType.FLEXIBLE)
        ) {
          Sentry.captureMessage("Update: Update available and allowed")
          AppLogger.d("Update", "Update available and allowed")
        } else {
          Sentry.captureMessage("Update: No update OR not allowed")
          AppLogger.d("Update", "No update OR not allowed")
          return@withContext "No update available"
        }
        return@withContext "Done"
      } catch (e: Exception) {
        Sentry.captureMessage("Updated Checker Failed due to ${e.message}")
        return@withContext "App update is not allowed"
      }
    }
  }

  @PluginMethod
  fun checkAppUpdateAvailable(call: PluginCall) {
    AppLogger.d("GIGA GigaAppPlugin", "Start Command Via Plugin")
    val context = context
    CoroutineScope(Dispatchers.Main).launch {
      try {
        val result = checkAppUpdate()
        val ret = JSObject()
        AppLogger.d("GIGA GigaAppPlugin", result)
        if (result !== "Done") {
          Toast.makeText(context, result, Toast.LENGTH_SHORT).show()
        }
        ret.put("value", result)
        call.resolve(ret)
      } catch (e: Exception) {
        call.reject(e.message)
      }
    }
  }


  /**
   * This function is invoked from ionic app UI
   * to clear the stored data from preferences
   * @param call : This contains all the passed params
   * as key value pair
   */
  @PluginMethod
  fun clearStoredData(call: PluginCall) {
    val context = context
    val alarmPrefs = AlarmSharedPref(context)
    alarmPrefs.resetAllData()
    call.resolve()
  }

  /**
   * This function is getting used to schedule the Alarm
   * to perform the speed test in background, when user updates/register
   * school in App
   * @param context: Application context to use native components
   * @param alarmPrefs: Shared Preference Instance to access and
   * update the stored values
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
