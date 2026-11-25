import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideHttpClient, withInterceptorsFromDi } from '@angular/common/http';
import { Network } from '@awesome-cordova-plugins/network/ngx';
import { of } from 'rxjs';
import ndt7 from '@m-lab/ndt7';
import { environment } from '../../environments/environment';
import { MeasurementClientService } from './measurement-client.service';
import { ScheduleService } from './schedule.service';

/**
 * Minimal shape of a finished ndt7 run: just the fields finalizeMeasurement
 * and calculateDataUsage read. Each leg needs a client speed, or the run
 * counts as failed. ndt7-js does not report `ServerTime` (M-Lab's locate
 * response does not let browsers read its Date header), so real runs leave
 * serverTimestamp null; the cases that pass one keep the reading covered.
 */
const resultsWith = (s2cServerTime: any, c2sServerTime: any) => ({
  'NDTResult.S2C': {
    ServerTime: s2cServerTime,
    LastClientMeasurement: { MeanClientMbps: 12.5, ElapsedTime: 10 },
    LastServerMeasurement: {
      ConnectionInfo: { UUID: 'ndt-abcde_1591240104_00000000000042C7' },
      TCPInfo: { BytesAcked: 10, BytesReceived: 20 },
    },
  },
  'NDTResult.C2S': {
    ServerTime: c2sServerTime,
    LastClientMeasurement: { MeanClientMbps: 4.2, ElapsedTime: 10 },
    LastServerMeasurement: {
      TCPInfo: { BytesAcked: 30, BytesReceived: 40 },
    },
  },
});

