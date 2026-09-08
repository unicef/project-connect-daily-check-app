import { TestBed } from '@angular/core/testing';
import { DeviceContextService } from './device-context.service';
import { environment } from '../../environments/environment';

describe('DeviceContextService', () => {
  let service: DeviceContextService;

  const setElectronAPI = (api: any) => {
    (window as any).electronAPI = api;
  };

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(DeviceContextService);
    spyOn(console, 'warn');
    spyOn(console, 'error');
  });

  afterEach(() => {
    delete (window as any).electronAPI;
  });

  describe('getDeviceIdentity', () => {
    it('maps the Electron payload onto the backend column names', async () => {
      setElectronAPI({
        getDeviceIdentity: () =>
          Promise.resolve({
            deviceName: 'SCHOOL-PC-01',
            deviceModel: 'ThinkPad E14',
            deviceManufacturer: 'LENOVO',
            appBuildNumber: 'a1b2c3d',
            osVersion: 'Microsoft Windows 11 Home 10.0.26200',
          }),
      });

      expect(await service.getDeviceIdentity()).toEqual({
        device_name: 'SCHOOL-PC-01',
        device_model: 'ThinkPad E14',
        device_manufacturer: 'LENOVO',
        app_build_number: 'a1b2c3d',
        os_version: 'Microsoft Windows 11 Home 10.0.26200',
      });
    });

    it('falls back to the app version when the build has no commit', async () => {
      setElectronAPI({
        getDeviceIdentity: () =>
          Promise.resolve({
            deviceName: 'SCHOOL-PC-01',
            deviceModel: 'ThinkPad E14',
            deviceManufacturer: 'LENOVO',
            appBuildNumber: null,
          }),
      });

      const identity = await service.getDeviceIdentity();

      expect(identity.app_build_number).toBe(environment.app_version);
    });

    it('asks Electron only once', async () => {
      const getDeviceIdentity = jasmine
        .createSpy('getDeviceIdentity')
        .and.returnValue(Promise.resolve({ deviceName: 'PC' }));
      setElectronAPI({ getDeviceIdentity });

      await service.getDeviceIdentity();
      await service.getDeviceIdentity();

      expect(getDeviceIdentity).toHaveBeenCalledTimes(1);
    });

    it('returns nulls outside Electron instead of throwing', async () => {
      expect(await service.getDeviceIdentity()).toEqual({
        device_name: null,
        device_model: null,
        device_manufacturer: null,
        app_build_number: null,
        os_version: null,
      });
    });

    it('returns nulls when the handler reports an error', async () => {
      setElectronAPI({
        getDeviceIdentity: () => Promise.resolve({ error: 'boom' }),
      });

      const identity = await service.getDeviceIdentity();

      expect(identity.device_name).toBeNull();
      expect(console.warn).toHaveBeenCalled();
    });

    it('returns nulls when the handler rejects', async () => {
      setElectronAPI({
        getDeviceIdentity: () => Promise.reject(new Error('ipc down')),
      });

      const identity = await service.getDeviceIdentity();

      expect(identity.device_model).toBeNull();
      expect(console.error).toHaveBeenCalled();
    });
  });

  describe('getDeviceContext', () => {
    it('returns the context object', async () => {
      const deviceContext = {
        connection_type: 'wifi',
        default_gateway: '192.168.1.1',
        vpn_likely: false,
      };
      setElectronAPI({
        getDeviceContext: () =>
          Promise.resolve({ deviceContext }),
      });

      expect(await service.getDeviceContext()).toEqual(
        deviceContext
      );
    });

    it('returns null for an empty context so the payload carries no key', async () => {
      setElectronAPI({
        getDeviceContext: () =>
          Promise.resolve({ deviceContext: {} }),
      });

      expect(await service.getDeviceContext()).toBeNull();
    });

    it('returns null outside Electron', async () => {
      expect(await service.getDeviceContext()).toBeNull();
    });

    it('returns null when the handler rejects', async () => {
      setElectronAPI({
        getDeviceContext: () => Promise.reject(new Error('nope')),
      });

      expect(await service.getDeviceContext()).toBeNull();
      expect(console.error).toHaveBeenCalled();
    });
  });

  describe('extractWifiDiagnostics', () => {
    it('reports the WLAN source when the read succeeded', () => {
      expect(
        service.extractWifiDiagnostics({
          wifiConnections: [{ ssid: 'school-wifi' }],
          ssidSource: 'wlan',
        })
      ).toEqual({
        wifi_unavailable_reason: null,
        ssid_source: 'wlan',
        fallback_ssid: null,
      });
    });

    it('reports the reason and the NLM fallback when Location blocks the WLAN stack', () => {
      expect(
        service.extractWifiDiagnostics({
          wifiConnections: [],
          wifiUnavailableReason: 'location_disabled',
          ssidSource: 'nlm',
          fallbackSsid: 'school-wifi',
        })
      ).toEqual({
        wifi_unavailable_reason: 'location_disabled',
        ssid_source: 'nlm',
        fallback_ssid: 'school-wifi',
      });
    });

    it('reports nulls when the Wi-Fi read itself failed', () => {
      expect(service.extractWifiDiagnostics({ error: 'boom' })).toEqual({
        wifi_unavailable_reason: null,
        ssid_source: null,
        fallback_ssid: null,
      });
      expect(service.extractWifiDiagnostics(null)).toEqual({
        wifi_unavailable_reason: null,
        ssid_source: null,
        fallback_ssid: null,
      });
    });
  });

  describe('os_version', () => {
    it('is null when the Electron shell predates the field', async () => {
      setElectronAPI({
        getDeviceIdentity: () =>
          Promise.resolve({
            deviceName: 'SCHOOL-PC-01',
            deviceModel: 'ThinkPad E14',
            deviceManufacturer: 'LENOVO',
            appBuildNumber: 'a1b2c3d',
          }),
      });

      expect((await service.getDeviceIdentity()).os_version).toBeNull();
    });
  });
});
