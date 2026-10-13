package com.meter.giga.worker

import io.mockk.mockk
import io.mockk.verify
import io.sentry.IScope
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class TestFailureReasonTest {

  @Test
  fun `download and upload errors are a poor connection`() {
    assertEquals(
      TestFailureReason.POOR_CONNECTION,
      TestFailureReason.of(Ndt7FailureKind.DOWNLOAD, networkChanged = false)
    )
    assertEquals(
      TestFailureReason.POOR_CONNECTION,
      TestFailureReason.of(Ndt7FailureKind.UPLOAD, networkChanged = false)
    )
  }

  @Test
  fun `download and upload errors after a network change are a changed connection`() {
    assertEquals(
      TestFailureReason.CONNECTION_CHANGED,
      TestFailureReason.of(Ndt7FailureKind.DOWNLOAD, networkChanged = true)
    )
    assertEquals(
      TestFailureReason.CONNECTION_CHANGED,
      TestFailureReason.of(Ndt7FailureKind.UPLOAD, networkChanged = true)
    )
  }

  @Test
  fun `server lookup errors keep their own reason even after a network change`() {
    assertEquals(
      TestFailureReason.SERVER_UNREACHABLE,
      TestFailureReason.of(Ndt7FailureKind.LOCATE, networkChanged = true)
    )
    assertEquals(
      TestFailureReason.RATE_LIMITED,
      TestFailureReason.of(Ndt7FailureKind.RATE_LIMITED, networkChanged = true)
    )
  }

  @Test
  fun `other ndt7 errors are unknown`() {
    assertEquals(
      TestFailureReason.UNKNOWN,
      TestFailureReason.of(Ndt7FailureKind.OTHER, networkChanged = false)
    )
  }

  @Test
  fun `tags are distinct and every reason has a message`() {
    val reasons = TestFailureReason.values()
    assertEquals(reasons.size, reasons.map { it.tag }.toSet().size)
    reasons.forEach {
      assertTrue(it.title.isNotBlank())
      assertTrue(it.description.isNotBlank())
    }
  }

  @Test
  fun `applyTo tags the event and attaches the user message`() {
    val scope = mockk<IScope>(relaxed = true)

    TestFailureReason.POOR_CONNECTION.applyTo(scope)

    verify { scope.setTag("failure_reason", "poor_connection") }
    verify { scope.setTag("failure_title", "Poor internet connection") }
    verify {
      scope.setContexts(
        "user_message",
        mapOf(
          "title" to "Poor internet connection",
          "description" to TestFailureReason.POOR_CONNECTION.description
        )
      )
    }
  }
}
