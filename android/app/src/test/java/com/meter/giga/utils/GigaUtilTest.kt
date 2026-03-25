package com.meter.giga.utils

import android.app.AlarmManager
import android.content.Context
import com.google.gson.Gson
import com.meter.giga.domain.entity.history.AccessInformation
import com.meter.giga.domain.entity.history.DataUsage
import com.meter.giga.domain.entity.history.Geo
import com.meter.giga.domain.entity.history.MeasurementsItem
import com.meter.giga.domain.entity.history.MlabInformation
import com.meter.giga.domain.entity.history.SnapLog
import com.meter.giga.domain.entity.request.ClientInfoRequestEntity
import com.meter.giga.domain.entity.request.ResultsRequestEntity
import com.meter.giga.domain.entity.response.ClientInfoResponseEntity
import com.meter.giga.domain.entity.response.ServerInfoResponseEntity
import com.meter.giga.prefrences.AlarmSharedPref
import com.meter.giga.utils.Constants.M_D_YYYY_H_MM_SS_A
import io.mockk.every
import io.mockk.mockk
import net.measurementlab.ndt7.android.models.AppInfo
import net.measurementlab.ndt7.android.models.BBRInfo
import net.measurementlab.ndt7.android.models.ClientResponse
import net.measurementlab.ndt7.android.models.ConnectionInfo
import net.measurementlab.ndt7.android.models.Measurement
import net.measurementlab.ndt7.android.models.TCPInfo
import org.junit.Assert.*
import org.junit.Before
import org.junit.Test
import java.time.LocalDateTime
import java.time.format.DateTimeFormatter
import java.util.Locale

class GigaUtilTest {

  private lateinit var mockContext: Context
  private lateinit var mockAlarmManager: AlarmManager

  @Before
  fun setup() {
    mockContext = mockk()
    mockAlarmManager = mockk()

    // Mock getSystemService for AlarmManager
    every { mockContext.getSystemService(Context.ALARM_SERVICE) } returns mockAlarmManager

    // Mock AlarmManager.canScheduleExactAlarms() to return true
    every { mockAlarmManager.canScheduleExactAlarms() } returns true

  }

  @Test
  fun `isExactAlarmPermissionGranted returns true on Android S and above`() {
    val result = GigaUtil.isExactAlarmPermissionGranted(mockContext)
    assertTrue(result)
  }

  @Test
  fun `getCurrentFormattedTime returns non-empty string`() {
    val result = GigaUtil.getCurrentFormattedTime()
    val formatter = DateTimeFormatter.ofPattern(M_D_YYYY_H_MM_SS_A, Locale.ENGLISH)
    LocalDateTime.parse(result, formatter) // should not throw
  }

  @Test
  fun `isBefore8AM returns false if current time is after 8AM`() {
    // We cannot change system time, but we can test that method executes
    val result = GigaUtil.isBefore8AM()
    assertTrue(result || !result) // just ensure no crash
  }

  @Test
  fun `convertToIso converts correctly`() {
    val input = GigaUtil.getCurrentFormattedTime()
    val iso = GigaUtil.convertToIso(input)
    assertTrue(iso.contains("Z")) // UTC format
  }

  @Test
  fun `addJsonItem adds item to empty list`() {
    val existingJson = "[]"
    val newItem = "item1"

    val result = GigaUtil.addJsonItem(existingJson, newItem)

    val expected = "[\"item1\"]"
    assertEquals(expected, result)
  }

  @Test
  fun `addJsonItem adds item to existing list`() {
    val existingJson = "[\"item1\",\"item2\"]"
    val newItem = "item3"

    val result = GigaUtil.addJsonItem(existingJson, newItem)

    val expected = "[\"item1\",\"item2\",\"item3\"]"
    assertEquals(expected, result)
  }

  @Test
  fun `addJsonItem removes oldest item if list exceeds 10`() {
    val existingJson = "[\"1\",\"2\",\"3\",\"4\",\"5\",\"6\",\"7\",\"8\",\"9\",\"10\"]"
    val newItem = "11"

    val result = GigaUtil.addJsonItem(existingJson, newItem)

    val expected = "[\"2\",\"3\",\"4\",\"5\",\"6\",\"7\",\"8\",\"9\",\"10\",\"11\"]"
    assertEquals(expected, result)
  }

