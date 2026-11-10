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
 * counts as failed.
 */
const finishedRun = () => ({
  'NDTResult.S2C': {
    LastClientMeasurement: { MeanClientMbps: 12.5, ElapsedTime: 10 },
    LastServerMeasurement: {
      ConnectionInfo: { UUID: 'ndt-abcde_1591240104_00000000000042C7' },
      TCPInfo: { BytesAcked: 10, BytesReceived: 20 },
    },
  },
  'NDTResult.C2S': {
    LastClientMeasurement: { MeanClientMbps: 4.2, ElapsedTime: 10 },
    LastServerMeasurement: {
      TCPInfo: { BytesAcked: 30, BytesReceived: 40 },
    },
  },
});

/** An unsigned JWT carrying `claims`, base64url-encoded like locate's. */
const jwt = (claims: any) =>
  [
    'eyJhbGciOiJFZERTQSJ9',
    btoa(JSON.stringify(claims))
      .replace(/=+$/, '')
      .replace(/\+/g, '-')
      .replace(/\//g, '_'),
    'signature',
  ].join('.');

/** One result of M-Lab's locate response, as ndt7-js passes it to serverChosen. */
const locateResult = (claims: any) => {
  const machine = 'mlab2-bcn01.mlab-oti.measurement-lab.org';
  const host = `ndt-${machine}`;
  const token = jwt(claims);
  return {
    machine,
    location: { city: 'Barcelona', country: 'ES' },
    urls: {
      'ws:///ndt/v7/download': `ws://${host}/ndt/v7/download?access_token=${token}`,
      'ws:///ndt/v7/upload': `ws://${host}/ndt/v7/upload?access_token=${token}`,
      'wss:///ndt/v7/download': `wss://${host}/ndt/v7/download?access_token=${token}`,
      'wss:///ndt/v7/upload': `wss://${host}/ndt/v7/upload?access_token=${token}`,
    },
  };
};

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
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  describe('serverTimestamp', () => {
    // 2026-11-10T11:18:36Z, read off a real locate response whose Date
    // header said the same.
    const issuedAt = 1794309516;

    it("takes M-Lab's clock from the token of the chosen server", () => {
      const record: any = service['initializeMeasurementRecord']('manual');

      service['getTestCallbacks'](record).serverChosen(
        locateResult({ iss: 'locate', sub: 'ndt', exp: issuedAt + 60 })
      );

      expect(record.serverTimestamp).toBe(issuedAt * 1000);
    });

    it('stays null when the chosen server carries no token', () => {
      const record: any = service['initializeMeasurementRecord']('manual');
      const server: any = locateResult({ exp: issuedAt + 60 });
      Object.keys(server.urls).forEach(
        (key) => (server.urls[key] = server.urls[key].split('?')[0])
      );

      service['getTestCallbacks'](record).serverChosen(server);

      expect(record.serverTimestamp).toBeNull();
    });

    it('is kept when the test is saved', async () => {
      const record: any = { timestamp: 1, results: finishedRun() };
      service['onServerChosen'](locateResult({ exp: issuedAt + 60 }), record);

      await service['finalizeMeasurement'](record);

      expect(record.serverTimestamp).toBe(issuedAt * 1000);
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
      const record: any = { timestamp: 1, results: finishedRun() };

      const done = service['finalizeMeasurement'](record);
      httpMock.expectOne((r) => r.url.endsWith('measurements')).flush({});
      await done;

      expect(record.synced).toBeTrue();
    });

    it('is not synced when the upload never reaches the backend', async () => {
      const record: any = { timestamp: 1, results: finishedRun() };

      const done = service['finalizeMeasurement'](record);
      httpMock
        .expectOne((r) => r.url.endsWith('measurements'))
        .error(new ProgressEvent('error'));
      await done;

      expect(record.synced).toBeFalse();
      expect(record.uploaded).toBeFalse();
    });
  });
});

/** A finished leg whose server sent nothing before ndt7's 12 s timeout. */
const clientOnlyLeg = (mbps: number) => ({
  LastClientMeasurement: { MeanClientMbps: mbps, ElapsedTime: 10.2 },
  LastServerMeasurement: undefined,
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

  beforeEach(() => {
    ndt7TestSpy = spyOn(ndt7, 'test').and.resolveTo(0);

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
    const sharedService: any = {
      broadcast: jasmine.createSpy('broadcast'),
      on: jasmine.createSpy('on'),
    };
    // Device/network context is diagnostic metadata read over IPC; outside
    // Electron it resolves to nulls, which is what these tests exercise.
    const deviceContext: any = {
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

    service = new MeasurementClientService(
      historyService,
      settingsService,
      networkService,
      uploadService,
      sharedService,
      deviceContext,
      sentryService,
      pingService,
      syncService
    );
    spyOn<any>(service, 'finalizeMeasurement').and.resolveTo(undefined);
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
});
