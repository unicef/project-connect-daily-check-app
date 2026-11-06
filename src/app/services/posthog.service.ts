import { Injectable } from '@angular/core';
import { NavigationEnd, Router } from '@angular/router';
import { filter } from 'rxjs/operators';
import posthog from 'posthog-js';
import { environment } from 'src/environments/environment';
import { HardwareIdService } from './hardware-id.service';

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
 * - Each PC is one PostHog person, identified by its hardware ID when it has
 *   a real one, else by its registration ID (`schoolUserId`, the BrowserID
 *   sent with every measurement). Both already travel with the measurements.
 *   Never a school name, a Windows user, installation paths or an IP.
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

  // Hardware IDs that are not unique to one PC: the main process's "none
  // read" value and the placeholders some boards ship with. PCs sharing one
  // would become a single person, so they fall back to the registration ID.
  private readonly PLACEHOLDER_HARDWARE_IDS = new Set([
    'NO_UUID_AVAILABLE',
    '03000200-0400-0500-0006-000700080009',
    'TO BE FILLED BY O.E.M.',
    'DEFAULT STRING',
    'SYSTEM SERIAL NUMBER',
    'NOT APPLICABLE',
    'NOT SPECIFIED',
    'NONE',
    'N/A',
    'UNDEFINED',
    'NULL',
  ]);

  constructor(
    private router: Router,
    private hardwareIdService: HardwareIdService
  ) {}

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
        loaded: () => this.registerAppProperties(),
      });

      // Set before the calls below: identifyDevice(), setSchool() and
      // trackPageView() return early while `initialized` is false.
      this.initialized = true;

      this.identifyDevice();
      this.applySchoolFromStorage();
      this.trackPageView();
      this.trackRouteChanges();
      this.bridgeMainProcessEvents();
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
   * Identifies this PC: by its hardware ID when it has a real one, else by its
   * registration ID. With neither (not registered, no hardware ID yet) the PC
   * stays anonymous. Called at startup and right after a registration, manual
   * or automatic. The school is a group (setSchool), never the identity.
   *
   * An identity, once set, is kept: identifying again with another ID would
   * start a new person, because PostHog does not merge two identified people.
   * So a PC that got its hardware ID only after registering stays on its
   * registration ID. Logout calls reset(), which frees it.
   */
  identifyDevice(properties?: Record<string, any>): void {
    try {
      if (!this.initialized) {
        return;
      }
      const deviceId = this.getDeviceDistinctId();
      if (!deviceId) {
        return;
      }

      if (posthog._isIdentified()) {
        const currentId = posthog.get_distinct_id();
        if (currentId === deviceId) {
          if (properties) {
            posthog.setPersonProperties(properties);
          }
          return;
        }
        // Earlier 2.0.4 test builds identified by the school's giga id, which
        // made every PC at a school one person. Move those installs over;
        // keep any other identity.
        if (currentId !== localStorage.getItem('gigaId')) {
          return;
        }
        this.reset();
        posthog.identify(deviceId, properties);
        this.applySchoolFromStorage(); // reset() dropped the school group
        return;
      }

      posthog.identify(deviceId, properties);
    } catch (error) {
      console.warn('[PostHog] identifyDevice failed:', error);
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

  /**
   * Forgets the PC's identity and school when the registration ends (logout,
   * or the device or school no longer registered), so the next registration
   * can identify it again.
   */
  reset(): void {
    try {
      if (!this.initialized) {
        return;
      }
      posthog.reset();
      // reset() also drops the properties sent with every event.
      this.registerAppProperties();
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

  /** The hardware ID when it is a real one, else the registration ID. */
  private getDeviceDistinctId(): string | null {
    const hardwareId = this.hardwareIdService.getHardwareId()?.trim();
    if (hardwareId && !this.isPlaceholderId(hardwareId)) {
      return hardwareId;
    }
    const registrationId = localStorage.getItem('schoolUserId')?.trim();
    if (registrationId && !this.isPlaceholderId(registrationId)) {
      return registrationId;
    }
    return null;
  }

  private isPlaceholderId(id: string): boolean {
    const value = id.toUpperCase();
    return (
      this.PLACEHOLDER_HARDWARE_IDS.has(value) ||
      // All zeros or all Fs, with or without dashes
      /^[0-]+$/.test(value) ||
      /^[F-]+$/.test(value)
    );
  }

  /** Properties sent with every event. */
  private registerAppProperties(): void {
    try {
      posthog.register({
        app_version: environment.app_version,
        app_mode: environment.mode,
        is_electron: !!environment.isElectron,
      });
    } catch (error) {
      console.warn('[PostHog] register failed:', error);
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
