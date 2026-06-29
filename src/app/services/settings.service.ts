import { Injectable } from '@angular/core';
import { StorageService } from '../services/storage.service';
import { SharedService } from '../services/shared-service.service';
import { environment } from 'src/environments/environment';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { map } from 'rxjs/operators';

const SIX_HOURS = 1000 * 60 * 60 * 6;

/** LocalStorage key for resolved protocol configuration cache */
export const PROTOCOL_CONFIG_STORAGE_KEY = 'protocolConfig';

export interface ResolvedProtocolConfig {
  measurementProviders: string[];
  betweenTestsDelaySec: number;
  configSource: 'school' | 'country' | 'default';
}

interface ProtocolConfigCacheEntry {
  cacheIdentityKey: string;
  savedAt: number;
  payload: ResolvedProtocolConfig;
}

const DEFAULT_PROTOCOL_CONFIG: ResolvedProtocolConfig = {
  measurementProviders: ['mlab'],
  betweenTestsDelaySec: 0,
  configSource: 'default',
};

interface ProtocolConfigApiBody {
  success?: boolean;
  data?: {
    measurementProviders?: string[];
    betweenTestsDelaySec?: number;
    configSource?: ResolvedProtocolConfig['configSource'];
  };
}
@Injectable({
  providedIn: 'root',
})
export class SettingsService {
  defaultCountryConfig = {
    measurementProviders: ['mlab'],
  };

  /** In-flight background refresh to avoid duplicate resolve requests */
  private protocolConfigRefreshPromise: Promise<void> | null = null;
  currentSettings = {
    onlyWifi: {
      default: false,
      type: 'boolean',
      value: undefined,
    },
    applicationLanguage: {
      default: { code: 'en', label: 'English' },
      options: [],
    },
    scheduledTesting: {
      default: false,
      type: 'boolean',
      value: undefined,
    },
    trustedTester: {
      default: false,
      type: 'boolean',
    },
    metroSelection: {
      default: 'automatic',
      options: [],
    },
    scheduleInterval: {
      default: 'daily',
      options: ['daily', 'weekly', 'custom'],
    },
    uploadEnabled: {
      default: true,
      type: 'boolean',
    },
    uploadURL: {
      default: '',
      type: 'string',
    },
    uploadAPIKey: {
      default: '',
      type: 'string',
    },
    browserID: {
      default: '',
      type: 'string',
    },
    deviceType: {
      default: '',
      type: 'string',
    },
    notes: {
      default: '',
      type: 'string',
    },
  };
  lastUpdatedTimestamp = undefined;
  availableSettings = {
    onlyWifi: {
      default: false,
      type: 'boolean',
      value: undefined,
    },
    applicationLanguage: {
      default: { code: 'en', label: 'English' },
      options: [],
    },
    scheduledTesting: {
      default: false,
      type: 'boolean',
      value: undefined,
    },
    trustedTester: {
      default: false,
      type: 'boolean',
    },
    metroSelection: {
      default: 'automatic',
      options: [],
    },
    scheduleInterval: {
      default: 'daily',
      options: ['daily', 'weekly', 'custom'],
    },
    uploadEnabled: {
      default: true,
      type: 'boolean',
    },
    uploadURL: {
      default: '',
      type: 'string',
    },
    uploadAPIKey: {
      default: '',
      type: 'string',
    },
    browserID: {
      default: '',
      type: 'string',
    },
    deviceType: {
      default: '',
      type: 'string',
    },
    notes: {
      default: '',
      type: 'string',
    },
  };
  constructor(
    private storageSerivce: StorageService,
    private sharedService: SharedService,
    private http: HttpClient
  ) {
    this.restore();
  }

  /**
   * Return setting data stored in local storage based on key
   *
   * @param key
   * @returns data based on key from saved settings
   */
  get(key) {
    let settings = this.storageSerivce.get('savedSettings');
    let settingsret;
    if (settings) {
      settings = JSON.parse(settings);
      settingsret = key ? settings[key] : settings;
    }
    return settingsret;
  }

  /**
   * Save setting data in storage
   *
   * @returns none
   */
  save() {
    const savedSettings = {};
    this.lastUpdatedTimestamp = Date.now();
    Object.entries(this.currentSettings).forEach((entry) => {
      const [key, value] = entry;
      savedSettings[key] = value;
    });
    return this.storageSerivce.set(
      'savedSettings',
      JSON.stringify(savedSettings)
    );
  }

