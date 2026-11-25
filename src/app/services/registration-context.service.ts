import { Inject, Injectable, LOCALE_ID } from '@angular/core';
import { formatDate } from '@angular/common';
import { Device } from '@capacitor/device';
import { firstValueFrom } from 'rxjs';
import { v4 as uuidv4 } from 'uuid';
import { environment } from 'src/environments/environment';
import { HardwareIdService } from './hardware-id.service';
import { LocationService } from './location.service';
import { StorageService } from './storage.service';
import { withTimeout } from '../utils/with-timeout.utils';

/** Cap for each optional lookup (IP, Windows username, install path, WiFi, location). */
export const LOOKUP_TIMEOUT_MS = 10000;
/** Cap for the registration request itself. */
export const REGISTER_TIMEOUT_MS = 30000;

/** Local storage keys of this app instance's ID and the school it was made for. */
export const APP_INSTANCE_ID_KEY = 'appInstanceId';
export const APP_INSTANCE_SCHOOL_KEY = 'appInstanceSchool';

/**
 * Set while this app instance uses the registration found for its PC because
 * its own couldn't be stored, so the next start tries again. A registration
 * of its own, automatic or by hand, clears it.
 */
export const PENDING_AUTO_REGISTRATION_KEY = 'pendingAutoRegistration';

/**
 * How the app came to register: the user picked the school, or the app took
 * it from the registration this PC already has.
 */
export type RegistrationSource = 'manual' | 'auto';

export interface RegistrationRequest {
  giga_id_school: string;
  country_code: string | null;
  registration_source: RegistrationSource;
  /** As the registration screen formats it; now when not given. */
  created?: string;
  /**
   * Work out the location from the Wi-Fi networks around the PC when none is
   * saved. The registration screen does it when it opens; a registration the
   * app makes by itself has had no chance to.
   */
  lookUpLocation?: boolean;
}

/**
 * Builds what a registration sends: the school, and this PC and app instance
 * as they are now. Both the registration screen and the registration the app
 * makes by itself on a PC that already has one use it, so every row has the
 * context of the app instance it belongs to (its Windows user, install path,
 * networks and location), never another instance's.
 */
@Injectable({
  providedIn: 'root',
})
export class RegistrationContextService {
  constructor(
    private hardwareIdService: HardwareIdService,
    private locationService: LocationService,
    private storage: StorageService,
    @Inject(LOCALE_ID) private locale: string
  ) {}

  async build(request: RegistrationRequest) {
    const deviceInfo = await this.getDeviceInfo();
    const deviceId = await this.getDeviceId();
    // Get hardware ID for machine-level registration
    const hardwareId = this.hardwareIdService.getHardwareId();
    // The serials and Windows install ID; the backend works out the device
    // ID from them (TECH-8828).
    const deviceIdentifiers = this.hardwareIdService.getDeviceIdentifiers();
    /* Nothing here may hang a registration: each optional lookup is capped and
       falls back to null, and they run together so the worst case is one cap
       rather than the sum. */
    const [ipAddress, windowsUsername, installedPath, wifiConnections, geolocation] =
      await Promise.all([
        withTimeout(LOOKUP_TIMEOUT_MS, this.getIPAddress(), null),
        withTimeout(LOOKUP_TIMEOUT_MS, this.getWindowsUsername(), null),
        withTimeout(LOOKUP_TIMEOUT_MS, this.getInstalledPath(), null),
        withTimeout(LOOKUP_TIMEOUT_MS, this.getWifiConnections(), null),
        this.getGeolocation(request.lookUpLocation === true),
      ]);

    return {
      giga_id_school: request.giga_id_school,
      mac_address: deviceId.identifier,
      os: deviceInfo.operatingSystem,
      app_version: environment.app_version,
      created:
        request.created ??
        formatDate(new Date(), 'yyyy-MM-ddah:mm:ssZZZZZ', this.locale),
      ip_address: ipAddress,
      country_code: request.country_code,
      device_hardware_id: hardwareId || null, // Add hardware ID
      ...deviceIdentifiers,
      windows_username: windowsUsername || null, // Add Windows username
      installed_path: installedPath || null, // Add installed path
      wifi_connections: wifiConnections || null, // Add WiFi connections
      geolocation,
      app_instance_id: this.appInstanceIdFor(request.giga_id_school),
      registration_source: request.registration_source,
    };
  }

