package com.meter.giga.domain.entity.history

import com.google.gson.annotations.SerializedName

data class Geo(
  @SerializedName("location")
  val geoLocation: GeoLocation?,
  @SerializedName("accuracy")
  val accuracy: Float?,
  @SerializedName("timestamp")
  val timestamp: Long?,
)

data class GeoLocation(
  @SerializedName("lat")
  val lat: Double?,
  @SerializedName("lng")
  val lng: Double?,
)
