package com.meter.giga.prefrences


import android.content.Context
import androidx.core.content.edit
import com.meter.giga.utils.Constants.ENVIRONMENT
import com.meter.giga.utils.Constants.GIGA_APP_PREFERENCES
import com.meter.giga.utils.Constants.KEY_BASE_URL
import com.meter.giga.utils.Constants.KEY_BROWSER_ID
import com.meter.giga.utils.Constants.KEY_COUNTRY_CODE
import com.meter.giga.utils.Constants.KEY_DEVICE_HARDWARE_ID
import com.meter.giga.utils.Constants.KEY_FIRST_15_EXECUTED_TIME
import com.meter.giga.utils.Constants.KEY_FIRST_15_SCHEDULED_TIME
import com.meter.giga.utils.Constants.KEY_GIGA_SCHOOL_ID
import com.meter.giga.utils.Constants.KEY_HISTORY_DATA_INDEX
import com.meter.giga.utils.Constants.KEY_IP_ADDRESS
import com.meter.giga.utils.Constants.KEY_IP_INFO_TOKEN
import com.meter.giga.utils.Constants.KEY_IS_TEST_RUNNING
import com.meter.giga.utils.Constants.KEY_LAST_EXECUTION_DAY
import com.meter.giga.utils.Constants.KEY_LAST_SLOT_EXECUTION_HOUR
import com.meter.giga.utils.Constants.KEY_LAST_UPDATE_CHECK_DATE
import com.meter.giga.utils.Constants.KEY_MLAB_UPLOAD_KEY
import com.meter.giga.utils.Constants.KEY_NEXT_EXECUTION_TIME
import com.meter.giga.utils.Constants.KEY_OLD_SPEEDTEST_DATA
import com.meter.giga.utils.Constants.KEY_SCHOOL_ID
import java.util.Calendar

/**
 * This class is used to provide getter and setter functions
 * for stored data in shared preferences for later use
 */
class AlarmSharedPref(context: Context) {

  private val prefs = context.getSharedPreferences(GIGA_APP_PREFERENCES, Context.MODE_PRIVATE)

  /**
   * This provides time stamp when first 15 min
   * speed test executed else -1
   */
  var first15ExecutedTime: Long
    get() = prefs.getLong(KEY_FIRST_15_EXECUTED_TIME, -1L)
    set(value) = prefs.edit() { putLong(KEY_FIRST_15_EXECUTED_TIME, value) }

  /**
   * This provides time stamp when first 15 min
   * speed test scheduled else -1
   */
  var first15ScheduledTime: Long
    get() = prefs.getLong(KEY_FIRST_15_SCHEDULED_TIME, -1L)
    set(value) = prefs.edit() { putLong(KEY_FIRST_15_SCHEDULED_TIME, value) }

  /**
   * This provides time stamp when last
   * speed test executed else -1
   */
  var lastExecutionDay: Int
    get() = prefs.getInt(KEY_LAST_EXECUTION_DAY, -1)
    set(value) = prefs.edit() { putInt(KEY_LAST_EXECUTION_DAY, value) }

  /**
   * This provides time stamp when next
   * speed test executed else -1
   */
  var nextExecutionTime: Long
    get() = prefs.getLong(KEY_NEXT_EXECUTION_TIME, -1L)
    set(value) = prefs.edit() { putLong(KEY_NEXT_EXECUTION_TIME, value) }

  /**
   * This provides slot hour when last
   * speed test executed else -1
   */
  var lastSlotHour: Int
    get() = prefs.getInt(KEY_LAST_SLOT_EXECUTION_HOUR, -1)
    set(value) = prefs.edit() { putInt(KEY_LAST_SLOT_EXECUTION_HOUR, value) }

  /**
   * This provides last speedtest data index
   * speed test executed else 0
   */
  var historyDataIndex: Int
    get() = prefs.getInt(KEY_HISTORY_DATA_INDEX, 0)
    set(value) = prefs.edit() {
      putInt(
        KEY_HISTORY_DATA_INDEX, value
      )
    }


  /**
   * This provides country code which
   * user has registered
   */
  var countryCode: String
    get() = prefs.getString(KEY_COUNTRY_CODE, null).toString()
    set(value) = prefs.edit() { putString(KEY_COUNTRY_CODE, value) }

