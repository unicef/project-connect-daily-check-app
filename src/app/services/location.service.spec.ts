import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed, fakeAsync, flushMicrotasks, tick } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import {
  GEOLOCATE_RETRY_DELAY_MS,
  GEOLOCATE_TIMEOUT_MS,
  LocationService,
  WIFI_SCAN_TIMEOUT_MS,
  hasNetworkChanged,
  normaliseBssid,
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

  describe('connected BSSID', () => {
    it('writes every usable BSSID one way', () => {
      expect(normaliseBssid('AA:BB:CC:DD:EE:0F')).toBe('aa:bb:cc:dd:ee:0f');
      expect(normaliseBssid('aa-bb-cc-dd-ee-0f')).toBe('aa:bb:cc:dd:ee:0f');
      expect(normaliseBssid(' AA-BB-CC-DD-EE-0F ')).toBe('aa:bb:cc:dd:ee:0f');
      expect(normaliseBssid('aabbccddee0f')).toBe('aa:bb:cc:dd:ee:0f');
    });

    it('treats anything that is not a usable address as unknown', () => {
      [
        null,
        undefined,
        '',
        123,
        'aa:bb:cc:dd:ee',
        'aa:bb:cc:dd:ee:ff:01',
        'zz:bb:cc:dd:ee:ff',
        '00:00:00:00:00:00',
        'FF-FF-FF-FF-FF-FF',
        // What an earlier test build saved under the same key.
        JSON.stringify({ ssid: 'School-WiFi', asn: 'AS1', isp: null }),
      ].forEach((raw) => expect(normaliseBssid(raw)).withContext(String(raw)).toBeNull());
    });

    it('is a change only for a known, different BSSID outside the saved access points', () => {
      const saved = ['aa:bb:cc:dd:ee:01', 'aa:bb:cc:dd:ee:02'];
      expect(hasNetworkChanged('aa:bb:cc:dd:ee:01', '11:22:33:44:55:66', saved)).toBeTrue();
      expect(hasNetworkChanged('aa:bb:cc:dd:ee:01', 'aa:bb:cc:dd:ee:01', saved)).toBeFalse();
      // Another access point of the same place, in any format.
      expect(hasNetworkChanged('aa:bb:cc:dd:ee:01', 'AA-BB-CC-DD-EE-02', saved)).toBeFalse();
      // The same access point written differently.
      expect(hasNetworkChanged('AA-BB-CC-DD-EE-01', 'aa:bb:cc:dd:ee:01', [])).toBeFalse();
      // Unknown on either side.
      expect(hasNetworkChanged(null, '11:22:33:44:55:66', saved)).toBeFalse();
      expect(hasNetworkChanged('aa:bb:cc:dd:ee:01', null, saved)).toBeFalse();
      expect(hasNetworkChanged('aa:bb:cc:dd:ee:01', '00:00:00:00:00:00', saved)).toBeFalse();
      // A broken saved list cannot vouch for anything.
      expect(hasNetworkChanged('aa:bb:cc:dd:ee:01', '11:22:33:44:55:66', null as any)).toBeTrue();
    });

    it('saves the BSSID one way and removes it when unknown', () => {
      service.saveConnectedBssid('AA-BB-CC-DD-EE-01');
      expect(localStorage.getItem('geolocationNetwork')).toBe('aa:bb:cc:dd:ee:01');
      expect(service.getSavedConnectedBssid()).toBe('aa:bb:cc:dd:ee:01');

      service.saveConnectedBssid('00:00:00:00:00:00');
      expect(localStorage.getItem('geolocationNetwork')).toBeNull();
      expect(service.getSavedConnectedBssid()).toBeNull();
    });

    it('ignores a value saved in the earlier shape', () => {
      localStorage.setItem(
        'geolocationNetwork',
        JSON.stringify({ ssid: 'School-WiFi', asn: 'AS1001', isp: 'Tigo' })
      );
      expect(service.getSavedConnectedBssid()).toBeNull();
    });
  });

  describe('fetchAndSaveGeolocation on a changed network', () => {
    // The PC was connected to the first school access point when the saved
    // location was worked out; the second one was also in that scan.
    const SCHOOL_AP = 'aa:bb:cc:dd:ee:01';
    const SCHOOL_OTHER_AP = 'aa:bb:cc:dd:ee:02';
    const HOME_AP = '11:22:33:44:55:66';
    const RESOLVED_AT = 1_700_000_000_000;
    const SAVED_GEO = { latitude: 14.07, longitude: -87.19, accuracy: 30, timestamp: RESOLVED_AT };
    const SAVED_MACS = [SCHOOL_AP, SCHOOL_OTHER_AP];
    const OTHER_WIFI = [
      { ssid: 'x', signal: -40, macAddress: '11:22:33:44:55:66' },
      { ssid: 'y', signal: -60, macAddress: 'AA:BB:CC:DD:EE:98' },
    ];

    const scanReturns = (list: any[]) =>
      ((window as any).electronAPI = { getWifiList: () => Promise.resolve(list) });

    /** Saved state as a fetch at school leaves it. */
    const savedAtSchool = (bssid: string | null = SCHOOL_AP) => {
      service.saveGeolocation(SAVED_GEO as any);
      service.saveWifiAccessPoints(SAVED_MACS);
      service.saveConnectedBssid(bssid);
    };

    /** Runs one fetch; the geolocate request, if any, fails with a 422. */
    const fetchWithFailingLookup = (bssid: string | null): any[] => {
      const emitted: any[] = [];
      service.fetchAndSaveGeolocation(bssid).subscribe((geo) => emitted.push(geo));
      flushMicrotasks();
      httpMock.match(isGeolocate).forEach((r) => r.flush(null, { status: 422, statusText: 'x' }));
      tick(GEOLOCATE_RETRY_DELAY_MS);
      return emitted;
    };

    /** Runs one fetch whose geolocate request succeeds with `geo`. */
    const fetchWithLookup = (bssid: string | null, geo: any): any[] => {
      const emitted: any[] = [];
      service.fetchAndSaveGeolocation(bssid).subscribe((value) => emitted.push(value));
      flushMicrotasks();
      httpMock.expectOne(isGeolocate).flush(geo);
      return emitted;
    };

    it('sends the saved location on the same access point when the lookup fails', fakeAsync(() => {
      savedAtSchool();
      scanReturns(OTHER_WIFI);

      expect(fetchWithFailingLookup(SCHOOL_AP)).toEqual([SAVED_GEO]);
    }));

    it('matches the same access point however the BSSID is written', fakeAsync(() => {
      savedAtSchool('AA-BB-CC-DD-EE-01');
      scanReturns(OTHER_WIFI);

      expect(fetchWithFailingLookup('AA:BB:CC:DD:EE:01')).toEqual([SAVED_GEO]);
    }));

    it('sends no location when the PC is on another access point and the lookup fails', fakeAsync(() => {
      savedAtSchool();
      scanReturns(OTHER_WIFI);

      expect(fetchWithFailingLookup(HOME_AP)).toEqual([null]);
    }));

    it('sends no location when the PC is on another access point and the scan is empty', fakeAsync(() => {
      savedAtSchool();
      scanReturns([]);

      expect(fetchWithFailingLookup(HOME_AP)).toEqual([null]);
      httpMock.expectNone(isGeolocate);
    }));

    it('keeps the saved location on another access point of the same place', fakeAsync(() => {
      savedAtSchool();

      // The lookup fails.
      scanReturns(OTHER_WIFI);
      expect(fetchWithFailingLookup(SCHOOL_OTHER_AP)).toEqual([SAVED_GEO]);
      // The scan is empty.
      scanReturns([]);
      expect(fetchWithFailingLookup(SCHOOL_OTHER_AP.toUpperCase())).toEqual([SAVED_GEO]);
      // The access points are unchanged: reused without a lookup.
      scanReturns(WIFI);
      expect(fetchWithFailingLookup(SCHOOL_OTHER_AP)).toEqual([SAVED_GEO]);

      expect(service.getSavedConnectedBssid()).toBe(SCHOOL_AP);
    }));

    it('looks up instead of reusing when the PC moved but the access points match', fakeAsync(() => {
      savedAtSchool();
      scanReturns(WIFI); // the same two access points as SAVED_MACS

      expect(fetchWithFailingLookup(HOME_AP)).toEqual([null]);
    }));

    it('saves and sends a fresh location with the new BSSID when the lookup succeeds', fakeAsync(() => {
      savedAtSchool();
      scanReturns(OTHER_WIFI);
      const fresh = { location: { lat: 15.5, lng: -88 }, latitude: 15.5, longitude: -88 };

      const emitted = fetchWithLookup(HOME_AP.toUpperCase(), fresh);

      expect(emitted).toEqual([jasmine.objectContaining(fresh)]);
      expect(service.getSavedGeolocation()).toEqual(jasmine.objectContaining(fresh));
      expect(service.getSavedConnectedBssid()).toBe(HOME_AP);
      expect(service.getSavedWifiAccessPoints()).toEqual([HOME_AP, 'aa:bb:cc:dd:ee:98']);
    }));

    it('removes the saved BSSID when a fresh location comes with none', fakeAsync(() => {
      savedAtSchool();
      scanReturns(OTHER_WIFI);

      fetchWithLookup(null, { latitude: 1, longitude: 2 });

      expect(service.getSavedConnectedBssid()).toBeNull();
    }));

    it('keeps the saved location for when the PC goes back', fakeAsync(() => {
      savedAtSchool();
      scanReturns(OTHER_WIFI);

      expect(fetchWithFailingLookup(HOME_AP)).toEqual([null]);
      expect(service.getSavedGeolocation()).toEqual(SAVED_GEO as any);
      expect(service.getSavedConnectedBssid()).toBe(SCHOOL_AP);
      expect(service.getSavedWifiAccessPoints()).toEqual(SAVED_MACS);

      // Back at school, the lookup still failing.
      expect(fetchWithFailingLookup(SCHOOL_AP)).toEqual([SAVED_GEO]);
    }));

    it('behaves as before when the current BSSID is unknown', fakeAsync(() => {
      savedAtSchool();
      scanReturns(OTHER_WIFI);
      expect(fetchWithFailingLookup(null)).toEqual([SAVED_GEO]);
      expect(fetchWithFailingLookup('00:00:00:00:00:00')).toEqual([SAVED_GEO]);
      expect(fetchWithFailingLookup('not-a-bssid')).toEqual([SAVED_GEO]);

      scanReturns([]);
      expect(fetchWithFailingLookup(null)).toEqual([SAVED_GEO]);
      expect(service.getSavedConnectedBssid()).toBe(SCHOOL_AP);
    }));

    it('behaves as before when the saved value has the earlier shape', fakeAsync(() => {
      savedAtSchool(null);
      localStorage.setItem(
        'geolocationNetwork',
        JSON.stringify({ ssid: 'School-WiFi', asn: 'AS1001', isp: 'Tigo' })
      );
      scanReturns(OTHER_WIFI);
      expect(fetchWithFailingLookup(HOME_AP)).toEqual([SAVED_GEO]);

      // Same access points: the current BSSID replaces the old value.
      scanReturns(WIFI);
      expect(fetchWithFailingLookup(SCHOOL_AP)).toEqual([SAVED_GEO]);
      expect(localStorage.getItem('geolocationNetwork')).toBe(SCHOOL_AP);
    }));

    it('keeps the original timestamp on a reused location', fakeAsync(() => {
      savedAtSchool();

      // Same access points: reused without a lookup.
      scanReturns(WIFI);
      const reused = fetchWithFailingLookup(SCHOOL_AP);
      // Lookup failed: falls back to the saved one.
      scanReturns(OTHER_WIFI);
      const fallback = fetchWithFailingLookup(SCHOOL_AP);

      expect(reused[0].timestamp).toBe(RESOLVED_AT);
      expect(fallback[0].timestamp).toBe(RESOLVED_AT);
      expect(service.getSavedGeolocation()).toEqual(SAVED_GEO as any);
    }));

    it('stamps a fresh location with the time it was resolved', fakeAsync(() => {
      scanReturns(OTHER_WIFI);
      const before = Date.now();

      const emitted = fetchWithLookup(SCHOOL_AP, { latitude: 1, longitude: 2 });

      expect(emitted[0].timestamp).toBeGreaterThanOrEqual(before);
      expect((service.getSavedGeolocation() as any).timestamp).toBe(emitted[0].timestamp);
    }));

    it('obeys the rule when the fetch fails before the lookup', fakeAsync(() => {
      savedAtSchool();
      scanReturns(OTHER_WIFI);
      spyOn(service, 'resolveGeolocation').and.throwError('boom');

      const onHome: any[] = [];
      service.fetchAndSaveGeolocation(HOME_AP).subscribe((geo) => onHome.push(geo));
      const onOtherSchoolAp: any[] = [];
      service.fetchAndSaveGeolocation(SCHOOL_OTHER_AP).subscribe((geo) => onOtherSchoolAp.push(geo));
      const atSchool: any[] = [];
      service.fetchAndSaveGeolocation(SCHOOL_AP).subscribe((geo) => atSchool.push(geo));
      flushMicrotasks();

      expect(onHome).toEqual([null]);
      expect(onOtherSchoolAp).toEqual([SAVED_GEO]);
      expect(atSchool).toEqual([SAVED_GEO]);
    }));

    describe('a location saved before the BSSID was recorded', () => {
      it('behaves as before when the lookup fails or the scan is empty', fakeAsync(() => {
        savedAtSchool(null);

        scanReturns(OTHER_WIFI);
        expect(fetchWithFailingLookup(HOME_AP)).toEqual([SAVED_GEO]);
        scanReturns([]);
        expect(fetchWithFailingLookup(HOME_AP)).toEqual([SAVED_GEO]);

        // Neither tells where the PC is, so the BSSID is not adopted.
        expect(service.getSavedConnectedBssid()).toBeNull();
      }));

      it('adopts the current BSSID when the access points are unchanged', fakeAsync(() => {
        savedAtSchool(null);
        scanReturns(WIFI);

        expect(fetchWithFailingLookup(SCHOOL_AP.toUpperCase())).toEqual([SAVED_GEO]);
        httpMock.expectNone(isGeolocate);
        expect(service.getSavedConnectedBssid()).toBe(SCHOOL_AP);
      }));

      it('records the BSSID with a fresh location', fakeAsync(() => {
        savedAtSchool(null);
        scanReturns(OTHER_WIFI);

        fetchWithLookup(HOME_AP, { latitude: 1, longitude: 2 });

        expect(service.getSavedConnectedBssid()).toBe(HOME_AP);
      }));
    });
  });
});
