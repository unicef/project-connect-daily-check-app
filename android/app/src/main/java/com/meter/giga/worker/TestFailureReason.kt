package com.meter.giga.worker

import io.sentry.IScope

/**
 * Why a speed test ended without a result, with the title and description the
 * user should see. Each failure's Sentry event carries these, so an event shows
 * what the user was told.
 */
enum class TestFailureReason(
  val tag: String,
  val title: String,
  val description: String
) {
  POOR_CONNECTION(
    "poor_connection",
    "Poor internet connection",
    "The connection was too weak or unstable to finish the test. Move closer to the router or try another network."
  ),
  CONNECTION_CHANGED(
    "connection_changed",
    "Connection changed",
    "Your network dropped or switched during the test. Stay on one network and try again."
  ),
  CONNECTION_TOO_SLOW(
    "connection_too_slow",
    "Connection too slow",
    "The test took too long to finish, which usually means a very slow connection. Try again later."
  ),
  NO_INTERNET(
    "no_internet",
    "No internet connection",
    "Connect to Wi-Fi or mobile data and try again."
  ),
  SERVER_UNREACHABLE(
    "server_unreachable",
    "Couldn't reach test server",
    "We couldn't find a speed test server. Check that your network allows internet access, then try again."
  ),
  RATE_LIMITED(
    "rate_limited",
    "Too many tests",
    "Too many speed tests were run from this network recently. Try again in a few minutes."
  ),
  SYSTEM_STOPPED(
    "system_stopped",
    "Test stopped by your phone",
    "Your phone stopped the test to save battery. Remove battery limits for Giga Meter and try again."
  ),
  NOTIFICATIONS_NEEDED(
    "notifications_needed",
    "Notifications needed",
    "Allow notifications for Giga Meter so the test can run."
  ),
  ALREADY_RUNNING(
    "already_running",
    "Test already running",
    "A speed test is already running. Wait for it to finish."
  ),
  NOT_SYNCED(
    "not_synced",
    "Results saved, not sent",
    "Your test finished, but the results couldn't be sent. They'll be sent when your connection improves."
  ),
  UNKNOWN(
    "unknown",
    "Test failed",
    "Something went wrong during the test. Try again."
  );

  /**
   * Tags the event with this reason and attaches the user-facing message.
   * The event message is left alone, so Sentry keeps grouping issues as before.
   */
  fun applyTo(scope: IScope) {
    scope.setTag("failure_reason", tag)
    scope.setTag("failure_title", title)
    scope.setContexts("user_message", mapOf("title" to title, "description" to description))
  }

  companion object {
    fun of(kind: Ndt7FailureKind, networkChanged: Boolean): TestFailureReason = when (kind) {
      Ndt7FailureKind.RATE_LIMITED -> RATE_LIMITED
      Ndt7FailureKind.LOCATE -> SERVER_UNREACHABLE
      Ndt7FailureKind.DOWNLOAD,
      Ndt7FailureKind.UPLOAD -> if (networkChanged) CONNECTION_CHANGED else POOR_CONNECTION
      Ndt7FailureKind.OTHER -> UNKNOWN
    }
  }
}
