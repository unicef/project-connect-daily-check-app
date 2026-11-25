import { HttpErrorResponse } from '@angular/common/http';
import { Injectable } from '@angular/core';
import * as Sentry from '@sentry/browser';

@Injectable({
  providedIn: 'root'
})
export class SentryService {
  constructor() {}

  /**
   * Reports an error. Takes anything, because Angular's error handler gets
   * whatever a promise rejected with: see toReportableError.
   */
  captureException(error: unknown, context?: Record<string, any>) {
    Sentry.withScope((scope) => {
      if (context) {
        Object.keys(context).forEach(key => {
          scope.setExtra(key, context[key]);
        });
      }
      if (error instanceof HttpErrorResponse) {
        // One issue per endpoint and status, not one for every failed call.
        scope.setFingerprint([
          'HttpErrorResponse',
          String(error.status),
          requestPath(error.url),
        ]);
      }
      Sentry.captureException(toReportableError(error));
    });
  }

  captureMessage(message: string, level: Sentry.Severity = Sentry.Severity.Info, context?: Record<string, any>) {
    Sentry.withScope((scope) => {
      if (context) {
        Object.keys(context).forEach(key => {
          scope.setExtra(key, context[key]);
        });
      }
      Sentry.captureMessage(message, level);
    });
  }

  setUser(id: string, email?: string, username?: string) {
    Sentry.setUser({
      id,
      email,
      username
    });
  }

  clearUser() {
    Sentry.setUser(null);
  }
}

/**
 * An Error to report for any thrown or rejected value. Sentry names, groups
 * and titles a report from an Error's type and message. A failed HttpClient
 * call rejects with an HttpErrorResponse, which is not an Error: Sentry then
 * files it as "Non-Error exception captured with keys: error, headers,
 * message, name, ok", without the URL or status.
 */
export function toReportableError(value: unknown): Error {
  if (value instanceof Error) {
    return value;
  }
  if (value instanceof HttpErrorResponse) {
    const error = new Error(
      `HTTP ${value.status || 'request failed'} from ${requestPath(value.url)}`
    );
    error.name = 'HttpErrorResponse';
    return error;
  }
  if (typeof value === 'string') {
    return new Error(value);
  }
  const message = (value as { message?: unknown } | null)?.message;
  return new Error(
    typeof message === 'string' && message
      ? message
      : `Non-Error value: ${Object.prototype.toString.call(value)}`
  );
}

/**
 * Host and path of a request, with ids replaced, so one endpoint gives one
 * issue and no school or device id ends up in the title.
 */
export function requestPath(url: string | null | undefined): string {
  if (!url) {
    return 'an unknown URL';
  }
  try {
    const { host, pathname } = new URL(url);
    const path = pathname
      .split('/')
      .map((part) => (/^[0-9a-f-]{8,}$/i.test(part) || /^\d[\d.:]*$/.test(part) ? ':id' : part))
      .join('/');
    return host + path;
  } catch {
    return 'an unknown URL';
  }
}
