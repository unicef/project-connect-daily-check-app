import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Device } from '@capacitor/device';
import { v4 as uuidv4 } from 'uuid';
import { IndexedDBService } from './indexed-db.service';
import { StorageService } from './storage.service';
import { SettingsService } from './settings.service';
import { IdentityService } from './identity.service';
import SpeedTest from '@cloudflare/speedtest';

export interface PingResult {
  timestamp: Date;
  isConnected: boolean;
  errorMessage: string | null;
  app_local_uuid: string;
  latency?: number | null;
}

@Injectable({
  providedIn: 'root',
})
export class PingService {
  private activeHours = { start: 8, end: 20 }; // Active hours: 8 AM to 8 PM
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
    private storage: StorageService,
    private identityService: IdentityService
  ) {}
  async checkConnectivity(): Promise<PingResult> {
    let isConnected = false;
    let errorMessage = null;
    let uniqueId = uuidv4();

    try {
      isConnected = await this.checkNavigatorOnline();

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
      app_local_uuid: uniqueId,
      latency: this.latency,
    };
  }

  async performCheck(): Promise<PingResult | null> {
    if (!this.isWithinActiveHours()) {
      console.log('Skipping check: Outside active hours.');
      return null;
    }

    return await this.checkConnectivity();
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

      if (!this.identityService.isRegistered()) {
        console.log('No registration found, skipping Ping service');
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
      const speedTest = new SpeedTest(configOptions as any);

      return new Promise((resolve) => {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => {
          controller.abort();
          console.error('SpeedTest timeout');
          resolve(false); // Ensure the function does not hang indefinitely
        }, 5000);

        speedTest.onFinish = (results) => {
          // console.log('SpeedTest Summary:', results.getSummary().latency);
          const summary = results?.getSummary();
          this.latency = summary?.latency
            ? Number(summary.latency.toFixed(2))
            : null;
          clearTimeout(timeoutId);
          resolve(true);
        };
      });
    } catch (error) {
      console.error('SpeedTest error:', error);
      return false;
    }
  }
}