  /**
   * Restore stored setting information
   *
   * @returns current settings
   */
  restore() {
    return new Promise((resolve, reject) => {
      let savedSettings = this.storageSerivce.get('savedSettings', {});
      if (savedSettings.length) {
        savedSettings = JSON.parse(savedSettings);
      }
      Object.keys(this.availableSettings).forEach((availableSettingsKey) => {
        if (
          savedSettings !== undefined &&
          savedSettings[availableSettingsKey] !== undefined
        ) {
          this.currentSettings[availableSettingsKey] =
            savedSettings[availableSettingsKey];
          if (
            availableSettingsKey === 'metroSelection' &&
            typeof savedSettings[availableSettingsKey] === 'object'
          ) {
            this.currentSettings[availableSettingsKey] =
              savedSettings[availableSettingsKey].metro;
          }
        } else {
          this.currentSettings[availableSettingsKey] =
            this.availableSettings[availableSettingsKey].default;
        }
      });
      resolve(this.currentSettings);
    });
  }

  /**
   * Save setting information and trigger settings changed event
   *
   * @param requestedSettingName
   * @param requestedSettingValue
   */
  setSetting(requestedSettingName, requestedSettingValue) {
    this.currentSettings[requestedSettingName] = requestedSettingValue;
    this.save();
    this.sharedService.broadcast('settings:changed', {
      name: requestedSettingName,
      value: requestedSettingValue,
    });
  }

  getIpcRenderer() {
    return (window as any).ipcRenderer;
  }
  getShell() {
    return (window as any).shell;
  }

  /** Open a URL in the default system browser (Electron) or a new tab (web). */
  openExternalUrl(href: string): void {
    const shell = this.getShell();
    if (shell?.shell?.openExternal) {
      shell.shell.openExternal(href);
      return;
    }
    window.open(href, '_blank', 'noopener,noreferrer');
  }

  private getProtocolConfigIdentityKey(): string {
    const gigaId = this.storageSerivce.get('gigaId') ?? '';
    const countryCode = this.storageSerivce.get('country_code') ?? '';
    return `${gigaId}|${countryCode}`;
  }

  private parseProtocolConfigCache(raw: string): ProtocolConfigCacheEntry | null {
    try {
      const parsed = JSON.parse(raw) as ProtocolConfigCacheEntry;
      if (
        parsed &&
        typeof parsed.savedAt === 'number' &&
        parsed.payload &&
        typeof parsed.cacheIdentityKey === 'string'
      ) {
        return parsed;
      }
    } catch {
      /* ignore */
    }
    return null;
  }

  /**
   * Drop cached protocol config (call when school or country changes).
   */
  async invalidateProtocolConfigCache(): Promise<void> {
    await this.storageSerivce.remove(PROTOCOL_CONFIG_STORAGE_KEY);
  }

  /**
   * Fire-and-forget network refresh; updates cache on success.
   */
  triggerProtocolConfigBackgroundRefresh(): void {
    void this.refreshProtocolConfigCache();
  }

  private async fetchProtocolConfigFromNetwork(): Promise<ResolvedProtocolConfig | null> {
    try {
      const gigaId = this.storageSerivce.get('gigaId');
      const countryCode = this.storageSerivce.get('country_code');
      const params = new URLSearchParams();
      if (gigaId) {
        params.set('gigaIdSchool', gigaId);
      }
      if (countryCode) {
        params.set('countryCode', countryCode);
      }
      const qs = params.toString();
      const url =
        environment.restAPI +
        `protocol-config/resolve` +
        (qs.length ? `?${qs}` : '');
      const body = (await this.http
        .get<ProtocolConfigApiBody>(url, {
          observe: 'response',
          headers: new HttpHeaders({
            'Content-type': 'application/json',
          }),
        })
        .pipe(map((response) => response.body))
        .toPromise()) as ProtocolConfigApiBody | null | undefined;

      if (
        body &&
        body.success &&
        body.data &&
        Array.isArray(body.data.measurementProviders)
      ) {
        const providers = body.data.measurementProviders.filter(
          (p): p is string => typeof p === 'string'
        );
        return {
          measurementProviders: providers.length ? providers : ['mlab'],
          betweenTestsDelaySec:
            typeof body.data.betweenTestsDelaySec === 'number'
              ? body.data.betweenTestsDelaySec
              : 0,
          configSource:
            body.data.configSource === 'school' ||
            body.data.configSource === 'country' ||
            body.data.configSource === 'default'
              ? body.data.configSource
              : 'default',
        };
      }
      return null;
    } catch (e) {
      console.log('protocol-config resolve failed', e);
      return null;
    }
  }