  /**
   * This provides school id which
   * user has registered
   */
  var schoolId: String
    get() = prefs.getString(KEY_SCHOOL_ID, "").toString()
    set(value) = prefs.edit() { putString(KEY_SCHOOL_ID, value) }

  /**
   * This provides mlab upload key which
   */
  var mlabUploadKey: String
    get() = prefs.getString(KEY_MLAB_UPLOAD_KEY, "").toString()
    set(value) = prefs.edit() { putString(KEY_MLAB_UPLOAD_KEY, value) }

  /**
   * This provides school giga id which
   * user has registered
   */
  var gigaSchoolId: String
    get() = prefs.getString(KEY_GIGA_SCHOOL_ID, "").toString()
    set(value) = prefs.edit() { putString(KEY_GIGA_SCHOOL_ID, value) }

  /**
   * This provides browser id which
   * user has registered
   */
  var browserId: String
    get() = prefs.getString(KEY_BROWSER_ID, null).toString()
    set(value) = prefs.edit() { putString(KEY_BROWSER_ID, value) }

  /**
   * This provides ip base url which
   * passed from FE env file
   */
  var baseUrl: String
    get() = prefs.getString(KEY_BASE_URL, null).toString()
    set(value) = prefs.edit() { putString(KEY_BASE_URL, value) }

  /**
   * This provides ip info token which
   * passed from FE env file
   */
  var ipInfoToken: String
    get() = prefs.getString(KEY_IP_INFO_TOKEN, null).toString()
    set(value) = prefs.edit() { putString(KEY_IP_INFO_TOKEN, value) }

  /**
   * This provides ip address which
   * user has registered
   */
  var ipAddress: String
    get() = prefs.getString(KEY_IP_ADDRESS, null).toString()
    set(value) = prefs.edit() { putString(KEY_IP_ADDRESS, value) }

  /**
   * This provides ip old historical speed
   * test data
   */
  var oldSpeedTestData: String
    get() = prefs.getString(KEY_OLD_SPEEDTEST_DATA, "[]").toString()
    set(value) = prefs.edit() { putString(KEY_OLD_SPEEDTEST_DATA, value) }


  /**
   * This checks if last executed speed test date is
   * not equal to today date
   */
  var isTestRunning: Boolean
    get() = prefs.getBoolean(KEY_IS_TEST_RUNNING, false)
    set(value) = prefs.edit() { putBoolean(KEY_IS_TEST_RUNNING, value) }

  /**
   * This checks if last executed speed test date is
   * not equal to today date
   */
  fun isNewDay(): Boolean {
    val today = Calendar.getInstance().get(Calendar.DAY_OF_YEAR)
    return today != lastExecutionDay
  }

  /**
   * This provides school id which
   * user has registered
   */
  var deviceHardwareId: String
    get() = prefs.getString(KEY_DEVICE_HARDWARE_ID, "").toString()
    set(value) = prefs.edit() { putString(KEY_DEVICE_HARDWARE_ID, value) }

  /**
   * This provides day of update check
   */
  var dateOfLastUpdateCheck: Int
    get() = prefs.getInt(KEY_LAST_UPDATE_CHECK_DATE, -1)
    set(value) = prefs.edit() { putInt(KEY_LAST_UPDATE_CHECK_DATE, value) }


  /**
   * This provides environment
   */
  var environment: String
    get() = prefs.getString(ENVIRONMENT, "development").toString()
    set(value) = prefs.edit() { putString(ENVIRONMENT, value) }

  /**
   * This resets data if scheduling the speed
   * test for new day on first app launch in the day
   */
  fun resetForNewDay() {
    first15ScheduledTime = -1
    first15ExecutedTime = -1
    lastSlotHour = -1
    lastExecutionDay = -1
    isTestRunning = false
    nextExecutionTime = -1
  }

  /**
   * This resets all data if new school id is
   * getting registered
   */
  fun resetAllData() {
    resetForNewDay()
    schoolId = ""
    gigaSchoolId = ""
    browserId = ""
    countryCode = ""
    ipAddress = ""
    oldSpeedTestData = "[]"
    historyDataIndex = 0
  }
}

