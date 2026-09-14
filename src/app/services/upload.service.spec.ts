import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideHttpClient, withInterceptorsFromDi } from '@angular/common/http';
import { of } from 'rxjs';
import { UploadService } from './upload.service';

describe('UploadService', () => {
  let service: UploadService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
    imports: [],
    providers: [provideHttpClient(withInterceptorsFromDi()), provideHttpClientTesting()]
});
    service = TestBed.inject(UploadService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  describe('server_timestamp', () => {
    /**
     * Drives uploadMeasurement far enough to inspect the POST body, with
     * makeMeasurement stubbed so the test does not need a full ndt7 result.
     */
    const post = (record: any): any => {
      service['settingService'].currentSettings = { uploadEnabled: true } as any;
      spyOn(service['settingService'], 'get').and.returnValue('');
      spyOn(service['storage'], 'get').and.returnValue('');
      spyOn(service['hardwareIdService'], 'getHardwareId').and.returnValue(null);
      spyOn(service['locationService'], 'fetchAndSaveGeolocation').and.returnValue(of(null));
      spyOn(service['locationService'], 'saveGeolocation').and.stub();
      spyOn(service['posthog'], 'capture').and.stub();
      // makeMeasurement is where `ts` (the device clock) normally gets set,
      // so the fake has to keep doing that for the rest of the method to run.
      spyOn(service, 'makeMeasurement').and.callFake((r: any) => {
        service.ts = new Date(r.timestamp);
        return {
          ClientInfo: { Country: 'TZ', IP: '10.0.0.1' },
          Notes: 'manual',
        } as any;
      });

      service.uploadMeasurement(record).subscribe();
      const req = httpMock.expectOne((r) => r.url.endsWith('measurements'));
      req.flush({});
      return req.request.body;
    };

    afterEach(() => httpMock.verify());

    it('sends the ndt7 server clock as an ISO string', () => {
      const serverTimestamp = Date.UTC(2026, 7, 24, 10, 30, 0);

      const body = post({ Notes: 'manual', timestamp: Date.now(), serverTimestamp });

      expect(body['server_timestamp']).toBe(new Date(serverTimestamp).toISOString());
    });

    it('sends null when ndt7 could not read a server clock', () => {
      const body = post({ Notes: 'manual', timestamp: Date.now(), serverTimestamp: null });

      expect(body['server_timestamp']).toBeNull();
    });
  });
});
