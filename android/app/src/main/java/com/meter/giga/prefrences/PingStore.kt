package com.meter.giga.prefrences

import android.content.Context
import androidx.core.content.edit
import com.google.gson.Gson
import com.google.gson.JsonParseException
import com.meter.giga.data.models.requests.ConnectivityRecordRequestModel
import com.meter.giga.data.models.requests.PendingPingModel
import com.meter.giga.utils.Constants.KEY_LAST_PING_RESULT
import com.meter.giga.utils.Constants.KEY_PENDING_PINGS
import com.meter.giga.utils.Constants.KEY_PING_FLAGS_FETCHED_AT
import com.meter.giga.utils.Constants.KEY_PING_LAST_CHECK_AT
import com.meter.giga.utils.Constants.KEY_PING_LAST_SYNC_AT
import com.meter.giga.utils.Constants.KEY_PING_SERVICE_ENABLED
import com.meter.giga.utils.Constants.PING_MAX_PENDING
import com.meter.giga.utils.Constants.PING_PREFERENCES

/**
 * Stores ping checks until they are posted, the latest check for the
 * dashboard, and the school's cached pingService flag.
 *
 * The periodic worker and the plugin can run at the same time, so every
 * read-modify-write of the queue holds [lock]. Queue writes are committed
 * synchronously because the worker's process can be killed right after.
 */
class PingStore(context: Context) {

  private val prefs = context.getSharedPreferences(PING_PREFERENCES, Context.MODE_PRIVATE)
  private val gson = Gson()

  /**
   * Queues a ping check and makes it the latest result. The oldest checks
   * are dropped once [PING_MAX_PENDING] are waiting.
   */
  fun add(ping: PendingPingModel) = synchronized(lock) {
    val pending = (readPending() + ping).takeLast(PING_MAX_PENDING)
    prefs.edit(commit = true) {
      putString(KEY_PENDING_PINGS, gson.toJson(pending))
      putString(KEY_LAST_PING_RESULT, gson.toJson(ping.record))
      putLong(KEY_PING_LAST_CHECK_AT, ping.createdAt)
    }
  }

  /**
   * Time the latest check was taken, else 0. Survives [resetSchoolState] so
   * re-registering doesn't force an extra check that day.
   */
  val lastCheckAt: Long
    get() = prefs.getLong(KEY_PING_LAST_CHECK_AT, 0L)

  fun pending(): List<PendingPingModel> = synchronized(lock) { readPending() }

  /**
   * Removes posted checks by their app_local_uuid
   */
  fun remove(appLocalUuids: Set<String>) = synchronized(lock) {
    writePending(readPending().filterNot { it.record.appLocalUuid in appLocalUuids })
  }

  /**
   * Drops checks taken before [cutoff], posted or not, as the web app does
   */
  fun pruneOlderThan(cutoff: Long) = synchronized(lock) {
    val pending = readPending()
    val kept = pending.filter { it.createdAt >= cutoff }
    if (kept.size != pending.size) writePending(kept)
  }

  val lastResult: ConnectivityRecordRequestModel?
    get() = prefs.getString(KEY_LAST_PING_RESULT, null)?.let {
      try {
        gson.fromJson(it, ConnectivityRecordRequestModel::class.java)
      } catch (e: JsonParseException) {
        null
      }
    }

  /**
   * Last pingService flag read from the backend, null if never read
   */
  var pingServiceEnabled: Boolean?
    get() = if (prefs.contains(KEY_PING_SERVICE_ENABLED)) {
      prefs.getBoolean(KEY_PING_SERVICE_ENABLED, true)
    } else null
    set(value) = prefs.edit {
      if (value == null) remove(KEY_PING_SERVICE_ENABLED) else putBoolean(KEY_PING_SERVICE_ENABLED, value)
    }

  var flagsFetchedAt: Long
    get() = prefs.getLong(KEY_PING_FLAGS_FETCHED_AT, 0L)
    set(value) = prefs.edit { putLong(KEY_PING_FLAGS_FETCHED_AT, value) }

  /**
   * Time of the last sync attempt, else 0
   */
  var lastSyncAt: Long
    get() = prefs.getLong(KEY_PING_LAST_SYNC_AT, 0L)
    set(value) = prefs.edit { putLong(KEY_PING_LAST_SYNC_AT, value) }

  /**
   * Forgets the flag and latest result of the previous school. Queued
   * checks are kept and still posted to the school they were taken for.
   */
  fun resetSchoolState() {
    prefs.edit {
      remove(KEY_PING_SERVICE_ENABLED)
      remove(KEY_PING_FLAGS_FETCHED_AT)
      remove(KEY_LAST_PING_RESULT)
    }
  }

  private fun readPending(): List<PendingPingModel> {
    val json = prefs.getString(KEY_PENDING_PINGS, null) ?: return emptyList()
    return try {
      gson.fromJson(json, Array<PendingPingModel>::class.java)?.toList() ?: emptyList()
    } catch (e: JsonParseException) {
      emptyList()
    }
  }

  private fun writePending(pending: List<PendingPingModel>) {
    prefs.edit(commit = true) { putString(KEY_PENDING_PINGS, gson.toJson(pending)) }
  }

  private companion object {
    val lock = Any()
  }
}
