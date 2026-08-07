/* eslint-disable @typescript-eslint/naming-convention */
/* eslint-disable @typescript-eslint/member-ordering */
import { Injectable } from '@angular/core';
import { StorageService } from '../services/storage.service';
import { MeasurementClientService } from '../services/measurement-client.service';
import { SettingsService } from '../services/settings.service';
import { SharedService } from '../services/shared-service.service';
import { NetworkService } from './network.service';

@Injectable({
  providedIn: 'root',
})
export class ScheduleService {
  // Constants for slot timings and retry mechanism
  private readonly SLOT_A_START = 8; // 8 AM
  private readonly SLOT_B_START = 12; // 12 PM
  private readonly SLOT_C_START = 16; // 4 PM
  private readonly SLOT_DURATION = 4 * 60 * 60 * 1000; // 4 hours in milliseconds
  private readonly NO_NETWORK_RETRY_DELAY = 60 * 1000; // 1 minute in milliseconds
  private readonly RETRY_BASE_DELAY = 60 * 1000; // 1 minute in milliseconds
  private readonly RETRY_BACKOFF_FACTOR = 1.2;
  private readonly RETRY_MAX_DELAY = 10 * 60 * 1000; // 10 minutes in milliseconds
  private readonly STARTUP_TEST_DELAY = 15 * 60 * 1000; // 15 minutes in milliseconds
  private readonly STARTUP_TEST_KEY = 'lastStartupTest';
  private readonly STARTUP_TEST_SCHEDULED_KEY = 'startupTestScheduled';
  private readonly TEN_MINUTE = 60 * 1000 * 10; // 10 minutes in milliseconds

  constructor(
    private storageService: StorageService,
    private measurementClientService: MeasurementClientService,
    private settingsService: SettingsService,
    private sharedService: SharedService,
    private networkService: NetworkService
  ) {
    console.log('ScheduleService constructor called');
  }

  async initiate() {
    console.log('ScheduleService initiate called');
    try {
      if (!this.storageService.get('schoolId')) {
        return console.log('No schoolId found, skipping schedule service');
      }

      this.scheduleStartupTestIfNeeded();
      await this.watch();
    } catch (error) {
      console.error('Error during ScheduleService initiation:', error);
    }
  }

  // Calculate start times for all slots on a given date
  private getSlotTimes(date: Date): {
    slotA: number;
    slotB: number;
    slotC: number;
  } {
    console.log(`Getting slot times for date: ${date.toISOString()}`);
    const result = {
      slotA: new Date(
        date.getFullYear(),
        date.getMonth(),
        date.getDate(),
        this.SLOT_A_START
      ).getTime(),
      slotB: new Date(
        date.getFullYear(),
        date.getMonth(),
        date.getDate(),
        this.SLOT_B_START
      ).getTime(),
      slotC: new Date(
        date.getFullYear(),
        date.getMonth(),
        date.getDate(),
        this.SLOT_C_START
      ).getTime(),
    };
    console.log('Slot times:', result);
    return result;
  }

  // Create a semaphore for the next available slot
  async createIntervalSemaphore(start: number, interval_ms: number) {
    const now = new Date();
    const lastMeasurementTime = await this.getLastMeasurementTime();
    const { slotA, slotB, slotC } = this.getSlotTimes(now);
    const tomorrow = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate() + 1
    );
    const nextDaySlotA = this.getSlotTimes(tomorrow).slotA;

