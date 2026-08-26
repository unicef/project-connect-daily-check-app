import { Injectable } from '@angular/core';
import { environment } from '../../environments/environment';

/**
 * Device identity uploaded with every measurement.
 *
 * The backend has accepted these columns since giga-meter-backend#353, but
 * nothing filled them, so every row landed with NULLs. `sdk_version` is resolved
 * here rather than in the main process because it depends on which measurement
 * protocol actually ran.
 */
export interface DeviceIdentity {
  device_name: string | null;
  device_model: string | null;
  device_manufacturer: string | null;
  app_build_number: string | null;
}

/** Volatile network/system context; shape mirrors the backend whitelist. */
export type DeviceNetworkInformation = Record<string, unknown>;

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
  async getDeviceNetworkInformation(): Promise<DeviceNetworkInformation | null> {
    const api = this.electronAPI;
    if (!api?.getDeviceNetworkInformation) {
      return null;
    }

    try {
      const result = await api.getDeviceNetworkInformation();
      if (!result || result.error) {
        console.warn(
          '[DeviceContext] network information unavailable:',
          result?.error
        );
        return null;
      }

      const context = result.deviceNetworkInformation;
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

  /**
   * Version of the speed-test SDK that produced this measurement.
   *
   * Both versions are baked into the build from the root package.json by
   * electron/scripts/generate-build-mode.js, so the value cannot drift from the
   * dependency that actually shipped. Which one applies is only known after the
   * test, because it depends on the protocol that ran.
   */
  async getSdkVersion(protocol: string | null | undefined): Promise<string | null> {
    const api = this.electronAPI;
    if (!api?.getDeviceIdentity) {
      return null;
    }

    try {
      const info = await api.getDeviceIdentity();
      const versions = info?.sdkVersions;
      if (!versions) return null;

      return (
        ((protocol ?? 'mlab').toLowerCase() === 'cloudflare'
          ? versions.cloudflare
          : versions.mlab) ?? null
      );
    } catch (error) {
      console.warn('[DeviceContext] could not resolve SDK version:', error);
      return null;
    }
  }
}
