import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideHttpClient, withInterceptorsFromDi } from '@angular/common/http';
import { Network } from '@awesome-cordova-plugins/network/ngx';
import ndt7 from '../../assets/js/ndt/ndt7.js';
import { MeasurementClientService } from './measurement-client.service';

/**
 * Minimal shape of a finished ndt7 run: just the fields finalizeMeasurement
 * and calculateDataUsage read. `ServerTime` is what ndt7.js now reports from
 * the Date header of the locate response.
 */
const resultsWith = (s2cServerTime: any, c2sServerTime: any) => ({
  'NDTResult.S2C': {
    ServerTime: s2cServerTime,
    LastServerMeasurement: {
      ConnectionInfo: { UUID: 'ndt-abcde_1591240104_00000000000042C7' },
      TCPInfo: { BytesAcked: 10, BytesReceived: 20 },
    },
  },
  'NDTResult.C2S': {
    ServerTime: c2sServerTime,
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
      getDeviceNetworkInformation: jasmine
        .createSpy('getDeviceNetworkInformation')
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

    service = new MeasurementClientService(
      historyService,
      settingsService,
      networkService,
      uploadService,
      sharedService,
      deviceContext
    );
    spyOn<any>(service, 'finalizeMeasurement').and.resolveTo(undefined);
  });

  it('runs the test through the vendored ndt7 with the worker files', async () => {
    await service.runTest('manual');

    expect(ndt7TestSpy).toHaveBeenCalledTimes(1);
    const config = ndt7TestSpy.calls.mostRecent().args[0];
    // No `metadata` here on purpose: the vendored ndt7.js hardcodes the client
    // name and version, unlike the npm package this reverted away from.
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

  it('does not retry non-locate test failures', async () => {
    ndt7TestSpy.and.rejectWith(new Error('websocket closed unexpectedly'));

    await service.runTest('manual');

    expect(ndt7TestSpy).toHaveBeenCalledTimes(1);
  });
});
