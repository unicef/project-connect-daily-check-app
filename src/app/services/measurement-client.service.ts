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
import {
  LocateAccess,
  lookupPriorityServer,
  readLocateParams,
} from '../utils/locate.utils';
import { withTimeout } from '../utils/with-timeout.utils';
import { LocateAccessService } from './locate-access.service';
import { PosthogService } from './posthog.service';
import {
  AnalyticsEvent,
  classifyMeasurementError,
  sanitizeMessage,
} from '../analytics/analytics-events';

/** Where a speed test is, for the failure event: what it was doing when it failed. */
type MeasurementPhase =
  | 'ping'
  | 'prep'
  | 'net_info'
  | 'locate'
  | 'download'
  | 'upload'
  | 'finalize';

/**
 * Analytics bookkeeping for one runTest(), retries included. Kept apart from
 * the measurement record, which is uploaded as it is.
 */
interface MeasurementRun {
  trigger: string;
  slot: string | null;
  startedAt: number;
  phase: MeasurementPhase;
  pingMs: number | null;
  prepMs: number | null;
  testStartedAt: number | null;
  /** The last error ndt7 reported through its error callback. */
  ndtError: string | null;
  wifiStatus: string | null;
  ssidSource: string | null;
  deviceIdentityRead: boolean | null;
  deviceContextRead: boolean | null;
}

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
  // The test in progress, so a second request joins it instead of running
  // another test at the same time (see runTest).
  private runningTest: { promise: Promise<void>; startedAt: number } | null =
    null;
  // A test still running after this long is taken as stuck, and another one
  // may start. Every step of a test has a time limit except the Wi-Fi reads,
  // so a healthy test, retries included, ends well before this.
  private readonly stuckTestMs = 10 * 60 * 1000;
  // How long a test waits for the device identity and context before it runs
  // without them. They are diagnostics, and the Windows queries behind them
  // have no time limit of their own.
  private readonly deviceReadsTimeoutMs = 10 * 1000;
  // How long M-Lab's priority server lookup gets before the test uses the
  // public lookup instead. The public one normally answers in under a second.
  private readonly priorityLookupTimeoutMs = 5 * 1000;
  // How long the public server lookup gets. ndt7 starts its download's 10 s
  // connection timer when the test starts, before it knows the server, so a
  // lookup slower than this ends the test with no download result anyway.
  private readonly serverLookupTimeoutMs = 10 * 1000;
  private readonly measurementNotificationActivity = new BehaviorSubject<any>(
    {}
  ).asObservable();
  private readonly testConfig = {
    userAcceptedDataPolicy: true,
    // Our wrappers (src/assets/js/ndt) around the library's workers, which
    // angular.json copies next to them: they end a leg at once when the
    // server lookup found no server, where the library's worker throws.
    downloadworkerfile: 'assets/js/ndt/giga-ndt7-download-worker.js',
    uploadworkerfile: 'assets/js/ndt/giga-ndt7-upload-worker.js',
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
    metroRank: null,
    locateVersion: null,
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

  /** The test in progress, for its analytics events. */
  private run: MeasurementRun | null = null;

  constructor(
    private historyService: HistoryService,
    private settingsService: SettingsService,
    private networkService: NetworkService,
    private uploadService: UploadService,
    private sharedService: SharedService,
    private deviceContext: DeviceContextService,
    private sentryService: SentryService,
    private pingService: PingService,
    private syncService: SyncService,
    private locateAccess: LocateAccessService,
    // Optional so the specs that build this service by hand keep working.
    private posthog?: PosthogService
  ) {}

  /**
   * Runs one speed test. Resolves once the result is saved. Rejects when the
   * test fails (after the retries for an unreachable locate server), so the
   * scheduler can try again later in the window; the 'error' status has
   * already told the test page by then.
   *
   * Every test also gets a ping just before it, sent once the test is over.
   *
   * One test at a time: while a test runs, another call gets that test's
   * promise instead of starting a second one, which would share the line with
   * it and lower both results.
   */
  runTest(
    notes = 'manual',
    scheduleContext: { slot: string | null; scheduledAt: number | null } = null
  ): Promise<void> {
    if (this.isTestRunning) {
      console.log('A test is already running; waiting for it instead.');
      return this.runningTest.promise;
    }
    const running = {
      promise: this.runOneTest(notes, scheduleContext),
      startedAt: Date.now(),
    };
    this.runningTest = running;
    const clear = () => {
      if (this.runningTest === running) {
        this.runningTest = null;
      }
    };
    running.promise.then(clear, clear);
    return running.promise;
  }

  /** Whether a test is running (one running longer than stuckTestMs isn't counted). */
  get isTestRunning(): boolean {
    return (
      !!this.runningTest &&
      Date.now() - this.runningTest.startedAt < this.stuckTestMs
    );
  }

  private async runOneTest(
    notes: string,
    scheduleContext: { slot: string | null; scheduledAt: number | null }
  ): Promise<void> {
    const startedAt = Date.now();
    this.run = {
      trigger: notes,
      slot: scheduleContext?.slot ?? null,
      startedAt,
      phase: 'ping',
      pingMs: null,
      prepMs: null,
      testStartedAt: null,
      ndtError: null,
      wifiStatus: null,
      ssidSource: null,
      deviceIdentityRead: null,
      deviceContextRead: null,
    };
    // trigger: first | manual | startup | daily; slot: the scheduled window.
    this.posthog?.capture(AnalyticsEvent.MeasurementStarted, {
      trigger: notes,
      slot: this.run.slot,
    });
    // Before the test, not alongside it, so neither slows the other down.
    await this.pingService.pingBeforeSpeedTest();
    this.run.pingMs = Date.now() - startedAt;
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
    const prepStartedAt = Date.now();
    this.setPhase('prep');

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
    // A read still running after deviceReadsTimeoutMs is sent as null. It
    // carries on in the background, and what it remembers is there for the
    // next test.
    const [deviceIdentity, deviceContext] = await Promise.all([
      this.readInTime('device identity', this.deviceContext.getDeviceIdentity()),
      this.readInTime('device context', this.deviceContext.getDeviceContext()),
    ]);
    measurementRecord.deviceIdentity = deviceIdentity;
    measurementRecord.deviceContext = deviceContext;
    // Derived from the Wi-Fi read that already happened above, so the expensive
    // wifiConnections() call is not repeated.
    measurementRecord.wifiDiagnostics =
      this.deviceContext.extractWifiDiagnostics(wifiInfo);
    this.recordPrep(prepStartedAt, wifiInfo, deviceIdentity, deviceContext);

    try {
      this.setPhase('net_info');
      measurementRecord.accessInformation =
        await this.networkService.getNetInfo();

      this.setPhase('locate');
      if (this.run) {
        this.run.testStartedAt = Date.now();
      }
      const exitCode = await this.runNdt7(measurementRecord);
      console.log('ndt7 test completed with exit code:', exitCode);

      this.setPhase('finalize');
      await this.finalizeMeasurement(measurementRecord);
      this.captureCompleted(measurementRecord);
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
        this.posthog?.capture(AnalyticsEvent.MeasurementRetrying, {
          trigger: notes,
          slot: this.run?.slot ?? null,
          attempt: this.retryAttempts,
          phase: this.run?.phase ?? null,
          error_code: classifyMeasurementError(message),
          error_message: sanitizeMessage(message),
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
        this.captureFailed(notes, message);
        // Without this the scheduler counts the failed test as done and
        // never retries it.
        throw error;
      }
    }
  }

  /**
   * Runs the download and upload test. With access from our backend, the
   * server comes from M-Lab's priority lookup. Without it, or when that lookup
   * fails in any way (bad token, rate limit, timeout), ndt7-js finds the server
   * through the public lookup as it did before, with a time limit (see
   * runNdt7WithPublicLookup). The record keeps which lookup was used, and why
   * the priority one was not.
   */
  private async runNdt7(measurementRecord: any): Promise<number> {
    const callbacks = this.getTestCallbacks(measurementRecord);
    measurementRecord.locateTier = 'public';

    // Asked for here, right before the lookup, and not earlier: M-Lab's token
    // is only good for 20 seconds after our backend gets it. Never rejects;
    // null means the public lookup.
    const access: LocateAccess | null = await this.locateAccess.get();

    let priority: Awaited<ReturnType<typeof lookupPriorityServer>> | null =
      null;
    if (access) {
      try {
        priority = await lookupPriorityServer(
          access,
          this.testConfig.metadata,
          this.priorityLookupTimeoutMs,
          (loadbalancer) => callbacks.serverDiscovery({ loadbalancer })
        );
      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        measurementRecord.priorityLocateError = reason;
        console.warn(
          `Priority server lookup failed (${reason}); using the public one`
        );
      }
    }
    if (!priority) {
      return this.runNdt7WithPublicLookup(callbacks);
    }

    // What ndt7.test does after its own lookup.
    callbacks.serverChosen(priority.server);
    measurementRecord.locateTier = 'priority';
    const urls = Promise.resolve(priority.urls);
    const download = await ndt7.downloadTest(this.testConfig, callbacks, urls);
    const upload = await ndt7.uploadTest(this.testConfig, callbacks, urls);
    return download + upload;
  }

  private setPhase(phase: MeasurementPhase): void {
    if (this.run) {
      this.run.phase = phase;
    }
  }

  /** What the reads before the test found, and how long they took. */
  private recordPrep(
    prepStartedAt: number,
    wifiInfo: any,
    deviceIdentity: unknown,
    deviceContext: unknown
  ): void {
    if (!this.run) {
      return;
    }
    this.run.prepMs = Date.now() - prepStartedAt;
    this.run.wifiStatus = !wifiInfo
      ? 'unavailable'
      : Array.isArray(wifiInfo.wifiConnections) &&
        wifiInfo.wifiConnections.length > 0
      ? 'ok'
      : wifiInfo.wifiUnavailableReason ?? 'empty';
    this.run.ssidSource = wifiInfo?.ssidSource ?? null;
    this.run.deviceIdentityRead = deviceIdentity !== null;
    this.run.deviceContextRead = deviceContext !== null;
  }

  /** The properties both the completed and the failed event carry. */
  private runProperties(): Record<string, any> {
    const run = this.run;
    const now = Date.now();
    return {
      trigger: run?.trigger ?? null,
      slot: run?.slot ?? null,
      attempt: this.retryAttempts,
      duration_ms: run ? now - run.startedAt : null,
      ping_ms: run?.pingMs ?? null,
      prep_ms: run?.prepMs ?? null,
      test_ms: run?.testStartedAt ? now - run.testStartedAt : null,
      wifi_status: run?.wifiStatus ?? null,
      ssid_source: run?.ssidSource ?? null,
      device_identity_read: run?.deviceIdentityRead ?? null,
      device_context_read: run?.deviceContextRead ?? null,
    };
  }

  /**
   * The test finished and was saved. No speed figures: the measurements table
   * has those. What matters here is whether each step worked.
   */
  private captureCompleted(measurementRecord: any): void {
    try {
      const results = measurementRecord?.results ?? {};
      this.posthog?.capture(AnalyticsEvent.MeasurementCompleted, {
        ...this.runProperties(),
        uploaded: measurementRecord?.uploaded === true,
        upload_enabled: !!this.settingsService.get('uploadEnabled'),
        server_country: measurementRecord?.mlabInformation?.country ?? null,
        metro_rank: measurementRecord?.mlabInformation?.metroRank ?? null,
        locate_version:
          measurementRecord?.mlabInformation?.locateVersion ?? null,
        // priority: M-Lab's priority lookup with our backend's token; public:
        // the fallback, with why the priority one failed when it was tried.
        locate_tier: measurementRecord?.locateTier ?? null,
        priority_locate_error: sanitizeMessage(
          measurementRecord?.priorityLocateError
        ),
        // False when the leg ended without a server measurement (slow or
        // filtered links): the speed is then the client's own figure.
        download_server_measurement:
          !!results[DOWNLOAD_LEG]?.LastServerMeasurement,
        upload_server_measurement: !!results[UPLOAD_LEG]?.LastServerMeasurement,
      });
    } catch (error) {
      console.warn('[Analytics] measurement_completed failed:', error);
    }
  }

  /** The test failed for good (after any retries). */
  private captureFailed(notes: string, message: string): void {
    try {
      this.posthog?.capture(AnalyticsEvent.MeasurementFailed, {
        ...this.runProperties(),
        trigger: notes,
        phase: this.run?.phase ?? null,
        error_code: classifyMeasurementError(message),
        error_message: sanitizeMessage(message),
        ndt_error: this.run?.ndtError ?? null,
        http_status: null,
        endpoint: null,
      });
    } catch (error) {
      console.warn('[Analytics] measurement_failed failed:', error);
    }
  }

  /** `read`'s value, or null when it hasn't come back in deviceReadsTimeoutMs. */
  private async readInTime<T>(name: string, read: Promise<T>): Promise<T | null> {
    const timedOut = Symbol('timed out');
    const result = await withTimeout(this.deviceReadsTimeoutMs, read, timedOut);
    if (result === timedOut) {
      console.warn(
        `${name} not read within ${this.deviceReadsTimeoutMs} ms; testing without it`
      );
      return null;
    }
    return result as T;
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
      // M-Lab's clock, set by finalizeMeasurement. Always null for now: ndt7-js
      // does not report it (see finalizeMeasurement).
      serverTimestamp: null,
      // Set by runNdt7: which M-Lab lookup found the server ('priority' or
      // 'public'), and why the priority one was not used when it was offered.
      locateTier: null,
      priorityLocateError: null,
    };
  }

  /**
   * Runs ndt7 with its public server lookup, giving up on the lookup after
   * serverLookupTimeoutMs.
   *
   * ndt7 puts no time limit on the lookup and can't cancel a run, so a lookup
   * that never answers would hold the test for ever. Past the limit this
   * rejects with a locate error, which runTestWithRetry retries, and the
   * abandoned run is silenced: its callbacks do nothing, and if the lookup
   * answers late, serverChosen throws so ndt7 stops before the download.
   */
  private runNdt7WithPublicLookup(
    callbacks: ReturnType<MeasurementClientService['getTestCallbacks']>
  ): Promise<number> {
    let abandoned = false;
    let timer: ReturnType<typeof setTimeout>;
    // Started before ndt7 so it fires before ndt7's own 10 s connection timer.
    const lookupTimedOut = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        abandoned = true;
        reject(
          new Error(
            `locate.measurementlab.net did not answer within ${this.serverLookupTimeoutMs} ms`
          )
        );
      }, this.serverLookupTimeoutMs);
    });

    const guarded: Record<string, (data: any) => void> = {};
    for (const [name, callback] of Object.entries(callbacks)) {
      guarded[name] = (data: any) => {
        if (!abandoned) {
          (callback as (data: any) => void)(data);
        }
      };
    }
    guarded.serverChosen = (server: any) => {
      if (abandoned) {
        throw new Error(
          'locate.measurementlab.net answered after the test gave up on it'
        );
      }
      clearTimeout(timer);
      callbacks.serverChosen(server);
    };

    return Promise.race([
      ndt7.test(this.testConfig, guarded),
      lookupTimedOut,
    ]).finally(() => clearTimeout(timer));
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
    // Log and broadcast only what is needed: Locate's urls carry the
    // access_token, and console calls end up in Sentry breadcrumbs.
    const { metroRank, locateVersion } = readLocateParams(server?.urls);
    console.log('Server chosen:', {
      machine: server?.machine,
      city: server?.location?.city,
      metroRank,
      locateVersion,
    });
    const serverInformation = {
      city: server?.location?.city,
      url: server?.machine,
      ip: [],
      fqdn: '',
      site: '',
      country: server?.location?.country,
      label: '',
      metro: '',
      metroRank,
      locateVersion,
    };
    measurementRecord.mlabInformation = serverInformation;
    console.log('Normalized server information:', serverInformation);
    this.setPhase('download');
    this.broadcastMeasurementStatus('server_chosen', {
      server: { machine: server?.machine, location: server?.location },
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
    this.setPhase('upload');
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
    if (this.run) {
      this.run.ndtError = sanitizeMessage(message);
    }

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

    // `timestamp` above comes from Date.now(), so it is only as good as the
    // clock of the machine running the test. The backend also wants M-Lab's
    // clock to tell the two apart, but ndt7-js does not report one: M-Lab's
    // locate response does not let browsers read its Date header. So this is
    // null for now, and is read from either leg's `ServerTime` for when one
    // carries it.
    measurementRecord.serverTimestamp =
      measurementRecord.results['NDTResult.S2C']?.ServerTime ??
      measurementRecord.results['NDTResult.C2S']?.ServerTime ??
      null;

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
        // The backend is reachable now, so send any tests whose upload failed
        // earlier. Not awaited: the test is done whatever happens to them.
        this.syncService
          .syncPendingMeasurements()
          .catch((error) => console.error('Sending queued tests failed:', error));
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
