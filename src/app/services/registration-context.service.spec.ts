import { TestBed } from '@angular/core/testing';
import { provideHttpClient, withInterceptorsFromDi } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { of } from 'rxjs';

import {
  APP_INSTANCE_ID_KEY,
  RegistrationContextService,
} from './registration-context.service';
import { LocationService } from './location.service';
import { StorageService } from './storage.service';

describe('RegistrationContextService', () => {
  const UUID =
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
  let service: RegistrationContextService;
  let location: LocationService;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptorsFromDi()),
        provideHttpClientTesting(),
      ],
    });
    service = TestBed.inject(RegistrationContextService);
    location = TestBed.inject(LocationService);

    // Electron IPC and a remote IP service: stubbed.
    spyOn(service, 'getDeviceInfo').and.resolveTo({
      operatingSystem: 'windows',
    } as any);
    spyOn(service, 'getDeviceId').and.resolveTo({ identifier: 'device-1' });
    spyOn(service, 'getIPAddress').and.resolveTo('203.0.113.10');
    spyOn(service, 'getWindowsUsername').and.resolveTo('second-user');
    spyOn(service, 'getInstalledPath').and.resolveTo('C:\\app');
    spyOn(service, 'getWifiConnections').and.resolveTo(null);
  });

  afterEach(() => localStorage.clear());

  const request = (giga_id_school = 'g-1') => ({
    giga_id_school,
    country_code: 'ES',
    registration_source: 'auto' as const,
  });

  it('sends the school, this PC as it is now, and how it registered', async () => {
    const payload = await service.build(request());

    expect(payload).toEqual(
      jasmine.objectContaining({
        giga_id_school: 'g-1',
        country_code: 'ES',
        os: 'windows',
        mac_address: 'device-1',
        ip_address: '203.0.113.10',
        windows_username: 'second-user',
        installed_path: 'C:\\app',
        wifi_connections: null,
        registration_source: 'auto',
      })
    );
    expect(payload.app_instance_id).toMatch(UUID);
    expect(payload.created).toEqual(jasmine.any(String));
  });

  describe('app instance ID', () => {
    it('stays the same for the same school', async () => {
      const first = await service.build(request());
      const second = await service.build(request());

      expect(second.app_instance_id).toBe(first.app_instance_id);
      expect(localStorage.getItem(APP_INSTANCE_ID_KEY)).toBe(
        first.app_instance_id
      );
    });

    it('is new for another school', async () => {
      const first = await service.build(request('g-1'));
      const second = await service.build(request('g-2'));

      expect(second.app_instance_id).toMatch(UUID);
      expect(second.app_instance_id).not.toBe(first.app_instance_id);
    });

    it('is new after logging out, which clears local storage', async () => {
      const first = await service.build(request());
      TestBed.inject(StorageService).clear();
      const second = await service.build(request());

      expect(second.app_instance_id).not.toBe(first.app_instance_id);
    });
  });

  describe('location', () => {
    const geo = { location: { lat: 1, lng: 2 }, accuracy: 30 };

    it('sends the saved one', async () => {
      spyOn(location, 'getSavedGeolocation').and.returnValue(geo as any);
      const fetch = spyOn(location, 'fetchAndSaveGeolocation');

      const payload = await service.build({ ...request(), lookUpLocation: true });

      expect(payload.geolocation).toEqual(geo);
      expect(fetch).not.toHaveBeenCalled();
    });

    it('works one out when none is saved and it is asked to', async () => {
      spyOn(location, 'getSavedGeolocation').and.returnValue(null);
      spyOn(location, 'fetchAndSaveGeolocation').and.returnValue(of(geo as any));

      const payload = await service.build({ ...request(), lookUpLocation: true });

      expect(payload.geolocation).toEqual(geo);
    });

    it('sends none when none is saved and it is not asked to look', async () => {
      spyOn(location, 'getSavedGeolocation').and.returnValue(null);
      const fetch = spyOn(location, 'fetchAndSaveGeolocation');

      const payload = await service.build(request());

      expect(payload.geolocation).toBeNull();
      expect(fetch).not.toHaveBeenCalled();
    });
  });
});
