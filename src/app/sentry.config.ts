/* eslint-disable prefer-arrow/prefer-arrow-functions */
import * as Sentry from '@sentry/browser';
import { environment } from '../environments/environment'; // './esrc/environments/environment';
import { Capacitor, registerPlugin } from '@capacitor/core';
import { GigaAppPlugin } from './android/giga-app-android-plugin';
import { App } from '@capacitor/app';
import { Device } from '@capacitor/device';

export async function initSentry() {
  const appVersion =
    Capacitor.getPlatform() === 'android'
      ? await getBuildInfo()
      : `giga-meter-angular@${environment.app_version}`;
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
    release: appVersion,
  });

  if (Capacitor.getPlatform() === 'android') {
    const deviceInfo = await Device.getInfo();
    const result = await GigaAppPlugin.getAndroidId();
    Sentry.setTag('Android Device Name', deviceInfo.name);
    Sentry.setTag('Android Device Manufacturer', deviceInfo.manufacturer);
    Sentry.setTag('Android Device Model', deviceInfo.model);
    if (result && result.androidId) {
      Sentry.setTag('Android Device Id', result.androidId);
      Sentry.setUser({
        id: result.androidId, // Device Android Id
      });
    }
  }
}

async function getBuildInfo() {
  const info = await App.getInfo();
  return info.version;
}
