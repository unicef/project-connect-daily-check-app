import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideHttpClient, withInterceptorsFromDi } from '@angular/common/http';
import { Network } from '@awesome-cordova-plugins/network/ngx';
import ndt7 from '@m-lab/ndt7';
import { MeasurementClientService } from './measurement-client.service';
import { environment } from '../../environments/environment';

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
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});

describe('MeasurementClientService ndt7 package integration', () => {
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

  it('runs the test through the npm package with the giga-meter metadata', async () => {
    await service.runTest('manual');

    expect(ndt7TestSpy).toHaveBeenCalledTimes(1);
    const config = ndt7TestSpy.calls.mostRecent().args[0];
    expect(config.metadata).toEqual({
      client_name: 'giga-meter',
      client_version: environment.app_version,
    });
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
