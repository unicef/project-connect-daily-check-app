package com.meter.giga.worker

import android.app.Application
import android.content.Context
import android.os.Build
import androidx.test.core.app.ApplicationProvider
import androidx.work.WorkManager
import androidx.work.testing.WorkManagerTestInitHelper
import com.meter.giga.data.models.requests.ConnectivityRecordRequestModel
import com.meter.giga.data.models.requests.PendingPingModel
import com.meter.giga.prefrences.PingStore
import com.meter.giga.utils.Constants.PING_ON_OPEN_WORK_NAME
import com.meter.giga.utils.Constants.PING_WORK_NAME
import io.mockk.every
import io.mockk.mockk
import io.mockk.mockkObject
import io.mockk.unmockkObject
import io.mockk.verify
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import java.time.Instant
import java.time.ZoneOffset

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [Build.VERSION_CODES.TIRAMISU], manifest = Config.NONE, application = Application::class)
class PingSchedulerTest {

  private val morning = Instant.parse("2026-10-09T09:00:00Z").toEpochMilli()
  private lateinit var context: Context

  @Before
  fun setup() {
    context = ApplicationProvider.getApplicationContext()
    WorkManagerTestInitHelper.initializeTestWorkManager(context)
  }

  private fun storeCheckAt(createdAt: Long) {
    PingStore(context).add(
      PendingPingModel(
        gigaIdSchool = "giga-1",
        createdAt = createdAt,
        record = ConnectivityRecordRequestModel(
          timestamp = "2026-10-09T09:00:00.000Z",
          isConnected = true,
          errorMessage = null,
          browserId = null,
          appLocalUuid = "uuid-$createdAt",
          latency = 20.0
        )
      )
    )
  }

  private fun onOpenRuns() = WorkManager.getInstance(context)
    .getWorkInfosForUniqueWork(PING_ON_OPEN_WORK_NAME).get()

  private fun checkNow(now: Long) = PingScheduler.checkNowIfNoneToday(context, now, ZoneOffset.UTC)

  @Test
  fun `queues a check when none was ever taken`() {
    assertTrue(checkNow(morning))
    assertEquals(1, onOpenRuns().size)
  }

  @Test
  fun `queues a check when the last one was yesterday`() {
    storeCheckAt(Instant.parse("2026-10-08T19:45:00Z").toEpochMilli())

    assertTrue(checkNow(morning))
  }

  @Test
  fun `queues nothing when a check was already taken today`() {
    storeCheckAt(Instant.parse("2026-10-09T08:15:00Z").toEpochMilli())

    assertFalse(checkNow(morning))
    assertTrue(onOpenRuns().isEmpty())
  }

  @Test
  fun `queues nothing outside active hours`() {
    assertFalse(checkNow(Instant.parse("2026-10-09T20:30:00Z").toEpochMilli()))
    assertFalse(checkNow(Instant.parse("2026-10-09T07:59:00Z").toEpochMilli()))
    assertTrue(onOpenRuns().isEmpty())
  }

  @Test
  fun `opening the app twice queues a single run`() {
    checkNow(morning)
    checkNow(morning + 1000)

    assertEquals(1, onOpenRuns().size)
  }

  @Test
  fun `cancel stops both the periodic and the on-open run`() {
    val workManager = mockk<WorkManager>(relaxed = true)
    mockkObject(WorkManager.Companion)
    every { WorkManager.getInstance(any<Context>()) } returns workManager
    try {
      PingScheduler.cancel(context)

      verify { workManager.cancelUniqueWork(PING_WORK_NAME) }
      verify { workManager.cancelUniqueWork(PING_ON_OPEN_WORK_NAME) }
    } finally {
      unmockkObject(WorkManager.Companion)
    }
  }
}
