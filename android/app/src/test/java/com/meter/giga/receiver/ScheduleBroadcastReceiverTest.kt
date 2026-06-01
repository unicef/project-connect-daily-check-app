package com.meter.giga.receiver

import android.app.Application
import android.content.Context
import android.content.Intent
import android.os.Build
import androidx.core.content.ContextCompat
import com.meter.giga.alarm_scheduler.AlarmHelper
import com.meter.giga.prefrences.AlarmSharedPref
import com.meter.giga.utils.GigaUtil
import com.meter.giga.utils.Constants.FIRST_15_MIN
import com.meter.giga.utils.Constants.NEXT_SLOT
import com.meter.giga.utils.Constants.SCHEDULE_TYPE
import com.meter.giga.utils.Constants.SCHEDULE_TYPE_DAILY
import com.meter.giga.utils.Constants.SCHEDULE_TYPE_START
import io.mockk.*
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import java.util.Calendar

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [Build.VERSION_CODES.S], application = Application::class)
class ScheduleBroadcastReceiverTest {

  private lateinit var context: Context
  private lateinit var receiver: ScheduleBroadcastReceiver
  private lateinit var mockPrefs: AlarmSharedPref

  @Before
  fun setup() {
    context = mockk(relaxed = true)
    receiver = ScheduleBroadcastReceiver()

    mockPrefs = mockk(relaxed = true)

    // Mock constructor replacement
    mockkConstructor(AlarmSharedPref::class)
    every { anyConstructed<AlarmSharedPref>().schoolId } returns "123"
    every { anyConstructed<AlarmSharedPref>().lastExecutionDay } returns 100

    // Mock static AlarmHelper
    mockkObject(AlarmHelper)
    every { AlarmHelper.getSlotStartHour(any()) } returns 8
    every { AlarmHelper.getNextSlotRange(any(), any(), any()) } returns (10L to 20L)
    every { AlarmHelper.scheduleExactAlarm(any(), any(), any()) } just Runs

    // Mock static GigaUtil
    mockkObject(GigaUtil)
    every { GigaUtil.isBefore8AM() } returns false

    // Mock startForegroundService
    mockkStatic(ContextCompat::class)
    every { ContextCompat.startForegroundService(any(), any()) } returns mockk()
  }

  @Test
  fun `onReceive - FIRST_15_MIN - triggers start service and schedules next slot`() {

    val intent = Intent().apply {
      putExtra(SCHEDULE_TYPE, FIRST_15_MIN)
    }

    receiver.onReceive(context, intent)

    verify {
      ContextCompat.startForegroundService(
        context,
        withArg {
          assert(it.getStringExtra(SCHEDULE_TYPE) == SCHEDULE_TYPE_START)
        }
      )
    }

    verify {
      AlarmHelper.scheduleExactAlarm(context, any(), NEXT_SLOT)
    }
  }

  @Test
  fun `onReceive - same day - triggers daily schedule`() {

    val today = Calendar.getInstance().get(Calendar.DAY_OF_YEAR)
    every { anyConstructed<AlarmSharedPref>().lastExecutionDay } returns today

    val intent = Intent().apply {
      putExtra(SCHEDULE_TYPE, NEXT_SLOT)
    }

    receiver.onReceive(context, intent)

    verify {
      ContextCompat.startForegroundService(
        context,
        withArg {
          assert(it.getStringExtra(SCHEDULE_TYPE) == SCHEDULE_TYPE_DAILY)
        }
      )
    }
  }

  @Test
  fun `onReceive - new day before 8AM - does NOT start service`() {

    val yesterday = Calendar.getInstance().get(Calendar.DAY_OF_YEAR) - 1
    every { anyConstructed<AlarmSharedPref>().lastExecutionDay } returns yesterday

    every { GigaUtil.isBefore8AM() } returns true

    val intent = Intent().apply {
      putExtra(SCHEDULE_TYPE, NEXT_SLOT)
    }

    receiver.onReceive(context, intent)

    verify(exactly = 0) {
      ContextCompat.startForegroundService(any(), any())
    }

    // Still schedules next slot
    verify {
      AlarmHelper.scheduleExactAlarm(context, any(), NEXT_SLOT)
    }
  }

  @Test
  fun `onReceive - schedules next slot`() {
    val intent = Intent().apply {
      putExtra(SCHEDULE_TYPE, SCHEDULE_TYPE_DAILY)
    }

    receiver.onReceive(context, intent)

    verify {
      AlarmHelper.scheduleExactAlarm(context, any(), NEXT_SLOT)
    }
  }

  @Test
  fun `onReceive - FIRST_15_MIN - updates prefs first15ExecutedTime`() {

    val intent = Intent().apply {
      putExtra(SCHEDULE_TYPE, FIRST_15_MIN)
    }

    receiver.onReceive(context, intent)

    verify {
      anyConstructed<AlarmSharedPref>().first15ExecutedTime = withArg { time ->
        assert(time > 0)
      }
    }
  }
}
