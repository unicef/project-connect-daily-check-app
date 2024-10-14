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
  private readonly SLOT_DURATION = 4 * 60 * 60 * 1000; // 4 hours in milliseconds
  private readonly MAX_RETRY_ATTEMPTS = 3; // Maximum number of retry attempts
  private readonly RETRY_DELAY = 15 * 60 * 1000; // 15 minutes in milliseconds

  constructor(
    private storageService: StorageService,
    private measurementClientService: MeasurementClientService,
    private settingsService: SettingsService,
    private sharedService: SharedService,
    private networkService: NetworkService
  ) { }

  // Initialize the service
  initiate() {
    this.watch();
  }

  // Calculate start times for both slots on a given date
  private getSlotTimes(date: Date): { slotA: number; slotB: number } {
    const year = date.getFullYear();
    const month = date.getMonth();
    const day = date.getDate();
    return {
      slotA: new Date(year, month, day, this.SLOT_A_START).getTime(),
      slotB: new Date(year, month, day, this.SLOT_B_START).getTime(),
    };
  }

  // Create a semaphore for the next available slot
  createIntervalSemaphore(start: number, interval_ms: number) {
    const now = new Date();
    const lastMeasurementTime = this.getLastMeasurementTime();
    const { slotA, slotB } = this.getSlotTimes(now);

    if (lastMeasurementTime < slotA) {
      return this.createSlotSemaphore(slotA, 'A');
    } else if (lastMeasurementTime < slotB) {
      return this.createSlotSemaphore(slotB, 'B');
    } else {
      const nextDaySlotA = slotA + 24 * 60 * 60 * 1000;
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
    return { start, end, choice, intervalType: 'daily', retryAttempts: 0 };
  }

  // Get the timestamp of the last measurement
  private getLastMeasurementTime(): number {
    const lastMeasurement = this.storageService.get('lastMeasurement');
    return lastMeasurement ? parseInt(lastMeasurement, 10) : 0;
  }

  // Save the semaphore to storage
  setSemaphore(semaphore: any) {
    this.storageService.set('scheduleSemaphore', JSON.stringify(semaphore));
    return JSON.parse(this.storageService.get('scheduleSemaphore'));
  }

  // Decide whether to run a measurement based on the current semaphore
  async decide(scheduleSemaphore: any) {
    const currentTime = Date.now();

    if (scheduleSemaphore.choice && currentTime > scheduleSemaphore.choice) {
      const networkInfo = await this.networkService.getNetInfo();
      if (!networkInfo) {
        console.log('Network not available, rescheduling measurement.');
        this.rescheduleFailedMeasurement(scheduleSemaphore);
        return;
      }

      console.log(
        `Scheduled test at ${new Date(scheduleSemaphore.choice).toISOString()}`
      );

      try {
        await this.measurementClientService.runTest(
          scheduleSemaphore.intervalType
        );
        console.log('Measurement completed successfully');
        this.storageService.set('lastMeasurement', currentTime.toString());
        this.setSemaphore({});
      } catch (error) {
        console.error('Measurement failed:', error);
        this.rescheduleFailedMeasurement(scheduleSemaphore);
      }
    }
  }

  // Reschedule a failed measurement
  private rescheduleFailedMeasurement(scheduleSemaphore: any) {
    const currentTime = Date.now();
    const retryAttempts = (scheduleSemaphore.retryAttempts || 0) + 1;

    if (
      retryAttempts <= this.MAX_RETRY_ATTEMPTS &&
      currentTime < scheduleSemaphore.end
    ) {
      const rescheduleTime = currentTime + this.RETRY_DELAY;
      const newSemaphore = {
        ...scheduleSemaphore,
        choice: Math.min(rescheduleTime, scheduleSemaphore.end),
        retryAttempts,
      };
      this.setSemaphore(newSemaphore);
      console.log(
        `Rescheduled measurement for ${new Date(
          newSemaphore.choice
        ).toISOString()}`
      );
    } else {
      console.log(
        'Max retry attempts reached or slot ended. Scheduling for next slot.'
      );
      this.setSemaphore({});
    }
  }

  // Get the current semaphore or create a new one
  getSemaphore() {
    const scheduledTesting = this.settingsService.get('scheduledTesting');
    if (!scheduledTesting) {
      this.sharedService.broadcast('semaphore:refresh', 'semaphore:refresh');
      return this.setSemaphore({});
    }

    const current = this.getCurrentSemaphore();
    const next = this.createIntervalSemaphore(Date.now(), 24 * 60 * 60 * 1000);

    if (
      current &&
      current.choice &&
      current.intervalType === next.intervalType &&
      next.start >= current.start
    ) {
      return current;
    } else {
      return this.setSemaphore(next);
    }
  }

  // Retrieve the current semaphore from storage
  private getCurrentSemaphore() {
    const semaphore = this.storageService.get('scheduleSemaphore');
    return semaphore && this.isJsonString(semaphore)
      ? JSON.parse(semaphore)
      : undefined;
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
    await this.decide(this.getSemaphore());
    this.sharedService.broadcast('semaphore:refresh', 'semaphore:refresh');
  }

  // Keeping these methods to maintain compatibility with existing code
  initializeScheduleInitializers() { }
  scheduleInitializers(type: string) {
    return this.createIntervalSemaphore(Date.now(), 24 * 60 * 60 * 1000);
  }
  createScheduleSemaphore() {
    return this.createIntervalSemaphore(Date.now(), 24 * 60 * 60 * 1000);
  }
  getSpecialSemaphore() {
    return {};
  }
  setSpecialSemaphore(semaphore: any) {
    return semaphore;
  }
}
