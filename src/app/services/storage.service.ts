import { Injectable } from '@angular/core';

@Injectable({
  providedIn: 'root',
})
export class StorageService {
  constructor() {}

  /**
   * Store data in local storage
   * @param key
   * @param value
   * @returns boolean
   */
  set(key, value) {
    return new Promise((resolve) => {
      localStorage.setItem(key, value);
      resolve(true);
    });
  }

  /**
   * get data from local storage based on key value
   * @param key
   * @param defaultVal Optional
   * @returns any
   */
  get(key, defaultVal?) {
    const retVal = localStorage.getItem(key);
    if (retVal) {
      return retVal;
    } else if (defaultVal) {
      return defaultVal;
    }
  }

  clear() {
    const settings = this.get('savedSettings');
    const hardwareId = this.get('system_hardware_id');
    localStorage.clear();
    this.set('savedSettings', settings);
    if (hardwareId) {
      this.set('system_hardware_id', hardwareId);
    }
  }

  /**
   * Set first-time visit flag after registration
   * @param value boolean indicating if this is first visit after registration
   */
  setFirstTimeVisit(value: boolean) {
    return this.set('isFirstVisitAfterRegistration', value.toString());
  }

  /**
   * Get first-time visit flag
   * @returns boolean indicating if this is first visit after registration
   */
  getFirstTimeVisit(): boolean {
    const value = this.get('isFirstVisitAfterRegistration');
    return value === 'true';
  }

  /**
   * Clear first-time visit flag (called after first test completion)
   */
  clearFirstTimeVisit() {
    return this.set('isFirstVisitAfterRegistration', 'false');
  }

  /**
   * Set registration completion timestamp
   * @param timestamp number representing when registration was completed
   */
  setRegistrationCompleted(timestamp: number) {
    return this.set('registrationCompletedAt', timestamp.toString());
  }

  /**
   * Get registration completion timestamp
   * @returns number | null timestamp when registration was completed
   */
  getRegistrationCompleted(): number | null {
    const value = this.get('registrationCompletedAt');
    return value ? parseInt(value, 10) : null;
  }

  /**
   * Check if user has just completed registration (within last hour)
   * @returns boolean indicating if registration was recent
   */
  isRecentRegistration(): boolean {
    const timestamp = this.getRegistrationCompleted();
    if (!timestamp) return false;

    const oneHourAgo = Date.now() - 60 * 60 * 1000; // 1 hour in milliseconds
    return timestamp > oneHourAgo;
  }
}
