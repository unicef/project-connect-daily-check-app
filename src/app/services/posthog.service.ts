import { Injectable } from '@angular/core';
import { NavigationEnd, Router } from '@angular/router';
import { filter } from 'rxjs/operators';
import posthog from 'posthog-js';
import { environment } from 'src/environments/environment';
import { StorageService } from './storage.service';

/**
 * Lightweight PostHog (product analytics) integration for the Angular
 * renderer. Runs alongside Matomo — see MatomoService.
 *
 * Identity model (see also electron/src/analytics.ts):
 *  - The PERSON (distinct_id) is PostHog's own persistent anonymous UUID.
 *    We deliberately do NOT identify by hardware ID — it can be null or, in
 *    rare cases, collide across machines. PostHog's anon UUID is per-install,
 *    stable (localStorage), and never null.
 *  - The SCHOOL (GigaID / giga_id_school) is attached as a PostHog "group"
 *    plus an event property, so every device at a school rolls up under one
 *    school while individual devices stay distinct.
 *  - The renderer's distinct_id and school are relayed to the Electron main
 *    process over IPC so main-process telemetry (posthog-node) shares the
 *    same person and group.
 *
 * All operations are wrapped in try/catch so any failure here can never
 * break the app.
 */
@Injectable({
  providedIn: 'root',
})
export class PosthogService {
  private initialized = false;

  // PostHog group type used for school-level rollups.
  private readonly SCHOOL_GROUP = 'school';

  // Virtual host used in Electron so PostHog receives clean URLs
  // (e.g. https://app.gigameter.local/home) instead of file:// paths.
  private readonly electronVirtualOrigin = 'https://app.gigameter.local';

  constructor(private router: Router, private storage: StorageService) {}

  /**
   * Initialize PostHog tracking. Safe to call multiple times.
   * Silently no-ops if configuration is missing.
   */
  init(): void {
    try {
      if (this.initialized) {
        return;
      }

      const apiKey = environment.posthog?.apiKey;
      const host = environment.posthog?.host;

      if (!apiKey || apiKey === 'POSTHOG_PROJECT_API_KEY' || !host) {
        console.warn('[PostHog] Skipping init: missing API key or host.');
        return;
      }

      posthog.init(apiKey, {
        api_host: host,
        // We send events manually; autocapture is noisy and pathname-based
        // (file:// in Electron), so it is disabled.
        autocapture: false,
        capture_pageview: false,
        capture_pageleave: true,
        // Desktop app: localStorage persistence keeps a stable anon UUID.
        persistence: 'localStorage+cookie',
        disable_session_recording: true,
        loaded: () => {
          // Attach the school group if this device is already registered,
          // and hand our identity to the Electron main process.
          this.applySchoolFromStorage();
          this.relayIdentityToMain();
        },
      });

      posthog.register({
        app: environment.appName,
        app_version: environment.app_version,
        is_electron: !!environment.isElectron,
      });

      // Report the first page view with a clean URL.
      this.capturePageView();
      this.trackRouteChanges();

      this.initialized = true;
    } catch (error) {
      console.warn('[PostHog] init failed:', error);
    }
  }

  /**
   * Capture a custom event. Safe to call even if PostHog is not initialized.
   */
  capture(event: string, properties?: Record<string, any>): void {
    try {
      if (!this.initialized) {
        return;
      }
      posthog.capture(event, properties);
    } catch (error) {
      console.warn('[PostHog] capture failed:', error);
    }
  }

  /**
   * Manually capture a page view with a clean URL.
   */
  capturePageView(url?: string): void {
    try {
      if (!this.initialized) {
        return;
      }
      const path = url || window.location.pathname || '/';
      posthog.capture('$pageview', {
        $current_url: this.getTrackingOrigin() + path,
      });
    } catch (error) {
      console.warn('[PostHog] capturePageView failed:', error);
    }
  }

  /**
   * Associate this device (and future events) with a school group. Call this
   * after registration completes / GigaID becomes known. Safe to call with a
   * missing value (no-ops).
   */
  setSchool(gigaId: string | number | null | undefined): void {
    try {
      if (!this.initialized || gigaId == null || gigaId === '') {
        return;
      }
      const key = String(gigaId);
      posthog.group(this.SCHOOL_GROUP, key, { giga_id_school: key });
      this.relayIdentityToMain();
    } catch (error) {
      console.warn('[PostHog] setSchool failed:', error);
    }
  }

  private applySchoolFromStorage(): void {
    try {
      const gigaId = this.storage.get('gigaId');
      if (gigaId) {
        posthog.group(this.SCHOOL_GROUP, String(gigaId), {
          giga_id_school: String(gigaId),
        });
      }
    } catch (error) {
      console.warn('[PostHog] applySchoolFromStorage failed:', error);
    }
  }

  /**
   * Hand the renderer's distinct_id and current school to the Electron main
   * process so main-process events (posthog-node) share the same person/group.
   */
  private relayIdentityToMain(): void {
    try {
      const ipc = (window as any).ipcRenderer;
      if (!environment.isElectron || !ipc?.send) {
        return;
      }
      ipc.send('posthog-identity', {
        distinctId: posthog.get_distinct_id(),
        gigaId: this.storage.get('gigaId') || null,
      });
    } catch (error) {
      console.warn('[PostHog] relayIdentityToMain failed:', error);
    }
  }

  private trackRouteChanges(): void {
    try {
      this.router.events
        .pipe(filter((event) => event instanceof NavigationEnd))
        .subscribe((event: NavigationEnd) => {
          try {
            const url = event.urlAfterRedirects || event.url;
            this.capturePageView(url);
          } catch (error) {
            console.warn('[PostHog] route tracking failed:', error);
          }
        });
    } catch (error) {
      console.warn('[PostHog] trackRouteChanges setup failed:', error);
    }
  }

  /**
   * Returns a clean origin for tracking. In Electron the real origin is
   * file://, which is useless for analytics, so we substitute a fixed
   * virtual host.
   */
  private getTrackingOrigin(): string {
    try {
      if (environment.isElectron) {
        return this.electronVirtualOrigin;
      }
      return window.location.origin;
    } catch {
      return this.electronVirtualOrigin;
    }
  }
}
