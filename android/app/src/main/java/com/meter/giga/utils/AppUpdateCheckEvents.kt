package com.meter.giga.utils

data class PluginEvent(
  val action: String,
  val payload: String? = null
) {
  companion object {
    const val ACTION_APP_CHECK_AVAILABLE = "ACTION_APP_CHECK_AVAILABLE"
    const val ACTION_APP_CHECK_NOT_AVAILABLE = "ACTION_APP_CHECK_NOT_AVAILABLE"
  }
}
