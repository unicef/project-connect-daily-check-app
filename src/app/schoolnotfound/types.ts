import { HttpErrorResponse } from '@angular/common/http';

/**
 * Why the registration flow ended on the error page. Each value has its own
 * copy under `registrationError.<reason>` in the translation files.
 */
export enum NotFound {
  /** The search ran and matched no school. */
  notFound = 'notFound',
  /** The school saved on this device is no longer registered on the backend. */
  notRegister = 'notRegister',
  /** The request never reached the backend (offline, DNS, blocked). */
  network = 'network',
  /** The backend did not answer in time. */
  timeout = 'timeout',
  /** The backend answered with a 5xx. */
  server = 'server',
  /** Registering the device failed for any other reason. */
  registrationFailed = 'registrationFailed',
  /** Anything else we cannot attribute. */
  unknown = 'unknown',
}

/**
 * Map a failed request to the reason shown to the user. Only an empty result
 * means "school not found"; a failure to get a result at all never does.
 *
 * @param error what the HTTP call (or rxjs `timeout`) threw
 * @param fallback reason for errors that fit no other bucket
 */
export const classifyRequestError = (
  error: unknown,
  fallback: NotFound = NotFound.unknown
): NotFound => {
  if ((error as Error)?.name === 'TimeoutError') {
    return NotFound.timeout;
  }
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    return NotFound.network;
  }
  if (error instanceof HttpErrorResponse) {
    if (error.status === 0) {
      return NotFound.network;
    }
    if (error.status === 408 || error.status === 504) {
      return NotFound.timeout;
    }
    if (error.status >= 500) {
      return NotFound.server;
    }
  }
  return fallback;
};
