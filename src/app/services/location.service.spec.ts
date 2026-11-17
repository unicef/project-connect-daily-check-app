import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed, fakeAsync, flushMicrotasks, tick } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import {
  GEOLOCATE_RETRY_DELAY_MS,
  GEOLOCATE_TIMEOUT_MS,
  LocationService,
  WIFI_SCAN_TIMEOUT_MS,
  hasNetworkChanged,
  normaliseNetworkIdentity,
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
    localStorage.removeItem('geolocationNetwork');
  });

  afterEach(() => {
    (window as any).electronAPI = originalElectronAPI;
    localStorage.removeItem('geolocation');
    localStorage.removeItem('wifiAccessPoints');
    localStorage.removeItem('geolocationNetwork');
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

  describe('network identity', () => {
    it('treats empty values as unknown and writes ASNs one way', () => {
      expect(normaliseNetworkIdentity({ ssid: ' ', asn: '', isp: '' })).toBeNull();
      expect(normaliseNetworkIdentity(null)).toBeNull();
      expect(normaliseNetworkIdentity({ ssid: ' School ', asn: 1234, isp: ' Tigo ' })).toEqual({
        ssid: 'School',
        asn: 'AS1234',
        isp: 'Tigo',
      });
      expect(normaliseNetworkIdentity({ asn: 'as1234' })!.asn).toBe('AS1234');
    });

    it('only compares the parts known on both sides', () => {
      const school = { ssid: 'School', asn: 'AS1', isp: 'Tigo' };
      expect(hasNetworkChanged(school, { ssid: 'Home', asn: 'AS1', isp: 'Tigo' })).toBeTrue();
      expect(hasNetworkChanged(school, { ssid: 'School', asn: 'AS2', isp: 'Claro' })).toBeTrue();
      expect(hasNetworkChanged(school, { ssid: null, asn: 'AS1', isp: null })).toBeFalse();
      expect(hasNetworkChanged(school, { ssid: null, asn: null, isp: 'tigo' })).toBeFalse();
      expect(hasNetworkChanged(school, { ssid: null, asn: null, isp: 'Claro' })).toBeTrue();
      expect(hasNetworkChanged({ ssid: 'School', asn: null, isp: null }, { ssid: null, asn: 'AS2', isp: null })).toBeFalse();
      expect(hasNetworkChanged(null, school)).toBeFalse();
      expect(hasNetworkChanged(school, null)).toBeFalse();
    });
  });

  describe('fetchAndSaveGeolocation on a changed network', () => {
    const SCHOOL = { ssid: 'School-WiFi', asn: 'AS1001', isp: 'AS1001 Tigo' };
    const HOME = { ssid: 'Home-WiFi', asn: 'AS2002', isp: 'AS2002 Claro' };
    const RESOLVED_AT = 1_700_000_000_000;
    const SAVED_GEO = { latitude: 14.07, longitude: -87.19, accuracy: 30, timestamp: RESOLVED_AT };
    const SAVED_MACS = ['aa:bb:cc:dd:ee:01', 'aa:bb:cc:dd:ee:02'];
    const OTHER_WIFI = [
      { ssid: 'x', signal: -40, macAddress: 'AA:BB:CC:DD:EE:99' },
      { ssid: 'y', signal: -60, macAddress: 'AA:BB:CC:DD:EE:98' },
    ];

    const scanReturns = (list: any[]) =>
      ((window as any).electronAPI = { getWifiList: () => Promise.resolve(list) });

    /** Saved state as a fetch on the school network leaves it. */
    const savedAtSchool = (identity: any = SCHOOL) => {
      service.saveGeolocation(SAVED_GEO as any);
      service.saveWifiAccessPoints(SAVED_MACS);
      if (identity) {
        service.saveNetworkIdentity(identity);
      }
    };

    /** Runs one fetch; the geolocate request, if any, fails with a 422. */
    const fetchWithFailingLookup = (identity: any): any[] => {
      const emitted: any[] = [];
      service.fetchAndSaveGeolocation(identity).subscribe((geo) => emitted.push(geo));
      flushMicrotasks();
      httpMock.match(isGeolocate).forEach((r) => r.flush(null, { status: 422, statusText: 'x' }));
      tick(GEOLOCATE_RETRY_DELAY_MS);
      return emitted;
    };

    it('sends the saved location on the same network when the lookup fails', fakeAsync(() => {
      savedAtSchool();
      scanReturns(OTHER_WIFI);

      expect(fetchWithFailingLookup(SCHOOL)).toEqual([SAVED_GEO]);
    }));

    it('sends no location when the Wi-Fi name changed and the lookup fails', fakeAsync(() => {
      savedAtSchool();
      scanReturns(OTHER_WIFI);

      expect(fetchWithFailingLookup({ ...SCHOOL, ssid: 'Home-WiFi' })).toEqual([null]);
    }));

    it('sends no location when the provider changed and the lookup fails', fakeAsync(() => {
      savedAtSchool();
      scanReturns(OTHER_WIFI);

      expect(fetchWithFailingLookup({ ...SCHOOL, asn: 'AS2002', isp: 'AS2002 Claro' })).toEqual([null]);
    }));

    it('compares the provider name when no ASN is known', fakeAsync(() => {
      savedAtSchool({ ssid: null, asn: null, isp: 'Tigo' });
      scanReturns(OTHER_WIFI);

      expect(fetchWithFailingLookup({ ssid: null, asn: null, isp: 'Claro' })).toEqual([null]);
    }));

    it('sends no location when the network changed and the scan is empty', fakeAsync(() => {
      savedAtSchool();
      scanReturns([]);

      const emitted: any[] = [];
      service.fetchAndSaveGeolocation(HOME).subscribe((geo) => emitted.push(geo));
      flushMicrotasks();

      expect(emitted).toEqual([null]);
      httpMock.expectNone(isGeolocate);
    }));

    it('looks up instead of reusing when the network changed but the access points match', fakeAsync(() => {
      savedAtSchool();
      scanReturns(WIFI); // the same two access points as SAVED_MACS

      expect(fetchWithFailingLookup(HOME)).toEqual([null]);
    }));

    it('saves and sends a fresh location with the new network when the lookup succeeds', fakeAsync(() => {
      savedAtSchool();
      scanReturns(OTHER_WIFI);
      const fresh = { location: { lat: 15.5, lng: -88 }, latitude: 15.5, longitude: -88 };

      const emitted: any[] = [];
      service.fetchAndSaveGeolocation(HOME).subscribe((geo) => emitted.push(geo));
      flushMicrotasks();
      httpMock.expectOne(isGeolocate).flush(fresh);

      expect(emitted).toEqual([jasmine.objectContaining(fresh)]);
      expect(service.getSavedGeolocation()).toEqual(jasmine.objectContaining(fresh));
      expect(service.getSavedNetworkIdentity()).toEqual(HOME);
      expect(service.getSavedWifiAccessPoints()).toEqual(['aa:bb:cc:dd:ee:98', 'aa:bb:cc:dd:ee:99']);
    }));

    it('keeps the saved location for when the PC goes back to that network', fakeAsync(() => {
      savedAtSchool();
      scanReturns(OTHER_WIFI);

      expect(fetchWithFailingLookup(HOME)).toEqual([null]);
      expect(service.getSavedGeolocation()).toEqual(SAVED_GEO as any);
      expect(service.getSavedNetworkIdentity()).toEqual(SCHOOL);
      expect(service.getSavedWifiAccessPoints()).toEqual(SAVED_MACS);

      // Back at school, the lookup still failing.
      expect(fetchWithFailingLookup(SCHOOL)).toEqual([SAVED_GEO]);
    }));

    it('behaves as before when the identity is unknown on one side', fakeAsync(() => {
      savedAtSchool({ ssid: 'School-WiFi', asn: null, isp: null });
      scanReturns(OTHER_WIFI);
      expect(fetchWithFailingLookup({ ssid: null, asn: 'AS2002', isp: null })).toEqual([SAVED_GEO]);
      expect(fetchWithFailingLookup(null)).toEqual([SAVED_GEO]);

      scanReturns([]);
      expect(fetchWithFailingLookup(null)).toEqual([SAVED_GEO]);
    }));

    it('keeps the original timestamp on a reused location', fakeAsync(() => {
      savedAtSchool();

      // Same access points: reused without a lookup.
      scanReturns(WIFI);
      const reused = fetchWithFailingLookup(SCHOOL);
      // Lookup failed: falls back to the saved one.
      scanReturns(OTHER_WIFI);
      const fallback = fetchWithFailingLookup(SCHOOL);

      expect(reused[0].timestamp).toBe(RESOLVED_AT);
      expect(fallback[0].timestamp).toBe(RESOLVED_AT);
      expect(service.getSavedGeolocation()).toEqual(SAVED_GEO as any);
    }));

    it('stamps a fresh location with the time it was resolved', fakeAsync(() => {
      scanReturns(OTHER_WIFI);
      const before = Date.now();

      const emitted: any[] = [];
      service.fetchAndSaveGeolocation(SCHOOL).subscribe((geo) => emitted.push(geo));
      flushMicrotasks();
      httpMock.expectOne(isGeolocate).flush({ latitude: 1, longitude: 2 });

      expect(emitted[0].timestamp).toBeGreaterThanOrEqual(before);
      expect((service.getSavedGeolocation() as any).timestamp).toBe(emitted[0].timestamp);
    }));

    it('obeys the rule when the fetch fails before the lookup', fakeAsync(() => {
      savedAtSchool();
      scanReturns(OTHER_WIFI);
      spyOn(service, 'resolveGeolocation').and.throwError('boom');

      const onHome: any[] = [];
      service.fetchAndSaveGeolocation(HOME).subscribe((geo) => onHome.push(geo));
      const atSchool: any[] = [];
      service.fetchAndSaveGeolocation(SCHOOL).subscribe((geo) => atSchool.push(geo));
      flushMicrotasks();

      expect(onHome).toEqual([null]);
      expect(atSchool).toEqual([SAVED_GEO]);
    }));

    describe('a location saved before the network was recorded', () => {
      it('adopts the current network when the access points are unchanged', fakeAsync(() => {
        savedAtSchool(null);
        scanReturns(WIFI);

        expect(fetchWithFailingLookup(SCHOOL)).toEqual([SAVED_GEO]);
        httpMock.expectNone(isGeolocate);
        expect(service.getSavedNetworkIdentity()).toEqual(SCHOOL);
      }));

      it('does not adopt the current network after a failed lookup', fakeAsync(() => {
        savedAtSchool(null);
        scanReturns(OTHER_WIFI);

        expect(fetchWithFailingLookup(HOME)).toEqual([SAVED_GEO]);
        expect(service.getSavedNetworkIdentity()).toBeNull();
      }));

      it('does not adopt the current network on an empty scan', fakeAsync(() => {
        savedAtSchool(null);
        scanReturns([]);

        expect(fetchWithFailingLookup(HOME)).toEqual([SAVED_GEO]);
        expect(service.getSavedNetworkIdentity()).toBeNull();
      }));

      it('records the network with a fresh location', fakeAsync(() => {
        savedAtSchool(null);
        scanReturns(OTHER_WIFI);

        service.fetchAndSaveGeolocation(HOME).subscribe();
        flushMicrotasks();
        httpMock.expectOne(isGeolocate).flush({ latitude: 1, longitude: 2 });

        expect(service.getSavedNetworkIdentity()).toEqual(HOME);
      }));
    });
  });
});
