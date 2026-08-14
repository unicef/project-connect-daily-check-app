/* eslint-disable prefer-arrow/prefer-arrow-functions */
import * as Sentry from '@sentry/browser';
import { environment } from '../environments/environment'; // './esrc/environments/environment';
import { Capacitor, registerPlugin } from '@capacitor/core';
import { GigaAppPlugin } from './android/giga-app-android-plugin';

export async function initSentry() {
  console.log(
    'GIGA Is Native Before Sentry : ',
    Capacitor.getPlatform() === 'android',
  );
  Sentry.init({
    dsn:
      Capacitor.getPlatform() === 'android'
        ? 'https://5c0e907b260d9edc3a215e5fb51ece9c@excubo.unicef.org/9' // Add Android APP DSN Here
        : 'https://e52e97fc558344bc80a218fc22a9a6a9@excubo.unicef.io/47', // Replace with your actual DSN
    environment:
      environment.mode === 'prod'
        ? 'production'
        : environment.mode === 'stg'
          ? 'staging'
          : 'development',
    integrations: [
      new Sentry.Integrations.GlobalHandlers(),
      new Sentry.Integrations.TryCatch(),
      new Sentry.Integrations.Breadcrumbs(),
      new Sentry.Integrations.LinkedErrors(),
      new Sentry.Integrations.UserAgent(),
      new Sentry.Integrations.FunctionToString(),
      new Sentry.Integrations.InboundFilters(),
    ],
    tracesSampleRate: 1.0,
    release: `giga-meter-angular@${environment.app_version}`,
  });
  if (Capacitor.getPlatform() === 'android') {
    const result = await GigaAppPlugin.getAndroidId();

    console.log('Sentry Config Android ID ', JSON.stringify(result));
    if (result && result.androidId) {
      Sentry.setUser({
        id: result.androidId, // Device Android Id
      });
    }
  }
}
