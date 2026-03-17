package com.meter.giga.receiver

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.util.Log
import com.meter.giga.ararm_scheduler.AlarmHelper
import com.meter.giga.ararm_scheduler.AlarmHelperType
import com.meter.giga.prefrences.AlarmSharedPref
import com.meter.giga.utils.AppLogger
import com.meter.giga.utils.Constants.FIRST_15_MIN
import com.meter.giga.utils.Constants.NEXT_SLOT
import com.meter.giga.utils.GigaUtil
import io.sentry.Sentry
import java.util.Date
import kotlin.random.Random

/**
 * BootBroadCastReceiver is used to receive the broadcast when system is restarted
 * This is native Broadcast Receiver component and registered in Manifest files
 * as well as Boot Broadcast Receiver
 */
class BootBroadCastReceiver(
  private val prefProvider: (Context) -> AlarmSharedPref = { ctx -> AlarmSharedPref(ctx) },
  private val alarmHelper: AlarmHelperType = AlarmHelper // Inject interface
) : BroadcastReceiver() {

  /**
   * BroadcastReceiver overridden method onReceive method implementation
   * @param context: Context of the app
   * @param intent: instance of Intent, contains the data
   */
  override fun onReceive(context: Context, intent: Intent?) {
    AppLogger.d("GIGA BootBroadCastReceiver", "On Boot")
    try {
      val prefs = prefProvider(context)
      val schoolId = prefs.schoolId
      if (schoolId != "" && intent?.action == Intent.ACTION_BOOT_COMPLETED && GigaUtil.isExactAlarmPermissionGranted(
          context
        )
      ) {
        try {
          scheduleAlarmOnRestart(context)
        } catch (e: Exception) {
          AppLogger.d("BootBroadCastReceiver", "Failed to schedule due to ${e.toString()}")
          scheduleAlarmOnRestart(context)
        }
      } else {
        if (schoolId == "") {
          AppLogger.d("BootBroadCastReceiver", "Failed to schedule due to no school is registered")
        } else {
          AppLogger.d("BootBroadCastReceiver", "Failed to schedule due to No permission granted")

        }
      }
    } catch (e: Exception) {
      Sentry.capture(e)
    }
  }

  /**
   * This function is used to schedule the speed test when device (Android/Chromebook)
   * gets restart any time in the day
   * It take cares of speed test type for the day, like initial 15 min speed test or slot based
   * speed test
   * @param context : Context of app, used to access the Shared Preferences
   */
  private fun scheduleAlarmOnRestart(context: Context) {
    try {
      val alarmPrefs = prefProvider(context)
      /**
       * This check used to check if speed test need to schedule for the
       * new day
       */
      if (alarmPrefs.isNewDay()) {
        alarmPrefs.resetForNewDay()
        val now = System.currentTimeMillis()
        val randomIn15Min = now + Random.nextLong(5 * 60 * 1000L, 15 * 60 * 1000L)
        alarmPrefs.first15ScheduledTime = randomIn15Min
        AppLogger.d("GIGA BootBroadCastReceiver", "On Boot New Day 15 Min $randomIn15Min")
        alarmPrefs.nextExecutionTime = randomIn15Min
        alarmHelper.scheduleExactAlarm(context, randomIn15Min, FIRST_15_MIN)
      }
      /**
       * This check used to check if first 15 min speed test was scheduled
       * but not executed for the day
       */
      else if (alarmPrefs.first15ExecutedTime == -1L) {
        val now = System.currentTimeMillis()
        val randomIn15Min = now + Random.nextLong(5 * 60 * 1000L, 15 * 60 * 1000L)
        alarmPrefs.first15ScheduledTime = randomIn15Min
        AppLogger.d("GIGA BootBroadCastReceiver", "On Boot Not Executed 15 Min $randomIn15Min")
        alarmPrefs.nextExecutionTime = randomIn15Min
        alarmHelper.scheduleExactAlarm(context, randomIn15Min, FIRST_15_MIN)
      }
      /**
       * This schedules slot speed test based on current time
       * if speed test for current slot already executed ,
       * it schedules for next slot else for current slot
       */
      else {
        val executedTime = alarmPrefs.first15ExecutedTime
        val lastExecutionDate = alarmPrefs.lastExecutionDay
        val currentSlotStartHour = alarmHelper.getSlotStartHour(executedTime)
        val (start, end) = alarmHelper.getNextSlotRange(
          executedTime,
          currentSlotStartHour,
          lastExecutionDate
        )
        val nextAlarmTime = Random.nextLong(start, end)
        AppLogger.d("GIGA BootBroadCastReceiver", "On Boot For Slot $nextAlarmTime")
        alarmPrefs.nextExecutionTime = nextAlarmTime
        alarmHelper.scheduleExactAlarm(context, nextAlarmTime, NEXT_SLOT)
      }
    } catch (e: Exception) {
      AppLogger.d("GIGA BootBroadCastReceiver", "On Boot For Slot ${e.toString()}")
      Sentry.capture("Received Exception while scheduling the speed test after boot completed")
    }
  }
}
