package com.meter.giga.worker

import android.content.Context
import androidx.work.CoroutineWorker
import androidx.work.WorkerParameters
import com.meter.giga.prefrences.AlarmSharedPref
import com.meter.giga.prefrences.PingStore
import io.sentry.Sentry
import kotlin.coroutines.cancellation.CancellationException

/**
 * Periodic worker that takes and posts ping checks without the app being
 * opened. Scheduled by [PingScheduler].
 *
 * It always succeeds: the next periodic run retries anything left queued.
 */
class PingWorker(
  appContext: Context,
  params: WorkerParameters
) : CoroutineWorker(appContext, params) {

  override suspend fun doWork(): Result {
    val runner = PingRunner(
      prefs = AlarmSharedPref(applicationContext),
      store = PingStore(applicationContext),
      probe = CloudflareLatencyProbe()
    )
    try {
      runner.run()
    } catch (e: CancellationException) {
      throw e
    } catch (e: Exception) {
      Sentry.captureException(e)
    }
    return Result.success()
  }
}
