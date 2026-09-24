package com.meter.giga

import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import androidx.work.ListenableWorker
import androidx.work.testing.TestListenableWorkerBuilder
import com.google.gson.Gson
import com.google.gson.reflect.TypeToken
import com.meter.giga.domain.entity.history.MeasurementsItem
import com.meter.giga.prefrences.AlarmSharedPref
import com.meter.giga.utils.Constants.SCHEDULE_TYPE
import com.meter.giga.utils.Constants.SCHEDULE_TYPE_MANUAL
import com.meter.giga.worker.NetworkTestWorker
import kotlinx.coroutines.runBlocking
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith

/**
 * Runs the production [NetworkTestWorker] path (Go ndt7 client) on device/emulator
 * and asserts the persisted Results match the desktop complete-summary schema.
 */
@RunWith(AndroidJUnit4::class)
class NetworkTestWorkerNdt7Test {

  private lateinit var prefs: AlarmSharedPref

  @Before
  fun setUp() {
    val context = InstrumentationRegistry.getInstrumentation().targetContext
    prefs = AlarmSharedPref(context)
    prefs.isTestRunning = false
    prefs.oldSpeedTestData = "[]"
    prefs.historyDataIndex = 0
    prefs.schoolId = "TEST-SCHOOL"
    prefs.gigaSchoolId = "GIGA-TEST"
    prefs.browserId = "android-test"
    prefs.countryCode = "ES"
    prefs.ipAddress = ""
    prefs.deviceHardwareId = "emulator-hw"
    // POST is expected to fail without a real backend; history is still saved.
    prefs.baseUrl = "https://invalid.example/"
    prefs.mlabUploadKey = "test-key"
    prefs.ipInfoToken = ""
  }

  @Test
  fun workerRunPersistsGoClientResultsSchema() = runBlocking {
    val context = InstrumentationRegistry.getInstrumentation().targetContext
    val worker = TestListenableWorkerBuilder<NetworkTestWorker>(context)
      .setInputData(
        androidx.work.Data.Builder()
          .putString(SCHEDULE_TYPE, SCHEDULE_TYPE_MANUAL)
          .build()
      )
      .build()

    val result = worker.doWork()
    assertTrue("worker result=$result", result is ListenableWorker.Result.Success)

    val rawHistory = prefs.oldSpeedTestData
    assertTrue(
      "history should not be empty: $rawHistory",
      rawHistory != "[]" && rawHistory.isNotBlank()
    )

    val listType = object : TypeToken<List<String>>() {}.type
    val items: List<String> = Gson().fromJson(rawHistory, listType)
    assertTrue(items.isNotEmpty())
    val measurement = Gson().fromJson(items.last(), MeasurementsItem::class.java)
    assertNotNull(measurement.results)
    val download = measurement.results!!.ndtResultS2C
    val upload = measurement.results!!.ndtResultC2S
    assertNotNull(download)
    assertNotNull(upload)

    assertDesktopSummary("download", download!!.toString())
    assertDesktopSummary("upload", upload!!.toString())

    assertNotNull(measurement.mlabInformation?.url)
    assertTrue(
      "ServerInfo URL should come from locate machine",
      !measurement.mlabInformation!!.url.isNullOrBlank()
    )

    val downloadMbps = JSONObject(download.toString())
      .getJSONObject("LastClientMeasurement")
      .getDouble("MeanClientMbps")
    val uploadMbps = JSONObject(upload.toString())
      .getJSONObject("LastClientMeasurement")
      .getDouble("MeanClientMbps")
    assertTrue(downloadMbps > 0)
    assertTrue(uploadMbps > 0)

    prefs.isTestRunning = false
  }

  private fun assertDesktopSummary(direction: String, raw: String) {
    val summary = JSONObject(raw)
    val client = summary.getJSONObject("LastClientMeasurement")
    val elapsed = client.getDouble("ElapsedTime")
    assertTrue("$direction ElapsedTime=$elapsed", elapsed in 1.0..30.0)
    assertTrue("$direction NumBytes", client.getDouble("NumBytes") > 0)
    assertTrue("$direction MeanClientMbps", client.getDouble("MeanClientMbps") > 0)
    val server = summary.getJSONObject("LastServerMeasurement")
    assertEquals("server", server.getString("Origin"))
    assertTrue(server.has("TCPInfo") || server.has("BBRInfo"))
    assertTrue("$direction ServerTime", summary.getLong("ServerTime") > 1_000_000_000_000L)
  }
}