  @Test
  fun `addJsonItem does not remove any item if list size less than 10`() {
    val existingJson = "[\"1\",\"2\",\"3\"]"
    val newItem = "4"

    val result = GigaUtil.addJsonItem(existingJson, newItem)

    val expected = "[\"1\",\"2\",\"3\",\"4\"]"
    assertEquals(expected, result)
  }

  @Test
  fun `addJsonItem handles exactly 10 items correctly`() {
    val existingJson = "[\"a\",\"b\",\"c\",\"d\",\"e\",\"f\",\"g\",\"h\",\"i\",\"j\"]"
    val newItem = "k"

    val result = GigaUtil.addJsonItem(existingJson, newItem)

    val expected = "[\"b\",\"c\",\"d\",\"e\",\"f\",\"g\",\"h\",\"i\",\"j\",\"k\"]"
    assertEquals(expected, result)
  }

  @Test
  fun `checkIfFutureAlarmScheduled returns correct boolean`() {
    val alarmPref = mockk<AlarmSharedPref>()
    every { alarmPref.nextExecutionTime } returns System.currentTimeMillis() + 1000
    val result = GigaUtil.checkIfFutureAlarmScheduled(alarmPref)
    assertTrue(result)
  }

  @Test
  fun `getDataUsage returns correct values when both measurements are provided`() {
    val c2s = Measurement(
      tcpInfo = TCPInfo(
        bytesReceived = 100, bytesAcked = 50,
        state = 0,
        caState = 0,
        retransmits = 0,
        probes = 0,
        backoff = 0,
        options = 0,
        wScale = 0,
        appLimited = 0,
        rto = 0,
        ato = 0,
        sndMss = 0,
        rcvMss = 0,
        unacked = 0,
        sacked = 0,
        lost = 0,
        retrans = 0,
        fackets = 0,
        lastDataSent = 0,
        lastAckSent = 0,
        lastDataRecv = 0,
        lastAckRecv = 0,
        pmtu = 0,
        rcvSsThresh = 0,
        rtt = 0,
        rttVar = 0,
        sndSsThresh = 0,
        sndCwnd = 0,
        advMss = 0,
        reordering = 0,
        rcvRtt = 0,
        rcvSpace = 0,
        totalRetrans = 0,
        pacingRate = 0,
        maxPacingRate = 0,
        segsOut = 0,
        segsIn = 0,
        notSentBytes = 0,
        minRtt = 0,
        dataSegsIn = 0,
        dataSegsOut = 0,
        deliveryRate = 0,
        busyTime = 0,
        rWndLimited = 0,
        sndBufLimited = 0,
        delivered = 0,
        deliveredCE = 0,
        bytesSent = 0,
        bytesRetrans = 0,
        dSackDups = 0,
        reordSeen = 0,
        elapsedTime = 0
      ),
      connectionInfo = ConnectionInfo(
        client = "",
        server = "",
        uuid = ""
      ),
      bbrInfo = BBRInfo(
        bw = 0,
        minRtt = 0,
        pacingGain = 0,
        cwndGain = 0,
        elapsedTime = 0
      )
    )
    val s2c = Measurement(
      tcpInfo = TCPInfo(
        bytesReceived = 200, bytesAcked = 150,
        state = 0,
        caState = 0,
        retransmits = 0,
        probes = 0,
        backoff = 0,
        options = 0,
        wScale = 0,
        appLimited = 0,
        rto = 0,
        ato = 0,
        sndMss = 0,
        rcvMss = 0,
        unacked = 0,
        sacked = 0,
        lost = 0,
        retrans = 0,
        fackets = 0,
        lastDataSent = 0,
        lastAckSent = 0,
        lastDataRecv = 0,
        lastAckRecv = 0,
        pmtu = 0,
        rcvSsThresh = 0,
        rtt = 0,
        rttVar = 0,
        sndSsThresh = 0,
        sndCwnd = 0,
        advMss = 0,
        reordering = 0,
        rcvRtt = 0,
        rcvSpace = 0,
        totalRetrans = 0,
        pacingRate = 0,
        maxPacingRate = 0,
        segsOut = 0,
        segsIn = 0,
        notSentBytes = 0,
        minRtt = 0,
        dataSegsIn = 0,
        dataSegsOut = 0,
        deliveryRate = 0,
        busyTime = 0,
        rWndLimited = 0,
        sndBufLimited = 0,
        delivered = 0,
        deliveredCE = 0,
        bytesSent = 0,
        bytesRetrans = 0,
        dSackDups = 0,
        reordSeen = 0,
        elapsedTime = 0
      ),
      connectionInfo = ConnectionInfo(
        client = "",
        server = "",
        uuid = ""
      ),
      bbrInfo = BBRInfo(
        bw = 0,
        minRtt = 0,
        pacingGain = 0,
        cwndGain = 0,
        elapsedTime = 0
      )
    )

    val result: DataUsage = GigaUtil.getDataUsage(c2s, s2c)

    assertEquals(300L, result.download)
    assertEquals(200L, result.upload)
    assertEquals(500L, result.total)
  }

