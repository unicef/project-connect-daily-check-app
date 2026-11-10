import { Injectable } from '@angular/core';
import ndt7 from '@m-lab/ndt7';
import { environment } from '../../environments/environment';
import { BehaviorSubject, Subject } from 'rxjs';
import { HistoryService } from './history.service';
import { SettingsService } from './settings.service';
import { NetworkService } from './network.service';
import { UploadService } from './upload.service';
import { SharedService } from './shared-service.service';
import { DeviceContextService } from './device-context.service';
import { SentryService } from './sentry.service';
import { PingService } from './ping.service';
import { SyncService } from './sync.service';
import {
  DOWNLOAD_LEG,
  UPLOAD_LEG,
  hasClientResult,
} from '../utils/ndt-results.utils';
import { locateServerTime } from '../utils/mlab-server-time.utils';

@Injectable({
  providedIn: 'root',
})
export class MeasurementClientService {
  public measurementStatus = new Subject<any>();
  public downloadComplete$ = new Subject<any>();
  public uploadComplete$ = new Subject<any>();
  public downloadStarted$ = new Subject<any>();
  public uploadStarted$ = new Subject<any>();

  private TIME_EXPECTED = 10;
  private retryAttempts = 0;
  private maxRetries = 3;
  private readonly measurementNotificationActivity = new BehaviorSubject<any>(
    {}
  ).asObservable();
  private readonly testConfig = {
    userAcceptedDataPolicy: true,
    // Copied from node_modules/@m-lab/ndt7 by the angular.json assets glob
    downloadworkerfile: 'assets/js/ndt/ndt7-download-worker.js',
    uploadworkerfile: 'assets/js/ndt/ndt7-upload-worker.js',
    // Identifies our tests in M-Lab's data. ndt7-js adds its own
    // client_library_name and client_library_version.
    metadata: {
      client_name: 'giga-meter',
      client_version: environment.app_version,
    },
  };

  mlabInformation = {
    city: '',
    url: '',
    ip: [],
    fqdn: '',
    site: '',
    country: '',
    label: '',
    metro: '',
  };

  accessInformation = {
    ip: '',
    city: '',
    region: '',
    country: '',
    label: '',
    metro: '',
    site: '',
    url: '',
    fqdn: '',
    loc: '',
    org: '',
    postal: '',
    timezone: '',
    asn: '',
  };

  resultData = {
    testStatus: {},
    passedResults: {},
  };

  progress = 0;

  private dataUsage = {
    download: 0,
    upload: 0,
    total: 0,
  };

  constructor(
    private historyService: HistoryService,
    private settingsService: SettingsService,
    private networkService: NetworkService,
    private uploadService: UploadService,
    private sharedService: SharedService,
    private deviceContext: DeviceContextService,
    private sentryService: SentryService,
    private pingService: PingService,
    private syncService: SyncService
  ) {}

  /**
   * Runs one speed test. Resolves once the result is saved. Rejects when the
   * test fails (after the retries for an unreachable locate server), so the
   * scheduler can try again later in the window; the 'error' status has
   * already told the test page by then.
   *
   * Every test also gets a ping just before it, sent once the test is over.
   */
  async runTest(
    notes = 'manual',
    scheduleContext: { slot: string | null; scheduledAt: number | null } = null
  ): Promise<void> {
    // Before the test, not alongside it, so neither slows the other down.
    await this.pingService.pingBeforeSpeedTest();
    console.log('Starting ndt7 test', ndt7);
    this.retryAttempts = 0;
    try {
      await this.runTestWithRetry(notes, scheduleContext);
    } finally {
      // Pings are otherwise only sent every 2 hours the app stays open, so a
      // PC that is on for a few minutes would never send them.
      this.syncService
        .syncPingResults()
        .catch((error) => console.error('Sending pings failed:', error));
    }
  }

