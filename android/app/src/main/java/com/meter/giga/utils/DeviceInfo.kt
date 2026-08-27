package com.meter.giga.utils

data class DeviceInfo(
  val manufacturer: String,
  val model: String,
  val deviceName: String,
  val sdkInt: Int,
  val buildId: Long,
)
