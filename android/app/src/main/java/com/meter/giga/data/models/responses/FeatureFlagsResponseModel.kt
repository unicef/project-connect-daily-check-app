package com.meter.giga.data.models.responses

import com.google.gson.annotations.SerializedName

/**
 * Response of GET /schools/features_flags/{giga_id_school}
 */
data class FeatureFlagsResponseModel(
  @SerializedName("data")
  val data: FeatureFlagsModel?
)

data class FeatureFlagsModel(
  @SerializedName("pingService")
  val pingService: Boolean?
)
