import { Injectable } from '@angular/core';
import { NavigationEnd, Router } from '@angular/router';
import { filter } from 'rxjs/operators';
import posthog from 'posthog-js';
import { environment } from 'src/environments/environment';

/**
 * PostHog product analytics (release v2.0.4).
 *
 * Same rules as MatomoService: everything is wrapped in try/catch so a failure
 * here (missing config, network down, broken SDK) never takes the app down,
 * and with no configuration the service simply does nothing.
 *
 * Notes specific to this app:
 * - It is a desktop Electron app living with intermittent connectivity — that
 *   is literally what it measures. The SDK is bundled (not loaded from a CDN
 *   like Matomo) so it works offline and queues events until the network is
 *   back, and so it does not depend on loading a remote script under Electron's
 *   CSP.
 * - In Electron `window.location` is `file://`, useless for analytics: the same
 *   virtual host as Matomo is used so the URLs stay readable.
 * - No PII: identification is by the school's giga id, which is the same value
 *   that already travels with every measurement. Never a school name, a Windows
 *   user, installation paths or an IP.
 */
@Injectable({
  providedIn: 'root',
})
export class PosthogService {
  private initialized = false;

  // PostHog group type used to aggregate by site. The school goes in as a
  // *group*, not as a person: each installation stays its own "person", so
  // devices can be counted per school instead of collapsing them all into one.
  private readonly SCHOOL_GROUP = 'school';

  // Same virtual host as MatomoService, so both tools report the same URLs and
  // can be cross-referenced.
  private readonly electronVirtualOrigin = 'https://app.gigameter.local';

  constructor(private router: Router) {}

  /**
   * Starts PostHog. Safe to call more than once.
   * Does nothing when the project API key or the host is missing.
   */
  init(): void {
    try {
      if (this.initialized) {
        return;
      }

      const apiKey = environment.posthog?.apiKey;
      const host = environment.posthog?.host;

      if (!apiKey || apiKey.startsWith('POSTHOG_PROJECT_API_KEY') || !host) {
        console.warn('[PostHog] Skipping init: missing API key or host.');
        return;
      }

      posthog.init(apiKey, {
        api_host: host,
        // Page views are sent by hand in trackRouteChanges(): with Angular's
        // hash routes the pageview autocapture does not see them.
        capture_pageview: false,
        capture_pageleave: true,
        autocapture: false, // explicit events only: less noise and less PII
        disable_session_recording: !environment.posthog?.enableSessionRecording,
        // localStorage holds the offline queue; the cookie keeps the device's
        // anon id stable if the renderer's storage is cleared.
        persistence: 'localStorage+cookie',
        // The installation can spend hours without network; let the SDK retry
        // instead of dropping events.
        request_batching: true,
        loaded: (ph) => {
          try {
            ph.register({
              app_version: environment.app_version,
              app_mode: environment.mode,
              is_electron: !!environment.isElectron,
            });
          } catch (error) {
            console.warn('[PostHog] register on load failed:', error);
          }
        },
      });

      this.identifyFromStorage();
      this.applySchoolFromStorage();
      this.trackPageView();
      this.trackRouteChanges();
      this.bridgeMainProcessEvents();

      this.initialized = true;
    } catch (error) {
      console.warn('[PostHog] init failed:', error);
    }
  }

  /**
   * Records an event. Safe even when PostHog is not initialized.
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
   * Ties events to a school. Called at startup (when a registration already
   * exists) and right after the registration completes.
   *
   * The identifier is the giga id: it identifies the site, not the person.
   */
  identify(gigaId: string, properties?: Record<string, any>): void {
    try {
      if (!this.initialized || !gigaId) {
        return;
      }
      posthog.identify(gigaId, properties);
    } catch (error) {
      console.warn('[PostHog] identify failed:', error);
    }
  }

  /**
   * Manual page view. With hash routes they have to be sent by hand.
   */
  trackPageView(url?: string): void {
    try {
      if (!this.initialized) {
        return;
      }
      const path = url ?? window.location.hash?.replace(/^#/, '') ?? '/';
      posthog.capture('$pageview', {
        $current_url: this.getTrackingOrigin() + (path || '/'),
      });
    } catch (error) {
      console.warn('[PostHog] trackPageView failed:', error);
    }
  }

  /** Ends the session when the user logs out, so schools are not mixed. */
  reset(): void {
    try {
      if (!this.initialized) {
        return;
      }
      posthog.reset();
    } catch (error) {
      console.warn('[PostHog] reset failed:', error);
    }
  }

  /**
   * Forwards to PostHog the events emitted by the Electron main process.
   *
   * The main process does not talk to PostHog directly: `posthog-node` does not
   * persist its queue across sessions and these machines spend hours without
   * network, so its events would be the least reliable exactly where they are
   * hardest to recover. The renderer SDK does queue in localStorage and
   * survives restarts.
   *
   * Today only the auto-update lifecycle arrives, which is the one thing
   * neither the renderer nor the backend sees: a machine that fails to update
   * stops sending measurements and disappears from version adoption queries.
   */
  private bridgeMainProcessEvents(): void {
    try {
      const electronAPI = (window as any).electronAPI;
      if (!electronAPI?.onTelemetryEvent) {
        return; // browser, or a build without the new preload
      }
      electronAPI.onTelemetryEvent(
        (payload: { event: string; properties?: Record<string, any> }) => {
          if (!payload?.event) {
            return;
          }
          this.capture(payload.event, {
            ...(payload.properties ?? {}),
            source: 'electron-main',
          });
        }
      );
    } catch (error) {
      console.warn('[PostHog] bridgeMainProcessEvents failed:', error);
    }
  }

  /**
   * Ties the device to its school's group. Called at startup (when a
   * registration already exists) and right after the registration completes.
   */
  setSchool(gigaId: string | number | null | undefined): void {
    try {
      if (!this.initialized || gigaId == null || gigaId === '') {
        return;
      }
      const key = String(gigaId);
      posthog.group(this.SCHOOL_GROUP, key, { giga_id_school: key });
    } catch (error) {
      console.warn('[PostHog] setSchool failed:', error);
    }
  }

  private applySchoolFromStorage(): void {
    try {
      const gigaId = localStorage.getItem('gigaId');
      if (gigaId) {
        this.setSchool(gigaId);
      }
    } catch (error) {
      console.warn('[PostHog] applySchoolFromStorage failed:', error);
    }
  }

  private identifyFromStorage(): void {
    try {
      const gigaId = localStorage.getItem('gigaId');
      if (gigaId) {
        this.identify(gigaId);
      }
    } catch (error) {
      console.warn('[PostHog] identifyFromStorage failed:', error);
    }
  }

  private trackRouteChanges(): void {
    try {
      this.router.events
        .pipe(filter((event) => event instanceof NavigationEnd))
        .subscribe((event: NavigationEnd) => {
          this.trackPageView(event.urlAfterRedirects || event.url);
        });
    } catch (error) {
      console.warn('[PostHog] trackRouteChanges setup failed:', error);
    }
  }

  /**
   * Clean origin for reporting. In Electron the real one is `file://`, which is
   * useless for analytics, so it is replaced by a fixed virtual host.
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