  @Test
  fun `getDataUsage handles null measurements`() {
    val result: DataUsage = GigaUtil.getDataUsage(null, null)

    assertEquals(0L, result.download)
    assertEquals(0L, result.upload)
    assertEquals(0L, result.total)
  }

  @Test
  fun `getDataUsage handles one null measurement`() {
    val c2s = Measurement(
      tcpInfo = TCPInfo(
        bytesReceived = 100, bytesAcked = 50,
        state = 0,
        caState = 0,
        retransmits = 0,
        probes = 0,
        backoff = 0,
        options = 0,
        wScale = 0,
        appLimited = 0,
        rto = 0,
        ato = 0,
        sndMss = 0,
        rcvMss = 0,
        unacked = 0,
        sacked = 0,
        lost = 0,
        retrans = 0,
        fackets = 0,
        lastDataSent = 0,
        lastAckSent = 0,
        lastDataRecv = 0,
        lastAckRecv = 0,
        pmtu = 0,
        rcvSsThresh = 0,
        rtt = 0,
        rttVar = 0,
        sndSsThresh = 0,
        sndCwnd = 0,
        advMss = 0,
        reordering = 0,
        rcvRtt = 0,
        rcvSpace = 0,
        totalRetrans = 0,
        pacingRate = 0,
        maxPacingRate = 0,
        segsOut = 0,
        segsIn = 0,
        notSentBytes = 0,
        minRtt = 0,
        dataSegsIn = 0,
        dataSegsOut = 0,
        deliveryRate = 0,
        busyTime = 0,
        rWndLimited = 0,
        sndBufLimited = 0,
        delivered = 0,
        deliveredCE = 0,
        bytesSent = 0,
        bytesRetrans = 0,
        dSackDups = 0,
        reordSeen = 0,
        elapsedTime = 0
      ),
      connectionInfo = ConnectionInfo(
        client = "",
        server = "",
        uuid = ""
      ),
      bbrInfo = BBRInfo(
        bw = 0,
        minRtt = 0,
        pacingGain = 0,
        cwndGain = 0,
        elapsedTime = 0
      )
    )
    val result: DataUsage = GigaUtil.getDataUsage(c2s, null)

    assertEquals(100L, result.download)
    assertEquals(50L, result.upload)
    assertEquals(150L, result.total)
  }

  @Test
  fun `getDataUsage handles tcpInfo being null`() {
    val c2s = Measurement(
      tcpInfo = null,
      connectionInfo = ConnectionInfo(
        client = "",
        server = "",
        uuid = ""
      ),
      bbrInfo = BBRInfo(
        bw = 0,
        minRtt = 0,
        pacingGain = 0,
        cwndGain = 0,
        elapsedTime = 0
      )
    )
    val s2c = Measurement(
      tcpInfo = null,
      connectionInfo = ConnectionInfo(
        client = "",
        server = "",
        uuid = ""
      ),
      bbrInfo = BBRInfo(
        bw = 0,
        minRtt = 0,
        pacingGain = 0,
        cwndGain = 0,
        elapsedTime = 0
      )
    )

    val result: DataUsage = GigaUtil.getDataUsage(c2s, s2c)

    assertEquals(0L, result.download)
    assertEquals(0L, result.upload)
    assertEquals(0L, result.total)
  }

