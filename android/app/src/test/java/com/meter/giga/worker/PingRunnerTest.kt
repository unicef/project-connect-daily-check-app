package com.meter.giga.worker

import android.app.Application
import android.content.Context
import android.os.Build
import androidx.test.core.app.ApplicationProvider
import com.meter.giga.data.models.requests.ConnectivityRecordsRequestModel
import com.meter.giga.data.models.responses.FeatureFlagsModel
import com.meter.giga.data.models.responses.FeatureFlagsResponseModel
import com.meter.giga.network.api.ApiService
import com.meter.giga.prefrences.AlarmSharedPref
import com.meter.giga.prefrences.PingStore
import com.meter.giga.utils.Constants.PING_FLAGS_REFRESH_MS
import com.meter.giga.utils.Constants.PING_RETENTION_MS
import com.meter.giga.utils.Constants.PING_SYNC_INTERVAL_MS
import io.mockk.clearMocks
import io.mockk.coEvery
import io.mockk.coVerify
import io.mockk.every
import io.mockk.mockk
import io.mockk.slot
import kotlinx.coroutines.async
import kotlinx.coroutines.delay
import kotlinx.coroutines.runBlocking
import okhttp3.ResponseBody.Companion.toResponseBody
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import retrofit2.Response
import java.io.IOException
import java.time.Instant
import java.time.ZoneOffset

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [Build.VERSION_CODES.TIRAMISU], manifest = Config.NONE, application = Application::class)
class PingRunnerTest {

  private val daytime = Instant.parse("2026-10-09T10:00:00Z").toEpochMilli()
  private val night = Instant.parse("2026-10-09T21:00:00Z").toEpochMilli()

  // Keeps the clock at 10:00, inside active hours, and past the sync interval
  private val oneDay = 24 * 60 * 60 * 1000L

  private lateinit var store: PingStore
  private lateinit var prefs: AlarmSharedPref
  private lateinit var api: ApiService
  private var now = daytime
  private var probeResult = LatencyResult(true, 23.5, null)
  private var probeCalls = 0
  private var probeDelayMs = 0L
  private var requestedBaseUrl: String? = null

  private val probe = object : LatencyProbe {
    override suspend fun measure(): LatencyResult {
      probeCalls++
      delay(probeDelayMs)
      return probeResult
    }
  }

  @Before
  fun setup() {
    val context: Context = ApplicationProvider.getApplicationContext()
    store = PingStore(context)
    prefs = mockk(relaxed = true)
    every { prefs.gigaSchoolId } returns "giga-1"
    every { prefs.baseUrl } returns "https://backend.test/api/v1/"
    every { prefs.mlabUploadKey } returns "app-token"
    every { prefs.browserId } returns "user-1"

    api = mockk()
    coEvery { api.getFeatureFlags(any(), any()) } returns
      Response.success(FeatureFlagsResponseModel(FeatureFlagsModel(pingService = true)))
    coEvery { api.postConnectivityRecords(any(), any(), any()) } returns Response.success(Unit)
  }

  private fun runner() = PingRunner(
    prefs = prefs,
    store = store,
    probe = probe,
    apiProvider = { requestedBaseUrl = it; api },
    clock = { now },
    zone = ZoneOffset.UTC,
    logger = FakeLogger()
  )

  @Test
  fun `takes a check and posts it to the school's connectivity endpoint`() = runBlocking {
    val body = slot<ConnectivityRecordsRequestModel>()
    coEvery { api.postConnectivityRecords(any(), any(), capture(body)) } returns Response.success(Unit)

    val record = runner().run()

    assertNotNull(record)
    assertEquals("https://backend.test/api/v1/", requestedBaseUrl)
    coVerify(exactly = 1) { api.postConnectivityRecords("Bearer app-token", "giga-1", any()) }
    val posted = body.captured.records.single()
    assertEquals("2026-10-09T10:00:00.000Z", posted.timestamp)
    assertTrue(posted.isConnected)
    assertEquals(23.5, posted.latency!!, 0.0)
    assertEquals("user-1", posted.browserId)
    assertNull(posted.errorMessage)
    assertTrue(store.pending().isEmpty())
    assertEquals(record, store.lastResult)
  }