  private async runTestWithRetry(
    notes = 'manual',
    scheduleContext: { slot: string | null; scheduledAt: number | null } = null
  ): Promise<void> {
    this.broadcastMeasurementStatus('onstart', {});
    const measurementRecord = this.initializeMeasurementRecord(
      notes,
      scheduleContext
    );

    // Get Windows username, installed path, and WiFi connections
    const windowsUsername = await this.getWindowsUsername();
    const installedPath = await this.getInstalledPath();
    const wifiInfo = await this.getWifiInfo();
    measurementRecord.windowsUsername = windowsUsername;
    measurementRecord.installedPath = installedPath;
    measurementRecord.wifiConnections = wifiInfo?.wifiConnections ?? null;

    // Network/device context. Captured before the test so
    // the readings describe the machine as the test found it, and awaited
    // together because they are independent I/O — serialising them is what would
    // push the capture past the 1.5 s budget the plan set.
    const [deviceIdentity, deviceContext] = await Promise.all([
      this.deviceContext.getDeviceIdentity(),
      this.deviceContext.getDeviceContext(),
    ]);
    measurementRecord.deviceIdentity = deviceIdentity;
    measurementRecord.deviceContext = deviceContext;
    // Derived from the Wi-Fi read that already happened above, so the expensive
    // wifiConnections() call is not repeated.
    measurementRecord.wifiDiagnostics =
      this.deviceContext.extractWifiDiagnostics(wifiInfo);

    try {
      measurementRecord.accessInformation =
        await this.networkService.getNetInfo();

      const exitCode = await ndt7.test(
        this.testConfig,
        this.getTestCallbacks(measurementRecord)
      );
      console.log('ndt7 test completed with exit code:', exitCode);

      await this.finalizeMeasurement(measurementRecord);
    } catch (error) {
      console.error('Error running ndt7 test:', error);
      const message = error instanceof Error ? error.message : String(error);

      // Check if this is a locate server error and we can retry
      const isLocateServerError =
        message.includes('locate.measurementlab.net') ||
        message.includes('Could not understand response') ||
        message.includes('fetch');

      if (isLocateServerError && this.retryAttempts < this.maxRetries) {
        this.retryAttempts++;
        console.log(
          `Retrying test due to locate server error. Attempt ${this.retryAttempts}/${this.maxRetries}`
        );

        this.broadcastMeasurementStatus('retrying', {
          attempt: this.retryAttempts,
          maxRetries: this.maxRetries,
          message: `Retrying test... (${this.retryAttempts}/${this.maxRetries})`,
        });

        // Wait a bit before retrying
        await new Promise((resolve) => setTimeout(resolve, 2000));
        return this.runTestWithRetry(notes, scheduleContext);
      } else {
        // 'error' is the status the test page resets itself on.
        this.broadcastMeasurementStatus('error', {
          error: message,
          errorType: 'test_error',
          originalError: message,
        });
        // Without this the scheduler counts the failed test as done and
        // never retries it.
        throw error;
      }
    }
  }

  private initializeMeasurementRecord(
    notes: string,
    scheduleContext: { slot: string | null; scheduledAt: number | null } = null
  ) {
    return {
      timestamp: Date.now(),
      results: {},
      snapLog: { s2cRate: [], c2sRate: [] },
      uploaded: false,
      mlabInformation: this.mlabInformation,
      accessInformation: this.accessInformation,
      uuid: '',
      version: 0,
      Notes: notes,
      dataUsage: this.dataUsage,
      windowsUsername: '',
      installedPath: '',
      wifiConnections: null,
      deviceIdentity: null,
      deviceContext: null,
      wifiDiagnostics: null,
      scheduledSlot: scheduleContext?.slot ?? null,
      scheduledAt: scheduleContext?.scheduledAt ?? null,
      // M-Lab's clock, set by onServerChosen from the locate response. Stays
      // null when the response carries no readable token.
      serverTimestamp: null,
    };
  }

  private getTestCallbacks(measurementRecord: any) {
    return {
      serverDiscovery: this.onServerDiscovery,
      serverChosen: (server) => this.onServerChosen(server, measurementRecord),
      downloadMeasurement: (data) =>
        this.onDownloadMeasurement(data, measurementRecord),
      downloadComplete: this.settleSafely('downloadComplete', (data) =>
        this.onDownloadComplete(data, measurementRecord)
      ),
      uploadMeasurement: (data) =>
        this.onUploadMeasurement(data, measurementRecord),
      uploadComplete: this.settleSafely('uploadComplete', (data) =>
        this.onUploadComplete(data, measurementRecord)
      ),
      error: this.onError,
    };
  }

