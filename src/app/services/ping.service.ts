import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Device } from '@capacitor/device';
import { v4 as uuidv4 } from 'uuid';
import { IndexedDBService } from './indexed-db.service';
import { StorageService } from './storage.service';
import { SettingsService } from './settings.service';
import SpeedTest from '@cloudflare/speedtest';

export interface PingResult {
  timestamp: Date;
  isConnected: boolean;
  errorMessage: string | null;
  browserId: string;
  app_local_uuid: string;
  latency?: number | null;
}

@Injectable({
  providedIn: 'root',
})
export class PingService {
  private activeHours = { start: 8, end: 20 }; // Active hours: 8 AM to 8 PM
  // Same as the regular ping interval.
  private readonly SPEED_TEST_PING_GAP = 15 * 60 * 1000;
  private isElectron: boolean;
  private dns: any;
  private net: any;
  private checkInterval: any;
  private latency: any;
  private connectivityChecks = {
    dns: ['8.8.8.8', '1.1.1.1'],
    hosts: ['google.com', 'cloudflare.com', 'microsoft.com'],
    ports: [53, 443],
  };

  constructor(
    private http: HttpClient,
    private indexedDBService: IndexedDBService,
    private settingsService: SettingsService,
    private storage: StorageService
  ) {}
  async checkConnectivity(): Promise<PingResult> {
    let isConnected = false;
    let errorMessage = null;
    let browserId;
    let uniqueId = uuidv4();

    try {
      isConnected = await this.checkNavigatorOnline();
      const deviceInfo = await this.getBrowserId();
      browserId = deviceInfo.uuid;

      if (this.isElectron) {
        const dnsChecks = await Promise.all(
          this.connectivityChecks.dns.map((ip) => this.checkDNSResolution(ip))
        );
        if (!dnsChecks.some((result) => result)) {
          throw new Error('DNS resolution failed');
        }

        const connectionChecks = await Promise.all(
          this.connectivityChecks.hosts.reduce(
            (acc, host) => [
              ...acc,
              ...this.connectivityChecks.ports.map((port) =>
                this.checkTCPConnection(host, port)
              ),
            ],
            []
          )
        );

        isConnected = connectionChecks.some((result) => result);
      } else {
        isConnected = await this.checkFetchAPI();
      }
    } catch (error) {
      isConnected = false;
      errorMessage = error.message;
    }

    return {
      timestamp: new Date(),
      isConnected,
      errorMessage,
      browserId,
      app_local_uuid: uniqueId,
      latency: this.latency,
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

    return await this.checkConnectivity();
  }

  /**
   * Saves a ping just before a speed test, so a PC that is only on for a few
   * minutes still has one for that day. It runs at any hour, because the
   * test does, and is skipped when there was a ping in the last 15 minutes,
   * so a test that is retried doesn't add a ping for every try.
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
      const result = await this.checkConnectivity();
      console.log('Ping before speed test:', result);
      await this.indexedDBService.savePingResult(result);
    } catch (error) {
      console.error('Ping before speed test failed:', error);
    }
  }

  private async pingedInLast(period: number): Promise<boolean> {
    const pings = await this.indexedDBService.getPingResults();
    const now = Date.now();
    return pings.some((ping) => {
      const age = now - new Date(ping.timestamp).getTime();
      // A ping dated in the future (the PC's clock went back) doesn't count.
      return age >= 0 && age < period;
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
          this.indexedDBService.savePingResult(result);
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

  private async checkNavigatorOnline(): Promise<boolean> {
    return navigator.onLine;
  }

  private async checkDNSResolution(host: string): Promise<boolean> {
    return new Promise((resolve) => {
      this.dns.lookup(host, (err: any) => resolve(!err));
    });
  }

  private async checkTCPConnection(
    host: string,
    port: number
  ): Promise<boolean> {
    return new Promise((resolve) => {
      const socket = new this.net.Socket();
      socket.setTimeout(5000);

      socket.on('connect', () => {
        socket.destroy();
        resolve(true);
      });

      socket.on('timeout', () => {
        socket.destroy();
        resolve(false);
      });

      socket.on('error', () => {
        socket.destroy();
        resolve(false);
      });

      socket.connect(port, host);
    });
  }

  private async checkFetchAPI(): Promise<boolean> {
    try {
      this.latency = null;

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
            this.latency = replies.latency;
            console.warn(
              `SpeedTest timeout after ${replies.count} replies: connected`
            );
            resolve(true);
            return;
          }
          console.error('SpeedTest timeout');
          resolve(false); // Ensure the function does not hang indefinitely
        }, 5000);

        speedTest.onFinish = () => {
          clearTimeout(timeoutId);
          // The check also finishes when it gives up because Cloudflare can't
          // be reached (the PC is offline, or a firewall blocks it), so only
          // a reply means the PC is online.
          const replies = this.repliesSoFar(speedTest);
          this.latency = replies.latency;
          resolve(replies.count > 0);
        };
      });
    } catch (error) {
      console.error('SpeedTest error:', error);
      return false;
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
