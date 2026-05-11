package com.meter.giga.ionic_plugin

import android.content.Context
import android.os.Build
import androidx.test.core.app.ApplicationProvider
import com.getcapacitor.Bridge
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.meter.giga.domain.entity.history.MeasurementsItem
import com.meter.giga.domain.entity.request.SpeedTestResultRequestEntity
import com.meter.giga.prefrences.AlarmSharedPref
import com.meter.giga.utils.Constants.ENV_TYPE
import io.mockk.*
import org.junit.Assert.*
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.Shadows.shadowOf
import org.robolectric.annotation.Config

// ─────────────────────────────────────────────────────────────────────────────
// Testable Plugin
// ─────────────────────────────────────────────────────────────────────────────

class TestableGigaAppPlugin : GigaAppPlugin() {

  val notifiedEvents = mutableListOf<Pair<String, JSObject?>>()

  override fun notifyListeners(
    eventName: String,
    data: JSObject?
  ) {
    notifiedEvents.add(eventName to data)
  }

  fun lastEvent() = notifiedEvents.lastOrNull()

  fun injectBridge(bridge: Bridge) {

    Plugin::class.java
      .getDeclaredField("bridge")
      .apply {
        isAccessible = true
        set(this@TestableGigaAppPlugin, bridge)
      }
  }
}

@RunWith(RobolectricTestRunner::class)
@Config(
  sdk = [Build.VERSION_CODES.TIRAMISU],
  manifest = Config.NONE
)
class GigaAppPluginTest {

  private lateinit var plugin: TestableGigaAppPlugin
  private lateinit var mockCall: PluginCall
  private lateinit var mockBridge: Bridge
  private lateinit var context: Context

