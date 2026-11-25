import { Injectable } from '@angular/core';
import { PosthogService } from '../services/posthog.service';
import { IndexedDBService } from '../services/indexed-db.service';
import { StorageService } from '../services/storage.service';
import { SettingsService } from '../services/settings.service';
import { DeviceContextService } from '../services/device-context.service';
import {
  APP_INSTANCE_ID_KEY,
  PENDING_APP_INSTANCE_CLAIM_KEY,
  PENDING_AUTO_REGISTRATION_KEY,
} from '../services/registration-context.service';
import { AnalyticsEvent, sanitizeMessage } from './analytics-events';

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * One `device_heartbeat` per device per local day.
 *
 * A device that stops working sends nothing, and an alert can't fire on
 * events that never arrive. The heartbeat is the event that does arrive, with
 * the state that explains a silent device: is it registered, is scheduled
 * testing on, how long since its last test, how many tests are stuck in the
 * offline queue, and how its pings went over the last 24 hours. Pings run
 * every 15 minutes, so they are summarised here rather than sent one by one.
 *
 * It's sent per app instance (each Windows user's app sends its own), so a
 * device is live when any of its app instances is.
 *
 * Everything here is best effort: a read that fails leaves its property null.
 */
@Injectable({
  providedIn: 'root',
})
export class AnalyticsHeartbeatService {
  /** The local day (YYYY-MM-DD) the last heartbeat was sent for. */
  static readonly LAST_SENT_KEY = 'analytics_heartbeat_day';
  /** After the startup work (registration check, sync), out of its way. */
  private readonly firstDelayMs = 2 * 60 * 1000;
  private readonly checkIntervalMs = 60 * 60 * 1000;
  private started = false;

  constructor(
    private posthog: PosthogService,
    private indexedDB: IndexedDBService,
    private storage: StorageService,
    private settings: SettingsService,
    private deviceContext: DeviceContextService
  ) {}

  /** Starts the daily heartbeat. Safe to call more than once. */
  start(): void {
    if (this.started) {
      return;
    }
    this.started = true;
    setTimeout(async () => {
      await this.registerDeviceProperties();
      await this.sendIfDue();
    }, this.firstDelayMs);
    setInterval(() => this.sendIfDue(), this.checkIntervalMs);
  }

  /**
   * Sends today's heartbeat unless it already went. Resolves true when it
   * sent one.
   */
  async sendIfDue(now: Date = new Date()): Promise<boolean> {
    try {
      const today = localDay(now);
      if (localStorage.getItem(AnalyticsHeartbeatService.LAST_SENT_KEY) === today) {
        return false;
      }
      const properties = await this.collect(now);
      this.posthog.capture(AnalyticsEvent.DeviceHeartbeat, properties);
      localStorage.setItem(AnalyticsHeartbeatService.LAST_SENT_KEY, today);
      return true;
    } catch (error) {
      console.warn('[Analytics] heartbeat failed:', error);
      return false;
    }
  }

  /** The heartbeat's properties. */
  async collect(now: Date = new Date()): Promise<Record<string, any>> {
    const lastMeasurement = Number(this.storage.get('lastMeasurement'));
    const pending = await this.safely(() =>
      this.indexedDB.getPendingMeasurements()
    );
    const pings = await this.safely(() => this.indexedDB.getPingResults());
    const recentPings = Array.isArray(pings)
      ? pings.filter((ping) => {
          const age = now.getTime() - new Date(ping?.timestamp).getTime();
          return age >= 0 && age < DAY_MS;
        })
      : null;

    return {
      registered: !!this.storage.get('schoolId'),
      has_app_instance_id: !!this.storage.get(APP_INSTANCE_ID_KEY),
      // Going on with the PC's registration because its own couldn't be
      // stored yet; and a registration from before app instances not yet
      // given this install's ID (the 2.0.4 migration).
      registration_pending:
        this.storage.get(PENDING_AUTO_REGISTRATION_KEY) === 'true',
      app_instance_claim_pending:
        this.storage.get(PENDING_APP_INSTANCE_CLAIM_KEY) === 'true',
      scheduled_testing: this.settings.get('scheduledTesting') ?? null,
      upload_enabled: this.settings.get('uploadEnabled') ?? null,
      online: typeof navigator !== 'undefined' ? navigator.onLine : null,
      hours_since_last_measurement:
        lastMeasurement > 0
          ? Math.round(((now.getTime() - lastMeasurement) / 3600000) * 10) / 10
          : null,
      pending_measurements: Array.isArray(pending) ? pending.length : null,
      ping_attempts_24h: recentPings ? recentPings.length : null,
      ping_successes_24h: recentPings
        ? recentPings.filter((ping) => ping?.isConnected).length
        : null,
      ping_unsynced: Array.isArray(pings)
        ? pings.filter((ping) => !ping?.isSynced).length
        : null,
      top_ping_error: recentPings ? topError(recentPings) : null,
    };
  }

  /**
   * Adds the build commit and OS version to every later event. Read from the
   * main process, which caches them, after startup so the WMI query behind
   * them doesn't compete with it.
   */
  async registerDeviceProperties(): Promise<void> {
    try {
      const identity = await this.deviceContext.getDeviceIdentity();
      this.posthog.registerProperties({
        build_commit: identity?.app_build_number,
        os_version: identity?.os_version,
      });
    } catch (error) {
      console.warn('[Analytics] device properties failed:', error);
    }
  }

  private async safely<T>(read: () => Promise<T>): Promise<T | null> {
    try {
      return await read();
    } catch {
      return null;
    }
  }
}

/** YYYY-MM-DD in the PC's local time: the school day the heartbeat is for. */
export function localDay(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(
    date.getDate()
  )}`;
}

/**
 * The most common error among failed pings, cleaned for sending. A ping that
 * got no reply before its timeout records no message: that is `no_reply`.
 */
function topError(pings: any[]): string | null {
  const counts = new Map<string, number>();
  for (const ping of pings) {
    if (!ping?.isConnected) {
      const key = ping?.errorMessage
        ? (sanitizeMessage(ping.errorMessage, 80) as string)
        : 'no_reply';
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
  }
  let top: string | null = null;
  let max = 0;
  counts.forEach((count, key) => {
    if (count > max) {
      max = count;
      top = key;
    }
  });
  return top;
}
