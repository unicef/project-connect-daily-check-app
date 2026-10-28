package com.meter.giga.utils

import android.Manifest
import android.annotation.SuppressLint
import android.app.ActivityManager
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import android.os.PowerManager
import android.provider.Settings
import androidx.core.app.ActivityCompat
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.net.toUri
import com.meter.giga.MainActivity
import com.meter.giga.app.R
import com.meter.giga.prefrences.AlarmSharedPref
import com.meter.giga.utils.Constants.BATTERY_CHANNEL_ID
import com.meter.giga.utils.Constants.BATTERY_NOTIFICATION_ID
import com.meter.giga.utils.Constants.BATTERY_PROMPT_INTERVAL_MS
import com.meter.giga.utils.Constants.BATTERY_STOPPED_PROMPT_INTERVAL_MS
import com.meter.giga.utils.Constants.EXTRA_REQUEST_BATTERY_UNRESTRICTED
import com.meter.giga.utils.Constants.MAX_BATTERY_PROMPTS
import io.sentry.Sentry
import io.sentry.SentryLevel

/**
 * Battery usage setting of the app, as shown in the system
 * app battery settings on Android 12 and later.
 */
enum class BatteryStatus { UNRESTRICTED, OPTIMIZED, RESTRICTED }

/**
 * Checks and requests unrestricted battery usage, so the system
 * does not delay or stop the background speed tests.
 *
 * <p>The request is optional. Users who decline are reminded at most
 * [MAX_BATTERY_PROMPTS] times, [BATTERY_PROMPT_INTERVAL_MS] apart, and
 * after that only when the system stops a test.
 */
object BatteryOptimizationHelper {

  private const val TAG = "GIGA BatteryOptimization"

  /**
   * Reads the current battery usage setting of the app.
   */
  fun status(context: Context): BatteryStatus {
    val ignoringOptimizations = context.getSystemService(PowerManager::class.java)
      ?.isIgnoringBatteryOptimizations(context.packageName) == true
    val backgroundRestricted = Build.VERSION.SDK_INT >= Build.VERSION_CODES.P &&
      context.getSystemService(ActivityManager::class.java)?.isBackgroundRestricted == true
    return statusOf(ignoringOptimizations, backgroundRestricted)
  }

  fun statusOf(ignoringOptimizations: Boolean, backgroundRestricted: Boolean): BatteryStatus =
    when {
      backgroundRestricted -> BatteryStatus.RESTRICTED
      ignoringOptimizations -> BatteryStatus.UNRESTRICTED
      else -> BatteryStatus.OPTIMIZED
    }

  /**
   * Whether the user should be asked again.
   *
   * @param systemStopped true when the system has just stopped a speed test.
   * These requests ignore the prompt limit, but still wait a day between requests.
   */
  fun shouldPrompt(
    status: BatteryStatus,
    promptCount: Int,
    lastPromptAt: Long,
    now: Long,
    systemStopped: Boolean
  ): Boolean {
    if (status == BatteryStatus.UNRESTRICTED) return false
    val sinceLastPrompt = now - lastPromptAt
    if (systemStopped) return sinceLastPrompt >= BATTERY_STOPPED_PROMPT_INTERVAL_MS
    return promptCount < MAX_BATTERY_PROMPTS && sinceLastPrompt >= BATTERY_PROMPT_INTERVAL_MS
  }

  /**
   * Intent for the system dialog that allows unrestricted battery usage.
   * A restricted app can only be changed from its app settings page.
   */
  @SuppressLint("BatteryLife")
  fun requestIntent(context: Context, status: BatteryStatus): Intent {
    val action = if (status == BatteryStatus.RESTRICTED) {
      Settings.ACTION_APPLICATION_DETAILS_SETTINGS
    } else {
      Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS
    }
    return Intent(action).setData("package:${context.packageName}".toUri())
  }

