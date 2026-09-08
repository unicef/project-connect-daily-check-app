import { Injectable } from '@angular/core';
import { environment } from '../../environments/environment';

/**
 * Device identity uploaded with every measurement.
 *
 * The backend has accepted these columns since giga-meter-backend#353, but
 * nothing filled them, so every row landed with NULLs.
 */
export interface DeviceIdentity {
  device_name: string | null;
  device_model: string | null;
  device_manufacturer: string | null;
  app_build_number: string | null;
  os_version: string | null;
}

/** Volatile network/system context; shape mirrors the backend whitelist. */
export type DeviceContext = Record<string, unknown>;

/** Why `wifi_connections` came back empty, and where the SSID came from. */
export interface WifiDiagnostics {
  wifi_unavailable_reason: string | null;
  ssid_source: string | null;
  fallback_ssid: string | null;
}

/**
 * Reads the network/device context the Windows client can see, via the Electron
 * main process.
 *
 * Everything here fails soft. The context is diagnostic metadata attached to a
 * measurement — a school PC with a locked-down PowerShell policy or a stale
 * Electron build must still be able to run and upload its test, just with null
 * fields. No method rejects, and none of them are on the critical path.
 */
@Injectable({
  providedIn: 'root',
})
export class DeviceContextService {
  private cachedIdentity: DeviceIdentity | null = null;

  /** The Electron bridge, or null when running in a plain browser (ng serve, tests). */
  private get electronAPI(): any | null {
    const api = (window as any)?.electronAPI;
    return api ?? null;
  }

  /**
   * Machine identity. Cached for the lifetime of the app: the hostname and the
   * hardware model do not change while the process is running, and the main
   * process caches its half too.
   */
  async getDeviceIdentity(): Promise<DeviceIdentity> {
    if (this.cachedIdentity) {
      return this.cachedIdentity;
    }

    const empty: DeviceIdentity = {
      device_name: null,
      device_model: null,
      device_manufacturer: null,
      app_build_number: null,
      os_version: null,
    };

    const api = this.electronAPI;
    if (!api?.getDeviceIdentity) {
      // Older Electron shell, or the web build: nothing to read, and nothing to
      // warn about on every measurement.
      return empty;
    }

    try {
      const info = await api.getDeviceIdentity();
      if (!info || info.error) {
        console.warn('[DeviceContext] device identity unavailable:', info?.error);
        return empty;
      }

      this.cachedIdentity = {
        device_name: info.deviceName ?? null,
        device_model: info.deviceModel ?? null,
        device_manufacturer: info.deviceManufacturer ?? null,
        app_build_number: info.appBuildNumber ?? environment.app_version ?? null,
        os_version: info.osVersion ?? null,
      };
      return this.cachedIdentity;
    } catch (error) {
      console.error('[DeviceContext] failed to read device identity:', error);
      return empty;
    }
  }

  /**
   * Volatile context for one measurement: gateway, DNS, connection type, VPN
   * inference, IP family, rx/tx counters and the cheap performance readings.
   *
   * @returns the context object, or null when nothing could be read — so the
   *          payload carries no key rather than an empty object.
   */
  async getDeviceContext(): Promise<DeviceContext | null> {
    const api = this.electronAPI;
    if (!api?.getDeviceContext) {
      return null;
    }

    try {
      const result = await api.getDeviceContext();
      if (!result || result.error) {
        console.warn(
          '[DeviceContext] network information unavailable:',
          result?.error
        );
        return null;
      }

      const context = result.deviceContext;
      return context && Object.keys(context).length > 0 ? context : null;
    } catch (error) {
      console.error('[DeviceContext] failed to read network information:', error);
      return null;
    }
  }

  /**
   * Turns the Wi-Fi read into the diagnosis the backend stores.
   *
   * Takes the value the main process already returned for this measurement
   * instead of asking again: `si.wifiConnections()` is the expensive part, and
   * re-running it would double the cost of the one call that is already in the
   * measurement path.
   */
  extractWifiDiagnostics(wifiInfo: any): WifiDiagnostics {
    if (!wifiInfo || wifiInfo.error) {
      return {
        wifi_unavailable_reason: null,
        ssid_source: null,
        fallback_ssid: null,
      };
    }

    return {
      wifi_unavailable_reason: wifiInfo.wifiUnavailableReason ?? null,
      ssid_source: wifiInfo.ssidSource ?? null,
      fallback_ssid: wifiInfo.fallbackSsid ?? null,
    };
  }

}
