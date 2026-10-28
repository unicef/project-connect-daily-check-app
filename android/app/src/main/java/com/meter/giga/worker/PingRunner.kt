package com.meter.giga.worker

import com.meter.giga.data.models.requests.ConnectivityRecordRequestModel
import com.meter.giga.data.models.requests.ConnectivityRecordsRequestModel
import com.meter.giga.data.models.requests.PendingPingModel
import com.meter.giga.network.RetrofitInstanceBuilder
import com.meter.giga.network.api.ApiService
import com.meter.giga.prefrences.AlarmSharedPref
import com.meter.giga.prefrences.PingStore
import com.meter.giga.utils.AppLogger
import com.meter.giga.utils.Constants.PING_ACTIVE_END_HOUR
import com.meter.giga.utils.Constants.PING_ACTIVE_START_HOUR
import com.meter.giga.utils.Constants.PING_FLAGS_REFRESH_MS
import com.meter.giga.utils.Constants.PING_RETENTION_MS
import com.meter.giga.utils.Constants.PING_REUSE_WINDOW_MS
import com.meter.giga.utils.Constants.PING_SYNC_BATCH_SIZE
import com.meter.giga.utils.Constants.PING_SYNC_INTERVAL_MS
import com.meter.giga.utils.Logger
import io.sentry.Sentry
import io.sentry.SentryLevel
import java.time.Instant
import java.time.ZoneId
import java.time.ZoneOffset
import java.time.format.DateTimeFormatter
import java.util.UUID
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlin.coroutines.cancellation.CancellationException

/**
 * One ping cycle, run by [PingWorker] every 15 minutes and by the plugin
 * before the first speed test:
 * - Takes a ping check between 8am and 8pm local time when the school's
 *   pingService flag is on, like the web PingService
 * - Drops checks older than 30 days
 * - Every 2 hours, posts waiting checks to /connectivity/{giga_id_school}
 *   in batches of 5, like the web SyncService
 */
