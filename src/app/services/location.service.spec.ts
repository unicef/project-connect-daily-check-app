import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed, fakeAsync, flushMicrotasks, tick } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import {
  GEOLOCATE_RETRY_DELAY_MS,
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

  describe('retry', () => {
    // A second attempt only makes sense when the first told us nothing about
    // the answer. Anything the backend decided is decided.
    beforeEach(() => {
      (window as any).electronAPI = { getWifiList: () => Promise.resolve(WIFI) };
      service.saveGeolocation(CACHED_GEO);
    });

    const attemptsFor = (status: number): number => {
      let attempts = 0;
      service.fetchAndSaveGeolocation().subscribe();
      flushMicrotasks();

      httpMock.expectOne(isGeolocate).flush(null, { status, statusText: 'x' });
      attempts++;
      tick(GEOLOCATE_RETRY_DELAY_MS);

      const retried = httpMock.match(isGeolocate);
      retried.forEach((r) => {
        attempts++;
        r.flush(null, { status, statusText: 'x' });
      });
      tick(GEOLOCATE_RETRY_DELAY_MS);
      return attempts;
    };

    it('does not retry a 422: those access points will not resolve next time either', fakeAsync(() => {
      expect(attemptsFor(422)).toBe(1);
    }));

    it('does not retry a 401', fakeAsync(() => {
      expect(attemptsFor(401)).toBe(1);
    }));

    it('does not retry a 400', fakeAsync(() => {
      expect(attemptsFor(400)).toBe(1);
    }));

    it('still retries a 503', fakeAsync(() => {
      expect(attemptsFor(503)).toBe(2);
    }));

    it('still retries a 504', fakeAsync(() => {
      expect(attemptsFor(504)).toBe(2);
    }));

    it('still retries a request that never reached the backend', fakeAsync(() => {
      expect(attemptsFor(0)).toBe(2);
    }));

    it('keeps the cached geolocation after a failure that is not retried', fakeAsync(() => {
      const emitted: any[] = [];
      service.fetchAndSaveGeolocation().subscribe((geo) => emitted.push(geo));
      flushMicrotasks();

      httpMock
        .expectOne(isGeolocate)
        .flush(null, { status: 401, statusText: 'Unauthorized' });
      tick(GEOLOCATE_RETRY_DELAY_MS);

      expect(emitted).toEqual([CACHED_GEO]);
      expect(service.getSavedGeolocation()).toEqual(CACHED_GEO);
    }));
  });
});