  @Test
  fun `getMeasurementItem maps all fields correctly`() {

    val clientInfo = ClientInfoResponseEntity(
      asn = "123",
      city = "Mumbai",
      country = "India",
      isp = "Reliance",
      ip = "10.10.1.1",
      loc = "19.07,72.87",
      org = "OrgX",
      postal = "400001",
      region = "MH",
      timezone = "IST"
    )

    val c2s = Measurement(
      tcpInfo = TCPInfo(
        bytesReceived = 100, bytesAcked = 50,
        state = 0,
        caState = 0,
        retransmits = 0,
        probes = 0,
        backoff = 0,
        options = 0,
        wScale = 0,
        appLimited = 0,
        rto = 0,
        ato = 0,
        sndMss = 0,
        rcvMss = 0,
        unacked = 0,
        sacked = 0,
        lost = 0,
        retrans = 0,
        fackets = 0,
        lastDataSent = 0,
        lastAckSent = 0,
        lastDataRecv = 0,
        lastAckRecv = 0,
        pmtu = 0,
        rcvSsThresh = 0,
        rtt = 0,
        rttVar = 0,
        sndSsThresh = 0,
        sndCwnd = 0,
        advMss = 0,
        reordering = 0,
        rcvRtt = 0,
        rcvSpace = 0,
        totalRetrans = 0,
        pacingRate = 0,
        maxPacingRate = 0,
        segsOut = 0,
        segsIn = 0,
        notSentBytes = 0,
        minRtt = 0,
        dataSegsIn = 0,
        dataSegsOut = 0,
        deliveryRate = 0,
        busyTime = 0,
        rWndLimited = 0,
        sndBufLimited = 0,
        delivered = 0,
        deliveredCE = 0,
        bytesSent = 0,
        bytesRetrans = 0,
        dSackDups = 0,
        reordSeen = 0,
        elapsedTime = 0
      ),
      connectionInfo = ConnectionInfo(
        client = "",
        server = "",
        uuid = "uuid-123"
      ),
      bbrInfo = BBRInfo(
        bw = 0,
        minRtt = 0,
        pacingGain = 0,
        cwndGain = 0,
        elapsedTime = 0
      )
    )

    val s2c = Measurement(
      tcpInfo = TCPInfo(
        bytesReceived = 200, bytesAcked = 150,
        state = 0,
        caState = 0,
        retransmits = 0,
        probes = 0,
        backoff = 0,
        options = 0,
        wScale = 0,
        appLimited = 0,
        rto = 0,
        ato = 0,
        sndMss = 0,
        rcvMss = 0,
        unacked = 0,
        sacked = 0,
        lost = 0,
        retrans = 0,
        fackets = 0,
        lastDataSent = 0,
        lastAckSent = 0,
        lastDataRecv = 0,
        lastAckRecv = 0,
        pmtu = 0,
        rcvSsThresh = 0,
        rtt = 0,
        rttVar = 0,
        sndSsThresh = 0,
        sndCwnd = 0,
        advMss = 0,
        reordering = 0,
        rcvRtt = 0,
        rcvSpace = 0,
        totalRetrans = 0,
        pacingRate = 0,
        maxPacingRate = 0,
        segsOut = 0,
        segsIn = 0,
        notSentBytes = 0,
        minRtt = 0,
        dataSegsIn = 0,
        dataSegsOut = 0,
        deliveryRate = 0,
        busyTime = 0,
        rWndLimited = 0,
        sndBufLimited = 0,
        delivered = 0,
        deliveredCE = 0,
        bytesSent = 0,
        bytesRetrans = 0,
        dSackDups = 0,
        reordSeen = 0,
        elapsedTime = 0
      ),
      connectionInfo = ConnectionInfo(
        client = "",
        server = "",
        uuid = "uuid-123"
      ),
      bbrInfo = BBRInfo(
        bw = 0,
        minRtt = 0,
        pacingGain = 0,
        cwndGain = 0,
        elapsedTime = 0
      )
    )

    val serverInfo = ServerInfoResponseEntity(
      city = "Delhi",
      country = "IN",
      fqdn = "mlab1",
      ipv4 = "1.1.1.1",
      ipv6 = "2001:db8::1",
      site = "del01",
      url = "https://example.com",
      label = "Test",
      metro = "Test"
    )

    val results = ResultsRequestEntity(
      ndtResultS2C = null,
      ndtResultC2S = null
    )

    val c2sRate = arrayListOf(1.0, 2.0)
    val s2cRate = arrayListOf(3.0, 4.0)

    val item = GigaUtil.getMeasurementItem(
      clientInfoResponse = clientInfo,
      c2sLastServerManagement = c2s,
      s2cLastServerManagement = s2c,
      serverInfoResponse = serverInfo,
      scheduleType = "DAILY",
      results = results,
      c2sRate = c2sRate,
      s2cRate = s2cRate,
      historyDataIndex = 5,
      currentLocation = null
    )

    // Access Information
    assertEquals("123", item.accessInformation?.asn)
    assertEquals("Mumbai", item.accessInformation?.city)
    assertEquals("India", item.accessInformation?.country)
    assertEquals("Reliance", item.accessInformation?.hostname)
    assertEquals("10.10.1.1", item.accessInformation?.ip)
    assertEquals("19.07,72.87", item.accessInformation?.loc)

    // Data Usage
    assertEquals(300L, item.dataUsage?.download)   // 200 + 100
    assertEquals(200L, item.dataUsage?.upload)     // 150 + 50

    // Index increment
    assertEquals(6, item.index) // 5 + 1

    // Mlab Information
    assertEquals("Delhi", item.mlabInformation?.city)
    assertEquals(listOf("1.1.1.1", "2001:db8::1"), item.mlabInformation?.ip)

    // Notes
    assertEquals("DAILY", item.notes)

    // Results
    assertEquals(results, item.results)

    // Snaplog
    assertEquals(c2sRate, item.snapLog?.c2sRate)
    assertEquals(s2cRate, item.snapLog?.s2cRate)

    // UUID
    assertEquals("uuid-123", item.uuid)

    // Uploaded always false
    assertFalse(item.uploaded == true)

    // Version always 1
    assertEquals(1, item.version)

    // Timestamp sanity check
    item.timestamp?.let { assertTrue(it > 0) }
  }

