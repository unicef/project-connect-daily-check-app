package com.meter.giga.utils

import com.meter.giga.error_handler.ErrorEntity

/**
 * Represents the state of an asynchronous operation such as
 * API requests, database operations, or background tasks.
 *
 * This sealed class provides a type-safe way to handle:
 * - Loading state while an operation is in progress
 * - Success state with generic response data
 * - Failure state with structured error information
 *
 * Example:
 * ```
 * when(result) {
 *   is ResultState.Loading -> showLoader()
 *   is ResultState.Success -> handleData(result.data)
 *   is ResultState.Failure -> showError(result.error)
 * }
 * ```
 *
 * @param T Type of data returned on successful execution.
 */
sealed class ResultState<out T> {

  /**
   * Represents an ongoing operation.
   */
  object Loading : ResultState<Nothing>()

  /**
   * Represents a successful operation result.
   *
   * @param data Result data returned from the operation.
   */
  data class Success<T>(val data: T) : ResultState<T>()

  /**
   * Represents a failed operation result.
   *
   * @param error Structured error information.
   */
  data class Failure(val error: ErrorEntity) : ResultState<Nothing>()
}
