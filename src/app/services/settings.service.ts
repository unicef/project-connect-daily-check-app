import { Injectable } from '@angular/core';
import { StorageService } from '../services/storage.service';
import { SharedService } from '../services/shared-service.service';
@Injectable({
  providedIn: 'root',
})
export class SettingsService {
  currentSettings: any = {};
  lastUpdatedTimestamp: number | undefined;
  lastRetrievedTimestamp: number | undefined;

  constructor(
    private storageService: StorageService,
    private sharedService: SharedService
  ) {
    this.restore();
  }

  /**
   * Retrieves settings from the backend
   */
  retrieveSettings() {
    // Hacer una llamada al backend para obtener las settings
    // Actualizar this.currentSettings y this.lastUpdatedTimestamp con los datos obtenidos
    this.currentSettings = {
      applicationLanguage: {
        code: 'en',
        label: 'English',
        options: [
          {
            name: 'En',
            label: 'English',
            code: 'en',
          },
          {
            name: 'Es',
            label: 'Español',
            code: 'es',
          },
          {
            name: 'Pt',
            label: 'Português',
            code: 'pt',
          },
        ],
      },
      scheduledTesting: {
        default: false,
        type: 'boolean',
        value: undefined,
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
    this.lastUpdatedTimestamp = Date.now();
  }

  /**
   * Gets a setting by key
   * @param key The key of the setting to retrieve
   * @returns The value of the setting
   */
  get(key: string) {
    return this.currentSettings[key];
  }

  /**
   * Sets a setting by key
   * @param key The key of the setting to set
   * @param value The value to set for the setting
   */
  setSetting(key: string, value: any) {
    this.currentSettings[key] = value;
    this.save();
    this.sharedService.broadcast('settings:changed', {
      name: key,
      value: value,
    });
  }

  /**
   * Save current settings to storage
   */
  save() {
    this.lastUpdatedTimestamp = Date.now();
    this.storageService.set('lastUpdatedTimestamp', this.lastUpdatedTimestamp);
    this.storageService.set('savedSettings', JSON.stringify(this.currentSettings));
  }

  /**
   * Restore settings from storage
   */
  restore() {
    new Promise((resolve, reject) => {
      let savedSettings = this.storageService.get('savedSettings', undefined);
      if (!savedSettings)
        return this.retrieveSettings();
      this.currentSettings = JSON.parse(savedSettings);
      console.log({ currentSettings: this.currentSettings });
      console.log(this.currentSettings.applicationLanguage);
    });
  }
  getIpcRenderer() {
    return (window as any).ipcRenderer;
  }
  getShell() {
    return (window as any).shell;
  }
}
