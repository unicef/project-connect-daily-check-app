import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideHttpClient, withInterceptorsFromDi } from '@angular/common/http';
import { Network } from '@awesome-cordova-plugins/network/ngx';
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