  @Before
  fun setup() {

    context = ApplicationProvider.getApplicationContext()

    mockCall = mockk(relaxed = true)

    mockBridge = mockk(relaxed = true)

    // IMPORTANT:
    // Mock METHOD not PROPERTY

    every {
      mockBridge.getContext()
    } returns context

    plugin = TestableGigaAppPlugin()

    plugin.injectBridge(mockBridge)

    plugin.load()
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // companion — sendXxx events
  // ═══════════════════════════════════════════════════════════════════════════

  @Test
  fun `sendSpeedUpdate fires correct event and payload`() {

    GigaAppPlugin.sendSpeedUpdate(
      50.0,
      25.0,
      "download"
    )

    val (event, data) = plugin.lastEvent()!!

    assertEquals("speedTestUpdate", event)

    assertEquals(
      50.0,
      data!!.getDouble("downloadSpeed"),
      0.001
    )

    assertEquals(
      25.0,
      data.getDouble("uploadSpeed"),
      0.001
    )

    assertEquals(
      "download",
      data.getString("testStatus")
    )
  }

  @Test
  fun `sendNoNetworkError fires offline status`() {

    GigaAppPlugin.sendNoNetworkError()

    assertEquals(
      "offline",
      plugin.lastEvent()!!
        .second
        ?.getString("testStatus")
    )
  }

  @Test
  fun `sendSpeedTestStarted fires onstart status`() {

    GigaAppPlugin.sendSpeedTestStarted()

    assertEquals(
      "onstart",
      plugin.lastEvent()!!
        .second
        ?.getString("testStatus")
    )
  }

  @Test
  fun `sendServerDiscoveryStarted fires server_discovery status`() {

    GigaAppPlugin.sendServerDiscoveryStarted()

    assertEquals(
      "server_discovery",
      plugin.lastEvent()!!
        .second
        ?.getString("testStatus")
    )
  }

  @Test
  fun `sendServerDiscoveryCompleted fires server_chosen status`() {

    GigaAppPlugin.sendServerDiscoveryCompleted()

    assertEquals(
      "server_chosen",
      plugin.lastEvent()!!
        .second
        ?.getString("testStatus")
    )
  }

  @Test
  fun `sendSpeedTestCompletedWithError fires onerror status`() {

    GigaAppPlugin.sendSpeedTestCompletedWithError(
      null,
      null
    )

    assertEquals(
      "onerror",
      plugin.lastEvent()!!
        .second
        ?.getString("testStatus")
    )
  }

  @Test
  fun `sendSpeedTestCompleted fires complete status`() {

    val speedData =
      mockk<SpeedTestResultRequestEntity>(
        relaxed = true
      )

    val measurements =
      mockk<MeasurementsItem>(
        relaxed = true
      )

    GigaAppPlugin.sendSpeedTestCompleted(
      speedData,
      measurements
    )

    assertEquals(
      "complete",
      plugin.lastEvent()!!
        .second
        ?.getString("testStatus")
    )
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // storeEnvironment
  // ═══════════════════════════════════════════════════════════════════════════

  @Test
  fun `storeEnvironment stores production env and resolves`() {

    every {
      mockCall.getString(ENV_TYPE)
    } returns "production"

    mockkConstructor(AlarmSharedPref::class)

    val envSlot = slot<String>()

    every {
      anyConstructed<AlarmSharedPref>()
        .environment = capture(envSlot)
    } just Runs

    plugin.storeEnvironment(mockCall)

    assertEquals(
      "production",
      envSlot.captured
    )

    verify(exactly = 1) {
      mockCall.resolve()
    }

    unmockkConstructor(AlarmSharedPref::class)
  }

  @Test
  fun `storeEnvironment defaults to development when null`() {

    every {
      mockCall.getString(ENV_TYPE)
    } returns null

    mockkConstructor(AlarmSharedPref::class)

    val envSlot = slot<String>()

    every {
      anyConstructed<AlarmSharedPref>()
        .environment = capture(envSlot)
    } just Runs

    plugin.storeEnvironment(mockCall)

    assertEquals(
      "development",
      envSlot.captured
    )

    unmockkConstructor(AlarmSharedPref::class)
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // clearStoredData
  // ═══════════════════════════════════════════════════════════════════════════

  @Test
  fun `clearStoredData calls resetAllData and resolves`() {

    mockkConstructor(AlarmSharedPref::class)

    every {
      anyConstructed<AlarmSharedPref>()
        .resetAllData()
    } just Runs

    plugin.clearStoredData(mockCall)

    verify(exactly = 1) {
      anyConstructed<AlarmSharedPref>()
        .resetAllData()
    }

    verify(exactly = 1) {
      mockCall.resolve()
    }

    unmockkConstructor(AlarmSharedPref::class)
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // getHistoricalSpeedTestData
  // ═══════════════════════════════════════════════════════════════════════════

  @Test
  fun `getHistoricalSpeedTestData resolves with 2 measurements`() {

    val stored =
      """["{\"download\":10,\"upload\":5}","{\"download\":20,\"upload\":8}"]"""

    mockkConstructor(AlarmSharedPref::class)

    every {
      anyConstructed<AlarmSharedPref>()
        .oldSpeedTestData
    } returns stored

    val slot = slot<JSObject>()

    every {
      mockCall.resolve(capture(slot))
    } just Runs

    plugin.getHistoricalSpeedTestData(mockCall)

    verify(exactly = 1) {
      mockCall.resolve(any())
    }

    val arr =
      slot.captured
        .getJSObject("historicalData")!!
        .getJSONArray("measurements")

    assertEquals(2, arr.length())

    unmockkConstructor(AlarmSharedPref::class)
  }

  @Test
  fun `getHistoricalSpeedTestData rejects on malformed JSON`() {

    mockkConstructor(AlarmSharedPref::class)

    every {
      anyConstructed<AlarmSharedPref>()
        .oldSpeedTestData
    } returns "INVALID"

    plugin.getHistoricalSpeedTestData(mockCall)

    verify(exactly = 1) {
      mockCall.reject(any(), any<Exception>())
    }

    verify(exactly = 0) {
      mockCall.resolve(any())
    }

    unmockkConstructor(AlarmSharedPref::class)
  }
}
