package com.meter.giga.utils

import android.app.AlarmManager
import android.app.Application
import android.content.Context
import com.google.gson.Gson
import com.google.gson.JsonParser
import com.meter.giga.domain.entity.history.AccessInformation
import com.meter.giga.domain.entity.history.DataUsage
import com.meter.giga.domain.entity.history.MeasurementsItem
import com.meter.giga.domain.entity.history.MlabInformation
import com.meter.giga.domain.entity.history.SnapLog
import com.meter.giga.domain.entity.request.ClientInfoRequestEntity
import com.meter.giga.prefrences.AlarmSharedPref
import com.meter.giga.utils.Constants.M_D_YYYY_H_MM_SS_A
import io.mockk.every
import io.mockk.mockk
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import java.time.LocalDateTime
import java.time.format.DateTimeFormatter
import java.util.Locale

@RunWith(RobolectricTestRunner::class)
@Config(application = Application::class)
class GigaUtilTest {

  private lateinit var mockContext: Context
  private lateinit var mockAlarmManager: AlarmManager

  private val deviceInfo = DeviceInfo(
    manufacturer = "Test",
    model = "Model",
    deviceName = "Device",
    sdkInt = 35,
    buildId = 1L
  )

  @Before
  fun setup() {
    mockContext = mockk()
    mockAlarmManager = mockk()
    every { mockContext.getSystemService(Context.ALARM_SERVICE) } returns mockAlarmManager
    every { mockAlarmManager.canScheduleExactAlarms() } returns true
  }

  @Test
  fun `isExactAlarmPermissionGranted returns true on Android S and above`() {
    assertTrue(GigaUtil.isExactAlarmPermissionGranted(mockContext))
  }

  @Test
  fun `getCurrentFormattedTime returns non-empty string`() {
    val result = GigaUtil.getCurrentFormattedTime()
    val formatter = DateTimeFormatter.ofPattern(M_D_YYYY_H_MM_SS_A, Locale.ENGLISH)
    LocalDateTime.parse(result, formatter)
  }

  @Test
  fun `convertToIso converts correctly`() {
    val iso = GigaUtil.convertToIso(GigaUtil.getCurrentFormattedTime())
    assertTrue(iso.contains("Z"))
  }

  @Test
  fun `addJsonItem adds item to empty list`() {
    assertEquals("[\"item1\"]", GigaUtil.addJsonItem("[]", "item1"))
  }

  @Test
  fun `addJsonItem removes oldest item if list exceeds 10`() {
    val existing = "[\"1\",\"2\",\"3\",\"4\",\"5\",\"6\",\"7\",\"8\",\"9\",\"10\"]"
    assertEquals(
      "[\"2\",\"3\",\"4\",\"5\",\"6\",\"7\",\"8\",\"9\",\"10\",\"11\"]",
      GigaUtil.addJsonItem(existing, "11")
    )
  }

  @Test
  fun `checkIfFutureAlarmScheduled returns correct boolean`() {
    val alarmPref = mockk<AlarmSharedPref>()
    every { alarmPref.nextExecutionTime } returns System.currentTimeMillis() + 1000
    assertTrue(GigaUtil.checkIfFutureAlarmScheduled(alarmPref))
  }

  @Test
  fun `createSpeedTestPayload uses MeanClientMbps from Go JSON without recomputing`() {
    val download = completeJson(
      meanMbps = 42.5,
      elapsedSec = 10.0,
      minRtt = 20_000,
      uuid = "dl-uuid",
      bytesReceived = 100,
      bytesAcked = 0
    )
    val upload = completeJson(
      meanMbps = 11.0,
      elapsedSec = 10.0,
      minRtt = 40_000,
      uuid = "ul-uuid",
      bytesReceived = 0,
      bytesAcked = 50
    )
    val server = """{"machine":"ndt-mlab1-xx.example","location":{"city":"Barcelona","country":"ES"}}"""

    val payload = GigaUtil.createSpeedTestPayload(
      downloadCompleteJson = download,
      uploadCompleteJson = upload,
      serverChosenJson = server,
      clientInfoRequestEntity = null,
      schoolId = "123",
      gigaSchoolId = "GIGA-1",
      appVersion = "1.0",
      scheduleType = "manual",
      deviceType = "android",
      browserId = "browser",
      countryCode = "ES",
      ipAddress = "1.1.1.1",
      deviceHardwareId = "hw",
      geo = null,
      deviceInfo = deviceInfo
    )!!

    assertEquals(42.5 * 1000, payload.download!!, 0.01)
    assertEquals(11.0 * 1000, payload.upload!!, 0.01)
    assertEquals("30", payload.latency) // (20000+40000)/2/1000
    assertEquals("ul-uuid", payload.uUID)
    assertEquals(10.0, payload.results!!.ndtResultS2C!!.getAsJsonObject("LastClientMeasurement")
      .get("ElapsedTime").asDouble, 0.01)
    assertEquals(
      42.5,
      payload.results!!.ndtResultS2C!!.getAsJsonObject("LastClientMeasurement")
        .get("MeanClientMbps").asDouble,
      0.01
    )
    assertTrue(payload.results!!.ndtResultS2C!!.has("ServerTime"))
    assertEquals("Barcelona", payload.serverInfo!!.city)
    assertEquals("ES", payload.serverInfo!!.country)
    assertEquals("ndt-mlab1-xx.example", payload.serverInfo!!.uRL)
  }

