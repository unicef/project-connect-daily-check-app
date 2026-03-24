package com.meter.giga.data.models.requests

import com.google.gson.annotations.SerializedName
import com.meter.giga.domain.entity.history.Geo

data class SpeedTestResultRequestModel(
  @SerializedName("annotation")
  val annotation: String?,
  @SerializedName("app_version")
  val appVersion: String?,
  @SerializedName("BrowserID")
  val browserID: String?,
  @SerializedName("device_hardware_id")
  val deviceHardwareId: String?,
  @SerializedName("ClientInfo")
  val clientInfo: ClientInfoRequestModel?,
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
  @SerializedName("Results")
  val results: ResultsRequestModel?,
  @SerializedName("school_id")
  val schoolId: String?,
  @SerializedName("ServerInfo")
  val serverInfo: ServerInfoRequestModel?,
  @SerializedName("Timestamp")
  val timestamp: String?,
  @SerializedName("timestamplocal")
  val timestampLocal: String?,
  @SerializedName("UUID")
  val uUID: String?,
  @SerializedName("Upload")
  val upload: Double?,
  @SerializedName("source")
  val source: String?,
  @SerializedName("geolocation")
  val geo: Geo?,
//  @SerializedName("created_at")
//  val createdAt: String?,
//  @SerializedName("DataDownloaded")
//  val dataDownloaded: Int?,
//  @SerializedName("DataUploaded")
//  val dataUploaded: Int?,
//  @SerializedName("DataUsage")
//  val dataUsage: Int?,
//  @SerializedName("id")
//  val id: String?,
)
