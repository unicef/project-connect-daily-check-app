package com.meter.giga.preference

import android.app.Application
import android.content.Context
import android.os.Build
import androidx.test.core.app.ApplicationProvider
import com.meter.giga.data.models.requests.ConnectivityRecordRequestModel
import com.meter.giga.data.models.requests.PendingPingModel
import com.meter.giga.prefrences.PingStore
import com.meter.giga.utils.Constants.PING_MAX_PENDING
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [Build.VERSION_CODES.TIRAMISU], manifest = Config.NONE, application = Application::class)
class PingStoreTest {

  private lateinit var context: Context
  private lateinit var store: PingStore

  @Before
  fun setup() {
    context = ApplicationProvider.getApplicationContext()
    store = PingStore(context)
  }

  private fun ping(uuid: String, createdAt: Long = 0L, gigaId: String = "giga-1") =
    PendingPingModel(
      gigaIdSchool = gigaId,
      createdAt = createdAt,
      record = ConnectivityRecordRequestModel(
        timestamp = "2026-10-09T10:00:00.000Z",
        isConnected = true,
        errorMessage = null,
        browserId = "user-1",
        appLocalUuid = uuid,
        latency = 20.0
      )
    )

  @Test
  fun `queued checks survive a new store instance`() {
    store.add(ping("a"))
    store.add(ping("b"))

    assertEquals(listOf("a", "b"), PingStore(context).pending().map { it.record.appLocalUuid })
    assertEquals("b", PingStore(context).lastResult?.appLocalUuid)
  }

  @Test
  fun `remove drops only the posted checks`() {
    store.add(ping("a"))
    store.add(ping("b"))

    store.remove(setOf("a"))

    assertEquals(listOf("b"), store.pending().map { it.record.appLocalUuid })
  }

  @Test
  fun `pruneOlderThan drops checks taken before the cutoff`() {
    store.add(ping("old", createdAt = 100))
    store.add(ping("new", createdAt = 200))

    store.pruneOlderThan(150)

    assertEquals(listOf("new"), store.pending().map { it.record.appLocalUuid })
  }

  @Test
  fun `drops the oldest checks beyond the queue limit`() {
    repeat(PING_MAX_PENDING + 2) { store.add(ping("$it")) }

    val pending = store.pending()
    assertEquals(PING_MAX_PENDING, pending.size)
    assertEquals("2", pending.first().record.appLocalUuid)
  }

  @Test
  fun `resetSchoolState forgets the flag and latest result but keeps the queue`() {
    store.add(ping("a"))
    store.pingServiceEnabled = false
    store.flagsFetchedAt = 123

    store.resetSchoolState()

    assertNull(store.pingServiceEnabled)
    assertEquals(0L, store.flagsFetchedAt)
    assertNull(store.lastResult)
    assertEquals(1, store.pending().size)
  }

  @Test
  fun `an unreadable queue is treated as empty`() {
    context.getSharedPreferences("GIGA_PING_PREFERENCES", Context.MODE_PRIVATE)
      .edit().putString("KEY_PENDING_PINGS", "not json").commit()

    assertTrue(store.pending().isEmpty())
  }
}