  @Test
  fun `createSpeedTestPayload falls back to clientInfo ip when ipAddress empty`() {
    val clientInfo = ClientInfoRequestEntity(
      ip = "9.9.9.9",
      asn = "123",
      city = "Mumbai",
      country = "India",
      isp = "ISP",
      hostname = "host",
      postal = "400001",
      region = "MH",
      timezone = "IST",
      latitude = 19.07,
      longitude = 72.87
    )
    val empty = completeJson(1.0, 10.0, 1000, "u", 0, 0)
    val payload = GigaUtil.createSpeedTestPayload(
      downloadCompleteJson = empty,
      uploadCompleteJson = empty,
      serverChosenJson = null,
      clientInfoRequestEntity = clientInfo,
      schoolId = "1",
      gigaSchoolId = "GIGA",
      appVersion = "1",
      scheduleType = "daily",
      deviceType = "android",
      browserId = "b",
      countryCode = "IN",
      ipAddress = "",
      deviceHardwareId = "hw",
      geo = null,
      deviceInfo = deviceInfo
    )!!
    assertEquals("9.9.9.9", payload.ipAddress)
  }

  @Test
  fun `serverInfoFromLocate maps desktop serverChosen shape`() {
    val info = GigaUtil.serverInfoFromLocate(
      """{"machine":"mlab3-bcn01.mlab-oti.measurement-lab.org","location":{"city":"Barcelona","country":"ES"},"urls":{}}"""
    )
    assertNotNull(info)
    assertEquals("Barcelona", info!!.city)
    assertEquals("ES", info.country)
    assertEquals("mlab3-bcn01.mlab-oti.measurement-lab.org", info.uRL)
    assertEquals("", info.fQDN)
  }

  @Test
  fun `getDataUsage sums TCPInfo counters from both directions`() {
    val download = JsonParser.parseString(
      completeJson(1.0, 10.0, 1000, "d", bytesReceived = 200, bytesAcked = 150)
    ).asJsonObject
    val upload = JsonParser.parseString(
      completeJson(1.0, 10.0, 1000, "u", bytesReceived = 100, bytesAcked = 50)
    ).asJsonObject
    val usage = GigaUtil.getDataUsage(upload, download)
    assertEquals(300L, usage.download)
    assertEquals(200L, usage.upload)
    assertEquals(500L, usage.total)
  }

  @Test
  fun `getMeasurementItem maps locate ServerInfo into mlabInformation`() {
    val complete = JsonParser.parseString(
      completeJson(5.0, 10.0, 1000, "uuid-1", 10, 20)
    ).asJsonObject
    val serverInfo = GigaUtil.serverInfoFromLocate(
      """{"machine":"host.example","location":{"city":"City","country":"CC"}}"""
    )
    val item = GigaUtil.getMeasurementItem(
      clientInfoResponse = null,
      downloadComplete = complete,
      uploadComplete = complete,
      serverInfo = serverInfo,
      scheduleType = "manual",
      results = null,
      c2sRate = arrayListOf(1.0),
      s2cRate = arrayListOf(2.0),
      historyDataIndex = 0,
      currentLocation = null,
      deviceHardwareId = "hw",
      deviceInfo = deviceInfo
    )
    assertEquals("City", item.mlabInformation?.city)
    assertEquals("host.example", item.mlabInformation?.url)
    assertEquals("uuid-1", item.uuid)
  }

  @Test
  fun `checkDataPendingForSync returns only items with uploaded false`() {
    val gson = Gson()
    val base = MeasurementsItem(
      accessInformation = AccessInformation(
        asn = "", city = "", country = "", hostname = "", ip = "",
        loc = "", org = "", postal = "", region = "", timezone = ""
      ),
      dataUsage = DataUsage(1, 1, 2),
      index = 1,
      mlabInformation = MlabInformation(
        city = "", country = "", fqdn = "", ip = null,
        label = "", metro = "", site = "", url = ""
      ),
      notes = "DAILY",
      results = null,
      snapLog = SnapLog(arrayListOf(), arrayListOf()),
      timestamp = 1L,
      uploaded = false,
      uuid = "u1",
      version = 1,
      geolocation = null,
      synced = false,
      deviceHardwareId = null,
      appBuildNumber = null,
      deviceManufacturer = null,
      deviceModel = null,
      deviceName = null,
      osVersion = null
    )
    val jsonList = listOf(
      gson.toJson(base),
      gson.toJson(base.copy(uploaded = true, uuid = "u2")),
      gson.toJson(base.copy(uploaded = false, uuid = "u3"))
    )
    val result = GigaUtil.checkDataPendingForSync(gson.toJson(jsonList))
    assertEquals(2, result.size)
    assertEquals("u1", result[0].uuid)
    assertEquals("u3", result[1].uuid)
  }

  private fun completeJson(
    meanMbps: Double,
    elapsedSec: Double,
    minRtt: Long,
    uuid: String,
    bytesReceived: Long,
    bytesAcked: Long
  ): String {
    return """
      {
        "LastClientMeasurement": {
          "ElapsedTime": $elapsedSec,
          "NumBytes": 12500000,
          "MeanClientMbps": $meanMbps
        },
        "LastServerMeasurement": {
          "Origin": "server",
          "BBRInfo": { "MinRTT": $minRtt, "BW": 1 },
          "ConnectionInfo": { "Client": "c", "Server": "s", "UUID": "$uuid" },
          "TCPInfo": {
            "BytesReceived": $bytesReceived,
            "BytesAcked": $bytesAcked,
            "ElapsedTime": 10000000
          }
        },
        "ServerTime": 1720000000000
      }
    """.trimIndent()
  }
}