  /**
   * ndt7 calls the complete callbacks while it settles the test. If one
   * throws, the library never resolves the test and the app waits for ever.
   * The callbacks already cope with a missing server measurement, so this only
   * catches the unexpected: the error is reported to Sentry and logged, and the
   * test carries on with whatever that leg recorded.
   */
  private settleSafely(name: string, callback: (data: any) => void) {
    return (data: any): void => {
      try {
        callback(data);
      } catch (error) {
        console.error(`[ndt7] ${name} callback failed:`, error);
        this.sentryService.captureException(error, { ndt7Callback: name });
      }
    };
  }

  private onServerDiscovery = (data: { loadbalancer: URL }): void => {
    console.log('Server: Discovering servers from:', data.loadbalancer.toString());
    console.log('Server: Full loadbalancer data:', data);
    this.broadcastMeasurementStatus('server_discovery', {
      loadbalancer: data.loadbalancer.toString(),
      message: 'Discovering test servers...',
    });
  };

  private onServerChosen(
    server: any,
    measurementRecord: any
  ): void {
    console.log('Server chosen:', server);
    const serverInformation = {
      city: server?.location?.city,
    url: server?.machine,
    ip: [],
    fqdn: '',
    site: '',
    country: server?.location?.country,
    label: '',
    metro: '',
    }
    measurementRecord.mlabInformation = serverInformation;
    // `timestamp` comes from Date.now(), so it is only as good as the clock of
    // the machine running the test. This is M-Lab's, for the backend to tell
    // the two apart.
    measurementRecord.serverTimestamp = locateServerTime(server);
    console.log('Normalized server information:', serverInformation);
    this.broadcastMeasurementStatus('server_chosen', {
      server: server,
      message: 'Server selected, preparing test...',
    });
  };

  private onDownloadMeasurement = (data: any, measurementRecord: any): void => {
    if (data.Source === 'client') {
      console.log(`Download: ${data.Data.MeanClientMbps.toFixed(2)} Mb/s`);
      measurementRecord.snapLog.s2cRate.push(data.Data.MeanClientMbps);
      this.downloadStarted$.next(data);
      this.updateProgress('interval_s2c', data, data.Data.ElapsedTime);
    }
  };

  private onDownloadComplete = (data: any, measurementRecord: any): void => {
    // LastServerMeasurement is undefined when the server sent nothing before
    // ndt7's time limit (slow or filtered links): 10 s to connect, then 12 s
    // for the test. The download speed is measured on the client, so the leg
    // is still usable without it.
    const server = data?.LastServerMeasurement;
    const client = data?.LastClientMeasurement;
    if (!server) {
      console.warn(
        'Download finished without a server measurement; keeping the client-side result'
      );
    }
    const bw = server?.BBRInfo?.BW;
    const serverBw = typeof bw === 'number' ? (bw * 8) / 1000000 : 'n/a';
    console.log(`Download test is complete:
    Instantaneous server bottleneck bandwidth estimate: ${serverBw} Mbps
    Mean client goodput: ${client?.MeanClientMbps ?? 'n/a'} Mbps`);
    measurementRecord.results[DOWNLOAD_LEG] = data;
    this.downloadComplete$.next(data); // Emit event
    this.updateProgress(
      'finished_s2c',
      data,
      client?.ElapsedTime ?? this.TIME_EXPECTED
    );
  };

  private onUploadMeasurement = (data: any, measurementRecord: any): void => {
    if (data.Source === 'server') {
      const elapsed = data.Data.TCPInfo.ElapsedTime;
      const uploadSpeed = (
        (data.Data.TCPInfo.BytesReceived / data.Data.TCPInfo.ElapsedTime) *
        8
      ).toFixed(2);
      console.log(`Upload: ${uploadSpeed} Mb/s`);
      this.uploadStarted$.next(data);
      measurementRecord.snapLog.c2sRate.push(Number(uploadSpeed));
      this.updateProgress('interval_c2s', data, elapsed / 1000000);
    }
  };