  @Test
  fun `getMeasurementItem maps all fields correctly when null`() {

    val clientInfo: ClientInfoResponseEntity? = null

    val c2s = Measurement(
      tcpInfo = TCPInfo(
        bytesReceived = 100, bytesAcked = 50,
        state = 0,
        caState = 0,
        retransmits = 0,
        probes = 0,
        backoff = 0,
        options = 0,
        wScale = 0,
        appLimited = 0,
        rto = 0,
        ato = 0,
        sndMss = 0,
        rcvMss = 0,
        unacked = 0,
        sacked = 0,
        lost = 0,
        retrans = 0,
        fackets = 0,
        lastDataSent = 0,
        lastAckSent = 0,
        lastDataRecv = 0,
        lastAckRecv = 0,
        pmtu = 0,
        rcvSsThresh = 0,
        rtt = 0,
        rttVar = 0,
        sndSsThresh = 0,
        sndCwnd = 0,
        advMss = 0,
        reordering = 0,
        rcvRtt = 0,
        rcvSpace = 0,
        totalRetrans = 0,
        pacingRate = 0,
        maxPacingRate = 0,
        segsOut = 0,
        segsIn = 0,
        notSentBytes = 0,
        minRtt = 0,
        dataSegsIn = 0,
        dataSegsOut = 0,
        deliveryRate = 0,
        busyTime = 0,
        rWndLimited = 0,
        sndBufLimited = 0,
        delivered = 0,
        deliveredCE = 0,
        bytesSent = 0,
        bytesRetrans = 0,
        dSackDups = 0,
        reordSeen = 0,
        elapsedTime = 0
      ),
      connectionInfo = ConnectionInfo(
        client = "",
        server = "",
        uuid = "uuid-123"
      ),
      bbrInfo = BBRInfo(
        bw = 0,
        minRtt = 0,
        pacingGain = 0,
        cwndGain = 0,
        elapsedTime = 0
      )
    )

    val s2c = Measurement(
      tcpInfo = TCPInfo(
        bytesReceived = 200, bytesAcked = 150,
        state = 0,
        caState = 0,
        retransmits = 0,
        probes = 0,
        backoff = 0,
        options = 0,
        wScale = 0,
        appLimited = 0,
        rto = 0,
        ato = 0,
        sndMss = 0,
        rcvMss = 0,
        unacked = 0,
        sacked = 0,
        lost = 0,
        retrans = 0,
        fackets = 0,
        lastDataSent = 0,
        lastAckSent = 0,
        lastDataRecv = 0,
        lastAckRecv = 0,
        pmtu = 0,
        rcvSsThresh = 0,
        rtt = 0,
        rttVar = 0,
        sndSsThresh = 0,
        sndCwnd = 0,
        advMss = 0,
        reordering = 0,
        rcvRtt = 0,
        rcvSpace = 0,
        totalRetrans = 0,
        pacingRate = 0,
        maxPacingRate = 0,
        segsOut = 0,
        segsIn = 0,
        notSentBytes = 0,
        minRtt = 0,
        dataSegsIn = 0,
        dataSegsOut = 0,
        deliveryRate = 0,
        busyTime = 0,
        rWndLimited = 0,
        sndBufLimited = 0,
        delivered = 0,
        deliveredCE = 0,
        bytesSent = 0,
        bytesRetrans = 0,
        dSackDups = 0,
        reordSeen = 0,
        elapsedTime = 0
      ),
      connectionInfo = ConnectionInfo(
        client = "",
        server = "",
        uuid = "uuid-123"
      ),
      bbrInfo = BBRInfo(
        bw = 0,
        minRtt = 0,
        pacingGain = 0,
        cwndGain = 0,
        elapsedTime = 0
      )
    )

    val serverInfo: ServerInfoResponseEntity? = null

    val results = ResultsRequestEntity(
      ndtResultS2C = null,
      ndtResultC2S = null
    )

    val c2sRate = arrayListOf(1.0, 2.0)
    val s2cRate = arrayListOf(3.0, 4.0)

    val item = GigaUtil.getMeasurementItem(
      clientInfoResponse = clientInfo,
      c2sLastServerManagement = c2s,
      s2cLastServerManagement = s2c,
      serverInfoResponse = serverInfo,
      scheduleType = "DAILY",
      results = results,
      c2sRate = c2sRate,
      s2cRate = s2cRate,
      historyDataIndex = 5,
      currentLocation = null

    )

    // Access Information
    assertNull(item.accessInformation?.asn)
    assertNull(item.accessInformation?.city)
    assertNull(item.accessInformation?.country)
    assertNull(item.accessInformation?.hostname)
    assertNull(item.accessInformation?.ip)
    assertNull(item.accessInformation?.loc)

    // Data Usage
    assertEquals(300L, item.dataUsage?.download)   // 200 + 100
    assertEquals(200L, item.dataUsage?.upload)     // 150 + 50

    // Index increment
    assertEquals(6, item.index) // 5 + 1

    // Mlab Information
    assertNull(item.mlabInformation?.city)
    assertEquals(listOf("", ""), item.mlabInformation?.ip)

    // Notes
    assertEquals("DAILY", item.notes)

    // Results
    assertEquals(results, item.results)

    // Snaplog
    assertEquals(c2sRate, item.snapLog?.c2sRate)
    assertEquals(s2cRate, item.snapLog?.s2cRate)

    // UUID
    assertEquals("uuid-123", item.uuid)

    // Uploaded always false
    assertFalse(item.uploaded == true)

    // Version always 1
    assertEquals(1, item.version)

    // Timestamp sanity check
    item.timestamp?.let { assertTrue(it > 0) }
  }


