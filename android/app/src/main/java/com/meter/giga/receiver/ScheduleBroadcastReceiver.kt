package com.meter.giga.receiver

import android.Manifest
import android.app.AlarmManager
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import androidx.core.content.ContextCompat
import com.meter.giga.alarm_scheduler.AlarmHelper
import com.meter.giga.alarm_scheduler.AlarmHelperType
import com.meter.giga.prefrences.AlarmSharedPref
import com.meter.giga.service.NetworkTestService
import com.meter.giga.utils.AppLogger
import com.meter.giga.utils.Constants.FIRST_15_MIN
import com.meter.giga.utils.Constants.NEXT_SLOT
import com.meter.giga.utils.Constants.SCHEDULE_TYPE
import com.meter.giga.utils.Constants.SCHEDULE_TYPE_DAILY
import com.meter.giga.utils.Constants.SCHEDULE_TYPE_START
import com.meter.giga.utils.GigaUtil
import io.sentry.Sentry
import java.util.Calendar
import kotlin.random.Random

/**
 * ScheduleBroadcastReceiver handles:
 * 1. Alarm broadcast when scheduled time arrives
 * 2. SCHEDULE_EXACT_ALARM permission state changes (Android 12+)
 *
 * This is registered in Manifest for both alarm triggers and permission state changes.
 */
