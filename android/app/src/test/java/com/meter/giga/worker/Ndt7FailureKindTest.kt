package com.meter.giga.worker

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class Ndt7FailureKindTest {

  @Test
  fun `locate refusal over the limit is rate limited`() {
    val message = "Too many periodic requests. Please contact support@measurementlab.net.: "
    assertEquals(Ndt7FailureKind.RATE_LIMITED, Ndt7FailureKind.of("locate", message))
  }

  @Test
  fun `rate limit text is matched regardless of case`() {
    assertEquals(
      Ndt7FailureKind.RATE_LIMITED,
      Ndt7FailureKind.of("locate", "locate: TOO MANY PERIODIC REQUESTS")
    )
  }

  @Test
  fun `other locate errors are lookup failures`() {
    assertEquals(Ndt7FailureKind.LOCATE, Ndt7FailureKind.of("locate", "no available M-Lab servers"))
  }

  @Test
  fun `rate limit text outside locate is not a rate limit`() {
    assertEquals(
      Ndt7FailureKind.UPLOAD,
      Ndt7FailureKind.of("upload", "Too many periodic requests")
    )
  }

  @Test
  fun `download and upload errors keep their direction`() {
    assertEquals(Ndt7FailureKind.DOWNLOAD, Ndt7FailureKind.of("download", "no targets available"))
    assertEquals(
      Ndt7FailureKind.UPLOAD,
      Ndt7FailureKind.of("upload", "ndt7 direction produced no client measurement")
    )
  }

  @Test
  fun `unknown direction is other`() {
    assertEquals(Ndt7FailureKind.OTHER, Ndt7FailureKind.of("", "boom"))
  }

  @Test
  fun `only download and upload failures are retryable`() {
    assertTrue(Ndt7FailureKind.DOWNLOAD.isRetryable)
    assertTrue(Ndt7FailureKind.UPLOAD.isRetryable)
    assertFalse(Ndt7FailureKind.RATE_LIMITED.isRetryable)
    assertFalse(Ndt7FailureKind.LOCATE.isRetryable)
    assertFalse(Ndt7FailureKind.OTHER.isRetryable)
  }

  @Test
  fun `tags are distinct so each kind is its own Sentry issue`() {
    val tags = Ndt7FailureKind.values().map { it.tag }
    assertEquals(tags.size, tags.toSet().size)
  }
}
