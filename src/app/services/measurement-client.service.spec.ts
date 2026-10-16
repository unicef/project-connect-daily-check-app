import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideHttpClient, withInterceptorsFromDi } from '@angular/common/http';
import { Network } from '@awesome-cordova-plugins/network/ngx';
import { of } from 'rxjs';
import ndt7 from '@m-lab/ndt7';
import { environment } from '../../environments/environment';
import { MeasurementClientService } from './measurement-client.service';

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
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
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

  it('reports a failed test as an error status the test page handles', async () => {
    spyOn(service['networkService'], 'getNetInfo').and.resolveTo({} as any);
    spyOn(ndt7, 'test').and.callFake(async (_config, callbacks) => {
      callbacks.downloadComplete(clientOnlyLeg(3.2));
      // The upload leg never completed.
      return 0;
    });

    await service.runTest('manual');

    expect(historyAdd).not.toHaveBeenCalled();
    const last = statuses.pop();
    expect(last.testStatus).toBe('error');
    expect(last.error).toMatch(/upload test did not produce a result/);
  });

  it('accepts plain-string errors from ndt7', () => {
    expect(() => service['onError']('worker error' as any)).not.toThrow();
    expect(statuses.pop()).toEqual(
      jasmine.objectContaining({ testStatus: 'error', error: 'worker error' })
    );
  });

  describe('when the ndt7 worker times out', () => {
    // Stands in for the download/upload web worker: it only ever reports a
    // client measurement, as on a link where the server's messages never
    // arrive.
    class SilentServerWorker {
      static instances: SilentServerWorker[] = [];
      onmessage: (ev: any) => void;
      terminated = false;
      constructor(public url: string) {
        SilentServerWorker.instances.push(this);
      }
      postMessage() {
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

    const urls = Promise.resolve({
      '///ndt/v7/download': 'wss://example/download',
      '///ndt/v7/upload': 'wss://example/upload',
      ServerTime: null,
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

    it('still settles the test when the complete callback throws', async () => {
      const download = ndt7.downloadTest(
        config,
        {
          downloadComplete: () => {
            throw new TypeError('boom');
          },
        },
        urls
      );
      await flushMicrotasks();

      // The error still surfaces (so it is reported), but the worker is
      // terminated and the promise resolves instead of hanging.
      expect(() => jasmine.clock().tick(12000)).toThrowError(TypeError, 'boom');
      expect(await download).toBe(0);
      expect(SilentServerWorker.instances[0].terminated).toBeTrue();
    });
  });
});

describe('MeasurementClientService ndt7 integration', () => {
  let service: MeasurementClientService;
  let ndt7TestSpy: jasmine.Spy;

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

    service = new MeasurementClientService(
      historyService,
      settingsService,
      networkService,
      uploadService,
      sharedService,
      deviceContext,
      sentryService
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

    await service.runTest('manual');

    // one initial attempt + one retry, then it gives up
    expect(ndt7TestSpy).toHaveBeenCalledTimes(2);
  });

  it('ends the test as a failure, reported to Sentry, when ndt7 settles with no server data', async () => {
    // A leg whose connection never opens settles with no server measurement.
    // ndt7-js settles a leg by calling the complete callback and only then
    // resolving, so a throw from our callback would leave the test pending for
    // ever. settleLeg does the same.
    const noServerData = {
      LastClientMeasurement: { MeanClientMbps: 1, ElapsedTime: 10 },
      LastServerMeasurement: undefined,
    };
    const settleLeg = (complete: (data: any) => void) =>
      new Promise<number>((resolve) =>
        setTimeout(() => {
          complete(noServerData);
          resolve(0);
        })
      );
    ndt7TestSpy.and.callFake(async (_config: any, cbs: any) => {
      await settleLeg(cbs.downloadComplete);
      await settleLeg(cbs.uploadComplete);
      return 0;
    });
    (service['finalizeMeasurement'] as jasmine.Spy).and.callThrough();
    spyOn(console, 'error');

    await service.runTest('manual');

    const sentry = service['sentryService'].captureException as jasmine.Spy;
    expect(sentry).toHaveBeenCalledWith(jasmine.any(TypeError), {
      ndt7Callback: 'downloadComplete',
    });
    expect(sentry).toHaveBeenCalledWith(jasmine.any(TypeError), {
      ndt7Callback: 'uploadComplete',
    });
    // Nothing is saved, and the test is never reported as complete.
    expect(service['historyService'].add).not.toHaveBeenCalled();
    const statuses = (service['sharedService'].broadcast as jasmine.Spy).calls
      .allArgs()
      .filter(([event]) => event === 'measurement:status')
      .map(([, , data]) => data.testStatus);
    expect(statuses).not.toContain('complete');
  });

  it('does not retry non-locate test failures', async () => {
    ndt7TestSpy.and.rejectWith(new Error('websocket closed unexpectedly'));

    await service.runTest('manual');

    expect(ndt7TestSpy).toHaveBeenCalledTimes(1);
  });
});
