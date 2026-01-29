package com.meter.giga.ararm_scheduler

interface AlarmHelperType {
  fun scheduleExactAlarm(context: android.content.Context, triggerAtMillis: Long, tag: String)
  fun getNextSlotRange(
    afterMillis: Long,
    lastSlotHour: Int,
    lastExecutionDay: Int
  ): Pair<Long, Long>

  fun getSlotStartHour(millis: Long): Int
  fun getNextDayTimeToCheckVersionUpdate(): Long
}