describe('MeasurementClientService', () => {
  let service: MeasurementClientService;
  let httpMock: HttpTestingController;
  beforeEach(() => {
    TestBed.configureTestingModule({
    imports: [],
    providers: [
        Network,
        provideHttpClient(withInterceptorsFromDi()),
        provideHttpClientTesting()
    ]
});
    service = TestBed.inject(MeasurementClientService);
    // uploadEnabled = false keeps finalizeMeasurement off the network.
    spyOn(service['settingsService'], 'get').and.returnValue(false);
    spyOn(service['historyService'], 'add').and.stub();
    spyOn(service['sharedService'], 'broadcast').and.stub();
    spyOn(service['pingService'], 'pingBeforeSpeedTest').and.resolveTo();
    spyOn(service['syncService'], 'syncPingResults').and.resolveTo();
    spyOn(service['syncService'], 'syncPendingMeasurements').and.resolveTo();
    spyOn(service['locateAccess'], 'get').and.resolveTo(null);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  describe('onServerChosen', () => {
    it('keeps metro_rank and locate_version from the Locate target URL', () => {
      const record: any = {};
      const query = 'access_token=abc&locate_version=v2&metro_rank=1';

      service['onServerChosen'](
        {
          machine: 'mlab1-mad06.mlab-oti.measurement-lab.org',
          location: { city: 'Madrid', country: 'ES' },
          urls: {
            'wss:///ndt/v7/download': `wss://ndt-mlab1-mad06.mlab-oti.measurement-lab.org/ndt/v7/download?${query}`,
            'wss:///ndt/v7/upload': `wss://ndt-mlab1-mad06.mlab-oti.measurement-lab.org/ndt/v7/upload?${query}`,
          },
        },
        record
      );

      expect(record.mlabInformation.metroRank).toBe(1);
      expect(record.mlabInformation.locateVersion).toBe('v2');
      expect(record.mlabInformation.city).toBe('Madrid');
    });

    it('keeps the Locate access_token out of logs and status events', () => {
      const logSpy = spyOn(console, 'log');
      const statuses: any[] = [];
      const subscription = service.measurementStatus.subscribe((s) => statuses.push(s));
      const url = 'wss://ndt-mlab1-mad06.mlab-oti.measurement-lab.org/ndt/v7/download?access_token=secret-token&locate_version=v2&metro_rank=0';

      service['onServerChosen'](
        {
          machine: 'mlab1-mad06.mlab-oti.measurement-lab.org',
          location: { city: 'Madrid', country: 'ES' },
          urls: { 'wss:///ndt/v7/download': url },
        },
        {}
      );
      subscription.unsubscribe();

      expect(JSON.stringify(logSpy.calls.allArgs())).not.toContain('secret-token');
      expect(JSON.stringify(statuses)).not.toContain('secret-token');
      expect(statuses[0].server.machine).toBe('mlab1-mad06.mlab-oti.measurement-lab.org');
    });
  });

  describe('serverTimestamp', () => {
    it('takes the server clock reported by the download leg', async () => {
      const serverTime = Date.UTC(2026, 7, 24, 10, 30, 0);
      const record: any = {
        timestamp: 1,
        results: resultsWith(serverTime, serverTime),
      };

      await service['finalizeMeasurement'](record);

      expect(record.serverTimestamp).toBe(serverTime);
    });

    it('falls back to the upload leg when the download leg has none', async () => {
      const serverTime = Date.UTC(2026, 7, 24, 10, 30, 0);
      const record: any = {
        timestamp: 1,
        results: resultsWith(undefined, serverTime),
      };

      await service['finalizeMeasurement'](record);

      expect(record.serverTimestamp).toBe(serverTime);
    });

    it('stays null when neither leg reports one', async () => {
      const record: any = { timestamp: 1, results: resultsWith(null, null) };

      await service['finalizeMeasurement'](record);

      expect(record.serverTimestamp).toBeNull();
    });

    it('is initialized to null on a fresh record', () => {
      const record: any = service['initializeMeasurementRecord']('manual');

      expect(record.serverTimestamp).toBeNull();
    });
  });

  describe('sync status', () => {
    /**
     * Runs finalizeMeasurement through the real UploadService, with only
     * makeMeasurement and geolocation stubbed, so the history row's status
     * comes from what the POST actually did.
     */
    beforeEach(() => {
      httpMock = TestBed.inject(HttpTestingController);
      (service['settingsService'].get as jasmine.Spy).and.callFake((key: string) =>
        key === 'uploadEnabled' ? true : ''
      );
      const upload = service['uploadService'];
      upload['settingService'].currentSettings = { uploadEnabled: true } as any;
      spyOn(upload['hardwareIdService'], 'getHardwareId').and.returnValue(null);
      spyOn(upload['locationService'], 'fetchAndSaveGeolocation').and.returnValue(of(null));
      spyOn(upload['posthog'], 'capture').and.stub();
      spyOn(upload['indexedDB'], 'saveMeasurement').and.resolveTo();
      spyOn(upload, 'makeMeasurement').and.callFake((r: any) => {
        upload.ts = new Date(r.timestamp);
        return { ClientInfo: {}, Notes: 'manual' } as any;
      });
    });

    afterEach(() => httpMock.verify());

    it('is synced when the backend accepts the upload', async () => {
      const record: any = { timestamp: 1, results: resultsWith(null, null) };

      const done = service['finalizeMeasurement'](record);
      httpMock.expectOne((r) => r.url.endsWith('measurements')).flush({});
      await done;

      expect(record.synced).toBeTrue();
    });

    it('is not synced when the upload never reaches the backend', async () => {
      const record: any = { timestamp: 1, results: resultsWith(null, null) };

      const done = service['finalizeMeasurement'](record);
      httpMock
        .expectOne((r) => r.url.endsWith('measurements'))
        .error(new ProgressEvent('error'));
      await done;

      expect(record.synced).toBeFalse();
      expect(record.uploaded).toBeFalse();
    });

    it('sends the queued tests once an upload goes through', async () => {
      const record: any = { timestamp: 1, results: resultsWith(null, null) };

      const done = service['finalizeMeasurement'](record);
      httpMock.expectOne((r) => r.url.endsWith('measurements')).flush({});
      await done;

      expect(service['syncService'].syncPendingMeasurements).toHaveBeenCalledTimes(1);
    });

    it('does not try the queued tests when the upload itself failed', async () => {
      const record: any = { timestamp: 1, results: resultsWith(null, null) };

      const done = service['finalizeMeasurement'](record);
      httpMock
        .expectOne((r) => r.url.endsWith('measurements'))
        .error(new ProgressEvent('error'));
      await done;

      expect(service['syncService'].syncPendingMeasurements).not.toHaveBeenCalled();
    });

    it('keeps the test synced when sending the queued tests fails', async () => {
      (service['syncService'].syncPendingMeasurements as jasmine.Spy).and.rejectWith(
        new Error('offline again')
      );
      const record: any = { timestamp: 1, results: resultsWith(null, null) };

      const done = service['finalizeMeasurement'](record);
      httpMock.expectOne((r) => r.url.endsWith('measurements')).flush({});
      await expectAsync(done).toBeResolved();

      expect(record.synced).toBeTrue();
    });
  });
});

/** A finished leg whose server sent nothing before ndt7's 12 s timeout. */
const clientOnlyLeg = (mbps: number) => ({
  LastClientMeasurement: { MeanClientMbps: mbps, ElapsedTime: 10.2 },
  LastServerMeasurement: undefined,
  ServerTime: null,
});

describe('MeasurementClientService without a server measurement', () => {
  let service: MeasurementClientService;
  let historyAdd: jasmine.Spy;
  let statuses: any[];

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        Network,
        provideHttpClient(withInterceptorsFromDi()),
        provideHttpClientTesting(),
      ],
    });
    service = TestBed.inject(MeasurementClientService);
    spyOn(service['settingsService'], 'get').and.returnValue(false);
    historyAdd = spyOn(service['historyService'], 'add').and.stub();
    spyOn(service['sharedService'], 'broadcast').and.stub();
    spyOn(service['pingService'], 'pingBeforeSpeedTest').and.resolveTo();
    spyOn(service['syncService'], 'syncPingResults').and.resolveTo();
    spyOn(service['locateAccess'], 'get').and.resolveTo(null);
    statuses = [];
    service.measurementStatus.subscribe((status) => statuses.push(status));
  });

  it('completes the download leg from the client measurement', () => {
    const record: any = { results: {} };
    const emitted = jasmine.createSpy('downloadComplete$');
    service.downloadComplete$.subscribe(emitted);
    const leg = clientOnlyLeg(3.2);

    expect(() => service['onDownloadComplete'](leg, record)).not.toThrow();

    expect(record.results['NDTResult.S2C']).toBe(leg);
    expect(emitted).toHaveBeenCalledWith(leg);
    expect(statuses.pop().testStatus).toBe('finished_s2c');
  });

  it('completes the upload leg from the client measurement', () => {
    const record: any = { results: {} };
    const leg = clientOnlyLeg(1.1);

    expect(() => service['onUploadComplete'](leg, record)).not.toThrow();

    expect(record.results['NDTResult.C2S']).toBe(leg);
    const status = statuses.pop();
    expect(status.testStatus).toBe('finished_c2s');
    expect(Number.isFinite(status.progress)).toBeTrue();
  });

  it('completes a leg with no measurement at all without throwing', () => {
    const record: any = { results: {} };
    const leg = {
      LastClientMeasurement: undefined,
      LastServerMeasurement: undefined,
      ServerTime: null,
    };

    expect(() => service['onDownloadComplete'](leg, record)).not.toThrow();
    expect(() => service['onUploadComplete'](leg, record)).not.toThrow();
  });

  it('reads the upload elapsed time from the server TCPInfo when present', () => {
    const record: any = { results: {} };

    service['onUploadComplete'](
      {
        LastClientMeasurement: { MeanClientMbps: 1, ElapsedTime: 99 },
        // 5 s in microseconds.
        LastServerMeasurement: {
          TCPInfo: { BytesReceived: 1000000, ElapsedTime: 5000000 },
        },
      },
      record
    );

    // 5 s / (2 * 10 s expected) + 0.5
    expect(statuses.pop().progress).toBe(0.75);
  });

  it('saves the test when only the client measurements are there', async () => {
    const record: any = {
      timestamp: 1,
      results: {
        'NDTResult.S2C': clientOnlyLeg(3.2),
        'NDTResult.C2S': {
          ...clientOnlyLeg(1.1),
          LastServerMeasurement: {
            TCPInfo: { BytesAcked: 5, BytesReceived: 7 },
          },
        },
      },
    };

    await service['finalizeMeasurement'](record);

    expect(record.uuid).toBe('');
    expect(record.dataUsage.upload).toBe(5);
    expect(record.dataUsage.download).toBe(7);
    expect(historyAdd).toHaveBeenCalledWith(record);
    expect(statuses.pop().testStatus).toBe('complete');
  });

  it('fails the test when a leg produced no result', async () => {
    const record: any = {
      timestamp: 1,
      results: { 'NDTResult.S2C': clientOnlyLeg(3.2) },
    };

    await expectAsync(service['finalizeMeasurement'](record)).toBeRejectedWithError(
      /upload test did not produce a result/
    );
    expect(historyAdd).not.toHaveBeenCalled();
  });

  it('reports a failed test to the test page and to its caller', async () => {
    spyOn(service['networkService'], 'getNetInfo').and.resolveTo({} as any);
    spyOn(ndt7, 'test').and.callFake(async (_config, callbacks) => {
      callbacks.downloadComplete(clientOnlyLeg(3.2));
      // The upload leg never completed.
      return 0;
    });

    await expectAsync(service.runTest('manual')).toBeRejectedWithError(
      /upload test did not produce a result/
    );

    expect(historyAdd).not.toHaveBeenCalled();
    const last = statuses.pop();
    expect(last.testStatus).toBe('error');
    expect(last.error).toMatch(/upload test did not produce a result/);
  });

  it('lets the scheduler retry a scheduled test that failed', async () => {
    spyOn(service['networkService'], 'getNetInfo').and.resolveTo({} as any);
    spyOn(ndt7, 'test').and.callFake(async (_config, callbacks) => {
      callbacks.downloadComplete(clientOnlyLeg(3.2));
      return 0; // the upload leg never completed
    });
    const store: Record<string, string> = {};
    const storage: any = {
      get: (key: string) => store[key],
      set: async (key: string, value: string) => {
        store[key] = value;
      },
    };
    const scheduler = new ScheduleService(
      storage,
      service,
      { get: async () => true } as any,
      { broadcast: () => undefined } as any,
      { getNetInfo: async () => ({ ip: '1.2.3.4' }) } as any
    );
    const now = Date.now();
    const semaphore = {
      start: now - 60 * 60 * 1000,
      end: now + 60 * 60 * 1000,
      choice: now - 1000,
      scheduledAt: now - 1000,
      slot: 'morning',
      intervalType: 'daily',
      retryAttempts: 0,
      backoffLevel: 0,
    };

    await scheduler.decide(semaphore);

    // The failed test is not counted as the window's test...
    expect(store.lastMeasurement).toBeUndefined();
    // ...and is planned again, a minute later, inside the same window.
    const retry = JSON.parse(store.scheduleSemaphore);
    expect(retry.lastFailReason).toBe('test-failed');
    expect(retry.retryAttempts).toBe(1);
    expect(retry.backoffLevel).toBe(1);
    expect(retry.choice).toBeGreaterThan(now);
    expect(retry.choice).toBeLessThan(semaphore.end);
    expect(retry.scheduledAt).toBe(semaphore.scheduledAt);
  });

  it('accepts plain-string errors from ndt7', () => {
    expect(() => service['onError']('worker error' as any)).not.toThrow();
    expect(statuses.pop()).toEqual(
      jasmine.objectContaining({ testStatus: 'error', error: 'worker error' })
    );
  });

  describe('when the ndt7 worker times out', () => {
    // Stand-ins for the download/upload web worker, run through the real
    // ndt7-js. It gives a leg 10 s to connect, then 12 s from the worker's
    // 'start' message. SilentServerWorker connects and reports a client
    // measurement, but the server's messages never arrive.
    class SilentServerWorker {
      static instances: SilentServerWorker[] = [];
      onmessage: (ev: any) => void;
      terminated = false;
      constructor(public url: string) {
        SilentServerWorker.instances.push(this);
      }
      postMessage() {
        this.onmessage({ data: { MsgType: 'start', Data: {} } });
        this.onmessage({
          data: {
            MsgType: 'measurement',
            Source: 'client',
            ClientData: { MeanClientMbps: 2.5, ElapsedTime: 11.9 },
          },
        });
      }
      terminate() {
        this.terminated = true;
      }
    }

    // Never opens its connection, so it never reports anything.
    class NeverConnectsWorker extends SilentServerWorker {
      postMessage() {}
    }

    const urls = Promise.resolve({
      '///ndt/v7/download': 'wss://example/download',
      '///ndt/v7/upload': 'wss://example/upload',
    });
    const config = {
      userAcceptedDataPolicy: true,
      downloadworkerfile: 'download.js',
      uploadworkerfile: 'upload.js',
    };
    let originalWorker: any;

    const flushMicrotasks = async () => {
      for (let i = 0; i < 10; i++) {
        await Promise.resolve();
      }
    };

    beforeEach(() => {
      originalWorker = (window as any).Worker;
      (window as any).Worker = SilentServerWorker;
      SilentServerWorker.instances = [];
      jasmine.clock().install();
    });

    afterEach(() => {
      jasmine.clock().uninstall();
      (window as any).Worker = originalWorker;
    });

    it('saves the test from the client measurements instead of hanging', async () => {
      const record: any = service['initializeMeasurementRecord']('manual');
      const callbacks = service['getTestCallbacks'](record);

      const download = ndt7.downloadTest(config, callbacks, urls);
      await flushMicrotasks();
      expect(() => jasmine.clock().tick(12000)).not.toThrow();
      expect(await download).toBe(0);

      const upload = ndt7.uploadTest(config, callbacks, urls);
      await flushMicrotasks();
      expect(() => jasmine.clock().tick(12000)).not.toThrow();
      expect(await upload).toBe(0);

      expect(SilentServerWorker.instances.every((w) => w.terminated)).toBeTrue();
      expect(
        record.results['NDTResult.S2C'].LastServerMeasurement
      ).toBeUndefined();

      await service['finalizeMeasurement'](record);

      expect(historyAdd).toHaveBeenCalledWith(record);
      expect(statuses.pop().testStatus).toBe('complete');
    });

    it('fails the test when a leg never connects', async () => {
      (window as any).Worker = NeverConnectsWorker;
      const record: any = service['initializeMeasurementRecord']('manual');
      const callbacks = service['getTestCallbacks'](record);

      const download = ndt7.downloadTest(config, callbacks, urls);
      await flushMicrotasks();
      jasmine.clock().tick(10000);
      expect(await download).toBe(0);
      expect(SilentServerWorker.instances[0].terminated).toBeTrue();

      await expectAsync(
        service['finalizeMeasurement'](record)
      ).toBeRejectedWithError(/download and upload test did not produce a result/);
      expect(historyAdd).not.toHaveBeenCalled();
    });

    it('still settles the test, and reports to Sentry, when a complete callback throws', async () => {
      const record: any = service['initializeMeasurementRecord']('manual');
      const callbacks = service['getTestCallbacks'](record);
      const boom = new TypeError('boom');
      spyOn(service.downloadComplete$, 'next').and.throwError(boom);
      const reported = spyOn(service['sentryService'], 'captureException');
      spyOn(console, 'error');

      const download = ndt7.downloadTest(config, callbacks, urls);
      await flushMicrotasks();

      // ndt7-js calls the callback before it resolves: without the guard the
      // throw escapes here and the test never settles.
      expect(() => jasmine.clock().tick(12000)).not.toThrow();
      expect(await download).toBe(0);
      expect(SilentServerWorker.instances[0].terminated).toBeTrue();
      expect(reported).toHaveBeenCalledWith(boom, {
        ndt7Callback: 'downloadComplete',
      });
    });
  });
});