  /**
   * This app instance's ID, for a registration at this school. It's kept in
   * local storage, so a retry or a second tap sends the same one and the server
   * returns the same registration. Logging out clears local storage, so the
   * next registration is a new instance, and so is one after a reinstall or
   * under another Windows user, which start with empty local storage. A new ID
   * is also made when the user picks another school before a registration went
   * through: the server refuses one instance at two schools.
   */
  appInstanceIdFor(gigaIdSchool: string): string {
    const stored = this.storage.get(APP_INSTANCE_ID_KEY);
    if (stored && this.storage.get(APP_INSTANCE_SCHOOL_KEY) === gigaIdSchool) {
      return stored;
    }
    const fresh = uuidv4();
    this.storage.set(APP_INSTANCE_ID_KEY, fresh);
    this.storage.set(APP_INSTANCE_SCHOOL_KEY, gigaIdSchool);
    return fresh;
  }

  async getDeviceInfo() {
    const info = await Device.getInfo();
    return info;
  }

  async getDeviceId() {
    const deviceId = await Device.getId();
    return deviceId;
  }

  async getIPAddress() {
    try {
      const response = await fetch('https://ipv4.geojs.io/v1/ip/geo.json');
      const data = await response.json();
      const ipAddress = data.ip;
      return ipAddress;
    } catch (error) {
      console.log('Error:', error);
      return null;
    }
  }

  async getWindowsUsername(): Promise<string> {
    try {
      // Check if running in Electron
      if (window && (window as any).electronAPI) {
        console.log('📡 [Windows Username] Requesting Windows username...');
        const usernameInfo = await (
          window as any
        ).electronAPI.getWindowsUsername();

        if (usernameInfo && usernameInfo.username) {
          console.log(
            '✅ [Windows Username] Retrieved username:',
            usernameInfo.username
          );
          return usernameInfo.username;
        } else if (usernameInfo && usernameInfo.error) {
          console.error(
            '❌ [Windows Username] Error retrieving username:',
            usernameInfo.error
          );
          return null;
        }
      } else {
        console.log(
          '⚠️ [Windows Username] Not running in Electron, username not available'
        );
        return null;
      }
    } catch (error) {
      console.error(
        '❌ [Windows Username] Exception while retrieving username:',
        error
      );
      return null;
    }

    return null;
  }

  async getInstalledPath(): Promise<string> {
    try {
      // Check if running in Electron
      if (window && (window as any).electronAPI) {
        console.log('📡 [Installed Path] Requesting installed path...');
        const pathInfo = await (window as any).electronAPI.getInstalledPath();

        if (pathInfo && pathInfo.installedPath) {
          console.log(
            '✅ [Installed Path] Retrieved path:',
            pathInfo.installedPath
          );
          return pathInfo.installedPath;
        } else if (pathInfo && pathInfo.error) {
          console.error(
            '❌ [Installed Path] Error retrieving path:',
            pathInfo.error
          );
          return null;
        }
      } else {
        console.log(
          '⚠️ [Installed Path] Not running in Electron, path not available'
        );
        return null;
      }
    } catch (error) {
      console.error(
        '❌ [Installed Path] Exception while retrieving path:',
        error
      );
      return null;
    }

    return null;
  }

  async getWifiConnections(): Promise<any> {
    try {
      // Check if running in Electron
      if (window && (window as any).electronAPI) {
        console.log('📡 [WiFi Connections] Requesting WiFi connections...');
        const wifiInfo = await (window as any).electronAPI.getWifiConnections();

        if (wifiInfo && wifiInfo.wifiConnections) {
          console.log(
            '✅ [WiFi Connections] Retrieved connections:',
            wifiInfo.wifiConnections
          );
          return wifiInfo.wifiConnections;
        } else if (wifiInfo && wifiInfo.error) {
          console.error(
            '❌ [WiFi Connections] Error retrieving connections:',
            wifiInfo.error
          );
          return null;
        }
      } else {
        console.log(
          '⚠️ [WiFi Connections] Not running in Electron, connections not available'
        );
        return null;
      }
    } catch (error) {
      console.error(
        '❌ [WiFi Connections] Exception while retrieving connections:',
        error
      );
      return null;
    }

    return null;
  }

  /**
   * The saved location (the server's geolocate answer: location and
   * accuracy). Without one, and when asked to, it's worked out now from the
   * Wi-Fi networks around the PC, within the lookup cap; null if that fails.
   */
  private async getGeolocation(lookUp: boolean): Promise<any> {
    const saved = this.locationService.getSavedGeolocation();
    if (saved || !lookUp) {
      return saved ?? null;
    }
    return withTimeout(
      LOOKUP_TIMEOUT_MS,
      firstValueFrom(this.locationService.fetchAndSaveGeolocation(), {
        defaultValue: null,
      }),
      null
    );
  }
}
