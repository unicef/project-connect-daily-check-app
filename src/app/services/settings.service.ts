import { Injectable } from '@angular/core';
import { StorageService } from '../services/storage.service';
import { SharedService } from '../services/shared-service.service';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { environment } from 'src/environments/environment';
import { map, tap } from 'rxjs/operators';
@Injectable({
  providedIn: 'root',
})
export class SettingsService {
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

  async checkForUpdate() {
    console.log('Checking for update', { userId: this.storageSerivce.get('schoolUserId') });
    if (!this.storageSerivce.get('schoolUserId')) return { url: "", status: false };

    const needUpdate = await this.http.get(environment.dcaRestAPI + 'dailycheckapp_schools/checkNotify',
      {
        observe: 'response',
        headers: new HttpHeaders({
          'Content-type': 'application/json',
        }),
        params: {
          user_id: this.storageSerivce.get('schoolUserId')
        }
      }
    ).pipe(map((response: any) => response.body)).toPromise();
    return { url: needUpdate.download_url, status: true };
    if (needUpdate.data.notify === 'true')
      return { url: needUpdate.download_url, status: true };

    return { url: "", status: false }
  }
}
