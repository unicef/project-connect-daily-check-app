package com.meter.giga.alarm_scheduler

import android.content.Context

/**
 * Contract interface defining alarm scheduling
 * and execution time calculation operations.
 *
 * <p>This interface is responsible for:
 * <ul>
 *   <li>Scheduling exact alarms.</li>
 *   <li>Calculating next execution slot ranges.</li>
 *   <li>Determining slot start hours.</li>
 *   <li>Providing next app update check intervals.</li>
 * </ul>
 *
 * <p>Implementations of this interface are used for
 * managing periodic speed test execution scheduling.
 */
interface AlarmHelperType {
  /**
   * Schedules an exact alarm at the specified timestamp.
   *
   * <p>The scheduled alarm is typically used to trigger
   * background speed test execution or update checks.
   *
   * @param context application context.
   * @param triggerAtMillis timestamp in milliseconds
   * representing when the alarm should trigger.
   * @param tag identifier associated with the alarm request.
   */
  fun scheduleExactAlarm(context: android.content.Context, triggerAtMillis: Long, tag: String)

  fun scheduleInexactAlarm(context: Context, triggerTime: Long, type: String)

  /**
   * Calculates the next valid execution slot range
   * based on the previous execution time.
   *
   * <p>The returned pair contains:
   * <ul>
   *   <li>Start timestamp of the next slot.</li>
   *   <li>End timestamp of the next slot.</li>
   * </ul>
   *
   * @param afterMillis previous execution timestamp.
   * @param lastSlotHour previously executed slot hour.
   * @param lastExecutionDay last execution calendar day.
   *
   * @return pair containing start and end timestamps
   * for the next execution slot.
   */
  fun getNextSlotRange(
    afterMillis: Long,
    lastSlotHour: Int,
    lastExecutionDay: Int
  ): Pair<Long, Long>

  /**
   * Returns the start hour associated with
   * the provided timestamp slot.
   *
   * @param millis timestamp in milliseconds.
   * @return slot start hour in 24-hour format.
   */
  fun getSlotStartHour(millis: Long): Int

  /**
   * Calculates the delay duration until
   * the next application version update check.
   *
   * @return delay duration in milliseconds.
   */
  fun getNextDayTimeToCheckVersionUpdate(): Long

  fun cancelExactAlarm(context: Context, tag: String)

}