class ScheduleBroadcastReceiver(
  private val prefProvider: (Context) -> AlarmSharedPref = { ctx -> AlarmSharedPref(ctx) },
  private val alarmHelper: AlarmHelperType = AlarmHelper
) : BroadcastReceiver() {

  override fun onReceive(context: Context, intent: Intent?) {
    when (intent?.action) {
      // Handle permission state change for SCHEDULE_EXACT_ALARM (Android 12+)
      AlarmManager.ACTION_SCHEDULE_EXACT_ALARM_PERMISSION_STATE_CHANGED -> {
        val prefs = prefProvider(context)
        val schoolId = prefs.schoolId
        if (schoolId !== "") {
          handleAlarmPermissionChange(context, intent)
        }
      }
      // Handle scheduled alarm trigger
      else -> {
        handleAlarmTrigger(context, intent)
      }
    }
  }

  /**
   * Handles SCHEDULE_EXACT_ALARM permission state change
   * This broadcast is sent when user GRANTS the permission (not when revoked)
   */
  private fun handleAlarmPermissionChange(context: Context, intent: Intent) {
    AppLogger.d("GIGA ScheduleBroadcastReceiver", "SCHEDULE_EXACT_ALARM permission changed")

    val hasAlarmPermission = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
      val alarmManager = context.getSystemService(Context.ALARM_SERVICE) as AlarmManager
      alarmManager.canScheduleExactAlarms()
    } else true

    if (hasAlarmPermission) {
      AppLogger.d(
        "GIGA ScheduleBroadcastReceiver",
        "Alarm permission granted - rescheduling exact alarms"
      )
      // Reschedule exact alarms now that permission is granted
      rescheduleExactAlarms(context)
    } else {
      AppLogger.d("GIGA ScheduleBroadcastReceiver", "Alarm permission not granted or revoked")
      // Permission was revoked or not granted - continue using inexact alarms
    }
  }

  /**
   * Reschedules all exact alarms after permission is granted
   */
  private fun rescheduleExactAlarms(context: Context) {
    try {
      val prefs = prefProvider(context)
      val nextExecutionTime = prefs.nextExecutionTime

      if (nextExecutionTime > 0 && nextExecutionTime > System.currentTimeMillis()) {
        // Schedule the next exact alarm
        val canScheduleExactAlarm = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
          val alarmManager = context.getSystemService(Context.ALARM_SERVICE) as AlarmManager
          alarmManager.canScheduleExactAlarms()
        } else true

        if (canScheduleExactAlarm) {
          alarmHelper.scheduleExactAlarm(context, nextExecutionTime, NEXT_SLOT)
          AppLogger.d(
            "GIGA ScheduleBroadcastReceiver",
            "Rescheduled exact alarm for ${nextExecutionTime}"
          )
        }
      }

      // Also check notification permission and start service if needed
      checkNotificationAndStartService(context)

    } catch (e: Exception) {
      Sentry.captureException(e)
      AppLogger.d("GIGA ScheduleBroadcastReceiver", "Error rescheduling alarms: ${e.message}")
    }
  }

  /**
   * Checks notification permission and starts foreground service if granted
   */
  private fun checkNotificationAndStartService(context: Context) {
    val hasNotificationPermission = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
      ContextCompat.checkSelfPermission(
        context,
        Manifest.permission.POST_NOTIFICATIONS
      ) == PackageManager.PERMISSION_GRANTED
    } else true

    if (hasNotificationPermission) {
      AppLogger.d(
        "GIGA ScheduleBroadcastReceiver",
        "Notification permission granted - starting service"
      )
      val serviceIntent = Intent(context, NetworkTestService::class.java).apply {
        putExtra(SCHEDULE_TYPE, SCHEDULE_TYPE_START)
      }
      ContextCompat.startForegroundService(context, serviceIntent)
    } else {
      AppLogger.d(
        "GIGA ScheduleBroadcastReceiver",
        "Notification permission still denied after alarm permission granted"
      )
      // Optionally: Show notification in settings or prompt user
    }
  }

  /**
   * Handles the main alarm trigger when scheduled time arrives
   */
  private fun handleAlarmTrigger(context: Context, intent: Intent?) {
    try {
      val prefs = prefProvider(context)
      val lastExecutionDate = prefs.lastExecutionDay
      val today = Calendar.getInstance().get(Calendar.DAY_OF_YEAR)

      // Check notification permission before starting foreground service
      val hasNotificationPermission = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
        ContextCompat.checkSelfPermission(
          context,
          Manifest.permission.POST_NOTIFICATIONS
        ) == PackageManager.PERMISSION_GRANTED
      } else true

      val serviceIntent = Intent(context, NetworkTestService::class.java).apply {
        putExtra(
          SCHEDULE_TYPE,
          if (intent?.getStringExtra(SCHEDULE_TYPE) == FIRST_15_MIN) {
            SCHEDULE_TYPE_START
          } else if (today != lastExecutionDate) {
            SCHEDULE_TYPE_START
          } else {
            SCHEDULE_TYPE_DAILY
          }
        )
      }

      // Only start foreground service if notification permission is granted
      if (hasNotificationPermission) {
        if (intent?.getStringExtra(SCHEDULE_TYPE) == FIRST_15_MIN) {
          ContextCompat.startForegroundService(context, serviceIntent)
        } else if (today != lastExecutionDate &&
          intent?.getStringExtra(SCHEDULE_TYPE) != FIRST_15_MIN &&
          GigaUtil.isBefore8AM()
        ) {
          AppLogger.d("GIGA ScheduleBroadcastReceiver", "Schedule for 8 AM to 12 PM Slot")
        } else {
          ContextCompat.startForegroundService(context, serviceIntent)
        }
      } else {
        // Notification permission denied - don't start foreground service
        AppLogger.d(
          "GIGA ScheduleBroadcastReceiver",
          "Notification permission denied, skipping foreground service"
        )
      }

      val type = intent?.getStringExtra(SCHEDULE_TYPE) ?: return

      // Update prefs and schedule next alarm (can proceed even without notification permission)
      val now = System.currentTimeMillis()
      var currentSlotStartHour = alarmHelper.getSlotStartHour(now)
      val currentHour = Calendar.getInstance().apply {
        timeInMillis = now
      }.get(Calendar.HOUR_OF_DAY)

      if (type == FIRST_15_MIN) {
        AppLogger.d("GIGA ScheduleBroadcastReceiver", "FIRST_15_MIN at $FIRST_15_MIN")
        currentSlotStartHour = -1
        prefs.first15ExecutedTime = now
      }
      if (currentSlotStartHour == -1 && Calendar.getInstance().get(Calendar.HOUR_OF_DAY) < 8) {
        currentSlotStartHour = 8
      }
      prefs.lastExecutionDay = Calendar.getInstance().get(Calendar.DAY_OF_YEAR)
      prefs.lastSlotHour = currentSlotStartHour

      val (start, end) = if (currentHour < 8) {
        val nextSlotStart = Calendar.getInstance().apply {
          set(Calendar.HOUR_OF_DAY, 8)
          set(Calendar.MINUTE, 0)
          set(Calendar.SECOND, 0)
          set(Calendar.MILLISECOND, 0)
        }.timeInMillis

        val nextSlotEnd = Calendar.getInstance().apply {
          set(Calendar.HOUR_OF_DAY, 12)
          set(Calendar.MINUTE, 0)
          set(Calendar.SECOND, 0)
          set(Calendar.MILLISECOND, 0)
        }.timeInMillis

        nextSlotStart to nextSlotEnd

      } else {
        alarmHelper.getNextSlotRange(now, currentSlotStartHour, lastExecutionDate)
      }

      val nextAlarmTime = Random.nextLong(start, end)
      prefs.nextExecutionTime = nextAlarmTime

      // Check alarm permission before scheduling exact alarm
      val canScheduleExactAlarm = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
        val alarmManager = context.getSystemService(Context.ALARM_SERVICE) as AlarmManager
        alarmManager.canScheduleExactAlarms()
      } else true

      if (canScheduleExactAlarm) {
        alarmHelper.scheduleExactAlarm(context, nextAlarmTime, NEXT_SLOT)
      } else {
        // Fallback to inexact alarm or handle gracefully
        AppLogger.d(
          "GIGA ScheduleBroadcastReceiver",
          "Exact alarm permission denied, using inexact alarm"
        )
        alarmHelper.scheduleInexactAlarm(context, nextAlarmTime, NEXT_SLOT)
      }

    } catch (e: Exception) {
      Sentry.captureException(e)
      AppLogger.d("GIGA ScheduleBroadcastReceiver", "Error in handleAlarmTrigger: ${e.message}")
    }
  }
}
