package com.meter.giga.error_handler

/**
 * Custom Error types can occur
 * during the speed test operation
 */
sealed class ErrorEntity {
  object Network : ErrorEntity()
//  object NotFound : ErrorEntity()
//  object AccessDenied : ErrorEntity()
//  object ServiceUnavailable : ErrorEntity()
  data class Unknown(val message: String? = null) : ErrorEntity()
}