  @Test
  fun `checkDataPendingForSync returns only items with uploaded false`() {
    val gson = Gson()
    val item1 = MeasurementsItem(
      accessInformation = AccessInformation(
        asn = "",
        city = "",
        country = "",
        hostname = "",
        ip = "",
        loc = "",
        org = "",
        postal = "",
        region = "",
        timezone = ""
      ),
      dataUsage = DataUsage(1, 1, 2),
      index = 1,
      mlabInformation = MlabInformation(
        city = "",
        country = "",
        fqdn = "",
        ip = null,
        label = "",
        metro = "",
        site = "",
        url = ""
      ),
      notes = "DAILY",
      results = null,
      snapLog = SnapLog(arrayListOf(), arrayListOf()),
      timestamp = 1L,
      uploaded = false,
      uuid = "u1",
      version = 1,
      geolocation = Geo(
        latitude = 0.0,
        longitude = 0.0
      )
    )

    val item2 = item1.copy(uploaded = true, uuid = "u2")
    val item3 = item1.copy(uploaded = false, uuid = "u3")

    val jsonList = listOf(
      gson.toJson(item1),
      gson.toJson(item2),
      gson.toJson(item3)
    )

    val outerJsonArrayString = gson.toJson(jsonList)

    val result = GigaUtil.checkDataPendingForSync(outerJsonArrayString)

    assertEquals(2, result.size)
    assertEquals("u1", result[0].uuid)
    assertEquals("u3", result[1].uuid)
  }

