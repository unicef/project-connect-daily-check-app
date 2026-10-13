package com.meter.giga.worker

import com.meter.giga.worker.CloudflareLatencyProbe.Companion.median
import com.meter.giga.worker.CloudflareLatencyProbe.Companion.roundTo2
import com.meter.giga.worker.CloudflareLatencyProbe.Companion.serverDurationMs
import org.junit.Assert.assertEquals
import org.junit.Test

class CloudflareLatencyProbeTest {

  @Test
  fun `reads Cloudflare's request duration from Server-Timing`() {
    assertEquals(1.5, serverDurationMs("cfRequestDuration;dur=1.5"), 0.0)
    assertEquals(0.25, serverDurationMs("cfL4;desc=\"?proto=TCP\", cfRequestDuration;dur=0.25"), 0.0)
  }

  @Test
  fun `server duration is zero when the header is missing or unrelated`() {
    assertEquals(0.0, serverDurationMs(null), 0.0)
    assertEquals(0.0, serverDurationMs("cache;desc=\"hit\""), 0.0)
  }

  @Test
  fun `median of odd and even sample counts`() {
    assertEquals(20.0, median(listOf(30.0, 10.0, 20.0)), 0.0)
    assertEquals(25.0, median(listOf(40.0, 10.0, 20.0, 30.0)), 0.0)
  }

  @Test
  fun `latency is rounded to two decimals like the web app`() {
    assertEquals(28.41, roundTo2(28.4149), 0.0)
    assertEquals(28.42, roundTo2(28.4151), 0.0)
  }
}
