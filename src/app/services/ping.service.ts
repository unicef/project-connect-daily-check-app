import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Device } from '@capacitor/device';
import { v4 as uuidv4 } from 'uuid';
import { IndexedDBService } from './indexed-db.service';
import { StorageService } from './storage.service';
import { SettingsService } from './settings.service';
import { SharedService } from './shared-service.service';
import SpeedTest from '@cloudflare/speedtest';
import { APP_INSTANCE_ID_KEY } from './registration-context.service';

/**
 * Why a ping got no reply. A fixed code, never an error's text: the ping goes
 * to the backend and to analytics, and that text can hold a Windows user name
 * or a path.
 * - `offline`: Windows reports no network, whichever way the check failed.
 * - `gave_up`: the check gave up without a reply (Cloudflare can't be reached).
 * - `timeout`: no reply within the check's 5 seconds.
 * - `error`: the check threw.
 */
export type PingFailure = 'offline' | 'gave_up' | 'timeout' | 'error';

export interface PingResult {
  timestamp: Date;
  isConnected: boolean;
  /** Why it failed; null when it got a reply. */
  errorMessage: PingFailure | null;
  browserId: string;
  app_local_uuid: string;
  latency?: number | null;
  /** This install (app instance): the link to its registration. */
  app_instance_id?: string | null;
}

@Injectable({
  providedIn: 'root',
})
export class PingService {
  private activeHours = { start: 8, end: 20 }; // Active hours: 8 AM to 8 PM
  // Same as the regular ping interval.
  private readonly SPEED_TEST_PING_GAP = 15 * 60 * 1000;
  // A check that gets no reply is run again after this wait. A PC waking
  // from sleep runs its overdue ping before Wi-Fi and DHCP are back.
  private readonly PING_RETRY_WAIT = 30 * 1000;
  // Shorter before a speed test, which waits for it.
  private readonly SPEED_TEST_PING_RETRY_WAIT = 5 * 1000;
  private checkInterval: any;

  constructor(
    private http: HttpClient,
    private indexedDBService: IndexedDBService,
    private settingsService: SettingsService,
    private storage: StorageService,
    private sharedService: SharedService
  ) {}

  /** One check. A ping that is stored goes through checkWithRetry(). */
  async checkConnectivity(): Promise<PingResult> {
    let failure: PingFailure | null = null;
    let latency: number | null = null;
    let browserId;
    let uniqueId = uuidv4();

    try {
      const deviceInfo = await this.getBrowserId();
      browserId = deviceInfo.uuid;
      ({ failure, latency } = await this.checkFetchAPI());
    } catch (error) {
      // Only the code is stored: the text can name the user or a path.
      console.error('Ping check error:', error);
      failure = 'error';
    }
    // Read once the check is over, as the network may have come back by then.
    if (failure && navigator.onLine === false) {
      failure = 'offline';
    }

    return {
      timestamp: new Date(),
      isConnected: !failure,
      errorMessage: failure,
      browserId,
      app_local_uuid: uniqueId,
      latency,
      app_instance_id: this.storage.get(APP_INSTANCE_ID_KEY) || null,
    };
  }

  async getBrowserId() {
    const browserId = this.storage.get('schoolUserId');
    return { uuid: browserId };
  }

  async performCheck(): Promise<PingResult | null> {
    if (!this.isWithinActiveHours()) {
      console.log('Skipping check: Outside active hours.');
      return null;
    }

    return await this.checkWithRetry(this.PING_RETRY_WAIT);
  }

  /**
   * Saves a ping just before a speed test, so a PC that is only on for a few
   * minutes still has one for that day. It runs at any hour, because the
   * test does, and is skipped when a ping got a reply in the last 15
   * minutes, so a test that is retried doesn't add a ping for every try.
   * Never throws: the speed test runs whatever happens here.
   */
  async pingBeforeSpeedTest(): Promise<void> {
    try {
      if (!this.storage.get('schoolId')) {
        return;
      }
      const featureFlags = await this.settingsService.getFeatureFlags();
      if (!featureFlags?.pingService) {
        return;
      }
      if (await this.pingedInLast(this.SPEED_TEST_PING_GAP)) {
        console.log('Ping before speed test skipped: pinged recently.');
        return;
      }
      const result = await this.checkWithRetry(
        this.SPEED_TEST_PING_RETRY_WAIT
      );
      console.log('Ping before speed test:', result);
      await this.savePing(result);
    } catch (error) {
      console.error('Ping before speed test failed:', error);
    }
  }

  /**
   * A check, and when it gets no reply, one more after `retryWait`. Only the
   * second is kept, so a PC that has just woken from sleep, with Wi-Fi not
   * back yet, isn't stored as offline.
   */
  private async checkWithRetry(retryWait: number): Promise<PingResult> {
    const first = await this.checkConnectivity();
    if (first.isConnected) {
      return first;
    }
    console.warn(
      `Ping got no reply (${first.errorMessage}), checking again in ${retryWait} ms`
    );
    await this.waitAtLeast(retryWait);
    return this.checkConnectivity();
  }

