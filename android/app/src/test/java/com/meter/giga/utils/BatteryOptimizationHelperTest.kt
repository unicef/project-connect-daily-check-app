package com.meter.giga.utils

import android.Manifest
import android.app.ActivityManager
import android.app.Application
import android.app.NotificationManager
import android.content.Context
import android.os.Build
import android.os.PowerManager
import android.provider.Settings
import androidx.test.core.app.ApplicationProvider
import com.meter.giga.prefrences.AlarmSharedPref
import com.meter.giga.utils.Constants.BATTERY_NOTIFICATION_ID
import com.meter.giga.utils.Constants.BATTERY_PROMPT_INTERVAL_MS
import com.meter.giga.utils.Constants.BATTERY_STOPPED_PROMPT_INTERVAL_MS
import com.meter.giga.utils.Constants.EXTRA_REQUEST_BATTERY_UNRESTRICTED
import com.meter.giga.utils.Constants.MAX_BATTERY_PROMPTS
import io.mockk.every
import io.mockk.mockkStatic
import io.mockk.unmockkAll
import io.sentry.ScopeCallback
import io.sentry.Sentry
import io.sentry.SentryLevel
import io.sentry.protocol.SentryId
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.Shadows.shadowOf
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [Build.VERSION_CODES.TIRAMISU], application = Application::class)
class BatteryOptimizationHelperTest {

  private lateinit var context: Context
  private lateinit var prefs: AlarmSharedPref
  private lateinit var notificationManager: NotificationManager

  @Before
  fun setup() {
    context = ApplicationProvider.getApplicationContext()
    prefs = AlarmSharedPref(context)
    notificationManager = context.getSystemService(NotificationManager::class.java)

    mockkStatic(Sentry::class)
    every {
      Sentry.captureMessage(any<String>(), any<SentryLevel>(), any<ScopeCallback>())
    } returns SentryId.EMPTY_ID
  }

  @After
  fun tearDown() {
    unmockkAll()
  }

  private fun setUnrestricted(value: Boolean) {
    shadowOf(context.getSystemService(PowerManager::class.java))
      .setIgnoringBatteryOptimizations(context.packageName, value)
  }

  private fun setRestricted(value: Boolean) {
    shadowOf(context.getSystemService(ActivityManager::class.java)).setBackgroundRestricted(value)
  }

  private fun registerSchool() {
    prefs.schoolId = "school-1"
  }

  private fun grantNotificationPermission() {
    shadowOf(context as Application).grantPermissions(Manifest.permission.POST_NOTIFICATIONS)
  }

  private fun postedReminder() =
    shadowOf(notificationManager).allNotifications.firstOrNull()

  // statusOf

  @Test
  fun `statusOf returns UNRESTRICTED when ignoring optimizations`() {
    assertEquals(BatteryStatus.UNRESTRICTED, BatteryOptimizationHelper.statusOf(true, false))
  }

  @Test
  fun `statusOf returns OPTIMIZED by default`() {
    assertEquals(BatteryStatus.OPTIMIZED, BatteryOptimizationHelper.statusOf(false, false))
  }

  @Test
  fun `statusOf returns RESTRICTED when background restricted`() {
    assertEquals(BatteryStatus.RESTRICTED, BatteryOptimizationHelper.statusOf(false, true))
  }

  @Test
  fun `status reads the system settings`() {
    setUnrestricted(true)
    assertEquals(BatteryStatus.UNRESTRICTED, BatteryOptimizationHelper.status(context))

    setUnrestricted(false)
    setRestricted(true)
    assertEquals(BatteryStatus.RESTRICTED, BatteryOptimizationHelper.status(context))
  }

  // shouldPrompt

  @Test
  fun `shouldPrompt is false when already unrestricted`() {
    assertFalse(
      BatteryOptimizationHelper.shouldPrompt(BatteryStatus.UNRESTRICTED, 0, 0L, NOW, false)
    )
    assertFalse(
      BatteryOptimizationHelper.shouldPrompt(BatteryStatus.UNRESTRICTED, 0, 0L, NOW, true)
    )
  }

  @Test
  fun `shouldPrompt is true on the first request`() {
    assertTrue(BatteryOptimizationHelper.shouldPrompt(BatteryStatus.OPTIMIZED, 0, 0L, NOW, false))
  }

  @Test
  fun `shouldPrompt waits for the prompt interval`() {
    val lastPromptAt = NOW - BATTERY_PROMPT_INTERVAL_MS + 1
    assertFalse(
      BatteryOptimizationHelper.shouldPrompt(BatteryStatus.OPTIMIZED, 1, lastPromptAt, NOW, false)
    )
    assertTrue(
      BatteryOptimizationHelper.shouldPrompt(
        BatteryStatus.OPTIMIZED, 1, NOW - BATTERY_PROMPT_INTERVAL_MS, NOW, false
      )
    )
  }

