import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed, fakeAsync, flushMicrotasks, tick } from '@angular/core/testing';
import { provideHttpClient, withInterceptorsFromDi } from '@angular/common/http';
import { of, throwError } from 'rxjs';
import { GEOLOCATE_RETRY_DELAY_MS, GEOLOCATE_TIMEOUT_MS } from './location.service';
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

  describe('ServerInfo', () => {
    const mlab = (extra: any = {}) => ({
      city: 'Madrid',
      url: 'mlab1-mad06.mlab-oti.measurement-lab.org',
      ip: [],
      fqdn: '',
      site: '',
      country: 'ES',
      label: '',
      metro: '',
      ...extra,
    });

    it('sends the Locate metro rank and version', () => {
      const measurement: any = service.makeMeasurement({
        timestamp: Date.now(),
        results: {},
        mlabInformation: mlab({ metroRank: 0, locateVersion: 'v2' }),
      });

      expect(measurement.ServerInfo.MetroRank).toBe(0);
      expect(measurement.ServerInfo.LocateVersion).toBe('v2');
    });

    it('sends null for records saved before the rank was captured', () => {
      const measurement: any = service.makeMeasurement({
        timestamp: Date.now(),
        results: {},
        mlabInformation: mlab(),
      });

      expect(measurement.ServerInfo.MetroRank).toBeNull();
      expect(measurement.ServerInfo.LocateVersion).toBeNull();
      expect(measurement.ServerInfo.LocateTier).toBeNull();
      expect(measurement.ServerInfo.PriorityLocateError).toBeNull();
    });

    it('sends which M-Lab lookup found the server, and why not the priority one', () => {
      const measurement: any = service.makeMeasurement({
        timestamp: Date.now(),
        results: {},
        mlabInformation: mlab(),
        locateTier: 'public',
        priorityLocateError: 'HTTP 401',
      });

      expect(measurement.ServerInfo.LocateTier).toBe('public');
      expect(measurement.ServerInfo.PriorityLocateError).toBe('HTTP 401');
    });
  });

  describe('server_timestamp', () => {
    /**
     * Drives uploadMeasurement far enough to inspect the POST body, with
     * makeMeasurement stubbed so the test does not need a full ndt7 result.
     */
    const post = (record: any, stored: Record<string, string> = {}): any => {
      service['settingService'].currentSettings = { uploadEnabled: true } as any;
      spyOn(service['settingService'], 'get').and.returnValue('');
      spyOn(service['storage'], 'get').and.callFake(
        (key: string) => stored[key] ?? ''
      );
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

    describe('app instance', () => {
      it("sends this install's app instance ID with the browser ID", () => {
        const body = post(
          { Notes: 'manual', timestamp: Date.now() },
          { appInstanceId: 'instance-1', schoolUserId: 'user-1' }
        );

        expect(body['app_instance_id']).toBe('instance-1');
        expect(body.BrowserID).toBe('user-1');
      });

      it('sends null on an install without one yet', () => {
        const body = post({ Notes: 'manual', timestamp: Date.now() });

        expect(body['app_instance_id']).toBeNull();
      });
    });
  });

  describe('when the upload fails', () => {
    afterEach(() => httpMock.verify());

    it('queues the measurement for the offline sync and still reports the failure', async () => {
      service['settingService'].currentSettings = { uploadEnabled: true } as any;
      spyOn(service['settingService'], 'get').and.returnValue('');
      spyOn(service['storage'], 'get').and.returnValue('');
      spyOn(service['hardwareIdService'], 'getHardwareId').and.returnValue(null);
      spyOn(service['locationService'], 'fetchAndSaveGeolocation').and.returnValue(of(null));
      spyOn(service['posthog'], 'capture').and.stub();
      const saveMeasurement = spyOn(service['indexedDB'], 'saveMeasurement').and.resolveTo();
      spyOn(service, 'makeMeasurement').and.callFake((r: any) => {
        service.ts = new Date(r.timestamp);
        return { UUID: 'ndt-1', ClientInfo: {}, Notes: 'manual' } as any;
      });

      const result = service
        .uploadMeasurement({ Notes: 'manual', timestamp: Date.now() })
        .toPromise();
      httpMock
        .expectOne((r) => r.url.endsWith('measurements'))
        .error(new ProgressEvent('error'));

      await expectAsync(result).toBeRejected();
      expect(saveMeasurement).toHaveBeenCalledOnceWith(
        jasmine.objectContaining({ UUID: 'ndt-1', offline_synced: true })
      );
    });
  });

  describe('geolocation that never answers', () => {
    let originalElectronAPI: any;

    beforeEach(() => {
      originalElectronAPI = (window as any).electronAPI;
      localStorage.removeItem('geolocation');
      localStorage.removeItem('wifiAccessPoints');
    });

    afterEach(() => {
      (window as any).electronAPI = originalElectronAPI;
      localStorage.removeItem('geolocation');
      localStorage.removeItem('wifiAccessPoints');
      httpMock.verify();
    });

    it('still posts the measurement once the geolocate requests time out', fakeAsync(() => {
      // A Wi-Fi list that is not cached forces the geolocate call.
      (window as any).electronAPI = {
        getWifiList: () =>
          Promise.resolve([{ ssid: 'ap-1', signal: -40, macAddress: 'aa:bb:cc:dd:ee:01' }]),
      };
      service['settingService'].currentSettings = { uploadEnabled: true } as any;
      spyOn(service['settingService'], 'get').and.returnValue('');
      spyOn(service['storage'], 'get').and.returnValue('');
      spyOn(service['hardwareIdService'], 'getHardwareId').and.returnValue(null);
      spyOn(service['posthog'], 'capture').and.stub();
      spyOn(service, 'makeMeasurement').and.callFake((r: any) => {
        service.ts = new Date(r.timestamp);
        return { ClientInfo: { Country: 'ES', IP: '10.0.0.1' }, Notes: 'manual' } as any;
      });

      let uploaded = false;
      service
        .uploadMeasurement({ Notes: 'manual', timestamp: Date.now() })
        .subscribe(() => (uploaded = true));
      flushMicrotasks();

      // Both attempts (first + retry) are left pending.
      httpMock.expectOne((r) => r.url.endsWith('geolocation/geolocate'));
      httpMock.expectNone((r) => r.url.endsWith('measurements'));
      tick(GEOLOCATE_TIMEOUT_MS + 1_000);
      httpMock.expectOne((r) => r.url.endsWith('geolocation/geolocate'));
      tick(GEOLOCATE_TIMEOUT_MS);

      const upload = httpMock.expectOne((r) => r.url.endsWith('measurements'));
      expect(upload.request.body['geolocation']).toBeNull();
      upload.flush({});
      expect(uploaded).toBeTrue();
    }));
  });

  describe('geolocation saved on another network', () => {
    let originalElectronAPI: any;
    const SAVED_GEO = { latitude: 14.07, longitude: -87.19, timestamp: 1_700_000_000_000 };
    const SCHOOL_AP = 'aa:bb:cc:dd:ee:01';
    const SCHOOL_OTHER_AP = 'aa:bb:cc:dd:ee:02';
    const HOME_AP = '11:22:33:44:55:66';

    const keys = ['geolocation', 'wifiAccessPoints', 'geolocationNetwork'];

    beforeEach(() => {
      originalElectronAPI = (window as any).electronAPI;
      keys.forEach((k) => localStorage.removeItem(k));
      const location = service['locationService'];
      location.saveGeolocation(SAVED_GEO as any);
      location.saveWifiAccessPoints([SCHOOL_AP, SCHOOL_OTHER_AP]);
      location.saveConnectedBssid(SCHOOL_AP);

      service['settingService'].currentSettings = { uploadEnabled: true } as any;
      spyOn(service['settingService'], 'get').and.returnValue('');
      spyOn(service['storage'], 'get').and.returnValue('');
      spyOn(service['hardwareIdService'], 'getHardwareId').and.returnValue(null);
      spyOn(service['posthog'], 'capture').and.stub();
      spyOn(service, 'makeMeasurement').and.callFake((r: any) => {
        service.ts = new Date(r.timestamp);
        return {
          ClientInfo: { Country: 'HN', IP: '10.0.0.1' },
          Notes: 'manual',
        } as any;
      });
    });

    afterEach(() => {
      (window as any).electronAPI = originalElectronAPI;
      keys.forEach((k) => localStorage.removeItem(k));
      httpMock.verify();
    });

    const record = (wifiConnections: any) => ({
      Notes: 'manual',
      timestamp: Date.now(),
      wifiConnections,
    });
    const connectedTo = (bssid: string) =>
      record([{ iface: 'Wi-Fi', ssid: 'Some-WiFi', bssid }]);

    it('passes the connected BSSID to the location lookup', () => {
      const fetch = spyOn(service['locationService'], 'fetchAndSaveGeolocation').and.returnValue(of(null));

      // The first entry with a usable BSSID, written one way.
      service
        .uploadMeasurement(
          record([
            { iface: 'Wi-Fi 2', ssid: 'Some-WiFi', bssid: '' },
            { iface: 'Wi-Fi', ssid: 'Home-WiFi', bssid: '11-22-33-44-55-66' },
          ])
        )
        .subscribe();
      httpMock.expectOne((r) => r.url.endsWith('measurements')).flush({});

      expect(fetch).toHaveBeenCalledOnceWith(HOME_AP);
    });

    it('passes no BSSID when none is known', () => {
      const fetch = spyOn(service['locationService'], 'fetchAndSaveGeolocation').and.returnValue(of(null));

      // On a cable, and when Windows hides the Wi-Fi details.
      [null, [], [{ iface: 'Wi-Fi', ssid: 'Home-WiFi' }]].forEach((connections) => {
        service.uploadMeasurement(record(connections)).subscribe();
        httpMock.expectOne((r) => r.url.endsWith('measurements')).flush({});
      });

      expect(fetch.calls.allArgs()).toEqual([[null], [null], [null]]);
    });

    describe('when the location fetch fails', () => {
      beforeEach(() => {
        spyOn(service['locationService'], 'fetchAndSaveGeolocation').and.returnValue(
          throwError(() => new Error('boom'))
        );
      });

      const uploadedGeolocation = (rec: any) => {
        service.uploadMeasurement(rec).subscribe();
        const upload = httpMock.expectOne((r) => r.url.endsWith('measurements'));
        const geo = upload.request.body['geolocation'];
        upload.flush({});
        return geo;
      };

      it('sends no location after the PC moved', () => {
        expect(uploadedGeolocation(connectedTo(HOME_AP))).toBeNull();
      });

      it('still sends the saved location on the same access point', () => {
        expect(uploadedGeolocation(connectedTo(SCHOOL_AP.toUpperCase()))).toEqual(SAVED_GEO);
      });

      it('still sends the saved location on another access point of the same place', () => {
        expect(uploadedGeolocation(connectedTo(SCHOOL_OTHER_AP))).toEqual(SAVED_GEO);
      });

      it('still sends the saved location when no BSSID is known', () => {
        expect(uploadedGeolocation(record(null))).toEqual(SAVED_GEO);
      });
    });

    it('sends no location after a moved PC fails the lookup, end to end', fakeAsync(() => {
      (window as any).electronAPI = {
        getWifiList: () =>
          Promise.resolve([{ ssid: 'x', signal: -40, macAddress: HOME_AP }]),
      };

      service.uploadMeasurement(connectedTo(HOME_AP)).subscribe();
      flushMicrotasks();
      httpMock
        .expectOne((r) => r.url.endsWith('geolocation/geolocate'))
        .flush(null, { status: 422, statusText: 'Unprocessable Entity' });
      tick(GEOLOCATE_RETRY_DELAY_MS);

      const upload = httpMock.expectOne((r) => r.url.endsWith('measurements'));
      expect(upload.request.body['geolocation']).toBeNull();
      upload.flush({});
      expect(service['locationService'].getSavedGeolocation()).toEqual(SAVED_GEO as any);
      expect(service['locationService'].getSavedConnectedBssid()).toBe(SCHOOL_AP);
    }));
  });
});
