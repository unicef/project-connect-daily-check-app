package com.meter.giga.alarm_scheduler

import android.annotation.SuppressLint
import android.app.AlarmManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.os.Build
import com.meter.giga.receiver.ScheduleBroadcastReceiver
import com.meter.giga.utils.AppLogger
import com.meter.giga.utils.Constants
import com.meter.giga.utils.Constants.SCHEDULE_TYPE
import com.meter.giga.utils.Logger
import java.time.LocalDateTime
import java.time.temporal.ChronoUnit
import java.util.Calendar

/**
 * This provides Singleton instance of AlarmHelper
 * This class is used to schedule the next Speed Test
 * Also getting used to calculate the next speed test slot
 */
object AlarmHelper : AlarmHelperType {

  var logger: Logger = AppLogger

  /**
   * This function is getting used to schedule the speed test
   * at exact time
   * @param context: App context to schedule the alarm
   * @param triggerAtMillis: Time at which need to schedule the speed test
   * @param tag: Defines if scheduled test is of start or daily one
   */
  @SuppressLint("ScheduleExactAlarm")
  override fun scheduleExactAlarm(context: Context, triggerAtMillis: Long, tag: String) {
    logger.d("GIGA AlarmHelper", "scheduleExactAlarm at $triggerAtMillis")

    val alarmManager = context.getSystemService(Context.ALARM_SERVICE) as AlarmManager
    val intent = Intent(context, ScheduleBroadcastReceiver::class.java).apply {
      putExtra(SCHEDULE_TYPE, tag)
    }
    val pendingIntent = PendingIntent.getBroadcast(
      context,
      tag.hashCode(),
      intent,
      PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
    )

    alarmManager.setExactAndAllowWhileIdle(
      AlarmManager.RTC_WAKEUP,
      triggerAtMillis,
      pendingIntent
    )
  }

  // Fallback method when exact alarm permission is denied
  override fun scheduleInexactAlarm(context: Context, triggerTime: Long, type: String) {
    val alarmManager = context.getSystemService(Context.ALARM_SERVICE) as AlarmManager
    val pendingIntent = createPendingIntent(context, type)

    // Uses setAndAllowWhileIdle - fires within a window around the trigger time
    // System may batch this with other alarms for battery optimization
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
      alarmManager.setAndAllowWhileIdle(
        AlarmManager.RTC_WAKEUP,
        triggerTime,
        pendingIntent
      )
    } else {
      alarmManager.set(
        AlarmManager.RTC_WAKEUP,
        triggerTime,
        pendingIntent
      )
    }