  private onUploadComplete = (data: any, measurementRecord: any): void => {
    // Same as the download leg: fall back to the client's own figures when the
    // server sent no measurement before the timeout.
    const tcpInfo = data?.LastServerMeasurement?.TCPInfo;
    const client = data?.LastClientMeasurement;
    if (!tcpInfo) {
      console.warn(
        'Upload finished without a server measurement; keeping the client-side result'
      );
    }
    // TCPInfo.ElapsedTime is in microseconds, the client's ElapsedTime in seconds.
    const hasServerTiming = tcpInfo?.ElapsedTime > 0;
    const elapsedSeconds = hasServerTiming
      ? tcpInfo.ElapsedTime / 1000000
      : client?.ElapsedTime ?? this.TIME_EXPECTED;
    const throughput = hasServerTiming
      ? (tcpInfo.BytesReceived * 8) / tcpInfo.ElapsedTime
      : client?.MeanClientMbps;
    console.log(`Upload test completed in ${elapsedSeconds.toFixed(2)}s
      Mean ${hasServerTiming ? 'server' : 'client'} throughput: ${throughput ?? 'n/a'} Mbps`);
    measurementRecord.results[UPLOAD_LEG] = data;
    this.uploadComplete$.next(data); // Emit event
    this.updateProgress('finished_c2s', data, elapsedSeconds);
  };

  private onError = (err: Error | string): void => {
    // ndt7 passes worker errors through as plain strings.
    const message = err instanceof Error ? err.message : String(err);
    console.error('Error while running the test:', message);

    // Check if this is a locate server error
    const isLocateServerError =
      message.includes('locate.measurementlab.net') ||
      message.includes('Could not understand response') ||
      message.includes('fetch');

    const errorType = isLocateServerError
      ? 'locate_server_error'
      : 'test_error';
    const errorMessage = isLocateServerError
      ? 'Failed to discover test servers. Please check your internet connection and try again.'
      : message;

    this.broadcastMeasurementStatus('error', {
      error: errorMessage,
      errorType: errorType,
      originalError: message,
    });
  };

  private updateProgress(
    testStatus: string,
    passedResults: any,
    elapsedTime: number
  ): void {
    this.progress =
      elapsedTime > this.TIME_EXPECTED * 2
        ? 1.0
        : elapsedTime / (this.TIME_EXPECTED * 2) + 0.5;
    this.broadcastMeasurementStatus(testStatus, {
      passedResults,
      running: true,
      progress: this.progress,
    });
  }

  private async finalizeMeasurement(measurementRecord: any): Promise<void> {
    // A leg without a server measurement is still saved from its client-side
    // speed. A leg without any result (it never completed, or produced no
    // client measurement) makes the whole test a failure: report it instead
    // of saving a record with no speed in it.
    const missingLegs = [
      [DOWNLOAD_LEG, 'download'],
      [UPLOAD_LEG, 'upload'],
    ]
      .filter(([leg]) => !hasClientResult(measurementRecord.results[leg]))
      .map(([, name]) => name);
    if (missingLegs.length) {
      throw new Error(
        `The ${missingLegs.join(' and ')} test did not produce a result`
      );
    }

    measurementRecord.uuid =
      measurementRecord.results[DOWNLOAD_LEG].LastServerMeasurement
        ?.ConnectionInfo?.UUID || '';
    measurementRecord.version = 1;

    const dataUsage = this.calculateDataUsage(measurementRecord.results);
    measurementRecord.dataUsage = dataUsage;

    if (this.settingsService.get('uploadEnabled')) {
      try {
        // Try to upload first before saving to localStorage
        await this.uploadService
          .uploadMeasurement(measurementRecord)
          .toPromise();
        measurementRecord.uploaded = true;
        measurementRecord.synced = true;
      } catch (error) {
        console.error('Upload failed:', error);
        measurementRecord.uploaded = false;
        measurementRecord.synced = false;
      }
    } else {
      // If upload is disabled, mark as not uploaded
      measurementRecord.uploaded = false;
      measurementRecord.synced = false;
    }

    // Now save to localStorage with the correct uploaded status
    this.historyService.add(measurementRecord);
    this.sharedService.broadcast(
      'history:measurement:change',
      'history:measurement:change'
    );

    this.broadcastMeasurementStatus('complete', {
      passedResults: measurementRecord.results,
      running: false,
      progress: 1,
    });
  }

