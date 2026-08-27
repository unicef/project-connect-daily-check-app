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
          }),
      });

      expect(await service.getDeviceIdentity()).toEqual({
        device_name: 'SCHOOL-PC-01',
        device_model: 'ThinkPad E14',
        device_manufacturer: 'LENOVO',
        app_build_number: 'a1b2c3d',
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

  describe('getDeviceNetworkInformation', () => {
    it('returns the context object', async () => {
      const deviceNetworkInformation = {
        connection_type: 'wifi',
        default_gateway: '192.168.1.1',
        vpn_likely: false,
      };
      setElectronAPI({
        getDeviceNetworkInformation: () =>
          Promise.resolve({ deviceNetworkInformation }),
      });

      expect(await service.getDeviceNetworkInformation()).toEqual(
        deviceNetworkInformation
      );
    });

    it('returns null for an empty context so the payload carries no key', async () => {
      setElectronAPI({
        getDeviceNetworkInformation: () =>
          Promise.resolve({ deviceNetworkInformation: {} }),
      });

      expect(await service.getDeviceNetworkInformation()).toBeNull();
    });

    it('returns null outside Electron', async () => {
      expect(await service.getDeviceNetworkInformation()).toBeNull();
    });

    it('returns null when the handler rejects', async () => {
      setElectronAPI({
        getDeviceNetworkInformation: () => Promise.reject(new Error('nope')),
      });

      expect(await service.getDeviceNetworkInformation()).toBeNull();
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

  describe('getSdkVersion', () => {
    beforeEach(() => {
      setElectronAPI({
        getDeviceIdentity: () =>
          Promise.resolve({
            sdkVersions: { mlab: '0.1.5', cloudflare: '1.4.1' },
          }),
      });
    });

    it('picks the SDK matching the protocol that ran', async () => {
      expect(await service.getSdkVersion('mlab')).toBe('0.1.5');
      expect(await service.getSdkVersion('cloudflare')).toBe('1.4.1');
      expect(await service.getSdkVersion('Cloudflare')).toBe('1.4.1');
    });

    it('defaults to the M-Lab SDK when no protocol is given', async () => {
      expect(await service.getSdkVersion(null)).toBe('0.1.5');
      expect(await service.getSdkVersion(undefined)).toBe('0.1.5');
    });

    it('returns null outside Electron', async () => {
      delete (window as any).electronAPI;

      expect(await service.getSdkVersion('mlab')).toBeNull();
    });
  });
});
