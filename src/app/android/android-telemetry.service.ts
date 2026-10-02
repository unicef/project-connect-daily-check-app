import { Injectable } from '@angular/core';
import { Capacitor } from '@capacitor/core';
import posthog from 'posthog-js';
import { PosthogService } from '../services/posthog.service';
import { GigaAppPlugin } from './giga-app-android-plugin';

/**
 * Publishes to PostHog what the native Android side does and the WebView does
 * not see.
 *
 * On Android the speed test runs and uploads in Kotlin (NetworkTestWorker), so
 * upload.service.ts never fires measurement_uploaded. The worker already
 * reports every outcome to the WebView through the plugin's speedTestUpdate
 * event; this service adds its own listener to it and maps the outcome to the
 * same event names the desktop app uses, so one insight covers both platforms.
 *
 * Events only arrive while the plugin is alive (app open). Scheduled tests that
 * run with the app closed are not seen; failures there still go to Sentry.
 *
 * Kept outside posthog.service.ts on purpose: that file is shared verbatim with
 * the desktop release branch.
 */
@Injectable({
  providedIn: 'root',
})
export class AndroidTelemetryService {
  private started = false;

  constructor(private posthogService: PosthogService) {}

  /**
   * Starts listening. Runs once the root component exists, so PostHog is
   * already initialized. Does nothing outside the native Android app.
   */
  start(): void {
    try {
      if (this.started || Capacitor.getPlatform() !== 'android') {
        return;
      }
      this.started = true;

      this.registerPlatform();

      const plugin = GigaAppPlugin as unknown as {
        addListener(
          eventName: 'speedTestUpdate',
          listener: (data: any) => void
        ): Promise<unknown>;
      };
      plugin
        .addListener('speedTestUpdate', (data) => this.onSpeedTestUpdate(data))
        .catch((error) =>
          console.warn('[PostHog] speedTestUpdate listener failed:', error)
        );
    } catch (error) {
      console.warn('[PostHog] AndroidTelemetryService start failed:', error);
    }
  }

  /**
   * Super-property on every following event. PostHog persists it, so from the
   * second launch on it is also present on app_started.
   */
  private registerPlatform(): void {
    try {
      if (!posthog.__loaded) {
        return; // no key configured: PostHog never started
      }
      posthog.register({ platform: 'android' });
    } catch (error) {
      console.warn('[PostHog] register platform failed:', error);
    }
  }

  private onSpeedTestUpdate(data: any): void {
    try {
      const status = data?.testStatus;
      const speedTestData = data?.speedTestData;
      const measurementsItem = data?.measurementsItem;
      // Notes carries the schedule type: daily, startup, manual or first.
      const base = {
        notes: speedTestData?.Notes ?? measurementsItem?.Notes ?? null,
        source: 'android-native',
      };

      if (status === 'complete') {
        // Uploaded in realtime by the worker. No speed figures: that is what
        // the measurements table itself is for.
        this.posthogService.capture('measurement_uploaded', {
          ...base,
          protocol: 'mlab',
          offline_synced: false,
        });
      } else if (status === 'onerror' && speedTestData) {
        // The test ran but the POST failed. The worker keeps it in the local
        // history with uploaded=false and does not retry it, so this is not a
        // queued measurement like measurement_queued_offline on desktop.
        this.posthogService.capture('measurement_upload_failed', base);
      } else if (status === 'onerror') {
        // The test failed or never started (e.g. notification permission
        // denied), or its upload payload could not be built.
        this.posthogService.capture('measurement_failed', {
          ...base,
          stage: measurementsItem ? 'payload' : 'test',
        });
      } else if (status === 'offline') {
        this.posthogService.capture('measurement_skipped_offline', base);
      }
    } catch (error) {
      console.warn('[PostHog] onSpeedTestUpdate failed:', error);
    }
  }
}