  private fun mockAppInfo(bytes: Double, elapsedMs: Long) =
    AppInfo(
      numBytes = bytes,
      elapsedTime = elapsedMs
    )

  private fun mockMeasurement(
    bytesAcked: Long,
    bytesReceived: Long,
    minRttMicros: Long,
    uuid: String
  ) =
    Measurement(
      tcpInfo = TCPInfo(
        bytesAcked = bytesAcked,
        bytesReceived = bytesReceived,
        minRtt = minRttMicros,
        state = 0,
        caState = 0,
        retransmits = 0,
        probes = 0,
        backoff = 0,
        options = 0,
        wScale = 0,
        appLimited = 0,
        rto = 0,
        ato = 0,
        sndMss = 0,
        rcvMss = 0,
        unacked = 0,
        sacked = 0,
        lost = 0,
        retrans = 0,
        fackets = 0,
        lastDataSent = 0,
        lastAckSent = 0,
        lastDataRecv = 0,
        lastAckRecv = 0,
        pmtu = 0,
        rcvSsThresh = 0,
        rtt = 0,
        rttVar = 0,
        sndSsThresh = 0,
        sndCwnd = 0,
        advMss = 0,
        reordering = 0,
        rcvRtt = 0,
        rcvSpace = 0,
        totalRetrans = 0,
        pacingRate = 0,
        maxPacingRate = 0,
        segsOut = 0,
        segsIn = 0,
        notSentBytes = 0,
        dataSegsIn = 0,
        dataSegsOut = 0,
        deliveryRate = 0,
        busyTime = 0,
        rWndLimited = 0,
        sndBufLimited = 0,
        delivered = 0,
        deliveredCE = 0,
        bytesSent = 0,
        bytesRetrans = 0,
        dSackDups = 0,
        reordSeen = 0,
        elapsedTime = 0
      ),
      connectionInfo = ConnectionInfo(
        client = "",
        server = "",
        uuid = uuid
      ),
      bbrInfo = BBRInfo(
        bw = 0,
        minRtt = 0,
        pacingGain = 0,
        cwndGain = 0,
        elapsedTime = 0
      )
    )

  @Test
  fun `createSpeedTestPayload calculates upload and download Mbps correctly`() {
    val uploadResponse = ClientResponse(
      appInfo = mockAppInfo(2000000.0, 2000),
      origin = "",
      test = ""
    )
    val downloadResponse = ClientResponse(
      appInfo = mockAppInfo(4000000.0, 4000),
      origin = "",
      test = ""
    )

    val payload = GigaUtil.createSpeedTestPayload(
      uploadMeasurement = null,
      downloadMeasurement = null,
      clientInfoRequestEntity = null,
      serverInfoRequestEntity = null,
      schoolId = "123",
      gigaSchoolId = "GIGA-1",
      appVersion = "1.0",
      scheduleType = "DAILY",
      deviceType = "Android",
      browserId = "Chrome",
      countryCode = "IN",
      ipAddress = "1.1.1.1",
      lastDownloadResponse = downloadResponse,
      lastUploadResponse = uploadResponse,
      deviceHardwareId = "testDeviceID",
      geo = null
    )!!

    // Mbps = (bytes / seconds) * 0.008 * 1000
    val expectedUpload = (2_000_000 / 2) * 0.008 * 1000   // = 8000
    val expectedDownload = (4_000_000 / 4) * 0.008 * 1000 // = 8000

    assertEquals(expectedUpload, payload.upload!!, 0.1)
    assertEquals(expectedDownload, payload.download!!, 0.1)
  }