  @Test
  fun `records a failed check with its error when the device is offline`() = runBlocking {
    probeResult = LatencyResult(false, null, "Unable to resolve host")
    coEvery { api.getFeatureFlags(any(), any()) } throws IOException("offline")
    coEvery { api.postConnectivityRecords(any(), any(), any()) } throws IOException("offline")
    store.pingServiceEnabled = true
    store.flagsFetchedAt = now

    val record = runner().run()

    assertFalse(record!!.isConnected)
    assertEquals("Unable to resolve host", record.errorMessage)
    assertNull(record.latency)
    assertEquals(1, store.pending().size)
  }

  @Test
  fun `keeps checks queued when the backend rejects them and posts them next run`() = runBlocking {
    coEvery { api.postConnectivityRecords(any(), any(), any()) } returns
      Response.error(400, "School does not exist".toResponseBody())
    runner().run()
    assertEquals(1, store.pending().size)

    coEvery { api.postConnectivityRecords(any(), any(), any()) } returns Response.success(Unit)
    now += PING_SYNC_INTERVAL_MS
    runner().run()

    assertTrue(store.pending().isEmpty())
    coVerify { api.postConnectivityRecords(any(), any(), match { it.records.size == 2 }) }
  }

  @Test
  fun `posts at most once every two hours`() = runBlocking {
    runner().run()
    now += 15 * 60 * 1000L
    runner().run()

    assertEquals(1, store.pending().size)
    coVerify(exactly = 1) { api.postConnectivityRecords(any(), any(), any()) }

    now += PING_SYNC_INTERVAL_MS
    runner().run()

    assertTrue(store.pending().isEmpty())
    coVerify(exactly = 2) { api.postConnectivityRecords(any(), any(), any()) }
  }

  @Test
  fun `a run with nothing to post does not delay the next check's upload`() = runBlocking {
    coEvery { api.getFeatureFlags(any(), any()) } throws IOException("offline")
    assertNull(runner().run())
    coEvery { api.getFeatureFlags(any(), any()) } returns
      Response.success(FeatureFlagsResponseModel(FeatureFlagsModel(pingService = true)))
    now += 60 * 1000L

    runner().run()

    coVerify(exactly = 1) { api.postConnectivityRecords(any(), any(), any()) }
    assertTrue(store.pending().isEmpty())
  }

  @Test
  fun `reuses a check taken in the last five minutes`() = runBlocking {
    val first = runner().run()
    now += 4 * 60 * 1000L

    val second = runner().run()

    assertEquals(first, second)
    assertEquals(1, probeCalls)

    now += 60 * 1000L
    runner().run()
    assertEquals(2, probeCalls)
  }

  @Test
  fun `overlapping runs take one check and post it`() = runBlocking {
    probeDelayMs = 100

    val runs = listOf(async { runner().run() }, async { runner().run() }).map { it.await() }

    assertEquals(runs[0], runs[1])
    assertEquals(1, probeCalls)
    assertTrue(store.pending().isEmpty())
    coVerify(exactly = 1) { api.postConnectivityRecords(any(), any(), match { it.records.size == 1 }) }
  }

  @Test
  fun `takes a new check after the device registers a school`() = runBlocking {
    runner().run()
    store.resetSchoolState()

    runner().run()

    assertEquals(2, probeCalls)
  }

  @Test
  fun `posts in batches of five`() = runBlocking {
    coEvery { api.postConnectivityRecords(any(), any(), any()) } throws IOException("offline")
    repeat(11) {
      runner().run()
      now += oneDay
      store.flagsFetchedAt = now
    }
    assertEquals(11, store.pending().size)
    val sizes = mutableListOf<Int>()
    coEvery { api.postConnectivityRecords(any(), any(), any()) } answers {
      sizes += thirdArg<ConnectivityRecordsRequestModel>().records.size
      Response.success(Unit)
    }

    runner().run()

    assertEquals(listOf(5, 5, 2), sizes)
    assertTrue(store.pending().isEmpty())
  }

  @Test
  fun `retries a failed batch once`() = runBlocking {
    coEvery { api.postConnectivityRecords(any(), any(), any()) } throws
      IOException("timeout") andThen Response.success(Unit)

    runner().run()

    coVerify(exactly = 2) { api.postConnectivityRecords(any(), any(), any()) }
    assertTrue(store.pending().isEmpty())
  }

