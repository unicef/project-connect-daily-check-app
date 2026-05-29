package com.meter.giga.error_handler

/**
 * Represents application-specific error types that can occur
 * during speed test execution and related network operations.
 *
 * <p>This sealed class provides a structured and type-safe
 * approach for handling known and unknown failures.
 *
 * <p>Supported error categories include:
 * <ul>
 *   <li>Network connectivity failures.</li>
 *   <li>Unexpected or unknown runtime exceptions.</li>
 * </ul>
 */
sealed class ErrorEntity {
  /**
   * Represents network-related failures.
   *
   * <p>This error is typically returned when:
   * <ul>
   *   <li>No internet connection is available.</li>
   *   <li>Request timeouts occur.</li>
   *   <li>Server communication fails.</li>
   * </ul>
   */
  object Network : ErrorEntity()
  /**
   * Represents unexpected or unclassified errors.
   *
   * <p>This error type can optionally include
   * a descriptive failure message.
   *
   * @property message optional error description.
   */
  data class Unknown(val message: String? = null) : ErrorEntity()
}