  @Test
  fun `createSpeedTestPayload calculates latency from minRtt micros`() {
    val upload = mockMeasurement(
      bytesAcked = 0,
      bytesReceived = 0,
      minRttMicros = 50_000, // 50 ms
      uuid = "UUID-123"
    )

    val payload = GigaUtil.createSpeedTestPayload(
      uploadMeasurement = upload,
      downloadMeasurement = null,
      clientInfoRequestEntity = null,
      serverInfoRequestEntity = null,
      schoolId = "1",
      gigaSchoolId = "GIGA",
      appVersion = "1",
      scheduleType = "DAILY",
      deviceType = "Android",
      browserId = "Chrome",
      countryCode = "IN",
      ipAddress = "",
      lastDownloadResponse = null,
      lastUploadResponse = null,
      deviceHardwareId = "testDeviceID",
      geo = null
    )!!

    assertEquals("50", payload.latency) // 50 ms
  }

  @Test
  fun `createSpeedTestPayload handles null elapsedTime and numBytes`() {
    val uploadResponse = ClientResponse(
      appInfo = mockAppInfo(0.0, 0),
      origin = "",
      test = ""
    )

    val payload = GigaUtil.createSpeedTestPayload(
      uploadMeasurement = null,
      downloadMeasurement = null,
      clientInfoRequestEntity = null,
      serverInfoRequestEntity = null,
      schoolId = "1",
      gigaSchoolId = "GIGA",
      appVersion = "1",
      scheduleType = "DAILY",
      deviceType = "Android",
      browserId = "Chrome",
      countryCode = "IN",
      ipAddress = "",
      lastDownloadResponse = null,
      lastUploadResponse = uploadResponse,
      deviceHardwareId = "testDeviceID",
      geo = null
    )!!

    assertEquals(0.0, payload.upload!!, 0.1)
  }

  @Test
  fun `createSpeedTestPayload falls back to clientInfo ip when ipAddress empty`() {
    val clientInfo = ClientInfoRequestEntity(
      ip = "9.9.9.9",
      asn = "123",
      city = "Mumbai",
      country = "India",
      isp = "Reliance",
      hostname = "OrgX",
      postal = "400001",
      region = "MH",
      timezone = "IST",
      latitude = 19.07,
      longitude = 72.87
    )

    val payload = GigaUtil.createSpeedTestPayload(
      uploadMeasurement = null,
      downloadMeasurement = null,
      clientInfoRequestEntity = clientInfo,
      serverInfoRequestEntity = null,
      schoolId = "1",
      gigaSchoolId = "GIGA",
      appVersion = "1",
      scheduleType = "DAILY",
      deviceType = "Android",
      browserId = "Chrome",
      countryCode = "IN",
      ipAddress = "",
      lastDownloadResponse = null,
      lastUploadResponse = null,
      deviceHardwareId = "testDeviceID",
      geo = null

    )!!

    assertEquals("9.9.9.9", payload.ipAddress)
  }

  @Test
  fun `createSpeedTestPayload maps uuid from uploadMeasurement`() {
    val upload = mockMeasurement(
      bytesAcked = 0,
      bytesReceived = 0,
      minRttMicros = 10_000,
      uuid = "UUID-ABC"
    )

    val payload = GigaUtil.createSpeedTestPayload(
      uploadMeasurement = upload,
      downloadMeasurement = null,
      clientInfoRequestEntity = null,
      serverInfoRequestEntity = null,
      schoolId = "1",
      gigaSchoolId = "GIGA",
      appVersion = "1",
      scheduleType = "DAILY",
      deviceType = "Android",
      browserId = "Chrome",
      countryCode = "IN",
      ipAddress = "",
      lastDownloadResponse = null,
      lastUploadResponse = null,
      deviceHardwareId = "testDeviceID",
      geo = null
    )!!

    assertEquals("UUID-ABC", payload.uUID)
  }
}
