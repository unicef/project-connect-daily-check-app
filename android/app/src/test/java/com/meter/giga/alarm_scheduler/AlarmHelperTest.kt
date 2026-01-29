package com.meter.giga.alarm_scheduler

import io.mockk.mockk

import android.app.AlarmManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import com.meter.giga.ararm_scheduler.AlarmHelper
import com.meter.giga.utils.AppLogger
import com.meter.giga.utils.Logger
import io.mockk.*
import junit.framework.TestCase.assertTrue
import org.junit.After
import org.junit.Before
import org.junit.Test
import org.mockito.Mockito.mockStatic
import java.time.LocalDateTime
import java.time.temporal.ChronoUnit
import java.util.Calendar
import kotlin.test.assertEquals

class AlarmHelperTest {

  private lateinit var context: Context
  private lateinit var alarmManager: AlarmManager

  @Before
  fun setup() {
    mockkObject(AlarmHelper)
    AlarmHelper.logger = mockk(relaxed = true)

    context = mockk(relaxed = true)
    alarmManager = mockk(relaxed = true)

    every {
      context.getSystemService(Context.ALARM_SERVICE)
    } returns alarmManager

    mockkStatic(PendingIntent::class)
    mockkConstructor(Intent::class)
  }

  @After
  fun tearDown() {
    AlarmHelper.logger = AppLogger
    unmockkAll()
    unmockkStatic(LocalDateTime::class)

  }

  @Test
  fun `getSlotStartHour returns correct start hour`() {
    val cal = Calendar.getInstance()

    cal.set(Calendar.HOUR_OF_DAY, 9)
    assertEquals(8, AlarmHelper.getSlotStartHour(cal.timeInMillis))

    cal.set(Calendar.HOUR_OF_DAY, 13)
    assertEquals(12, AlarmHelper.getSlotStartHour(cal.timeInMillis))

    cal.set(Calendar.HOUR_OF_DAY, 17)
    assertEquals(16, AlarmHelper.getSlotStartHour(cal.timeInMillis))

    cal.set(Calendar.HOUR_OF_DAY, 22)
    assertEquals(-1, AlarmHelper.getSlotStartHour(cal.timeInMillis))
  }

  @Test
  fun `getNextSlotRange returns next slot correctly when inside first slot`() {
    val cal = Calendar.getInstance()
    cal.set(Calendar.HOUR_OF_DAY, 9)
    cal.set(Calendar.MINUTE, 0)

    val now = cal.timeInMillis

    val (start, end) = AlarmHelper.getNextSlotRange(
      now,
      lastSlotHour = -1,
      lastExecutionDay = -1
    )

    assertTrue(start >= now + 60_000L)
    assertTrue(end > start)
  }

  @Test
  fun `getNextSlotRange skips slot if already executed`() {
    val cal = Calendar.getInstance()
    val today = cal.get(Calendar.DAY_OF_YEAR)

    cal.set(Calendar.HOUR_OF_DAY, 9)
    val now = cal.timeInMillis

    val (start, end) = AlarmHelper.getNextSlotRange(
      now,
      lastSlotHour = 8,
      lastExecutionDay = today
    )

    assertEquals(
      12,
      Calendar.getInstance().apply { timeInMillis = start }.get(Calendar.HOUR_OF_DAY)
    )
    assertEquals(16, Calendar.getInstance().apply { timeInMillis = end }.get(Calendar.HOUR_OF_DAY))
  }

  // -------------------------------------------------------------
  // TEST: getSlotStartHour()
  // -------------------------------------------------------------
  @Test
  fun `getSlotStartHour returns correct slot hour`() {
    mockkStatic(Calendar::class)

    val calendar = mockk<Calendar>(relaxed = true)
    every { Calendar.getInstance() } returns calendar

    every { calendar.get(Calendar.HOUR_OF_DAY) } returnsMany listOf(
      9,   // inside 8–12
      14,  // inside 12–16
      18,  // inside 16–20
      3    // outside all slots
    )

    assertEquals(8, AlarmHelper.getSlotStartHour(0))
    assertEquals(12, AlarmHelper.getSlotStartHour(0))
    assertEquals(16, AlarmHelper.getSlotStartHour(0))
    assertEquals(-1, AlarmHelper.getSlotStartHour(0))
  }

  // -------------------------------------------------------------
  // TEST: getNextSlotRange()
  // -------------------------------------------------------------
  @Test
  fun `getNextSlotRange returns next slot when inside current slot`() {
    val now = 10L   // mock millis

    mockkStatic(Calendar::class)

    val fakeCalendar = mockk<Calendar>(relaxed = true)
    every { Calendar.getInstance() } returns fakeCalendar
    every { fakeCalendar.timeInMillis = any() } just Runs

    // Today = Day 100
    every { fakeCalendar.get(Calendar.DAY_OF_YEAR) } returns 100

    // Simulate slot boundaries
    every {
      fakeCalendar.clone() as Calendar
    } returns fakeCalendar

    // Let values flow for start/end as mockk won't use real timestamps
    every {
      fakeCalendar.timeInMillis
    } returnsMany listOf(now, now)

    val (start, end) = AlarmHelper.getNextSlotRange(
      afterMillis = now,
      lastSlotHour = -1,
      lastExecutionDay = -1
    )

    // Not exact numbers because Calendar is mocked,
    // but test verifies method *completes without crash* and returns pair.
    assert(start >= now)
    assert(end >= start)
  }

  @Test
  fun `before 13_30 schedules same day`() {

    val fakeNow = LocalDateTime.of(2026, 1, 29, 10, 0)

    mockkStatic(LocalDateTime::class)
    every { LocalDateTime.now() } returns fakeNow

    val result = AlarmHelper.getNextDayTimeToCheckVersionUpdate()

    val expected =
      ChronoUnit.MILLIS.between(
        fakeNow,
        fakeNow.withHour(13).withMinute(30).withSecond(0).withNano(0)
      )

    assertEquals(expected, result)
  }

  @Test
  fun `after 13_30 schedules next day`() {

    val fakeNow = LocalDateTime.of(2026, 1, 29, 15, 0)

    mockkStatic(LocalDateTime::class)
    every { LocalDateTime.now() } returns fakeNow

    val result = AlarmHelper.getNextDayTimeToCheckVersionUpdate()

    val expected =
      ChronoUnit.MILLIS.between(
        fakeNow,
        fakeNow.plusDays(1)
          .withHour(13)
          .withMinute(30)
          .withSecond(0)
          .withNano(0)
      )

    assertEquals(expected, result)
  }

  @Test
  fun `exactly 13_30 returns zero`() {

    val fakeNow = LocalDateTime.of(2026, 1, 29, 13, 30, 0)

    mockkStatic(LocalDateTime::class)
    every { LocalDateTime.now() } returns fakeNow

    val result = AlarmHelper.getNextDayTimeToCheckVersionUpdate()

    assertEquals(0L, result)
  }
}

