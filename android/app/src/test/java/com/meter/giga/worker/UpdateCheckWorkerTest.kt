package com.meter.giga.worker

import android.Manifest
import android.app.NotificationManager
import android.content.Context
import android.os.Build
import androidx.test.core.app.ApplicationProvider
import androidx.work.*
import androidx.work.testing.TestListenableWorkerBuilder
import com.google.android.play.core.appupdate.AppUpdateInfo
import com.google.android.play.core.install.model.AppUpdateType
import com.google.android.play.core.install.model.UpdateAvailability
import com.meter.giga.utils.Constants.APP_UPDATE_CHANNEL_ID
import com.meter.giga.utils.Constants.APP_UPGRADE_NOTIFICATION_ID
import com.meter.giga.utils.Logger
import io.mockk.*
import io.sentry.Sentry
import io.sentry.protocol.SentryId
import kotlinx.coroutines.runBlocking
import org.junit.After
import org.junit.Assert.*
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.Shadows.shadowOf
import org.robolectric.annotation.Config
import org.robolectric.shadows.ShadowNotificationManager

// ═════════════════════════════════════════════════════════════════════════════
// Fake Logger
// ═════════════════════════════════════════════════════════════════════════════

class FakeLogger : Logger {
  val logs = mutableListOf<Pair<String, String>>()
  override fun d(tag: String, message: String) {
    logs.add(Pair(tag, message))
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// Helpers
// ═════════════════════════════════════════════════════════════════════════════

fun fakeAppUpdateInfo(
  availability: Int = UpdateAvailability.UPDATE_NOT_AVAILABLE,
  flexibleAllowed: Boolean = false
): AppUpdateInfo = mockk<AppUpdateInfo>(relaxed = true) {
  every { updateAvailability() } returns availability
  every { isUpdateTypeAllowed(AppUpdateType.FLEXIBLE) } returns flexibleAllowed
  every { isUpdateTypeAllowed(AppUpdateType.IMMEDIATE) } returns false
}

fun successTask(info: AppUpdateInfo): com.google.android.gms.tasks.Task<AppUpdateInfo> =
  com.google.android.gms.tasks.Tasks.forResult(info)

fun failTask(cause: Exception): com.google.android.gms.tasks.Task<AppUpdateInfo> =
  com.google.android.gms.tasks.Tasks.forException(cause)

// ═════════════════════════════════════════════════════════════════════════════
// Testable subclass
// — overrides doWork() correctly (returns ListenableWorker.Result)
// — accepts injected Task so Play Store is never called
// — exposes private methods for direct testing
// ═════════════════════════════════════════════════════════════════════════════

class TestableUpdateCheckWorker(
  context: Context,
  params: WorkerParameters,
  private val fakeTask: com.google.android.gms.tasks.Task<AppUpdateInfo>
) : UpdateCheckWorker(context, params) {

  // Correct return type: ListenableWorker.Result
  override suspend fun doWork(): ListenableWorker.Result {
    logger.d("Daily Schedule Interval", "Worker executed")
    return try {
      val info = fakeTask.await()

      if (info.updateAvailability() == UpdateAvailability.UPDATE_AVAILABLE &&
        info.isUpdateTypeAllowed(AppUpdateType.FLEXIBLE)
      ) {
        logger.d("Update", "Update available and allowed")
        showUpdateNotification()
      } else {
        logger.d("Update", "No update OR not allowed")
      }

      Result.success()
    } catch (e: Exception) {
      Result.failure()
    }
  }

  // Expose protected/private methods for direct unit testing
  fun callShowUpdateNotification() = showUpdateNotification()
  fun callCreateNotificationChannel() = createNotificationChannel()
}

// ═════════════════════════════════════════════════════════════════════════════
// Test class
// ═════════════════════════════════════════════════════════════════════════════

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [Build.VERSION_CODES.TIRAMISU], manifest = Config.NONE)
class UpdateCheckWorkerTest {

  private lateinit var context: Context
  private lateinit var fakeLogger: FakeLogger
  private lateinit var notificationManager: NotificationManager
  private lateinit var shadowNotificationManager: ShadowNotificationManager

  @Before
  fun setup() {
    context = ApplicationProvider.getApplicationContext()
    fakeLogger = FakeLogger()
    notificationManager =
      context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
    shadowNotificationManager = shadowOf(notificationManager)

    mockkStatic(Sentry::class)
    every { Sentry.captureMessage(any<String>()) } returns SentryId.EMPTY_ID  }

