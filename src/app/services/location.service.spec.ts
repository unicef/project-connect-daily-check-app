import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed, fakeAsync, flushMicrotasks, tick } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import {
  GEOLOCATE_TIMEOUT_MS,
  LocationService,
  WIFI_SCAN_TIMEOUT_MS,
} from './location.service';

describe('LocationService', () => {
  let service: LocationService;
  let httpMock: HttpTestingController;
  let originalElectronAPI: any;

  const CACHED_GEO = { latitude: 40.4168, longitude: -3.7038 };
  const WIFI = [
    { ssid: 'ap-1', signal: -40, macAddress: 'AA:BB:CC:DD:EE:01' },
    { ssid: 'ap-2', signal: -65, macAddress: 'AA:BB:CC:DD:EE:02' },
  ];
  const isGeolocate = (r: { url: string }) => r.url.endsWith('geolocation/geolocate');

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(LocationService);
    httpMock = TestBed.inject(HttpTestingController);

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

  describe('fetchAndSaveGeolocation', () => {
    it('falls back to the cached geolocation when geolocate never answers', fakeAsync(() => {
      (window as any).electronAPI = { getWifiList: () => Promise.resolve(WIFI) };
      service.saveGeolocation(CACHED_GEO); // cached, but for a different Wi-Fi list

      const emitted: any[] = [];
      let completed = false;
      service.fetchAndSaveGeolocation().subscribe({
        next: (geo) => emitted.push(geo),
        complete: () => (completed = true),
      });
      flushMicrotasks();

      // First attempt is left pending until the timeout cancels it.
      const first = httpMock.expectOne(isGeolocate);
      tick(GEOLOCATE_TIMEOUT_MS);
      expect(first.cancelled).toBeTrue();

      // One retry after 1 s, also left pending.
      tick(1_000);
      const second = httpMock.expectOne(isGeolocate);
      tick(GEOLOCATE_TIMEOUT_MS);
      expect(second.cancelled).toBeTrue();

      expect(emitted).toEqual([CACHED_GEO]);
      expect(completed).toBeTrue();
    }));

    it('emits null when geolocate never answers and nothing is cached', fakeAsync(() => {
      (window as any).electronAPI = { getWifiList: () => Promise.resolve(WIFI) };

      const emitted: any[] = [];
      service.fetchAndSaveGeolocation().subscribe((geo) => emitted.push(geo));
      flushMicrotasks();

      httpMock.expectOne(isGeolocate);
      tick(GEOLOCATE_TIMEOUT_MS + 1_000);
      httpMock.expectOne(isGeolocate);
      tick(GEOLOCATE_TIMEOUT_MS);

      expect(emitted).toEqual([null]);
    }));

    it('uses the answer when geolocate responds in time', fakeAsync(() => {
      (window as any).electronAPI = { getWifiList: () => Promise.resolve(WIFI) };
      const fresh = { latitude: 1, longitude: 2 };

      const emitted: any[] = [];
      service.fetchAndSaveGeolocation().subscribe((geo) => emitted.push(geo));
      flushMicrotasks();

      httpMock.expectOne(isGeolocate).flush({ location: { lat: 1, lng: 2 }, ...fresh });
      tick();

      expect(emitted.length).toBe(1);
      expect(emitted[0]).toEqual(jasmine.objectContaining(fresh));
    }));

    it('falls back to the cache without calling the backend when the Wi-Fi scan hangs', fakeAsync(() => {
      (window as any).electronAPI = { getWifiList: () => new Promise(() => undefined) };
      service.saveGeolocation(CACHED_GEO);

      const emitted: any[] = [];
      service.fetchAndSaveGeolocation().subscribe((geo) => emitted.push(geo));
      flushMicrotasks();
      expect(emitted).toEqual([]);

      tick(WIFI_SCAN_TIMEOUT_MS);
      flushMicrotasks();

      expect(emitted).toEqual([CACHED_GEO]);
      httpMock.expectNone(isGeolocate);
    }));
  });
});
