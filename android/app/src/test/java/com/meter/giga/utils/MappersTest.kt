package com.meter.giga.utils

import com.meter.giga.data.models.responses.*
import com.meter.giga.domain.entity.request.*
import com.google.gson.JsonParser
import org.junit.Assert.*
import org.junit.Test

class MappersTest {

  @Test
  fun `ClientInfoResponseModel toEntity maps data correctly`() {
    val model = ClientInfoResponseModel(
      asn = AsnResponseModel(
        asn = "AS123",
        domain = "Test",
        name = "Test",
        route = "Test",
        type = "Test"
      ),
      city = "Mumbai",
      company = CompanyResponseModel(
        domain = "Test",
        name = "Test",
        type = "Test"
      ),
      country = "IN",
      ip = "1.1.1.1",
      loc = "19,72",
      org = "ORG",
      postal = "400001",
      region = "MH",
      timezone = "IST",
      abuse = AbuseResponseModel(
        address = "",
        country = "",
        email = "",
        name = "",
        network = "",
        phone = ""
      ),
      carrier = CarrierResponseModel(
        mcc = "",
        mnc = "",
        name = ""
      ),
      domains = DomainsResponseModel(
        domains = emptyList(),
        page = 0,
        total = 0
      ),
      privacy = PrivacyResponseModel(
        hosting = false,
        proxy = false,
        relay = false,
        service = "",
        tor = false,
        vpn = false
      )
    )

    val entity = model.toEntity()!!
    assertEquals("AS123", entity.asn)
    assertEquals("Mumbai", entity.city)
    assertEquals("Test", entity.isp)
    assertEquals("IN", entity.country)
    assertEquals("1.1.1.1", entity.ip)
  }

  @Test
  fun `ClientInfoResponseModel toEntity maps data correctly for null`() {
    val model = ClientInfoResponseModel(
      asn = null,
      city = null,
      company = null,
      country = null,
      ip = null,
      loc = null,
      org = null,
      postal = null,
      region = null,
      timezone = null,
      abuse = null,
      carrier = null,
      domains = null,
      privacy = null,
    )

    val entity = model.toEntity()!!
    assertEquals("", entity.asn)
    assertEquals("", entity.city)
    assertEquals("", entity.isp)
    assertEquals("", entity.country)
    assertEquals("0", entity.ip)
  }

  @Test
  fun `ServerInfoResponseModel toEntity maps IPs correctly`() {
    val model = ServerInfoResponseModel(
      city = "Delhi",
      country = "IN",
      fqdn = "speed.example.com",
      ip = listOf("10.0.0.1", "2001::1"),
      site = "DEL001",
      url = "https://server/",
    )

    val entity = model.toEntity()!!
    assertEquals("10.0.0.1", entity.ipv4)
    assertEquals("2001::1", entity.ipv6)
    assertEquals("DEL", entity.metro)
  }

  @Test
  fun `ServerInfoResponseModel toEntity handles missing IPv6`() {
    val model = ServerInfoResponseModel(
      ip = listOf("10.0.0.1"),
      city = "",
      country = "",
      fqdn = "",
      site = null,
      url = ""
    )

    val entity = model.toEntity()!!
    assertEquals("10.0.0.1", entity.ipv4)
    assertEquals("0", entity.ipv6)
  }

  @Test
  fun `ClientInfoFallbackResponseModel toEntity maps organization correctly`() {
    val model = ClientInfoFallbackResponseModel(
      asn = 123,
      city = "Pune",
      organization = "VI",
      country = "IN",
      ip = "8.8.8.8",
      latitude = "19",
      longitude = "73",
      region = "MH",
      timezone = "IST",
      accuracy = 0,
      area_code = "",
      continent_code = "",
      country_code = "",
      country_code3 = "",
      organization_name = ""
    )

    val entity = model.toEntity()!!
    assertEquals("AS123", entity.asn)
    assertEquals("19,73", entity.loc)
    assertEquals("VI", entity.org)
  }

  @Test
  fun `SpeedTestResultRequestEntity toModel maps basic fields`() {
    val entity = SpeedTestResultRequestEntity(
      annotation = "note",
      appVersion = "1.0",
      browserID = "br",
      clientInfo = null,
      countryCode = "IN",
      deviceType = "Android",
      download = 50.0,
      gigaIdSchool = "g123",
      ipAddress = "1.1.1.1",
      latency = "10.0",
      notes = "test",
      results = null,
      schoolId = "s1",
      serverInfo = null,
      timestamp = "123456",
      uUID = "uuid",
      upload = 20.0,
      timestampLocal = "123456",
      source = "manual",
      deviceHardwareId = "testDeviceId",
      geo = null,
      appBuildNumber = 1L,
      deviceManufacturer = "m",
      deviceModel = "model",
      deviceName = "name",
      osVersion = "35"
    )

    val model = entity.toModel()
    assertEquals("1.0", model.appVersion)
    assertEquals("manual", model.source)
    assertEquals(20.0, model.upload!!, 0.01)
  }

  @Test
  fun `BBRInfoRequestEntity toModel maps fields`() {
    val entity = BBRInfoRequestEntity(1L, 2L, 3L, 4L, 5L)
    val model = entity.toModel()
    assertEquals(1L, model.bW)
  }

