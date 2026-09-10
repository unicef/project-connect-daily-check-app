package com.meter.giga.domain.entity.response

data class ClientInfoResponseEntity(
  val asn: String?,
  val city: String?,
  val isp: String?,
  val country: String?,
  val ip: String?,
  val loc: String?,
  val org: String?,
  val postal: String?,
  val region: String?,
  val timezone: String?
)


//"Country": "ES",
//"Hostname": "hostname",
//"Latitude": 41.3888,
//"Longitude": 2.159,
//"ISP": "ISP",
//"Postal": "08001",
//"Region": "Catalonia",
//"Timezone": "Europe/Madrid",
//"IP": "0",
//"ASN": "ASN",
//"City": "Barcelona"