  @Test
  fun `stops the sync when a batch fails twice`() = runBlocking {
    coEvery { api.postConnectivityRecords(any(), any(), any()) } throws IOException("offline")
    repeat(6) {
      runner().run()
      now += oneDay
      store.flagsFetchedAt = now
    }
    clearMocks(api, answers = false)
    coEvery { api.postConnectivityRecords(any(), any(), any()) } returns
      Response.error(500, "".toResponseBody())

    runner().run()

    coVerify(exactly = 2) { api.postConnectivityRecords(any(), any(), any()) }
    assertEquals(7, store.pending().size)
  }

  @Test
  fun `takes no check outside active hours but still posts queued checks`() = runBlocking {
    coEvery { api.postConnectivityRecords(any(), any(), any()) } throws IOException("offline")
    runner().run()
    coEvery { api.postConnectivityRecords(any(), any(), any()) } returns Response.success(Unit)
    now = night

    val record = runner().run()

    assertNull(record)
    assertEquals(1, probeCalls)
    assertTrue(store.pending().isEmpty())
  }

  @Test
  fun `takes no check when the pingService flag is off`() = runBlocking {
    coEvery { api.getFeatureFlags(any(), any()) } returns
      Response.success(FeatureFlagsResponseModel(FeatureFlagsModel(pingService = false)))

    assertNull(runner().run())
    assertEquals(0, probeCalls)
    assertEquals(false, store.pingServiceEnabled)
  }

  @Test
  fun `treats a missing pingService flag as enabled like the backend`() = runBlocking {
    coEvery { api.getFeatureFlags(any(), any()) } returns
      Response.success(FeatureFlagsResponseModel(FeatureFlagsModel(pingService = null)))

    assertNotNull(runner().run())
  }

  @Test
  fun `takes no check when the flag was never read`() = runBlocking {
    coEvery { api.getFeatureFlags(any(), any()) } throws IOException("offline")

    assertNull(runner().run())
    assertEquals(0, probeCalls)
  }

  @Test
  fun `reads flags again only after six hours`() = runBlocking {
    runner().run()
    now += 15 * 60 * 1000L
    runner().run()
    coVerify(exactly = 1) { api.getFeatureFlags(any(), any()) }

    now += PING_FLAGS_REFRESH_MS
    runner().run()
    coVerify(exactly = 2) { api.getFeatureFlags(any(), any()) }
  }

  @Test
  fun `posts queued checks to the school they were taken for`() = runBlocking {
    coEvery { api.postConnectivityRecords(any(), any(), any()) } throws IOException("offline")
    runner().run()
    every { prefs.gigaSchoolId } returns "giga-2"
    store.resetSchoolState()
    coEvery { api.postConnectivityRecords(any(), any(), any()) } returns Response.success(Unit)
    clearMocks(api, answers = false)
    now += PING_SYNC_INTERVAL_MS

    runner().run()

    coVerify(exactly = 1) { api.postConnectivityRecords(any(), "giga-1", any()) }
    coVerify(exactly = 1) { api.postConnectivityRecords(any(), "giga-2", any()) }
    assertTrue(store.pending().isEmpty())
  }

  @Test
  fun `drops checks older than thirty days`() = runBlocking {
    coEvery { api.postConnectivityRecords(any(), any(), any()) } throws IOException("offline")
    runner().run()
    now += PING_RETENTION_MS + 1
    store.flagsFetchedAt = now

    runner().run()

    assertEquals(1, store.pending().size)
  }

  @Test
  fun `does nothing before the device is registered`() = runBlocking {
    every { prefs.gigaSchoolId } returns ""

    assertNull(runner().run())
    assertNull(requestedBaseUrl)
    assertEquals(0, probeCalls)
  }

  @Test
  fun `does nothing when the base url was never stored`() = runBlocking {
    every { prefs.baseUrl } returns "null"

    assertNull(runner().run())
    assertNull(requestedBaseUrl)
  }

  @Test
  fun `leaves browserId out when it was never stored`() = runBlocking {
    every { prefs.browserId } returns "null"

    assertNull(runner().run()!!.browserId)
  }
}