  private calculateDataUsage(passedResults: any): {
    download: number;
    upload: number;
    total: number;
  } {
    // Counted per leg, so a leg without a server measurement adds 0 instead
    // of turning the sum into NaN.
    const tcpCounter = (leg: string, field: string): number =>
      Number(passedResults[leg]?.LastServerMeasurement?.TCPInfo?.[field]) || 0;
    const bytesSent =
      tcpCounter(DOWNLOAD_LEG, 'BytesAcked') +
      tcpCounter(UPLOAD_LEG, 'BytesAcked');
    const bytesReceived =
      tcpCounter(DOWNLOAD_LEG, 'BytesReceived') +
      tcpCounter(UPLOAD_LEG, 'BytesReceived');

    const totalBytes = bytesSent + bytesReceived;

    this.dataUsage.total += totalBytes;
    this.dataUsage.download += bytesReceived;
    this.dataUsage.upload += bytesSent;

    const totalMB = this.dataUsage.total / (1024 * 1024);
    console.log(
      `Current Test Data Usage: ${totalBytes} bytes - ${(
        totalBytes /
        (1024 * 1024)
      ).toFixed(2)} MB`
    );

    return this.dataUsage;
  }

  private broadcastMeasurementStatus(
    testStatus: string,
    additionalData: any
  ): void {
    this.sharedService.broadcast('measurement:status', 'measurement:status', {
      testStatus,
      ...additionalData,
    });
    this.measurementStatus.next({
      testStatus,
      ...additionalData,
    });
  }

  /**
   * Get Windows username from Electron process
   * @returns Windows username string or fallback value
   */
  private async getWindowsUsername(): Promise<string> {
    try {
      // Check if running in Electron
      if (window && (window as any).electronAPI) {
        console.log('📡 [Windows Username] Requesting Windows username...');
        const usernameInfo = await (
          window as any
        ).electronAPI.getWindowsUsername();

        if (usernameInfo && usernameInfo.username) {
          console.log(
            '✅ [Windows Username] Retrieved username:',
            usernameInfo.username
          );
          return usernameInfo.username;
        } else if (usernameInfo && usernameInfo.error) {
          console.error(
            '❌ [Windows Username] Error retrieving username:',
            usernameInfo.error
          );
          return 'Error';
        }
      } else {
        console.log(
          '⚠️ [Windows Username] Not running in Electron, username not available'
        );
        return 'N/A';
      }
    } catch (error) {
      console.error(
        '❌ [Windows Username] Exception while retrieving username:',
        error
      );
      return 'Error';
    }

    return 'Unknown';
  }

  /**
   * Get application installed path from Electron process
   * @returns Installed path string or fallback value
   */
  private async getInstalledPath(): Promise<string> {
    try {
      // Check if running in Electron
      if (window && (window as any).electronAPI) {
        console.log('📡 [Installed Path] Requesting installed path...');
        const pathInfo = await (window as any).electronAPI.getInstalledPath();

        if (pathInfo && pathInfo.installedPath) {
          console.log(
            '✅ [Installed Path] Retrieved path:',
            pathInfo.installedPath
          );
          return pathInfo.installedPath;
        } else if (pathInfo && pathInfo.error) {
          console.error(
            '❌ [Installed Path] Error retrieving path:',
            pathInfo.error
          );
          return 'Error';
        }
      } else {
        console.log(
          '⚠️ [Installed Path] Not running in Electron, path not available'
        );
        return 'N/A';
      }
    } catch (error) {
      console.error(
        '❌ [Installed Path] Exception while retrieving path:',
        error
      );
      return 'Error';
    }

    return 'Unknown';
  }

  /**
   * Get the full WiFi read from the Electron process.
   *
   * Returns the whole response rather than just the connections array: when the
   * array comes back empty the main process also says why (`wifiUnavailableReason`)
   * and may have recovered the SSID through the NLM fallback, and that diagnosis
   * is uploaded with the measurement.
   *
   * @returns the IPC response, or null when it is unavailable
   */
  private async getWifiInfo(): Promise<any> {
    try {
      // Check if running in Electron
      if (window && (window as any).electronAPI) {
        console.log('📡 [WiFi Connections] Requesting WiFi connections...');
        const wifiInfo = await (window as any).electronAPI.getWifiConnections();

        if (wifiInfo && wifiInfo.error) {
          console.error(
            '❌ [WiFi Connections] Error retrieving connections:',
            wifiInfo.error
          );
          return null;
        }

        if (wifiInfo) {
          console.log(
            '✅ [WiFi Connections] Retrieved connections:',
            wifiInfo.wifiConnections
          );
          return wifiInfo;
        }
      } else {
        console.log(
          '⚠️ [WiFi Connections] Not running in Electron, connections not available'
        );
        return null;
      }
    } catch (error) {
      console.error(
        '❌ [WiFi Connections] Exception while retrieving connections:',
        error
      );
      return null;
    }

    return null;
  }
}