class PingRunner(
  private val prefs: AlarmSharedPref,
  private val store: PingStore,
  private val probe: LatencyProbe,
  private val apiProvider: (String) -> ApiService = RetrofitInstanceBuilder::getSpeedTestApi,
  private val clock: () -> Long = System::currentTimeMillis,
  private val zone: ZoneId = ZoneId.systemDefault(),
  private val logger: Logger = AppLogger
) {

  /**
   * Runs are serialized so the worker and the plugin can't measure at the
   * same time; a run within 5 minutes of the last check reuses it.
   *
   * @return the check taken or reused in this cycle, or null if there is none
   */
  suspend fun run(): ConnectivityRecordRequestModel? = runLock.withLock { runCycle() }

  private suspend fun runCycle(): ConnectivityRecordRequestModel? {
    val gigaId = prefs.gigaSchoolId
    val baseUrl = prefs.baseUrl
    if (gigaId.isBlank() || !baseUrl.startsWith("http")) {
      logger.d(TAG, "No registered school, skipping ping")
      return null
    }
    val api = apiProvider(baseUrl)
    val authorization = "Bearer ${prefs.mlabUploadKey}"

    val record = when {
      !isWithinActiveHours() -> {
        logger.d(TAG, "Outside active hours, skipping ping")
        null
      }

      !isPingServiceEnabled(api, authorization, gigaId) -> {
        logger.d(TAG, "Ping service disabled by feature flags")
        null
      }

      else -> recentCheck() ?: takeCheck(gigaId)
    }

    store.pruneOlderThan(clock() - PING_RETENTION_MS)
    // A run with nothing queued must not start the 2-hour wait, or the first
    // check after registration waits 2 hours instead of posting right away.
    if (store.pending().isNotEmpty() && clock() - store.lastSyncAt >= PING_SYNC_INTERVAL_MS) {
      store.lastSyncAt = clock()
      syncPending(api, authorization)
    }
    return record
  }

  private fun isWithinActiveHours(): Boolean {
    val hour = Instant.ofEpochMilli(clock()).atZone(zone).hour
    return hour in PING_ACTIVE_START_HOUR until PING_ACTIVE_END_HOUR
  }

  /**
   * Reads the pingService flag at most every 6 hours. If it can't be read,
   * the last known value is used; a school whose flag was never read is
   * treated as disabled, as the web app does.
   */
  private suspend fun isPingServiceEnabled(
    api: ApiService,
    authorization: String,
    gigaId: String
  ): Boolean {
    val cached = store.pingServiceEnabled
    if (cached != null && clock() - store.flagsFetchedAt < PING_FLAGS_REFRESH_MS) {
      return cached
    }
    val flags = try {
      api.getFeatureFlags(authorization, gigaId).takeIf { it.isSuccessful }?.body()?.data
    } catch (e: CancellationException) {
      throw e
    } catch (e: Exception) {
      logger.d(TAG, "Feature flags request failed: ${e.message}")
      null
    }
    if (flags == null) return cached ?: false
    // The backend treats a missing pingService flag as enabled.
    val enabled = flags.pingService != false
    store.pingServiceEnabled = enabled
    store.flagsFetchedAt = clock()
    return enabled
  }

  /**
   * The last result is cleared when the device registers a school, so a
   * check is never reused across schools.
   */
  private fun recentCheck(): ConnectivityRecordRequestModel? {
    val last = store.lastResult ?: return null
    if (clock() - store.lastCheckAt >= PING_REUSE_WINDOW_MS) return null
    logger.d(TAG, "Reusing ping check taken at ${last.timestamp}")
    return last
  }

  private suspend fun takeCheck(gigaId: String): ConnectivityRecordRequestModel {
    val now = clock()
    val result = probe.measure()
    val record = ConnectivityRecordRequestModel(
      timestamp = ISO_UTC.format(Instant.ofEpochMilli(now)),
      isConnected = result.isConnected,
      errorMessage = result.errorMessage,
      browserId = prefs.browserId.takeUnless { it.isBlank() || it == "null" },
      appLocalUuid = UUID.randomUUID().toString(),
      latency = result.latencyMs
    )
    store.add(PendingPingModel(gigaId, now, record))
    logger.d(TAG, "Ping check stored: $record")
    return record
  }

  /**
   * Posts waiting checks per school in batches, retrying a failed batch once.
   * As in the web SyncService, a batch that fails twice stops the sync until
   * the next one; it stays queued and the backend skips checks it already
   * stored.
   */
  private suspend fun syncPending(api: ApiService, authorization: String) {
    val pendingBySchool = store.pending().groupBy { it.gigaIdSchool }
    for ((gigaId, pings) in pendingBySchool) {
      for (batch in pings.chunked(PING_SYNC_BATCH_SIZE)) {
        val body = ConnectivityRecordsRequestModel(batch.map { it.record })
        if (!postBatch(api, authorization, gigaId, body) &&
          !postBatch(api, authorization, gigaId, body)
        ) {
          logger.d(TAG, "Ping sync for $gigaId failed after retry, stopping until next sync")
          return
        }
        store.remove(batch.map { it.record.appLocalUuid }.toSet())
        logger.d(TAG, "Posted ${batch.size} ping checks for $gigaId")
      }
    }
  }

  /**
   * @return true if the backend stored the batch
   */
  private suspend fun postBatch(
    api: ApiService,
    authorization: String,
    gigaId: String,
    body: ConnectivityRecordsRequestModel
  ): Boolean {
    val response = try {
      api.postConnectivityRecords(authorization, gigaId, body)
    } catch (e: CancellationException) {
      throw e
    } catch (e: Exception) {
      logger.d(TAG, "Ping sync failed, device may be offline: ${e.message}")
      return false
    }
    if (!response.isSuccessful) {
      logger.d(TAG, "Ping sync rejected for $gigaId with HTTP ${response.code()}")
      Sentry.captureMessage("Ping sync rejected", SentryLevel.WARNING) { scope ->
        scope.setTag("http_status", "${response.code()}")
      }
    }
    return response.isSuccessful
  }

  private companion object {
    const val TAG = "GIGA PingRunner"

    val runLock = Mutex()

    // Same format as JavaScript's Date.toISOString(), which the web app sends
    val ISO_UTC: DateTimeFormatter =
      DateTimeFormatter.ofPattern("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'").withZone(ZoneOffset.UTC)
  }
}
