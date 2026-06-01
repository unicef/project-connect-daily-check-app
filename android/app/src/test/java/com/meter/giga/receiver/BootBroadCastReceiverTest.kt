package com.meter.giga.receiver

import android.app.Application
import android.content.Context
import android.content.Intent
import android.os.Build
import com.meter.giga.alarm_scheduler.AlarmHelperType
import com.meter.giga.prefrences.AlarmSharedPref
import com.meter.giga.utils.GigaUtil
import com.meter.giga.utils.Constants.FIRST_15_MIN
import com.meter.giga.utils.Constants.NEXT_SLOT
import io.mockk.*
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [Build.VERSION_CODES.S], application = Application::class)
class BootBroadCastReceiverTest {

  private lateinit var context: Context
  private lateinit var mockPrefs: AlarmSharedPref
  private lateinit var mockHelper: AlarmHelperType
  private lateinit var receiver: BootBroadCastReceiver

  @Before
  fun setup() {
    context = mockk(relaxed = true)
    mockPrefs = mockk(relaxed = true)
    mockHelper = mockk(relaxed = true)

    // Allow constructing prefs via provider
    receiver = BootBroadCastReceiver(
      prefProvider = { mockPrefs },
      alarmHelper = mockHelper
    )

    // ★ IMPORTANT: Mock static call for GigaUtil
    mockkObject(GigaUtil)
    every { GigaUtil.isExactAlarmPermissionGranted(any()) } returns true
  }

  @Test
  fun `onReceive - new day - schedules first 15 min alarm`() {
    // Arrange
    every { mockPrefs.schoolId } returns "123"
    every { mockPrefs.isNewDay() } returns true
    every { mockPrefs.first15ExecutedTime } returns -1L

    val intent = Intent(Intent.ACTION_BOOT_COMPLETED)

    // Act
    receiver.onReceive(context, intent)

    // Assert
    verify {
      mockHelper.scheduleExactAlarm(
        context = context,
        any(),
        FIRST_15_MIN
      )
    }
  }

  @Test
  fun `onReceive - first 15 not executed - schedules 15 min alarm`() {
    every { mockPrefs.schoolId } returns "123"
    every { mockPrefs.isNewDay() } returns false
    every { mockPrefs.first15ExecutedTime } returns -1L

    val intent = Intent(Intent.ACTION_BOOT_COMPLETED)

    receiver.onReceive(context, intent)

    verify {
      mockHelper.scheduleExactAlarm(context, any(), FIRST_15_MIN)
    }
  }

  @Test
  fun `onReceive - slot case - schedules next slot alarm`() {
    every { mockPrefs.schoolId } returns "123"
    every { mockPrefs.isNewDay() } returns false
    every { mockPrefs.first15ExecutedTime } returns 1000L
    every { mockPrefs.lastExecutionDay } returns 20240101

    every { mockHelper.getSlotStartHour(any()) } returns 1
    every { mockHelper.getNextSlotRange(any(), any(), any()) } returns (10L to 20L)

    val intent = Intent(Intent.ACTION_BOOT_COMPLETED)

    receiver.onReceive(context, intent)

    verify {
      mockHelper.scheduleExactAlarm(context, any(), NEXT_SLOT)
    }
  }

  @Test
  fun `onReceive - no school id - does nothing`() {
    every { mockPrefs.schoolId } returns ""
    val intent = Intent(Intent.ACTION_BOOT_COMPLETED)

    receiver.onReceive(context, intent)

    verify(exactly = 0) {
      mockHelper.scheduleExactAlarm(any(), any(), any())
    }
  }

  @Test
  fun `onReceive - permission denied - does nothing`() {
    every { mockPrefs.schoolId } returns "123"
    every { GigaUtil.isExactAlarmPermissionGranted(any()) } returns false

    val intent = Intent(Intent.ACTION_BOOT_COMPLETED)

    receiver.onReceive(context, intent)

    verify(exactly = 0) {
      mockHelper.scheduleExactAlarm(any(), any(), any())
    }
  }
}
