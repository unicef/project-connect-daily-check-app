package com.meter.giga.domain.entity.request

import com.google.gson.annotations.SerializedName

data class SpeedTestResultRequestEntity(
  @SerializedName("annotation")
  val annotation: String?,
  @SerializedName("app_version")
  val appVersion: String?,
  @SerializedName("BrowserID")
  val browserID: String?,
  @SerializedName("device_hardware_id")
  val deviceHardwareId: String?,
  @SerializedName("ClientInfo")
  val clientInfo: ClientInfoRequestEntity?,
  @SerializedName("country_code")
  val countryCode: String?,
  @SerializedName("DeviceType")
  val deviceType: String?,
  @SerializedName("Download")
  val download: Double?,
  @SerializedName("giga_id_school")
  val gigaIdSchool: String?,
  @SerializedName("ip_address")
  val ipAddress: String?,
  @SerializedName("Latency")
  val latency: String?,
  @SerializedName("Notes")
  val notes: String?,
  @SerializedName("results")
  val results: ResultsRequestEntity?,
  @SerializedName("school_id")
  val schoolId: String?,
  @SerializedName("ServerInfo")
  val serverInfo: ServerInfoRequestEntity?,
  @SerializedName("timestamp")
  val timestamp: String?,
  @SerializedName("timestamplocal")
  val timestampLocal: String?,
  @SerializedName("UUID")
  val uUID: String?,
  @SerializedName("Upload")
  val upload: Double?,
  @SerializedName("source")
  val source: String?,
//  val id: String?,
//  val createdAt: String?,
//  val dataDownloaded: Int?,
//  val dataUploaded: Int?,
//  val dataUsage: Double?,
)
