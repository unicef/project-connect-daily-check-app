package com.meter.giga.worker

import com.meter.giga.utils.Constants.PING_LATENCY_SAMPLES
import com.meter.giga.utils.Constants.PING_LATENCY_URL
import com.meter.giga.utils.Constants.PING_REQUEST_TIMEOUT_MS
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.Call
import okhttp3.EventListener
import okhttp3.OkHttpClient
import okhttp3.Request
import java.io.IOException
import java.util.concurrent.TimeUnit
import kotlin.math.roundToLong

/**
 * Outcome of one ping check
 * @param isConnected : true if at least one latency request succeeded
 * @param latencyMs : median latency in ms, rounded to 2 decimals, else null
 * @param errorMessage : reason no request succeeded, else null
 */
data class LatencyResult(
  val isConnected: Boolean,
  val latencyMs: Double?,
  val errorMessage: String?
)

interface LatencyProbe {
  suspend fun measure(): LatencyResult
}

/**
 * Measures unloaded latency the way the web app's Cloudflare SpeedTest does:
 * empty downloads from speed.cloudflare.com, timed from sending the request
 * to the first response byte, minus the server time Cloudflare reports in
 * Server-Timing, reduced to the median.
 */
class CloudflareLatencyProbe(
  private val client: OkHttpClient = defaultClient,
  private val url: String = PING_LATENCY_URL,
  private val samples: Int = PING_LATENCY_SAMPLES
) : LatencyProbe {

  override suspend fun measure(): LatencyResult = withContext(Dispatchers.IO) {
    val latencies = mutableListOf<Double>()
    var lastError: String? = null
    var consecutiveFailures = 0
    for (i in 0 until samples) {
      // An offline device would otherwise wait out every timeout.
      if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) break
      try {
        latencies += sample()
        consecutiveFailures = 0
      } catch (e: IOException) {
        lastError = e.message ?: e.javaClass.simpleName
        consecutiveFailures++
      }
    }
    if (latencies.isEmpty()) {
      LatencyResult(false, null, lastError ?: "Latency check failed")
    } else {
      LatencyResult(true, roundTo2(median(latencies)), null)
    }
  }

  private fun sample(): Double {
    val timing = RequestTiming()
    val request = Request.Builder()
      .url(url)
      .header("Cache-Control", "no-store")
      .build()
    client.newBuilder().eventListener(timing).build().newCall(request).execute().use { response ->
      if (!response.isSuccessful) throw IOException("HTTP ${response.code}")
      val roundTripMs = timing.roundTripMs() ?: throw IOException("Request was not timed")
      val serverMs = serverDurationMs(response.header("Server-Timing"))
      return (roundTripMs - serverMs).coerceAtLeast(0.0)
    }
  }

  private class RequestTiming : EventListener() {
    private var requestStart = 0L
    private var responseStart = 0L

    override fun requestHeadersStart(call: Call) {
      requestStart = System.nanoTime()
    }

    override fun responseHeadersStart(call: Call) {
      responseStart = System.nanoTime()
    }

    fun roundTripMs(): Double? =
      if (requestStart == 0L || responseStart == 0L) null
      else (responseStart - requestStart) / 1_000_000.0
  }

  companion object {
    private const val MAX_CONSECUTIVE_FAILURES = 3
    private val SERVER_DURATION = Regex("""cfRequestDuration;dur=([\d.]+)""")

    private val defaultClient: OkHttpClient by lazy {
      OkHttpClient.Builder()
        .callTimeout(PING_REQUEST_TIMEOUT_MS, TimeUnit.MILLISECONDS)
        .build()
    }

    internal fun serverDurationMs(serverTiming: String?): Double =
      serverTiming?.let { SERVER_DURATION.find(it)?.groupValues?.get(1)?.toDoubleOrNull() } ?: 0.0

    internal fun median(values: List<Double>): Double {
      val sorted = values.sorted()
      val mid = sorted.size / 2
      return if (sorted.size % 2 == 0) (sorted[mid - 1] + sorted[mid]) / 2 else sorted[mid]
    }

    internal fun roundTo2(value: Double): Double = (value * 100).roundToLong() / 100.0
  }
}