  @Test
  fun `shouldPrompt stops after the prompt limit`() {
    assertFalse(
      BatteryOptimizationHelper.shouldPrompt(
        BatteryStatus.OPTIMIZED, MAX_BATTERY_PROMPTS, 0L, NOW, false
      )
    )
  }

  @Test
  fun `shouldPrompt after a stopped test ignores the limit but waits a day`() {
    assertTrue(
      BatteryOptimizationHelper.shouldPrompt(
        BatteryStatus.RESTRICTED,
        MAX_BATTERY_PROMPTS,
        NOW - BATTERY_STOPPED_PROMPT_INTERVAL_MS,
        NOW,
        true
      )
    )
    assertFalse(
      BatteryOptimizationHelper.shouldPrompt(
        BatteryStatus.RESTRICTED,
        MAX_BATTERY_PROMPTS,
        NOW - BATTERY_STOPPED_PROMPT_INTERVAL_MS + 1,
        NOW,
        true
      )
    )
  }

  // requestIntent

  @Test
  fun `requestIntent opens the system dialog when optimized`() {
    val intent = BatteryOptimizationHelper.requestIntent(context, BatteryStatus.OPTIMIZED)
    assertEquals(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS, intent.action)
    assertEquals("package:${context.packageName}", intent.dataString)
  }

  @Test
  fun `requestIntent opens app settings when restricted`() {
    val intent = BatteryOptimizationHelper.requestIntent(context, BatteryStatus.RESTRICTED)
    assertEquals(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, intent.action)
    assertEquals("package:${context.packageName}", intent.dataString)
  }

  // refreshStatus

  @Test
  fun `refreshStatus stores the status`() {
    setUnrestricted(true)
    BatteryOptimizationHelper.refreshStatus(context, prefs)
    assertEquals(BatteryStatus.UNRESTRICTED.name, prefs.batteryLastStatus)
  }

  @Test
  fun `refreshStatus resets the prompt count when unrestricted is removed`() {
    setUnrestricted(true)
    BatteryOptimizationHelper.refreshStatus(context, prefs)
    prefs.batteryPromptCount = MAX_BATTERY_PROMPTS

    setUnrestricted(false)
    BatteryOptimizationHelper.refreshStatus(context, prefs)

    assertEquals(0, prefs.batteryPromptCount)
  }

  @Test
  fun `refreshStatus keeps the prompt count while still optimized`() {
    BatteryOptimizationHelper.refreshStatus(context, prefs)
    prefs.batteryPromptCount = 2

    BatteryOptimizationHelper.refreshStatus(context, prefs)

    assertEquals(2, prefs.batteryPromptCount)
  }

  // remindIfNeeded

  @Test
  fun `remindIfNeeded posts a reminder that opens the battery request`() {
    registerSchool()
    grantNotificationPermission()

    assertTrue(BatteryOptimizationHelper.remindIfNeeded(context))

    val notification = postedReminder()!!
    val intent = shadowOf(notification.contentIntent).savedIntent
    assertTrue(intent.getBooleanExtra(EXTRA_REQUEST_BATTERY_UNRESTRICTED, false))
    assertEquals(1, prefs.batteryPromptCount)
  }

  @Test
  fun `remindIfNeeded waits for the interval before reminding again`() {
    registerSchool()
    grantNotificationPermission()
    BatteryOptimizationHelper.remindIfNeeded(context)
    notificationManager.cancelAll()

    assertFalse(BatteryOptimizationHelper.remindIfNeeded(context))
    assertNull(postedReminder())
    assertEquals(1, prefs.batteryPromptCount)
  }

  @Test
  fun `remindIfNeeded skips unregistered devices`() {
    grantNotificationPermission()

    assertFalse(BatteryOptimizationHelper.remindIfNeeded(context))
    assertNull(postedReminder())
  }

  @Test
  fun `remindIfNeeded skips unrestricted devices`() {
    registerSchool()
    grantNotificationPermission()
    setUnrestricted(true)

    assertFalse(BatteryOptimizationHelper.remindIfNeeded(context))
    assertNull(postedReminder())
  }

  @Test
  fun `remindIfNeeded does not count a reminder without notification permission`() {
    registerSchool()

    assertFalse(BatteryOptimizationHelper.remindIfNeeded(context))
    assertEquals(0, prefs.batteryPromptCount)
  }

  @Test
  fun `refreshStatus removes the reminder once unrestricted`() {
    registerSchool()
    grantNotificationPermission()
    BatteryOptimizationHelper.remindIfNeeded(context)

    setUnrestricted(true)
    BatteryOptimizationHelper.refreshStatus(context, prefs)

    assertNull(shadowOf(notificationManager).getNotification(BATTERY_NOTIFICATION_ID))
  }

  private companion object {
    const val NOW = 10_000_000_000L
  }
}
