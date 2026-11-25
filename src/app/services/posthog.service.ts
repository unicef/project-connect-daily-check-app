import { Injectable } from '@angular/core';
import { NavigationEnd, Router } from '@angular/router';
import { filter } from 'rxjs/operators';
import posthog from 'posthog-js';
import { environment } from 'src/environments/environment';
import {
  describeError,
  getRememberedDeviceId,
} from '../analytics/analytics-events';
import { APP_INSTANCE_ID_KEY } from './registration-context.service';

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
 * - Two levels, as in the backend's registration table:
 *   - device: each PC is one PostHog person, identified by its device ID, the
 *     backend's ID for one physical PC across all its app instances
 *     (TECH-8828), from its firmware UUID, motherboard serial and disk serial.
 *   - app instance: each registration, manual or automatic, is one app
 *     instance (the app under one Windows user, for one registration), with
 *     the ID the app generates (`appInstanceId`, also sent with every
 *     measurement and ping). A device can have several. It goes with every
 *     event as the `app_instance_id` property and the `app_instance` group.
 *   Both are grouped by school and country. Until the backend has told the
 *   app its device ID, events stay anonymous; PostHog merges them into the
 *   device once it is identified. Never a school name, a Windows user,
 *   installation paths or an IP.
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
  // Second group type, so dashboards can break any metric down by country.
  private readonly COUNTRY_GROUP = 'country';
  // Third: the app instance (one registration), so dashboards can count app
  // instances as well as devices.
  private readonly APP_INSTANCE_GROUP = 'app_instance';

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
   * Records an event and sends it right away instead of with the next batch.
   * For events sent just before the page reloads or the window closes (logout
   * clears localStorage and reloads 500 ms later), which a batch would lose.
   */
  captureNow(event: string, properties?: Record<string, any>): void {
    try {
      if (!this.initialized) {
        return;
      }
      posthog.capture(event, properties, {
        send_instantly: true,
        transport: 'sendBeacon',
      });
    } catch (error) {
      console.warn('[PostHog] captureNow failed:', error);
    }
  }

  /**
   * Records a failure with the standard fields (error_code, http_status,
   * endpoint, error_message) worked out from whatever was caught.
   * `properties` can override any of them.
   */
  captureFailure(
    event: string,
    error: unknown,
    properties?: Record<string, any>,
    fallbackCode = 'unknown'
  ): void {
    this.capture(event, {
      ...describeError(error, fallbackCode),
      ...(properties ?? {}),
    });
  }

  /**
   * Adds properties sent with every event from now on, such as the build and
   * OS version once the main process has read them.
   */
  registerProperties(properties: Record<string, any>): void {
    try {
      if (!this.initialized) {
        return;
      }
      const defined = Object.fromEntries(
        Object.entries(properties).filter(
          ([, value]) => value !== undefined && value !== null && value !== ''
        )
      );
      if (Object.keys(defined).length > 0) {
        posthog.register(defined);
      }
    } catch (error) {
      console.warn('[PostHog] registerProperties failed:', error);
    }
  }

  /**
   * Identifies this PC by its device ID, once the backend has given it one
   * (this app instance's registration, or the status check at every start).
   * Without one the PC stays anonymous, and PostHog merges those anonymous
   * events into the device when it is identified. Called at startup, after the
   * status check, and after a registration, manual or automatic. The app
   * instance, school and country are groups, never the identity: every app
   * instance on a PC (each Windows user, each login) is the same person.
   *
   * An install identified by anything else (2.0.4 test builds used the
   * hardware ID, the registration ID or the school's giga id), or by a device
   * ID the backend has since changed, moves to its device ID. PostHog does
   * not merge two identified people, so that starts the device's person
   * afresh rather than carrying the old history.
   */
  identifyDevice(properties?: Record<string, any>): void {
    try {
      if (!this.initialized) {
        return;
      }
      this.applyAppInstance();
      const deviceId = getRememberedDeviceId();
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
        this.reset();
        posthog.identify(deviceId, properties);
        this.applySchoolFromStorage(); // reset() dropped the groups
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
   * What arrives is what only the main process sees: the auto-update
   * lifecycle (a machine that fails to update stops sending measurements and
   * disappears from version adoption queries), first launch and app_updated,
   * hardware ID retries, and main-process crashes. See MainProcessEvent in
   * analytics/analytics-events.ts.
   */
  private bridgeMainProcessEvents(): void {
    try {
      const electronAPI = (window as any).electronAPI;
      if (!electronAPI?.onTelemetryEvent) {
        return; // browser, or a build without the new preload
      }
      electronAPI.onTelemetryEvent(
        (payload: {
          event: string;
          properties?: Record<string, any>;
          sendNow?: boolean;
        }) => {
          if (!payload?.event) {
            return;
          }
          const properties = {
            ...(payload.properties ?? {}),
            source: 'electron-main',
          };
          // Events sent just before the app quits (restart to update, quit).
          if (payload.sendNow) {
            this.captureNow(payload.event, properties);
          } else {
            this.capture(payload.event, properties);
          }
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

  /** Ties the device to its country's group. */
  setCountry(countryCode: string | null | undefined): void {
    try {
      if (!this.initialized || !countryCode) {
        return;
      }
      const key = String(countryCode).toUpperCase();
      posthog.group(this.COUNTRY_GROUP, key, { country_code: key });
    } catch (error) {
      console.warn('[PostHog] setCountry failed:', error);
    }
  }

  private applySchoolFromStorage(): void {
    try {
      const gigaId = localStorage.getItem('gigaId');
      if (gigaId) {
        this.setSchool(gigaId);
      }
      const countryCode = localStorage.getItem('country_code');
      if (countryCode) {
        this.setCountry(countryCode);
      }
      this.applyAppInstance();
    } catch (error) {
      console.warn('[PostHog] applySchoolFromStorage failed:', error);
    }
  }

  /**
   * Sends this app instance's ID with every event, as the `app_instance_id`
   * property and the `app_instance` group, so dashboards can count app
   * instances per device and per school next to devices. Only once the app is
   * registered: the ID is made when a registration is first tried, and an
   * install from before app instances makes one at start to attach to its
   * registration. `properties` describe the app instance (its group), set
   * when it registers.
   */
  applyAppInstance(properties?: Record<string, any>): void {
    try {
      if (!this.initialized) {
        return;
      }
      const appInstanceId = localStorage.getItem(APP_INSTANCE_ID_KEY)?.trim();
      if (!appInstanceId || !localStorage.getItem('schoolUserId')) {
        return;
      }
      posthog.register({ app_instance_id: appInstanceId });
      posthog.group(this.APP_INSTANCE_GROUP, appInstanceId, properties);
    } catch (error) {
      console.warn('[PostHog] applyAppInstance failed:', error);
    }
  }

  /** Properties sent with every event. */
  private registerAppProperties(): void {
    try {
      posthog.register({
        app_version: environment.app_version,
        app_mode: environment.mode,
        is_electron: this.isElectron(),
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
  /**
   * Whether this is the desktop app. environment.isElectron reads
   * window.process, which context isolation hides from the page, so it is
   * false in Electron too; the preload's electronAPI is the reliable sign.
   */
  private isElectron(): boolean {
    return !!environment.isElectron || !!(window as any)?.electronAPI;
  }

  private getTrackingOrigin(): string {
    try {
      if (this.isElectron()) {
        return this.electronVirtualOrigin;
      }
      return window.location.origin;
    } catch {
      return this.electronVirtualOrigin;
    }
  }
}
