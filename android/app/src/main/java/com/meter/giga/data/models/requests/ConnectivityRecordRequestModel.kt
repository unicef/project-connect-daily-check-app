package com.meter.giga.data.models.requests

import com.google.gson.annotations.SerializedName

/**
 * One ping check, in the shape POST /connectivity/{giga_id_school} expects
 */
data class ConnectivityRecordRequestModel(
  @SerializedName("timestamp")
  val timestamp: String,
  @SerializedName("isConnected")
  val isConnected: Boolean,
  @SerializedName("errorMessage")
  val errorMessage: String?,
  @SerializedName("browserId")
  val browserId: String?,
  @SerializedName("app_local_uuid")
  val appLocalUuid: String,
  @SerializedName("latency")
  val latency: Double?
)

/**
 * Request body of POST /connectivity/{giga_id_school}
 */
data class ConnectivityRecordsRequestModel(
  @SerializedName("records")
  val records: List<ConnectivityRecordRequestModel>
)

/**
 * A ping check waiting to be posted. The school is stored with the record
 * so checks taken before a re-registration still go to their own school.
 */
data class PendingPingModel(
  @SerializedName("giga_id_school")
  val gigaIdSchool: String,
  @SerializedName("created_at")
  val createdAt: Long,
  @SerializedName("record")
  val record: ConnectivityRecordRequestModel
)
