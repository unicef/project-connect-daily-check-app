package com.meter.giga.receiver

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import com.meter.giga.utils.AppLogger
import com.meter.giga.utils.BatteryOptimizationHelper
import io.sentry.Sentry

/**
 * PackageReplacedReceiver receives the broadcast sent after the app is updated,
 * even if the app is not opened afterwards. It reminds registered devices that
 * don't allow unrestricted battery usage yet.
 */
class PackageReplacedReceiver : BroadcastReceiver() {

  /**
   * BroadcastReceiver overridden method onReceive method implementation
   * @param context: Context of the app
   * @param intent: instance of Intent, contains the data
   */
  override fun onReceive(context: Context, intent: Intent?) {
    if (intent?.action != Intent.ACTION_MY_PACKAGE_REPLACED) return
    AppLogger.d("GIGA PackageReplacedReceiver", "App updated")
    try {
      BatteryOptimizationHelper.remindIfNeeded(context)
    } catch (e: Exception) {
      Sentry.captureException(e)
    }
  }
}
