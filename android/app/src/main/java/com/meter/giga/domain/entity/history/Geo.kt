package com.meter.giga.domain.entity.history

import com.google.gson.annotations.SerializedName

data class Geo(
  @SerializedName("latitude")
  val latitude: Double?,
  @SerializedName("longitude")
  val longitude: Double?,
)
