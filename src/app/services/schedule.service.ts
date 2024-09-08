import { Injectable } from '@angular/core';
import { StorageService } from './storage.service';
import { MeasurementClientService } from './measurement-client.service';
import { SettingsService } from './settings.service';
import { SharedService } from './shared-service.service';
import { NetworkService } from './network.service';

@Injectable({
  providedIn: 'root',
})
export class ScheduleService {
  private readonly SCHEDULE_STORAGE_KEY = 'schedules';

  constructor(
    private storageService: StorageService,
    private measurementClientService: MeasurementClientService,
    private settingsService: SettingsService,
    private sharedService: SharedService,
    private networkService: NetworkService
  ) {}

  initiate() {
    this.watch();
  }

  async watch() {
    const schedules = await this.getSchedules();
    for (const schedule of schedules) {
      await this.processSchedule(schedule);
    }
    this.sharedService.broadcast('semaphore:refresh', 'semaphore:refresh');
  }

  private async getSchedules(): Promise<Schedule[]> {
    const scheduledTesting = this.settingsService.get('scheduledTesting');
    if (!scheduledTesting) {
      return [];
    }
    let schedules = await this.getStoredSchedules();
    if (schedules.length === 0 || this.shouldCreateNewSchedules(schedules)) {
      schedules = this.createDailySchedules();
      await this.storeSchedules(schedules);
    }
    return schedules;
  }

  private shouldCreateNewSchedules(schedules: Schedule[]): boolean {
    const now = new Date();
    return schedules.every((schedule) => schedule.end < now.getTime());
  }

  private createDailySchedules(): Schedule[] {
    const today = new Date();
    const slots = this.getDailySlots(today);
    return slots.map((slot) => this.createScheduleForSlot(slot));
  }

  private getDailySlots(date: Date): TimeSlot[] {
    const slots: TimeSlot[] = [
      { start: 8, end: 12, type: 'morning' },
      { start: 12, end: 16, type: 'afternoon' },
    ];

    return slots.map((slot) => ({
      start: this.setHours(date, slot.start).getTime(),
      end: this.setHours(date, slot.end).getTime(),
      type: slot.type,
    }));
  }

  private setHours(date: Date, hours: number): Date {
    const newDate = new Date(date);
    newDate.setHours(hours, 0, 0, 0);
    return newDate;
  }

  private createScheduleForSlot(slot: TimeSlot): Schedule {
    return {
      start: slot.start,
      end: slot.end,
      choice: this.getRandomTime(slot.start, slot.end),
      intervalType: 'daily',
      slotType: slot.type,
    };
  }

  private getRandomTime(start: number, end: number): number {
    return start + Math.floor(Math.random() * (end - start));
  }

  private async processSchedule(schedule: Schedule) {
    const currentTime = Date.now();
    if (currentTime > schedule.end) {
      await this.rescheduleForNextDay(schedule);
    } else if (currentTime > schedule.choice) {
      await this.runScheduledTest(schedule);
    }
  }

  private async rescheduleForNextDay(schedule: Schedule) {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const newSlot = this.getDailySlots(tomorrow).find(
      (slot) => slot.type === schedule.slotType
    );
    if (newSlot) {
      const newSchedule = this.createScheduleForSlot(newSlot);
      await this.updateSchedule(newSchedule);
    }
  }

  private async runScheduledTest(schedule: Schedule) {
    try {
      const networkInfo = await this.networkService.getNetworkInfo();
      if (!networkInfo) {
        throw new Error('Network not available');
      }

      console.log(`Running scheduled test for ${schedule.slotType} slot`);
      await this.measurementClientService.runTest(schedule.intervalType);
      console.log('Measurement completed successfully');
      await this.removeSchedule(schedule);
    } catch (error) {
      await this.handleMeasurementFailure(error, schedule);
    }
  }

  private async updateSchedule(schedule: Schedule) {
    const schedules = await this.getStoredSchedules();
    const updatedSchedules = schedules.filter(
      (s) => s.slotType !== schedule.slotType
    );
    updatedSchedules.push(schedule);
    await this.storeSchedules(updatedSchedules);
  }

  private async removeSchedule(schedule: Schedule) {
    const schedules = await this.getStoredSchedules();
    const updatedSchedules = schedules.filter(
      (s) => s.slotType !== schedule.slotType
    );
    await this.storeSchedules(updatedSchedules);
  }

  private async handleMeasurementFailure(error: any, schedule: Schedule) {
    console.error('Measurement failed:', error);
    if (error.message === 'Network not available') {
      this.storageService.set('measurementOfReconnect', true);
    } else {
      const rescheduleTime = Date.now() + 15 * 60 * 1000; // Reschedule in 15 minutes
      const updatedSchedule = { ...schedule, choice: rescheduleTime };
      await this.updateSchedule(updatedSchedule);
    }
  }

  private async getStoredSchedules(): Promise<Schedule[]> {
    const storedSchedules = await this.storageService.get(
      this.SCHEDULE_STORAGE_KEY
    );
    return storedSchedules ? JSON.parse(storedSchedules) : [];
  }

  private async storeSchedules(schedules: Schedule[]) {
    await this.storageService.set(
      this.SCHEDULE_STORAGE_KEY,
      JSON.stringify(schedules)
    );
  }

  getSemaphore() {
    let schedules = this.createScheduleSemaphore();
    let scheduledTesting = this.settingsService.get('scheduledTesting');
    let current = this.storageService.get(this.SCHEDULE_STORAGE_KEY);

    // Ensure current is an array
    if (!Array.isArray(current)) {
      current = this.isJsonString(current) ? JSON.parse(current) : [];
    }

    if (!scheduledTesting) {
      this.sharedService.broadcast('semaphore:refresh', 'semaphore:refresh');
      return this.setSemaphore([]);
    } else if (Array.isArray(schedules) && schedules.length > 0) {
      const updatedSchedules = schedules.filter((schedule) => {
        if (!Array.isArray(current)) return true;
        const existingSchedule = current.find(
          (c) => c && c.slotType === schedule.slotType
        );
        return !existingSchedule || schedule.start > existingSchedule.start;
      });

      if (updatedSchedules.length > 0) {
        const newSchedules = [
          ...(Array.isArray(current)
            ? current.filter(
                (c) =>
                  c && !updatedSchedules.some((s) => s.slotType === c.slotType)
              )
            : []),
          ...updatedSchedules,
        ];
        return this.setSemaphore(newSchedules);
      }
      return current;
    }
    return [];
  }

  private createScheduleSemaphore(): Schedule[] {
    return this.createDailySchedules();
  }

  private setSemaphore(schedules: Schedule[]): Schedule[] {
    this.storeSchedules(schedules);
    return schedules;
  }

  private isJsonString(str: string): boolean {
    try {
      JSON.parse(str);
    } catch (e) {
      return false;
    }
    return true;
  }
}

interface TimeSlot {
  start: number;
  end: number;
  type: string;
}

interface Schedule {
  start: number;
  end: number;
  choice: number;
  intervalType: string;
  slotType: string;
}