  /**
   * Waits `ms` or longer, never shorter. The window is usually hidden in the
   * tray, where Chromium runs timers late, and a timer firing is no proof of
   * the time gone by: the wait lasts until the monotonic clock shows it all.
   */
  private async waitAtLeast(ms: number): Promise<void> {
    const start = performance.now();
    let left = ms;
    while (left > 0) {
      await new Promise((resolve) => setTimeout(resolve, left));
      left = ms - (performance.now() - start);
    }
  }

  private async savePing(result: PingResult): Promise<void> {
    await this.indexedDBService.savePingResult(result);
    // For the start page's Ping tile, which shows the newest ping: showing
    // the window from the tray doesn't reload it.
    this.sharedService.broadcast('ping:saved');
  }

  private async pingedInLast(period: number): Promise<boolean> {
    const pings = await this.indexedDBService.getPingResults();
    const now = Date.now();
    return pings.some((ping) => {
      const age = now - new Date(ping.timestamp).getTime();
      // A failed ping doesn't count: this one may get a reply. Nor does one
      // dated in the future (the PC's clock went back).
      return ping.isConnected && age >= 0 && age < period;
    });
  }

  async startPeriodicChecks(
    frequency: number,
    callback: (result: PingResult | null) => void
  ) {
    // Clear any existing interval
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }

    this.checkInterval = setInterval(async () => {
      // Check feature flag on each interval
      const featureFlags = await this.settingsService.getFeatureFlags();

      if (!this.storage.get('schoolId')) {
        console.log('No schoolId found, skipping Ping service');
      } else if (!featureFlags?.pingService) {
        console.log('Ping service disabled by feature flags');
      } else {
        const result = await this.performCheck();
        if (result) {
          console.log('Ping result:', result);
          await this.savePing(result);
        } else {
          console.log('Ping skipped: Outside active hours.');
        }
      }
    }, frequency);
  }

  private isWithinActiveHours(): boolean {
    const now = new Date();
    const currentHour = now.getHours();
    return (
      currentHour >= this.activeHours.start &&
      currentHour < this.activeHours.end
    );
  }

  /**
   * Cloudflare's latency check: why it got no reply (null when it got one),
   * and the latency of its replies.
   */
  private async checkFetchAPI(): Promise<{
    failure: PingFailure | null;
    latency: number | null;
  }> {
    try {
      const configOptions = {
        measurements: [{ type: 'latency', numPackets: 10 }],
      };
      // The check reads each reply's timing from the browser's list of
      // request timings. That list holds 250 requests, and the library only
      // empties it after a check that finishes, so once it is full every
      // reply looks like a failure. Start each check with an empty list.
      performance.clearResourceTimings();
      const speedTest = this.createSpeedTest(configOptions);

      return new Promise((resolve) => {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => {
          controller.abort();
          // Otherwise the check keeps running, and this ping now comes just
          // before a speed test.
          speedTest.pause();
          // The 10 requests run one after another, so on a slow link, such as
          // satellite, they take longer than 5 seconds. Any reply means the
          // PC is online, so it counts, with the latency of the replies so far.
          const replies = this.repliesSoFar(speedTest);
          if (replies.count > 0) {
            console.warn(
              `SpeedTest timeout after ${replies.count} replies: connected`
            );
            resolve({ failure: null, latency: replies.latency });
            return;
          }
          console.error('SpeedTest timeout');
          // Ensure the function does not hang indefinitely
          resolve({ failure: 'timeout', latency: null });
        }, 5000);

        speedTest.onFinish = () => {
          clearTimeout(timeoutId);
          // The check also finishes when it gives up because Cloudflare can't
          // be reached (the PC is offline, or a firewall blocks it), so only
          // a reply means the PC is online.
          const replies = this.repliesSoFar(speedTest);
          resolve({
            failure: replies.count > 0 ? null : 'gave_up',
            latency: replies.latency,
          });
        };
      });
    } catch (error) {
      console.error('SpeedTest error:', error);
      return { failure: 'error', latency: null };
    }
  }

  // A method of its own so tests can use a fake.
  protected createSpeedTest(configOptions: any): SpeedTest {
    return new SpeedTest(configOptions);
  }

  private repliesSoFar(speedTest: SpeedTest): {
    count: number;
    latency: number | null;
  } {
    try {
      const count = speedTest.results.getUnloadedLatencyPoints().length;
      // The median, the same as the library's summary.
      const latency = speedTest.results.getUnloadedLatency();
      return { count, latency: latency ? Number(latency.toFixed(2)) : null };
    } catch {
      // Before the first reply the library has no timings to read.
      return { count: 0, latency: null };
    }
  }
}