  /**
   * Battery optimization list, for devices without the system dialog.
   */
  fun settingsListIntent(): Intent = Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS)

  /**
   * Reads the current status and stores it. Resets the prompt limit when the
   * user removes unrestricted usage, and removes the reminder once it is allowed.
   */
  @JvmOverloads
  fun refreshStatus(
    context: Context,
    prefs: AlarmSharedPref = AlarmSharedPref(context),
    reportChange: Boolean = true
  ): BatteryStatus {
    val status = status(context)
    val previous = prefs.batteryLastStatus
    if (previous != status.name) {
      if (previous == BatteryStatus.UNRESTRICTED.name) prefs.batteryPromptCount = 0
      if (reportChange && previous.isNotEmpty()) {
        Sentry.captureMessage("Battery usage setting changed", SentryLevel.INFO) { scope ->
          scope.setTag("battery_status_from", previous.lowercase())
          scope.setTag("battery_status", status.name.lowercase())
        }
      }
      prefs.batteryLastStatus = status.name
    }
    if (status == BatteryStatus.UNRESTRICTED) {
      NotificationManagerCompat.from(context).cancel(BATTERY_NOTIFICATION_ID)
    }
    return status
  }

  /**
   * Counts a request towards the prompt limit.
   *
   * @param source where the user was asked: app_open, background or test_stopped.
   */
  fun recordPrompt(prefs: AlarmSharedPref, status: BatteryStatus, source: String) {
    prefs.batteryPromptCount = prefs.batteryPromptCount + 1
    prefs.batteryLastPromptAt = System.currentTimeMillis()
    AppLogger.d(TAG, "Requested unrestricted battery from $source, status: $status")
    Sentry.captureMessage("Unrestricted battery requested", SentryLevel.INFO) { scope ->
      scope.setTag("battery_prompt_source", source)
      scope.setTag("battery_status", status.name.lowercase())
      scope.setTag("battery_prompt_count", "${prefs.batteryPromptCount}")
    }
  }

  /**
   * Reports the user's choice after the system request closes.
   */
  fun recordPromptResult(context: Context) {
    val status = refreshStatus(context, reportChange = false)
    val declined = status != BatteryStatus.UNRESTRICTED
    AppLogger.d(TAG, "Unrestricted battery request result: $status")
    Sentry.captureMessage("Unrestricted battery request result", SentryLevel.INFO) { scope ->
      scope.setTag("battery_status", status.name.lowercase())
      scope.setTag("battery_prompt_declined", "$declined")
    }
  }

  /**
   * Shows a reminder notification when the app runs without the user, for
   * example after an update or when the system stops a test. The system dialog
   * can't open from the background, so the notification opens the app first.
   *
   * @return true if the reminder was shown.
   */
  @JvmOverloads
  fun remindIfNeeded(context: Context, systemStopped: Boolean = false): Boolean {
    val prefs = AlarmSharedPref(context)
    if (prefs.schoolId.isEmpty()) return false

    val status = refreshStatus(context, prefs)
    val shouldPrompt = shouldPrompt(
      status,
      prefs.batteryPromptCount,
      prefs.batteryLastPromptAt,
      System.currentTimeMillis(),
      systemStopped
    )
    if (!shouldPrompt || !showReminderNotification(context)) return false

    recordPrompt(prefs, status, if (systemStopped) "test_stopped" else "background")
    return true
  }

  private fun showReminderNotification(context: Context): Boolean {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU &&
      ActivityCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS)
      != PackageManager.PERMISSION_GRANTED
    ) {
      AppLogger.d(TAG, "POST_NOTIFICATION PERMISSIONS ARE MISSING")
      return false
    }

    val channel = NotificationChannel(
      BATTERY_CHANNEL_ID,
      "Background speed tests",
      NotificationManager.IMPORTANCE_DEFAULT
    ).apply {
      description = "Reminders to allow speed tests in the background"
    }
    context.getSystemService(NotificationManager::class.java)?.createNotificationChannel(channel)

    val intent = Intent(context, MainActivity::class.java).apply {
      flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
      putExtra(EXTRA_REQUEST_BATTERY_UNRESTRICTED, true)
    }
    val pendingIntent = PendingIntent.getActivity(
      context,
      BATTERY_NOTIFICATION_ID,
      intent,
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
    )
    val content = "Daily speed tests may be delayed or skipped. Tap to remove battery limits for Giga Meter."
    val notification = NotificationCompat.Builder(context, BATTERY_CHANNEL_ID)
      .setContentTitle("Let Giga Meter run in the background")
      .setContentText(content)
      .setStyle(NotificationCompat.BigTextStyle().bigText(content))
      .setSmallIcon(R.mipmap.ic_launcher_round)
      .setContentIntent(pendingIntent)
      .setAutoCancel(true)
      .build()

    NotificationManagerCompat.from(context).notify(BATTERY_NOTIFICATION_ID, notification)
    return true
  }
}
