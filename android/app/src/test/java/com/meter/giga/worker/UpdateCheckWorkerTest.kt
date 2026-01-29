package com.meter.giga.worker

import android.app.Application
import android.app.NotificationManager
import android.content.Context
import androidx.test.core.app.ApplicationProvider
import androidx.work.WorkerParameters
import com.google.android.play.core.appupdate.AppUpdateInfo
import com.google.android.play.core.appupdate.AppUpdateManager
import com.google.android.play.core.appupdate.AppUpdateManagerFactory
import com.google.android.play.core.install.model.UpdateAvailability
import com.google.android.gms.tasks.Tasks
import com.meter.giga.utils.Constants.APP_UPDATE_CHANNEL_ID
import com.meter.giga.utils.Logger
import io.mockk.*
import kotlinx.coroutines.runBlocking
import org.junit.After
import org.junit.Assert.*
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [33], application = Application::class)
class UpdateCheckWorkerTest {

  private lateinit var context: Context
  private lateinit var worker: UpdateCheckWorker

  @Before
  fun setup() {
    context = ApplicationProvider.getApplicationContext()

    mockkStatic(AppUpdateManagerFactory::class)

    val params = mockk<WorkerParameters>(relaxed = true)

    worker = spyk(UpdateCheckWorker(context, params))

    // Replace logger to avoid android.util.Log crash
    worker.logger = mockk(relaxed = true)
  }

  @After
  fun tearDown() {
    unmockkAll()
  }

  @Test
  fun `when update not available notification not shown`() = runBlocking {

    val manager = mockk<AppUpdateManager>()
    val info = mockk<AppUpdateInfo>()

    every { AppUpdateManagerFactory.create(any()) } returns manager
    every { info.updateAvailability() } returns UpdateAvailability.UPDATE_NOT_AVAILABLE
    every { manager.appUpdateInfo } returns Tasks.forResult(info)

    every { worker["showUpdateNotification"]() }

    worker.doWork()

    verify(exactly = 0) { worker["showUpdateNotification"]() }
  }

  @Test
  fun `notification channel is created`() {

    val method =
      UpdateCheckWorker::class.java.getDeclaredMethod("createNotificationChannel")

    method.isAccessible = true
    method.invoke(worker)

    val manager =
      context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager

    val channel = manager.getNotificationChannel(APP_UPDATE_CHANNEL_ID)

    assertNotNull(channel)
    assertEquals(APP_UPDATE_CHANNEL_ID, channel.id)
  }
}