    AppLogger.d("AlarmHelper", "Scheduled INEXACT alarm for ${triggerTime} (type: $type)")
  }

  private fun createPendingIntent(context: Context, type: String): PendingIntent {
    val intent = Intent(context, ScheduleBroadcastReceiver::class.java).apply {
      putExtra(Constants.SCHEDULE_TYPE, type)
    }
    return PendingIntent.getBroadcast(
      context,
      type.hashCode(),
      intent,
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
    )
  }

  /**
   * This function is getting used to get the next slot range
   * @param afterMillis : time instance in milliseconds
   * @param lastSlotHour : Previous speed test slot
   * @param lastExecutionDay : When the last scheduled speed test performed
   * @return Pair of start and end of slot time
   */

  override fun getNextSlotRange(
    afterMillis: Long,
    lastSlotHour: Int,
    lastExecutionDay: Int
  ): Pair<Long, Long> {
    val slots = listOf(8 to 12, 12 to 16, 16 to 20)
    val calendar = Calendar.getInstance().apply { timeInMillis = afterMillis }
    var isExecutedInCurrentSlot = false
    for ((startHour, endHour) in slots) {
      val start = Calendar.getInstance().apply {
        timeInMillis = calendar.timeInMillis
        set(Calendar.HOUR_OF_DAY, startHour)
        set(Calendar.MINUTE, 0)
        set(Calendar.SECOND, 0)
        set(Calendar.MILLISECOND, 0)
      }.timeInMillis

      val end = Calendar.getInstance().apply {
        timeInMillis = calendar.timeInMillis
        set(Calendar.HOUR_OF_DAY, endHour)
        set(Calendar.MINUTE, 0)
        set(Calendar.SECOND, 0)
        set(Calendar.MILLISECOND, 0)
      }.timeInMillis

      if (isExecutedInCurrentSlot) {
        logger.d("GIGA AlarmHelper", "Slot scheduling in next slot time")
        isExecutedInCurrentSlot = false
        return start to end
      }
      val today = Calendar.getInstance().get(Calendar.DAY_OF_YEAR)
      logger.d("GIGA AlarmHelper", "today at $today")
      if (afterMillis in start until end) {
        return if (lastSlotHour == startHour && today == lastExecutionDay) {
          logger.d("GIGA AlarmHelper", "Already Executed for Slot")
          isExecutedInCurrentSlot = true
          // Already executed in this slot, go to next
          continue
        } else {
          // Still inside current slot and not executed
          logger.d("GIGA AlarmHelper", "Deciding slot time")
          val adjustedStart = maxOf(afterMillis + 60_000L, start)
          return adjustedStart to end
        }
      }
    }

    logger.d("GIGA AlarmHelper", "getNextSlotRange scheduling for next day")

    // Move to next day's 6 AM - 8 PM
    val tomorrowStart = Calendar.getInstance().apply {
      add(Calendar.DATE, 1)
      set(Calendar.HOUR_OF_DAY, 6)
      set(Calendar.MINUTE, 0)
      set(Calendar.SECOND, 0)
      set(Calendar.MILLISECOND, 0)
    }.timeInMillis

    val tomorrowEnd = Calendar.getInstance().apply {
      add(Calendar.DATE, 1)
      set(Calendar.HOUR_OF_DAY, 8)
      set(Calendar.MINUTE, 0)
      set(Calendar.SECOND, 0)
      set(Calendar.MILLISECOND, 0)
    }.timeInMillis

    return tomorrowStart to tomorrowEnd
  }

  /**
   * returns slot time start time
   * @param millis : time instance in milliseconds
   * @return Slot start time
   */
  override fun getSlotStartHour(millis: Long): Int {
    val hour = Calendar.getInstance().apply {
      timeInMillis = millis
    }.get(Calendar.HOUR_OF_DAY)

    return when (hour) {
      in 8 until 12 -> 8
      in 12 until 16 -> 12
      in 16 until 20 -> 16
      else -> -1
    }
  }

  /**
   * Calculates the delay duration until the next scheduled
   * app version update check time.
   *
   * <p>The update check is scheduled daily at 12:00 PM.
   * If the current time has already passed today's 12:00 PM,
   * the next execution is scheduled for the following day.
   *
   * <p>This method:
   * <ul>
   *   <li>Determines the next target execution time.</li>
   *   <li>Calculates the delay in milliseconds.</li>
   *   <li>Logs the computed scheduling interval.</li>
   * </ul>
   *
   * @return delay duration in milliseconds until
   * the next version update check execution.
   */
  override fun getNextDayTimeToCheckVersionUpdate(): Long {
    val now = LocalDateTime.now()
    var target = now.withHour(12).withMinute(0).withSecond(0).withNano(0)
    if (now.isAfter(target)) {
      target = target.plusDays(1)
    }
    val delayMs = ChronoUnit.MILLIS.between(now, target)
    logger.d("Daily Schedule Interval", "Scheduled at time ${delayMs}")
    return delayMs
  }

  override fun cancelExactAlarm(context: Context, tag: String) {
    logger.d("GIGA AlarmHelper", "cancelExactAlarm for tag = $tag")

    val alarmManager = context.getSystemService(Context.ALARM_SERVICE) as AlarmManager

    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
      alarmManager.cancelAll()
    } else {
      val intent = Intent(context, ScheduleBroadcastReceiver::class.java).apply {
        putExtra(SCHEDULE_TYPE, tag)
      }

      val pendingIntent = PendingIntent.getBroadcast(
        context,
        tag.hashCode(),
        intent,
        PendingIntent.FLAG_NO_CREATE or PendingIntent.FLAG_IMMUTABLE
      )

      pendingIntent?.let {
        alarmManager.cancel(it)
        it.cancel()
      }
    }
  }
}