    if (lastMeasurementTime < slotA && now.getTime() < slotB) {
      return this.createSlotSemaphore(slotA, 'A');
    } else if (lastMeasurementTime < slotB && now.getTime() < slotC) {
      return this.createSlotSemaphore(slotB, 'B');
    } else if (lastMeasurementTime < slotC) {
      return this.createSlotSemaphore(slotC, 'C');
    } else if (lastMeasurementTime < nextDaySlotA) {
      return this.createSlotSemaphore(nextDaySlotA, 'A');
    } else {
      // If lastMeasurementTime is in the future, reset to next available slot
      console.warn(
        'Last measurement time is in the future. Resetting to next available slot.'
      );
      return this.createSlotSemaphore(nextDaySlotA, 'A');
    }
  }

  // Create a semaphore for a specific slot
  private createSlotSemaphore(start: number, slotName: string) {
    const end = start + this.SLOT_DURATION;
    const choice = start + Math.floor(Math.random() * this.SLOT_DURATION);
    console.log(
      `Scheduling for slot ${slotName}: ${new Date(choice).toISOString()}`
    );
    return {
      start,
      end,
      choice,
      intervalType: 'daily',
      retryAttempts: 0,
      backoffLevel: 0,
    };
  }

  // Get the timestamp of the last measurement
  private async getLastMeasurementTime(): Promise<number> {
    const lastMeasurement = await this.storageService.get('lastMeasurement');
    return lastMeasurement ? parseInt(lastMeasurement, 10) : 0;
  }

  async setSemaphore(semaphore: any): Promise<any> {
    try {
      await this.storageService.set(
        'scheduleSemaphore',
        JSON.stringify(semaphore)
      );
      return this.getCurrentSemaphore();
    } catch (error) {
      console.error('Error setting semaphore:', error);
      return null;
    }
  }

  async decide(scheduleSemaphore: any) {
    console.log(
      'Deciding whether to run measurement. Current semaphore:',
      scheduleSemaphore
    );
    const currentTime = Date.now();
    console.log(`Current time: ${new Date(currentTime).toISOString()}`);

    if (scheduleSemaphore.choice && currentTime > scheduleSemaphore.choice) {
      console.log("It's time to run the measurement");
      const networkInfo = await this.getNetworkInfoSafe();
      if (!networkInfo) {
        console.log('Network not available, rescheduling measurement.');
        await this.rescheduleFailedMeasurement(scheduleSemaphore, 'no-network');
        return;
      }
      if (currentTime > scheduleSemaphore.end) {
        console.log('Slot ended, Skiping measurement.');
        await this.setSemaphore({});
        return;
      }
      if (scheduleSemaphore.lastFailReason === 'no-network') {
        // Network is back: the failed-test backoff starts over
        scheduleSemaphore.backoffLevel = 0;
      }

      try {
        console.log('Running test...');
        await this.measurementClientService.runTest(
          scheduleSemaphore.intervalType
        );
        console.log('Measurement completed successfully');
        await this.storageService.set(
          'lastMeasurement',
          currentTime.toString()
        );
        await this.setSemaphore({});
      } catch (error) {
        console.error('Measurement failed:', error);
        await this.rescheduleFailedMeasurement(scheduleSemaphore, 'test-failed');
      }
    } else {
      console.log('Not time to run measurement yet');
    }
  }

  // getNetInfo() throws when fully offline (its geojs fallback fails too);
  // treat both the throw and an empty result as "no network"
  private async getNetworkInfoSafe(): Promise<any> {
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      console.log('navigator.onLine is false, skipping network check');
      return null;
    }
    try {
      return await this.networkService.getNetInfo();
    } catch (error) {
      console.log('Network check failed:', error);
      return null;
    }
  }

  private async rescheduleFailedMeasurement(
    scheduleSemaphore: any,
    reason: 'no-network' | 'test-failed'
  ) {
    console.log(
      `Rescheduling failed measurement (${reason}). Current semaphore:`,
      scheduleSemaphore
    );
    const currentTime = Date.now();

    if (currentTime >= scheduleSemaphore.end) {
      console.log('Slot ended. Scheduling for next slot.');
      await this.setSemaphore({});
      return;
    }

    // no-network retries are free (no test traffic), so they stay at a fixed
    // 1-minute pace; failed tests consume real bandwidth, so they back off
    const backoffLevel = scheduleSemaphore.backoffLevel || 0;
    const delay =
      reason === 'no-network'
        ? this.NO_NETWORK_RETRY_DELAY
        : Math.min(
            this.RETRY_BASE_DELAY *
              Math.pow(this.RETRY_BACKOFF_FACTOR, backoffLevel),
            this.RETRY_MAX_DELAY
          );

    const newSemaphore = {
      ...scheduleSemaphore,
      choice: Math.min(currentTime + delay, scheduleSemaphore.end),
      retryAttempts: (scheduleSemaphore.retryAttempts || 0) + 1,
      backoffLevel: reason === 'test-failed' ? backoffLevel + 1 : backoffLevel,
      lastFailReason: reason,
    };
    await this.setSemaphore(newSemaphore);
    console.log(
      `Rescheduled measurement for ${new Date(
        newSemaphore.choice
      ).toISOString()}`
    );
  }

  async getSemaphore() {
    console.log('Getting semaphore');
    const scheduledTesting = await this.settingsService.get('scheduledTesting');
    console.log('Scheduled testing enabled:', scheduledTesting);
    if (!scheduledTesting) {
      console.log('Scheduled testing disabled, returning empty semaphore');
      this.sharedService.broadcast('semaphore:refresh', 'semaphore:refresh');
      return this.setSemaphore({});
    }

    const current = await this.getCurrentSemaphore();
    console.log('Current semaphore:', current);
    const next = await this.createIntervalSemaphore(
      Date.now(),
      24 * 60 * 60 * 1000
    );
    console.log('Next semaphore:', next);

    if (
      current &&
      current.choice &&
      current.intervalType === next.intervalType &&
      next.start >= current.start
    ) {
      console.log('Using current semaphore');
      return current;
    } else {
      console.log('Setting new semaphore');
      return this.setSemaphore(next);
    }
  }

  private async getCurrentSemaphore(): Promise<any> {
    const semaphoreString = await this.storageService.get('scheduleSemaphore');
    if (semaphoreString && this.isJsonString(semaphoreString)) {
      return JSON.parse(semaphoreString);
    }
    return null;
  }

  // Check if a string is valid JSON
  private isJsonString(str: string): boolean {
    try {
      JSON.parse(str);
      return true;
    } catch (e) {
      return false;
    }
  }

  // Main method to check and run scheduled measurements
  async watch() {
    try {
      const semaphore = await this.getSemaphore();
      await this.decide(semaphore);
      this.sharedService.broadcast('semaphore:refresh', 'semaphore:refresh');
    } catch (error) {
      console.error('Error in watch method:', error);
    }
  }

  // Keeping these methods to maintain compatibility with existing code
  initializeScheduleInitializers() {}
  async scheduleInitializers(type: string) {
    return this.createIntervalSemaphore(Date.now(), 24 * 60 * 60 * 1000);
  }
  async createScheduleSemaphore() {
    return this.createIntervalSemaphore(Date.now(), 24 * 60 * 60 * 1000);
  }
  getSpecialSemaphore() {
    return {};
  }
  setSpecialSemaphore(semaphore: any) {
    return semaphore;
  }

  // Schedule a startup test if it hasn't been run today
  private async scheduleStartupTestIfNeeded() {
    const lastStartupTest = await this.storageService.get(
      this.STARTUP_TEST_KEY
    );
    const startupTestScheduled = await this.storageService.get(
      this.STARTUP_TEST_SCHEDULED_KEY
    );
    console.log(`Startup test scheduled for: ${startupTestScheduled}`);
    if (parseInt(startupTestScheduled, 10) + this.TEN_MINUTE > Date.now()) {
      console.log('Startup test already scheduled, skipping.');
      return;
    }

    const now = new Date();
    const today = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate()
    ).getTime();
    console.log('Last startup test:', lastStartupTest);

    if (!lastStartupTest || parseInt(lastStartupTest, 10) < today) {
      const startupDelay = Math.floor(Math.random() * this.STARTUP_TEST_DELAY);
      const scheduledTime = new Date(Date.now() + startupDelay);
      this.storageService.set(
        this.STARTUP_TEST_SCHEDULED_KEY,
        scheduledTime.getTime().toString()
      );
      console.log(`Scheduling startup test for ${scheduledTime.toISOString()}`);
      setTimeout(() => this.runStartupTest(), startupDelay);
    } else {
      console.log('Startup test already run today, skipping.');
    }
  }

  // Run the startup test
  private async runStartupTest() {
    console.log('Running startup test');
    const networkInfo = await this.networkService.getNetInfo();
    if (!networkInfo) {
      console.log('Network not available for startup test, skipping.');
      return;
    }

    try {
      await this.measurementClientService.runTest('startup');
      console.log('Startup test completed successfully');
      this.storageService.set('lastMeasurement', Date.now().toString());
      this.storageService.set(this.STARTUP_TEST_KEY, Date.now().toString());
    } catch (error) {
      console.error('Startup test failed:', error);
    }
  }
}