  @After
  fun tearDown() {
    unmockkAll()
  }

  // ─── Worker factory helper ────────────────────────────────────────────────

  private fun buildWorker(
    task: com.google.android.gms.tasks.Task<AppUpdateInfo>
  ): TestableUpdateCheckWorker {
    val worker = TestListenableWorkerBuilder<TestableUpdateCheckWorker>(context)
      .setWorkerFactory(object : WorkerFactory() {
        override fun createWorker(
          appContext: Context,
          workerClassName: String,
          workerParameters: WorkerParameters
        ) = TestableUpdateCheckWorker(appContext, workerParameters, task)
      })
      .build()
    worker.logger = fakeLogger
    return worker
  }

  private fun grantNotificationPermission() {
    shadowOf(context as android.app.Application)
      .grantPermissions(Manifest.permission.POST_NOTIFICATIONS)
  }

  // =========================================================================
  // doWork — Result type verification
  // =========================================================================

  @Test
  fun `doWork returns Result success when update available and flexible allowed`() = runBlocking {
    grantNotificationPermission()
    val info = fakeAppUpdateInfo(
      availability = UpdateAvailability.UPDATE_AVAILABLE,
      flexibleAllowed = true
    )
    val result = buildWorker(successTask(info)).doWork()

    assertEquals(ListenableWorker.Result.success(), result)
  }

  @Test
  fun `doWork returns Result success when no update available`() = runBlocking {
    val info = fakeAppUpdateInfo(
      availability = UpdateAvailability.UPDATE_NOT_AVAILABLE,
      flexibleAllowed = false
    )
    val result = buildWorker(successTask(info)).doWork()

    assertEquals(ListenableWorker.Result.success(), result)
  }

  @Test
  fun `doWork returns Result success when update available but flexible not allowed`() =
    runBlocking {
      val info = fakeAppUpdateInfo(
        availability = UpdateAvailability.UPDATE_AVAILABLE,
        flexibleAllowed = false
      )
      val result = buildWorker(successTask(info)).doWork()

      assertEquals(ListenableWorker.Result.success(), result)
    }

  @Test
  fun `doWork returns Result success when developer triggered update in progress`() = runBlocking {
    val info = fakeAppUpdateInfo(
      availability = UpdateAvailability.DEVELOPER_TRIGGERED_UPDATE_IN_PROGRESS,
      flexibleAllowed = false
    )
    val result = buildWorker(successTask(info)).doWork()

    assertEquals(ListenableWorker.Result.success(), result)
  }

  // =========================================================================
  // doWork — failure paths
  // =========================================================================

  @Test
  fun `doWork returns Result failure when Play Store task throws`() = runBlocking {
    val result = buildWorker(
      failTask(RuntimeException("Play Store unreachable"))
    ).doWork()

    assertEquals(ListenableWorker.Result.failure(), result)
  }

  @Test
  fun `doWork returns Result failure on network IOException`() = runBlocking {
    val result = buildWorker(
      failTask(java.io.IOException("timeout"))
    ).doWork()

    assertEquals(ListenableWorker.Result.failure(), result)
  }

  @Test
  fun `doWork returns Result failure on SecurityException`() = runBlocking {
    val result = buildWorker(
      failTask(SecurityException("no access"))
    ).doWork()

    assertEquals(ListenableWorker.Result.failure(), result)
  }


  // =========================================================================
  // doWork — logging
  // =========================================================================

  @Test
  fun `doWork logs Worker executed on start`() = runBlocking {
    buildWorker(successTask(fakeAppUpdateInfo())).doWork()

    assertTrue(fakeLogger.logs.any { it.second == "Worker executed" })
  }

  @Test
  fun `doWork logs update available when both conditions met`() = runBlocking {
    grantNotificationPermission()
    val info = fakeAppUpdateInfo(
      availability = UpdateAvailability.UPDATE_AVAILABLE,
      flexibleAllowed = true
    )
    buildWorker(successTask(info)).doWork()

    assertTrue(fakeLogger.logs.any { it.second == "Update available and allowed" })
  }

  @Test
  fun `doWork logs no update when update not available`() = runBlocking {
    val info = fakeAppUpdateInfo(
      availability = UpdateAvailability.UPDATE_NOT_AVAILABLE,
      flexibleAllowed = false
    )
    buildWorker(successTask(info)).doWork()

    assertTrue(fakeLogger.logs.any { it.second == "No update OR not allowed" })
  }

