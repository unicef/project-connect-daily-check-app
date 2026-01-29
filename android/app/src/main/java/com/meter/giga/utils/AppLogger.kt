package com.meter.giga.utils

import android.util.Log

object AppLogger : Logger {
  // 👇 injectable logger
  var logger: Logger = this
  override fun d(tag: String, msg: String) {
    Log.d(tag, msg)
  }
}
