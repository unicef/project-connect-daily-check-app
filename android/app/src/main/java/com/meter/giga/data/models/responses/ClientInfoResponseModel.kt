package com.meter.giga.data.models.responses

data class ClientInfoResponseModel(
  val abuse: AbuseResponseModel?,
  val asn: AsnResponseModel?,
  val carrier: CarrierResponseModel?,
  val city: String?,
  val company: CompanyResponseModel?,
  val country: String?,
  val domains: DomainsResponseModel?,
  val ip: String?,
  val loc: String?,
  val org: String?,
  val postal: String?,
  val privacy: PrivacyResponseModel?,
  val region: String?,
  val timezone: String?
)