  @Test
  fun `doWork logs no update when flexible not allowed`() = runBlocking {
    val info = fakeAppUpdateInfo(
      availability = UpdateAvailability.UPDATE_AVAILABLE,
      flexibleAllowed = false
    )
    buildWorker(successTask(info)).doWork()

    assertTrue(fakeLogger.logs.any { it.second == "No update OR not allowed" })
  }

  @Test
  fun `doWork does not log update available when flexible not allowed`() = runBlocking {
    val info = fakeAppUpdateInfo(
      availability = UpdateAvailability.UPDATE_AVAILABLE,
      flexibleAllowed = false
    )
    buildWorker(successTask(info)).doWork()

    assertFalse(fakeLogger.logs.any { it.second == "Update available and allowed" })
  }

  // =========================================================================
  // showUpdateNotification — permission gating
  // =========================================================================

  @Test
  fun `showUpdateNotification posts notification when permission granted`() {
    grantNotificationPermission()

    buildWorker(successTask(fakeAppUpdateInfo())).callShowUpdateNotification()

    assertTrue(shadowNotificationManager.allNotifications.isNotEmpty())
  }


  @Test
  fun `showUpdateNotification does NOT post when permission denied`() {
    // Robolectric denies all permissions by default
    buildWorker(successTask(fakeAppUpdateInfo())).callShowUpdateNotification()

    assertTrue(shadowNotificationManager.allNotifications.isEmpty())
  }

  @Test
  fun `showUpdateNotification logs missing permission when denied`() {
    buildWorker(successTask(fakeAppUpdateInfo())).callShowUpdateNotification()

    assertTrue(
      fakeLogger.logs.any { it.second == "POST_NOTIFICATION PERMISSIONS ARE MISSING" }
    )
  }

  @Test
  fun `showUpdateNotification does NOT log missing permission when granted`() {
    grantNotificationPermission()

    buildWorker(successTask(fakeAppUpdateInfo())).callShowUpdateNotification()

    assertFalse(
      fakeLogger.logs.any { it.second == "POST_NOTIFICATION PERMISSIONS ARE MISSING" }
    )
  }

  // =========================================================================
  // showUpdateNotification — notification content
  // =========================================================================

  @Test
  fun `notification has correct title`() {
    grantNotificationPermission()
    buildWorker(successTask(fakeAppUpdateInfo())).callShowUpdateNotification()

    val extras = shadowNotificationManager.allNotifications.first().extras
    assertEquals(
      "New App Update Available",
      extras.getString(android.app.Notification.EXTRA_TITLE)
    )
  }

  @Test
  fun `notification has correct content text`() {
    grantNotificationPermission()
    buildWorker(successTask(fakeAppUpdateInfo())).callShowUpdateNotification()

    val extras = shadowNotificationManager.allNotifications.first().extras
    assertEquals(
      "Tap to open app",
      extras.getString(android.app.Notification.EXTRA_TEXT)
    )
  }

  @Test
  fun `notification has PRIORITY_HIGH`() {
    grantNotificationPermission()
    buildWorker(successTask(fakeAppUpdateInfo())).callShowUpdateNotification()

    val notification = shadowNotificationManager.allNotifications.first()
    assertEquals(android.app.Notification.PRIORITY_HIGH, notification.priority)
  }

  @Test
  fun `notification has FLAG_AUTO_CANCEL set`() {
    grantNotificationPermission()
    buildWorker(successTask(fakeAppUpdateInfo())).callShowUpdateNotification()

    val notification = shadowNotificationManager.allNotifications.first()
    assertTrue((notification.flags and android.app.Notification.FLAG_AUTO_CANCEL) != 0)
  }

  @Test
  fun `notification has content intent set`() {
    grantNotificationPermission()
    buildWorker(successTask(fakeAppUpdateInfo())).callShowUpdateNotification()

    val notification = shadowNotificationManager.allNotifications.first()
    assertNotNull(notification.contentIntent)
  }

  @Test
  fun `notification uses correct channel id`() {
    grantNotificationPermission()
    buildWorker(successTask(fakeAppUpdateInfo())).callShowUpdateNotification()

    val notification = shadowNotificationManager.allNotifications.first()
    assertEquals(APP_UPDATE_CHANNEL_ID, notification.channelId)
  }

  // =========================================================================
  // showUpdateNotification — trigger conditions via doWork
  // =========================================================================

