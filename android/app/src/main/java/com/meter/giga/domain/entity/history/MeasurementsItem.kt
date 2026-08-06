package com.meter.giga.domain.entity.history

import com.google.gson.annotations.SerializedName
import com.meter.giga.domain.entity.request.ResultsRequestEntity


data class MeasurementsItem(
  @SerializedName("accessInformation")
  val accessInformation: AccessInformation?,
  @SerializedName("dataUsage")
  val dataUsage: DataUsage?,
  @SerializedName("index")
  val index: Int?,
  @SerializedName("mlabInformation")
  val mlabInformation: MlabInformation?,
  @SerializedName("Notes")
  val notes: String?,
  @SerializedName("results")
  val results: ResultsRequestEntity?,
  @SerializedName("snapLog")
  val snapLog: SnapLog?,
  @SerializedName("timestamp")
  val timestamp: Long?,
  @SerializedName("uploaded")
  var uploaded: Boolean?,
  @SerializedName("uuid")
  val uuid: String?,
  @SerializedName("version")
  val version: Int?,
  @SerializedName("synced")
  var synced: Boolean?,
  @SerializedName("geolocation")
  val geolocation: Geo?,
  @SerializedName("device_hardware_id")
  val deviceHardwareId: String?


)