  private persistProtocolConfigCache(
    payload: ResolvedProtocolConfig,
    identityKey: string
  ): void {
    const entry: ProtocolConfigCacheEntry = {
      cacheIdentityKey: identityKey,
      savedAt: Date.now(),
      payload,
    };
    void this.storageSerivce.set(
      PROTOCOL_CONFIG_STORAGE_KEY,
      JSON.stringify(entry)
    );
  }

  /**
   * Refresh protocol config from API and store when successful (single-flight).
   */
  async refreshProtocolConfigCache(): Promise<void> {
    if (this.protocolConfigRefreshPromise) {
      return this.protocolConfigRefreshPromise;
    }
    this.protocolConfigRefreshPromise = (async () => {
      try {
        const data = await this.fetchProtocolConfigFromNetwork();
        if (data) {
          this.persistProtocolConfigCache(
            data,
            this.getProtocolConfigIdentityKey()
          );
        }
      } finally {
        this.protocolConfigRefreshPromise = null;
      }
    })();
    return this.protocolConfigRefreshPromise;
  }

  /**
   * Resolved protocol settings with precedence school → country → default.
   * TTL 6h; stale entries are returned immediately and refreshed in the background (SWR).
   */
  async getProtocolConfig(): Promise<ResolvedProtocolConfig> {
    const identityKey = this.getProtocolConfigIdentityKey();
    const raw = this.storageSerivce.get(PROTOCOL_CONFIG_STORAGE_KEY);
    const cached = raw ? this.parseProtocolConfigCache(raw) : null;

    if (cached && cached.cacheIdentityKey === identityKey) {
      const age = Date.now() - cached.savedAt;
      if (age < SIX_HOURS) {
        return cached.payload;
      }
      void this.refreshProtocolConfigCache();
      return cached.payload;
    }

    const fresh = await this.fetchProtocolConfigFromNetwork();
    if (fresh) {
      this.persistProtocolConfigCache(fresh, identityKey);
      return fresh;
    }

    return { ...DEFAULT_PROTOCOL_CONFIG };
  }

  /**
   * @deprecated Prefer {@link getProtocolConfig}; kept for backward compatibility.
   */
  async getCountryConfig(): Promise<{ measurementProviders: string[] }> {
    const pc = await this.getProtocolConfig();
    return { measurementProviders: pc.measurementProviders };
  }

  async getFeatureFlags() {
    const gigaId = this.storageSerivce.get('gigaId');
    console.log('Checking for flags', { giga_id_school: gigaId });
    if (!gigaId) {
      console.log('No gigaId found');
      return {};
    }
    let featureFlags = this.storageSerivce.get('featureFlags');
    if (featureFlags) {
      featureFlags = JSON.parse(featureFlags);
    }
    console.log({ featureFlags, giga_id_school: gigaId });
    if (
      featureFlags?.updateDate &&
      new Date(parseInt(featureFlags.updateDate, 10)).getTime() >
        Date.now() - SIX_HOURS
    ) {
      return featureFlags;
    }
    try {
      const newFlags = await this.http
        .get(environment.restAPI + `schools/features_flags/${gigaId}`, {
          observe: 'response',
          headers: new HttpHeaders({
            'Content-type': 'application/json',
          }),
        })
        .pipe(map((response: any) => response.body))
        .toPromise();
      if (!newFlags || newFlags.data.length === 0) {
        return featureFlags;
      }

      this.storageSerivce.set(
        'featureFlags',
        JSON.stringify({ ...newFlags.data, updateDate: Date.now() })
      );

      return newFlags?.data || {};
    } catch (e) {
      console.log(e);
      return featureFlags;
    }
  }
}
