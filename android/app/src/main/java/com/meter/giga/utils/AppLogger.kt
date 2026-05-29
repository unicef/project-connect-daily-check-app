package com.meter.giga.utils

import android.util.Log

/**
 * Application level logger implementation.
 *
 * This singleton acts as a wrapper around Android's [Log] utility and
 * also supports dependency injection of a custom [Logger] implementation
 * for testing or alternate logging frameworks.
 *
 * Example usage:
 * ```
 * AppLogger.d("TAG", "Debug message")
 * ```
 */
object AppLogger : Logger {
  /**
   * Injectable logger instance.
   *
   * By default, this points to [AppLogger] itself, but it can be replaced
   * during testing or runtime with another implementation of [Logger].
   */
  var logger: Logger = this

  /**
   * Prints debug logs using Android's [Log.d].
   *
   * @param tag Tag used to identify the source of the log message.
   * @param msg Debug message to print.
   */
  override fun d(tag: String, msg: String) {
    Log.d(tag, msg)
  }
}
