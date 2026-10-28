package com.meter.giga.worker

/**
 * Groups the Go client's OnError events. The tag is the Sentry fingerprint, so
 * each kind is its own Sentry issue instead of one shared by every Go error.
 */
enum class Ndt7FailureKind(val tag: String) {
  RATE_LIMITED("rate_limited"),
  LOCATE("locate"),
  DOWNLOAD("download"),
  UPLOAD("upload"),
  OTHER("other");

  /** Download and upload failures can pass on a later attempt. */
  val isRetryable: Boolean
    get() = this == DOWNLOAD || this == UPLOAD

  companion object {
    // M-Lab Locate refuses lookups over its limit with this text. Refused
    // lookups still count toward the limit, so retrying only extends it.
    private const val RATE_LIMIT_TEXT = "too many periodic requests"

    fun of(direction: String, message: String): Ndt7FailureKind = when (direction) {
      "locate" ->
        if (message.contains(RATE_LIMIT_TEXT, ignoreCase = true)) RATE_LIMITED else LOCATE
      "download" -> DOWNLOAD
      "upload" -> UPLOAD
      else -> OTHER
    }
  }
}
