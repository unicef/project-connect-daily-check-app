package com.meter.giga.utils

/**
 * Logger abstraction used across the application.
 *
 * This interface provides a common contract for logging messages,
 * allowing different logging implementations to be injected
 * (for example Android Logcat, Timber, or mock loggers in tests).
 */
interface Logger {

  /**
   * Logs a debug message.
   *
   * @param tag Tag used to identify the source of the log message.
   * @param msg Message content to log.
   */
  fun d(tag: String, msg: String)
}
