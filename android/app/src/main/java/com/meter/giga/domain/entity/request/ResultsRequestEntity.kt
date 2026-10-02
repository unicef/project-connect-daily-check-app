package com.meter.giga.domain.entity.request

import com.google.gson.JsonObject
import com.google.gson.annotations.SerializedName

/**
 * Speed-test Results as produced by the ndt7 Go client for each direction.
 * Kept as [JsonObject] so the POST body matches the desktop client JSON
 * (including ServerTime and the full LastServerMeasurement).
 */
data class ResultsRequestEntity(
  @SerializedName("NDTResult.S2C")
  val ndtResultS2C: JsonObject?,
  @SerializedName("NDTResult.C2S")
  val ndtResultC2S: JsonObject?,
  /**
   * Present only on the copy shown in the WebView. The backend POST leaves
   * this null, and Gson omits nulls, so the uploaded body is unchanged.
   */
  @SerializedName("receivedBytes")
  val receivedBytes: Long? = null,
)
