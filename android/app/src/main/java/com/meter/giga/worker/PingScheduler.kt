package com.meter.giga.worker

import android.content.Context
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.ExistingWorkPolicy
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import com.meter.giga.prefrences.PingStore
import com.meter.giga.utils.Constants.PING_ACTIVE_END_HOUR
import com.meter.giga.utils.Constants.PING_ACTIVE_START_HOUR
import com.meter.giga.utils.Constants.PING_INTERVAL_MIN
import com.meter.giga.utils.Constants.PING_ON_OPEN_WORK_NAME
import com.meter.giga.utils.Constants.PING_WORK_NAME
import java.time.Instant
import java.time.ZoneId
import java.util.concurrent.TimeUnit

/**
 * Schedules [PingWorker] every 15 minutes, the shortest interval WorkManager
 * allows. WorkManager keeps the schedule across reboots, and KEEP leaves an
 * existing schedule untouched, so this is safe to call on every app start.
 *
 * There is no network constraint: checks taken offline are recorded as
 * not connected.
 */
object PingScheduler {

  @JvmStatic
  fun schedule(context: Context) {
    val request = PeriodicWorkRequestBuilder<PingWorker>(PING_INTERVAL_MIN, TimeUnit.MINUTES).build()
    WorkManager.getInstance(context).enqueueUniquePeriodicWork(
      PING_WORK_NAME,
      ExistingPeriodicWorkPolicy.KEEP,
      request
    )
  }

  /**
   * Runs [PingWorker] once now if it is within active hours and no check was
   * taken today, for devices where Doze or battery restrictions held the
   * periodic work back. The pingService flag still applies in the worker.
   *
   * @return true if a run was queued
   */
  @JvmStatic
  @JvmOverloads
  fun checkNowIfNoneToday(
    context: Context,
    now: Long = System.currentTimeMillis(),
    zone: ZoneId = ZoneId.systemDefault()
  ): Boolean {
    val current = Instant.ofEpochMilli(now).atZone(zone)
    if (current.hour !in PING_ACTIVE_START_HOUR until PING_ACTIVE_END_HOUR) return false
    val lastCheckAt = PingStore(context).lastCheckAt
    if (lastCheckAt > 0 &&
      Instant.ofEpochMilli(lastCheckAt).atZone(zone).toLocalDate() == current.toLocalDate()
    ) {
      return false
    }
    WorkManager.getInstance(context).enqueueUniqueWork(
      PING_ON_OPEN_WORK_NAME,
      ExistingWorkPolicy.KEEP,
      OneTimeWorkRequestBuilder<PingWorker>().build()
    )
    return true
  }

  @JvmStatic
  fun cancel(context: Context) {
    WorkManager.getInstance(context).cancelUniqueWork(PING_WORK_NAME)
    WorkManager.getInstance(context).cancelUniqueWork(PING_ON_OPEN_WORK_NAME)
  }
}
