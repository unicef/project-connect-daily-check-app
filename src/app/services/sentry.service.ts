import { Injectable } from '@angular/core';
import * as Sentry from '@sentry/browser';

@Injectable({
  providedIn: 'root'
})
export class SentryService {
  constructor() {}

  captureException(error: any, context?: Record<string, any>) {
    Sentry.withScope((scope) => {
      if (context) {
        Object.keys(context).forEach(key => {
          scope.setExtra(key, context[key]);
        });
      }

      if (error instanceof Error) {
        Sentry.captureException(error);
      } else {
        Sentry.captureMessage('Non-error exception', {
          level: Sentry.Severity.Warning,
          extra: {
            originalError: error
          }
        });
      }
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
