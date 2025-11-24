import { Injectable } from '@angular/core';
import { StorageService } from '../services/storage.service';
import { SharedService } from '../services/shared-service.service';
import { environment } from 'src/environments/environment';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { map } from 'rxjs/operators';

const TEN_MINUTES = 1000 * 60 * 10;
const MINUTE = 60 * 1000;
const SIX_HOURS = 1000 * 60 * 60 * 6;

const DAY = 1000 * 60 * 60 * 24;
@Injectable({
  providedIn: 'root',
})
export class SettingsService {
  defaultCountryConfig = {
    measurementProvider: 'mlab',
  };
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

  async getCountryConfig():
  Promise<{ measurementProvider: string;} > {  
    const countryCode = this.storageSerivce.get('country_code');
    console.log('Checking for country config', { country_code: countryCode });
    if (!countryCode) {
      console.log('No country code found');
      return this.defaultCountryConfig;
    }
    let countryConfig = this.storageSerivce.get('countryConfig');
    if (countryConfig && countryConfig?.savedAt < Date.now() - DAY ) {
      countryConfig = JSON.parse(countryConfig);
      return countryConfig;
    }
    if(!countryConfig || countryConfig?.code !== countryCode) {
      try {
        // localhost:3000/api/v1/country-config/code/ES
        const newConfig = await this.http
          .get(environment.restAPI + `country-config/code/${countryCode}`, {
            observe: 'response',
            headers: new HttpHeaders({
              'Content-type': 'application/json',
            }),
          }).pipe(map((response: any) => response.body))
          .toPromise();
        if (!newConfig || newConfig.data.length === 0) {
          return this.defaultCountryConfig;
        }
        newConfig.data.savedAt = Date.now();
        this.storageSerivce.set(
          'countryConfig',
          JSON.stringify(newConfig.data)
        );
        return newConfig?.data || this.defaultCountryConfig;
      } catch (e) {
        console.log(e);
        return this.defaultCountryConfig;
      }
    }
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