  @Test
  fun `ConnectionInfoRequestEntity toModel maps fields`() {
    val entity = ConnectionInfoRequestEntity("c", "s", "u")
    val model = entity.toModel()
    assertEquals("c", model.client)
  }

  @Test
  fun `TCPInfoRequestEntity toModel maps fields`() {
    val entity = TCPInfoRequestEntity(
      ato = 1,
      advMSS = 2,
      appLimited = 3,
      backoff = 4,
      busyTime = 5,
      bytesAcked = 6,
      bytesReceived = 7,
      bytesRetrans = 8,
      bytesSent = 9,
      caState = 10,
      dSackDups = 11,
      dataSegsIn = 12,
      dataSegsOut = 13,
      delivered = 14,
      deliveredCE = 15,
      deliveryRate = 16L,
      elapsedTime = 17,
      fackets = 18,
      lastAckRecv = 19,
      lastAckSent = 20,
      lastDataRecv = 21,
      lastDataSent = 22,
      lost = 23,
      maxPacingRate = 24L,
      minRTT = 25L,
      notsentBytes = 26,
      options = 27,
      pmtu = 28,
      pacingRate = 29L,
      probes = 30,
      rto = 31L,
      rtt = 32L,
      rttVar = 33L,
      rWndLimited = 34,
      rcvMSS = 35,
      rcvOooPack = 0,
      rcvRTT = 36L,
      rcvSpace = 37,
      rcvSsThresh = 38,
      reordSeen = 39,
      reordering = 40,
      retrans = 41,
      retransmits = 42,
      sacked = 43,
      segsIn = 44,
      segsOut = 45,
      sndBufLimited = 46,
      sndCwnd = 47,
      sndMSS = 48,
      sndSsThresh = 49,
      sndWnd = 47,
      state = 50,
      totalRetrans = 51,
      unacked = 52,
      wScale = 53
    )

    val model = entity.toModel()
    assertEquals(1L, model.aTO)
    assertEquals(48L, model.sndMSS)
  }

  @Test
  fun `toModel maps all non-null fields correctly for ClientInfoRequestEntity`() {
    val entity = ClientInfoRequestEntity(
      asn = "12345",
      city = "Mumbai",
      country = "India",
      hostname = "host1",
      ip = "1.1.1.1",
      isp = "ISPName",
      latitude = 19.0,
      longitude = 72.0,
      postal = "400001",
      region = "MH",
      timezone = "IST"
    )

    val model = entity.toModel()

    assertEquals("12345", model.aSN)
    assertEquals("Mumbai", model.city)
    assertEquals("India", model.country)
    assertEquals("host1", model.hostname)
    assertEquals("1.1.1.1", model.iP)
    assertEquals("ISPName", model.iSP)
    assertEquals(19.0, model.latitude!!, 0.0)
    assertEquals(72.0, model.longitude!!, 0.0)
    assertEquals("400001", model.postal)
    assertEquals("MH", model.region)
    assertEquals("IST", model.timezone)
  }

  @Test
  fun `toModel sets ASN empty string when it is null`() {
    val entity = ClientInfoRequestEntity(
      asn = null,
      city = null,
      country = null,
      hostname = null,
      ip = null,
      isp = null,
      latitude = null,
      longitude = null,
      postal = null,
      region = null,
      timezone = null
    )

    val model = entity.toModel()

    assertEquals("", model.aSN)
    assertNull(model.city)
    assertNull(model.country)
    assertNull(model.hostname)
    assertNull(model.iP)
    assertNull(model.iSP)
    assertNull(model.latitude)
    assertNull(model.longitude)
  }

  @Test
  fun `ResultsRequestEntity maps JsonObject results as-is`() {
    val download = JsonParser.parseString(
      """{"LastClientMeasurement":{"ElapsedTime":10.0,"MeanClientMbps":42.5,"NumBytes":1},"ServerTime":1}"""
    ).asJsonObject
    val upload = JsonParser.parseString(
      """{"LastClientMeasurement":{"ElapsedTime":10.0,"MeanClientMbps":11.0,"NumBytes":1},"ServerTime":1}"""
    ).asJsonObject
    val entity = ResultsRequestEntity(
      ndtResultS2C = download,
      ndtResultC2S = upload
    )

    val model = entity.toModel()

    assertEquals(42.5, model.ndtResultS2C!!.getAsJsonObject("LastClientMeasurement")
      .get("MeanClientMbps").asDouble, 0.0)
    assertEquals(11.0, model.ndtResultC2S!!.getAsJsonObject("LastClientMeasurement")
      .get("MeanClientMbps").asDouble, 0.0)
    assertTrue(model.ndtResultS2C.has("ServerTime"))
  }

  @Test
  fun `ResultsRequestEntity handles null nested objects`() {
    val entity = ResultsRequestEntity(
      ndtResultS2C = null,
      ndtResultC2S = null
    )

    val model = entity.toModel()

    assertNull(model.ndtResultS2C)
    assertNull(model.ndtResultC2S)
  }

  @Test
  fun `LastClientMeasurementRequestEntity maps properly`() {
    val entity = LastClientMeasurementRequestEntity(
      elapsedTime = 15.0,
      meanClientMbps = 99.9,
      numBytes = 5000
    )

    val model = entity.toModel()

    assertEquals(15.0, model.elapsedTime)
    assertEquals(99.9, model.meanClientMbps!!, 0.0)
    assertEquals(5000, model.numBytes)
  }
}

