package com.meter.giga

import androidx.test.ext.junit.runners.AndroidJUnit4
import ndt7client.Callbacks
import ndt7client.Ndt7client
import org.json.JSONObject
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicReference

@RunWith(AndroidJUnit4::class)
class Ndt7ClientTest {

  @Test
  fun runAgainstMlabMatchesDesktopSchema() {
    val download = AtomicReference<String>()
    val upload = AtomicReference<String>()
    val error = AtomicReference<String>()
    val done = CountDownLatch(1)

    Ndt7client.run(
      "0.1.0",
      object : Callbacks {
        override fun onServerDiscovery() {}
        override fun onServerChosen(serverJSON: String) {}
        override fun onDownloadProgress(clientJSON: String) {}
        override fun onUploadProgress(clientJSON: String) {}
        override fun onDownloadComplete(summaryJSON: String) {
          download.set(summaryJSON)
        }
        override fun onUploadComplete(summaryJSON: String) {
          upload.set(summaryJSON)
          done.countDown()
        }
        override fun onError(direction: String, message: String) {
          error.set("$direction: $message")
          done.countDown()
        }
      }
    )

    assertTrue("test did not finish", done.await(3, TimeUnit.MINUTES))
    assertTrue("error: ${error.get()}", error.get() == null)
    assertDesktopSummary("download", download.get())
    assertDesktopSummary("upload", upload.get())
  }

  private fun assertDesktopSummary(direction: String, raw: String?) {
    assertTrue("$direction summary missing", raw != null)
    val summary = JSONObject(raw)
    val client = summary.getJSONObject("LastClientMeasurement")
    val elapsed = client.getDouble("ElapsedTime")
    assertTrue("$direction ElapsedTime=$elapsed", elapsed in 1.0..30.0)
    assertTrue("$direction NumBytes", client.getDouble("NumBytes") > 0)
    assertTrue("$direction MeanClientMbps", client.getDouble("MeanClientMbps") > 0)
    val server = summary.getJSONObject("LastServerMeasurement")
    assertTrue(server.getString("Origin") == "server")
    assertTrue(server.has("TCPInfo"))
    assertTrue("$direction ServerTime", summary.getLong("ServerTime") > 1_000_000_000_000L)
  }
}