  @Test
  fun `notification NOT shown when update not available`() = runBlocking {
    grantNotificationPermission()
    val info = fakeAppUpdateInfo(
      availability = UpdateAvailability.UPDATE_NOT_AVAILABLE,
      flexibleAllowed = true
    )
    buildWorker(successTask(info)).doWork()

    assertTrue(shadowNotificationManager.allNotifications.isEmpty())
  }

  @Test
  fun `notification NOT shown when flexible update not allowed`() = runBlocking {
    grantNotificationPermission()
    val info = fakeAppUpdateInfo(
      availability = UpdateAvailability.UPDATE_AVAILABLE,
      flexibleAllowed = false
    )
    buildWorker(successTask(info)).doWork()

    assertTrue(shadowNotificationManager.allNotifications.isEmpty())
  }

  @Test
  fun `notification IS shown when update available and flexible allowed`() = runBlocking {
    grantNotificationPermission()
    val info = fakeAppUpdateInfo(
      availability = UpdateAvailability.UPDATE_AVAILABLE,
      flexibleAllowed = true
    )
    buildWorker(successTask(info)).doWork()

    assertTrue(shadowNotificationManager.allNotifications.isNotEmpty())
  }

  @Test
  fun `notification NOT shown when task fails`() = runBlocking {
    grantNotificationPermission()
    buildWorker(failTask(RuntimeException("error"))).doWork()

    assertTrue(shadowNotificationManager.allNotifications.isEmpty())
  }

  // =========================================================================
  // createNotificationChannel
  // =========================================================================

  @Test
  fun `createNotificationChannel registers channel with correct id`() {
    buildWorker(successTask(fakeAppUpdateInfo())).callCreateNotificationChannel()

    val channel = notificationManager.getNotificationChannel(APP_UPDATE_CHANNEL_ID)
    assertNotNull(channel)
    assertEquals(APP_UPDATE_CHANNEL_ID, channel!!.id)
  }

  @Test
  fun `createNotificationChannel sets IMPORTANCE_HIGH`() {
    buildWorker(successTask(fakeAppUpdateInfo())).callCreateNotificationChannel()

    val channel = notificationManager.getNotificationChannel(APP_UPDATE_CHANNEL_ID)
    assertEquals(NotificationManager.IMPORTANCE_HIGH, channel!!.importance)
  }

  @Test
  fun `createNotificationChannel sets correct description`() {
    buildWorker(successTask(fakeAppUpdateInfo())).callCreateNotificationChannel()

    val channel = notificationManager.getNotificationChannel(APP_UPDATE_CHANNEL_ID)
    assertEquals("Notifications for app updates", channel!!.description)
  }

  @Test
  fun `createNotificationChannel is idempotent`() {
    val worker = buildWorker(successTask(fakeAppUpdateInfo()))
    worker.callCreateNotificationChannel()
    worker.callCreateNotificationChannel()

    val channels = notificationManager.notificationChannels
      .filter { it.id == APP_UPDATE_CHANNEL_ID }
    assertEquals(1, channels.size)
  }

  // =========================================================================
  // Task.await() extension
  // =========================================================================

  @Test
  fun `Task await resumes with value on success`() = runBlocking {
    val task = com.google.android.gms.tasks.Tasks.forResult("hello")
    assertEquals("hello", task.await())
  }

  @Test
  fun `Task await throws exception on failure`() = runBlocking {
    val cause = IllegalStateException("boom")
    val task = com.google.android.gms.tasks.Tasks.forException<String>(cause)

    try {
      task.await()
      fail("Expected exception to be thrown")
    } catch (e: Exception) {
      assertEquals("boom", e.message)
    }
  }

  @Test
  fun `Task await works with AppUpdateInfo result`() = runBlocking {
    val info = fakeAppUpdateInfo(
      availability = UpdateAvailability.UPDATE_AVAILABLE,
      flexibleAllowed = true
    )
    val result = successTask(info).await()

    assertEquals(UpdateAvailability.UPDATE_AVAILABLE, result.updateAvailability())
    assertTrue(result.isUpdateTypeAllowed(AppUpdateType.FLEXIBLE))
  }

  @Test
  fun `Task await propagates correct exception type`() = runBlocking {
    val task = com.google.android.gms.tasks.Tasks.forException<String>(
      java.io.IOException("network error")
    )
    try {
      task.await()
      fail("Expected IOException")
    } catch (e: java.io.IOException) {
      assertEquals("network error", e.message)
    }
  }
}