describe('MeasurementClientService ndt7 integration', () => {
  let service: MeasurementClientService;
  let ndt7TestSpy: jasmine.Spy;
  let pingService: any;
  let syncService: any;
  let sharedService: any;
  let deviceContext: any;
  let locateAccess: any;
  let posthog: { capture: jasmine.Spy };

  /** The properties of the one PostHog event with this name. */
  const event = (name: string): Record<string, any> => {
    const calls = posthog.capture.calls
      .allArgs()
      .filter(([eventName]) => eventName === name);
    expect(calls.length).withContext(`${name} sent once`).toBe(1);
    return calls[0][1];
  };

  beforeEach(() => {
    ndt7TestSpy = spyOn(ndt7, 'test').and.resolveTo(0);
    posthog = { capture: jasmine.createSpy('capture') };

    const historyService: any = { add: jasmine.createSpy('add') };
    const settingsService: any = {
      get: jasmine.createSpy('get').and.returnValue(false),
      currentSettings: { uploadEnabled: false },
    };
    const networkService: any = {
      getNetInfo: jasmine.createSpy('getNetInfo').and.resolveTo({}),
    };
    const uploadService: any = {
      uploadMeasurement: jasmine.createSpy('uploadMeasurement'),
    };
    sharedService = {
      broadcast: jasmine.createSpy('broadcast'),
      on: jasmine.createSpy('on'),
    };
    // Device/network context is diagnostic metadata read over IPC; outside
    // Electron it resolves to nulls, which is what these tests exercise.
    deviceContext = {
      getDeviceIdentity: jasmine.createSpy('getDeviceIdentity').and.resolveTo({
        device_name: null,
        device_model: null,
        device_manufacturer: null,
        app_build_number: null,
      }),
      getDeviceContext: jasmine
        .createSpy('getDeviceContext')
        .and.resolveTo(null),
      getSdkVersion: jasmine.createSpy('getSdkVersion').and.resolveTo(null),
      extractWifiDiagnostics: jasmine
        .createSpy('extractWifiDiagnostics')
        .and.returnValue({
          wifi_unavailable_reason: null,
          ssid_source: null,
          fallback_ssid: null,
        }),
    };

    const sentryService: any = {
      captureException: jasmine.createSpy('captureException'),
    };

    pingService = {
      pingBeforeSpeedTest: jasmine
        .createSpy('pingBeforeSpeedTest')
        .and.resolveTo(),
    };
    syncService = {
      syncPingResults: jasmine.createSpy('syncPingResults').and.resolveTo(),
    };
    // No priority access unless a case offers it: the public lookup.
    locateAccess = { get: jasmine.createSpy('get').and.resolveTo(null) };

    service = new MeasurementClientService(
      historyService,
      settingsService,
      networkService,
      uploadService,
      sharedService,
      deviceContext,
      sentryService,
      pingService,
      syncService,
      locateAccess,
      posthog as any
    );
    spyOn<any>(service, 'finalizeMeasurement').and.resolveTo(undefined);
  });

  describe('analytics events', () => {
    it('reports a scheduled test as started, then completed with its timings', async () => {
      await service.runTest('daily', { slot: 'morning', scheduledAt: 1 });

      expect(event('measurement_started')).toEqual({
        trigger: 'daily',
        slot: 'morning',
      });
      const completed = event('measurement_completed');
      expect(completed.trigger).toBe('daily');
      expect(completed.slot).toBe('morning');
      expect(completed.attempt).toBe(0);
      expect(completed.duration_ms).toEqual(jasmine.any(Number));
      expect(completed.prep_ms).toEqual(jasmine.any(Number));
      // Outside Electron the Wi-Fi read has nothing to say.
      expect(completed.wifi_status).toBe('unavailable');
      // No token from the backend: the public M-Lab lookup was used.
      expect(completed.locate_tier).toBe('public');
      expect(posthog.capture).not.toHaveBeenCalledWith(
        'measurement_failed',
        jasmine.anything()
      );
    });

    it('reports a failed test with the phase it failed in and a code', async () => {
      ndt7TestSpy.and.rejectWith(new Error('websocket closed unexpectedly'));

      await expectAsync(service.runTest('manual')).toBeRejected();

      const failed = event('measurement_failed');
      expect(failed.trigger).toBe('manual');
      expect(failed.phase).toBe('locate');
      expect(failed.error_code).toBe('websocket_error');
      expect(failed.error_message).toBe('websocket closed unexpectedly');
      expect(posthog.capture).not.toHaveBeenCalledWith(
        'measurement_completed',
        jasmine.anything()
      );
    });

    it('reports each locate retry before the final failure', async () => {
      (service as any).maxRetries = 1;
      spyOn(window, 'setTimeout').and.callFake(((fn: any) => {
        fn();
        return 0;
      }) as any);
      ndt7TestSpy.and.rejectWith(
        new Error('locate.measurementlab.net: Could not understand response')
      );

      await expectAsync(service.runTest('manual')).toBeRejected();

      expect(event('measurement_retrying')).toEqual(
        jasmine.objectContaining({ attempt: 1, error_code: 'locate_failed' })
      );
      expect(event('measurement_failed').error_code).toBe('locate_failed');
    });

    it('reports a failure to read the network before the test', async () => {
      (service as any).networkService.getNetInfo = jasmine
        .createSpy('getNetInfo')
        .and.rejectWith(new Error('net::ERR_INTERNET_DISCONNECTED'));

      await expectAsync(service.runTest('first')).toBeRejected();

      const failed = event('measurement_failed');
      expect(failed.phase).toBe('net_info');
      expect(failed.error_code).toBe('network');
    });
  });

  it('runs the test through the ndt7 package with the giga-meter metadata', async () => {
    await service.runTest('manual');

    expect(ndt7TestSpy).toHaveBeenCalledTimes(1);
    const config = ndt7TestSpy.calls.mostRecent().args[0];
    expect(config.metadata).toEqual(
      jasmine.objectContaining({
        client_name: 'giga-meter',
        client_version: environment.app_version,
      })
    );
    expect(config.userAcceptedDataPolicy).toBeTrue();
    expect(config.downloadworkerfile).toBe(
      'assets/js/ndt/ndt7-download-worker.js'
    );
    expect(config.uploadworkerfile).toBe('assets/js/ndt/ndt7-upload-worker.js');
  });

  it('still classifies locate-server failures as retryable', async () => {
    (service as any).maxRetries = 1;
    ndt7TestSpy.and.rejectWith(
      new Error('TypeError: Failed to fetch locate.measurementlab.net')
    );

    await expectAsync(service.runTest('manual')).toBeRejectedWithError(
      /locate\.measurementlab\.net/
    );

    // one initial attempt + one retry, then it gives up
    expect(ndt7TestSpy).toHaveBeenCalledTimes(2);
  });

  it('does not retry non-locate test failures', async () => {
    ndt7TestSpy.and.rejectWith(new Error('websocket closed unexpectedly'));

    await expectAsync(service.runTest('manual')).toBeRejectedWithError(
      'websocket closed unexpectedly'
    );

    expect(ndt7TestSpy).toHaveBeenCalledTimes(1);
  });

  describe('ping with every test', () => {
    it('pings before the test starts, and sends the pings once it is over', async () => {
      const order: string[] = [];
      pingService.pingBeforeSpeedTest.and.callFake(async () => {
        order.push('ping');
      });
      ndt7TestSpy.and.callFake(async () => {
        order.push('test');
        return 0;
      });
      syncService.syncPingResults.and.callFake(async () => {
        order.push('send pings');
      });

      await service.runTest('manual');

      expect(order).toEqual(['ping', 'test', 'send pings']);
    });

    it('still sends the pings when the test fails', async () => {
      ndt7TestSpy.and.rejectWith(new Error('websocket closed unexpectedly'));

      await expectAsync(service.runTest('scheduled')).toBeRejected();

      expect(pingService.pingBeforeSpeedTest).toHaveBeenCalledTimes(1);
      expect(syncService.syncPingResults).toHaveBeenCalledTimes(1);
    });

    it('pings once per test, not once per locate retry', async () => {
      (service as any).maxRetries = 1;
      ndt7TestSpy.and.rejectWith(
        new Error('TypeError: Failed to fetch locate.measurementlab.net')
      );

      await expectAsync(service.runTest('manual')).toBeRejected();

      expect(ndt7TestSpy).toHaveBeenCalledTimes(2);
      expect(pingService.pingBeforeSpeedTest).toHaveBeenCalledTimes(1);
    });

    it('does not fail the test when sending the pings fails', async () => {
      syncService.syncPingResults.and.rejectWith(new Error('offline'));

      await expectAsync(service.runTest('manual')).toBeResolved();
    });
  });

  describe('one test at a time', () => {
    it('gives a second request the test already running', async () => {
      ndt7TestSpy.and.callFake(
        () => new Promise((resolve) => setTimeout(() => resolve(0), 20))
      );

      const first = service.runTest('manual');
      const second = service.runTest('daily');

      expect(second).toBe(first);
      expect(service.isTestRunning).toBeTrue();
      await first;
      expect(ndt7TestSpy).toHaveBeenCalledTimes(1);
      expect(service.isTestRunning).toBeFalse();
    });

    it('runs the next test once the previous one has ended', async () => {
      await service.runTest('manual');
      await service.runTest('manual');

      expect(ndt7TestSpy).toHaveBeenCalledTimes(2);
    });

    it('is not running any more after a failed test', async () => {
      ndt7TestSpy.and.rejectWith(new Error('websocket closed unexpectedly'));

      await expectAsync(service.runTest('manual')).toBeRejected();

      expect(service.isTestRunning).toBeFalse();
    });

    it('lets another test start when the running one looks stuck', async () => {
      // Server found, then ndt7 never ends: no timer left behind.
      ndt7TestSpy.and.callFake((config: any, callbacks: any) => {
        callbacks.serverChosen({});
        return new Promise(() => undefined);
      });
      (service as any).stuckTestMs = 0;

      const first = service.runTest('manual');
      const second = service.runTest('manual');

      expect(second).not.toBe(first);
      // Both reach the ndt7 spy before it is removed, or they would call the
      // real ndt7 after this spec.
      while (ndt7TestSpy.calls.count() < 2) {
        await new Promise((resolve) => setTimeout(resolve, 5));
      }
    });
  });

  describe('server lookup', () => {
    beforeEach(() => {
      (service as any).serverLookupTimeoutMs = 50;
    });

    it('gives up on a lookup that does not answer, and retries it', async () => {
      (service as any).maxRetries = 1;
      ndt7TestSpy.and.returnValue(new Promise(() => undefined));

      await expectAsync(service.runTest('manual')).toBeRejectedWithError(
        /locate\.measurementlab\.net did not answer/
      );

      expect(ndt7TestSpy).toHaveBeenCalledTimes(2);
    });

    it('silences a run whose lookup answers after it gave up', async () => {
      (service as any).maxRetries = 0;
      const runs: any[] = [];
      ndt7TestSpy.and.callFake((config: any, callbacks: any) => {
        runs.push(callbacks);
        return new Promise(() => undefined);
      });

      await expectAsync(service.runTest('manual')).toBeRejected();
      const broadcasts = sharedService.broadcast.calls.count();

      // Throwing here makes ndt7 stop before it starts the download.
      expect(() => runs[0].serverChosen({ machine: 'late' })).toThrowError(
        /after the test gave up/
      );
      runs[0].error('late error');
      runs[0].downloadComplete({});
      expect(sharedService.broadcast.calls.count()).toBe(broadcasts);
    });

    it('waits for the test as long as it takes once the server is chosen', async () => {
      ndt7TestSpy.and.callFake((config: any, callbacks: any) => {
        callbacks.serverChosen({ machine: 'mlab1' });
        // Longer than the lookup limit.
        return new Promise((resolve) => setTimeout(() => resolve(0), 120));
      });

      await expectAsync(service.runTest('manual')).toBeResolved();

      expect(ndt7TestSpy).toHaveBeenCalledTimes(1);
    });
  });

  describe('device reads', () => {
    const never = () => new Promise<never>(() => undefined);
    const savedRecord = () =>
      (service as any).finalizeMeasurement.calls.mostRecent().args[0];

    beforeEach(() => {
      (service as any).deviceReadsTimeoutMs = 50;
      spyOn(console, 'warn');
    });

    it('runs the test without the identity when it does not come back in time', async () => {
      deviceContext.getDeviceIdentity.and.callFake(never);
      deviceContext.getDeviceContext.and.resolveTo({ connection_type: 'wifi' });

      await service.runTest('manual');

      expect(ndt7TestSpy).toHaveBeenCalledTimes(1);
      expect(savedRecord().deviceIdentity).toBeNull();
      expect(savedRecord().deviceContext).toEqual({ connection_type: 'wifi' });
      expect(console.warn).toHaveBeenCalled();
    });

    it('runs the test without the context when it does not come back in time', async () => {
      deviceContext.getDeviceContext.and.callFake(never);

      await service.runTest('manual');

      expect(ndt7TestSpy).toHaveBeenCalledTimes(1);
      expect(savedRecord().deviceContext).toBeNull();
      expect(savedRecord().deviceIdentity).toEqual(
        jasmine.objectContaining({ device_name: null })
      );
    });

    it('keeps reads that come back in time', async () => {
      const identity = { device_name: 'SCHOOL-PC-01', device_model: 'ThinkPad' };
      deviceContext.getDeviceIdentity.and.callFake(
        () => new Promise((resolve) => setTimeout(() => resolve(identity), 10))
      );

      await service.runTest('manual');

      expect(savedRecord().deviceIdentity).toEqual(identity);
      expect(console.warn).not.toHaveBeenCalled();
    });
  });

  describe('priority server lookup', () => {
    const token = 'jwt-from-our-backend';
    const target = (leg: string) =>
      `wss://ndt-mlab1-mad06.mlab-oti.measurement-lab.org/ndt/v7/${leg}?access_token=server-token&locate_version=v2&metro_rank=0`;
    const locateReply = {
      results: [
        {
          machine: 'mlab1-mad06.mlab-oti.measurement-lab.org',
          location: { city: 'Madrid', country: 'ES' },
          urls: {
            'wss:///ndt/v7/download': target('download'),
            'wss:///ndt/v7/upload': target('upload'),
          },
        },
      ],
    };
    const savedRecord = () =>
      (service as any).finalizeMeasurement.calls.mostRecent().args[0];
    let fetchSpy: jasmine.Spy;
    let downloadSpy: jasmine.Spy;
    let uploadSpy: jasmine.Spy;

    beforeEach(() => {
      fetchSpy = spyOn(window, 'fetch').and.callFake(async () =>
        new Response(JSON.stringify(locateReply), { status: 200 })
      );
      downloadSpy = spyOn(ndt7, 'downloadTest').and.resolveTo(0);
      uploadSpy = spyOn(ndt7, 'uploadTest').and.resolveTo(0);
      spyOn(console, 'warn');
    });

    it('uses the public lookup, as before, when our backend offers none', async () => {
      await service.runTest('manual');

      expect(ndt7TestSpy).toHaveBeenCalledTimes(1);
      expect(fetchSpy).not.toHaveBeenCalled();
      expect(downloadSpy).not.toHaveBeenCalled();
      expect(savedRecord().locateTier).toBe('public');
      expect(savedRecord().priorityLocateError).toBeNull();
    });

    it('tests against the server the priority lookup picked', async () => {
      locateAccess.get.and.resolveTo({ token, locateUrl: null });

      await service.runTest('manual');

      const [url, init] = fetchSpy.calls.mostRecent().args;
      expect(url).toContain(
        'https://locate.measurementlab.net/v2/priority/nearest/ndt/ndt7?'
      );
      expect(url).toContain('client_name=giga-meter');
      expect(init.headers.Authorization).toBe(`Bearer ${token}`);

      expect(ndt7TestSpy).not.toHaveBeenCalled();
      expect(await downloadSpy.calls.mostRecent().args[2]).toEqual({
        '///ndt/v7/download': target('download'),
        '///ndt/v7/upload': target('upload'),
      });
      expect(uploadSpy).toHaveBeenCalledTimes(1);
      expect(savedRecord().locateTier).toBe('priority');
      expect(savedRecord().mlabInformation.city).toBe('Madrid');
      expect(savedRecord().mlabInformation.metroRank).toBe(0);
    });

    it('asks our backend for access only once everything else is read', async () => {
      // M-Lab's token lasts 20 s, and the device reads alone may take 10 s.
      const order: string[] = [];
      deviceContext.getDeviceContext.and.callFake(async () => {
        order.push('device reads');
        return null;
      });
      (service as any).networkService.getNetInfo.and.callFake(async () => {
        order.push('net info');
        return {};
      });
      locateAccess.get.and.callFake(async () => {
        order.push('access');
        return { token, locateUrl: null };
      });
      fetchSpy.and.callFake(async () => {
        order.push('lookup');
        return new Response(JSON.stringify(locateReply), { status: 200 });
      });

      await service.runTest('manual');

      expect(order).toEqual(['device reads', 'net info', 'access', 'lookup']);
    });

    it('calls the lookup URL our backend gave, keeping its query string', async () => {
      locateAccess.get.and.resolveTo({
        token: null,
        locateUrl: 'https://locate.example.org/v3/priority/ndt7?key=abc',
      });

      await service.runTest('manual');

      const [url, init] = fetchSpy.calls.mostRecent().args;
      expect(url).toContain('https://locate.example.org/v3/priority/ndt7?key=abc&');
      expect(init.headers.Authorization).toBeUndefined();
      expect(savedRecord().locateTier).toBe('priority');
    });

    it('falls back to the public lookup when the priority one refuses', async () => {
      locateAccess.get.and.resolveTo({ token, locateUrl: null });
      fetchSpy.and.callFake(async () => new Response('{}', { status: 401 }));

      await service.runTest('manual');

      expect(ndt7TestSpy).toHaveBeenCalledTimes(1);
      expect(downloadSpy).not.toHaveBeenCalled();
      expect(savedRecord().locateTier).toBe('public');
      expect(savedRecord().priorityLocateError).toBe('HTTP 401');
    });

    it('falls back to the public lookup when the priority one does not answer', async () => {
      (service as any).priorityLookupTimeoutMs = 20;
      locateAccess.get.and.resolveTo({ token, locateUrl: null });
      fetchSpy.and.callFake(
        (_url: string, init: RequestInit) =>
          new Promise((_resolve, reject) =>
            init.signal.addEventListener('abort', () =>
              reject(init.signal.reason)
            )
          )
      );

      await service.runTest('manual');

      expect(ndt7TestSpy).toHaveBeenCalledTimes(1);
      expect(savedRecord().priorityLocateError).toBe('timeout');
    });

    it('keeps the token out of logs and status events', async () => {
      const logSpy = spyOn(console, 'log');
      locateAccess.get.and.resolveTo({ token, locateUrl: null });

      await service.runTest('manual');

      const broadcasts = JSON.stringify(
        (service as any).sharedService.broadcast.calls.allArgs()
      );
      expect(JSON.stringify(logSpy.calls.allArgs())).not.toContain(token);
      expect(broadcasts).not.toContain(token);
      expect(broadcasts).toContain('locate.measurementlab.net');
    });
  });
});
