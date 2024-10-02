import { Injectable } from '@angular/core';
import { StorageService } from '../services/storage.service';
import { MeasurementClientService } from '../services/measurement-client.service';
import { SettingsService } from '../services/settings.service';
import { CustomScheduleService } from '../services/custom-schedule.service';
import { SharedService } from '../services/shared-service.service';
import { NetworkService } from './network.service';

@Injectable({
  providedIn: 'root',
})
export class ScheduleService {
  constructor(
    private storageService: StorageService,
    private measurementClientService: MeasurementClientService,
    private settingsService: SettingsService,
    private sharedService: SharedService,
    private networkService: NetworkService,
    private customScheduleService: CustomScheduleService
  ) { }

  initiate() {
    this.watch();
  }

  initializeScheduleInitializers() {
    this.scheduleInitializers('daily');
    this.scheduleInitializers('weekly');
    this.scheduleInitializers('monthly');
    this.scheduleInitializers('custom');
  }

  scheduleInitializers(type) {
    let result;
    switch (type) {
      case 'daily':
        result = this.createIntervalSemaphore(Date.now(), 60 * 60 * 24 * 1000);
        break;
      case 'weekly':
        result = this.createIntervalSemaphore(
          Date.now(),
          60 * 60 * 24 * 7 * 1000
        );
        break;
      case 'monthly':
        result = this.createMonthlyIntervalSemaphore(Date.now());
        break;
      case 'custom':
        result = this.createCustomSemaphore();
        break;
    }
    return result;
  }

  setSemaphore(semaphore) {
    this.storageService.set('scheduleSemaphore', JSON.stringify(semaphore));
    return JSON.parse(this.storageService.get('scheduleSemaphore'));
  }

  setSpecialSemaphore(semaphore) {
    this.storageService.set(
      'scheduleSpecialSemaphore',
      JSON.stringify(semaphore)
    );
    return JSON.parse(this.storageService.get('scheduleSpecialSemaphore'));
  }

  async decide(scheduleSemaphore) {
    const currentTime = Date.now();

    if (
      scheduleSemaphore.choice !== undefined &&
      currentTime > scheduleSemaphore.choice
    ) {
      const networkInfo = await this.networkService.getNetInfo();
      if (networkInfo === null) {
        console.log('Network not available, skipping schedule check.');
        this.storageService.set('measurementOfReconnect', true);
        this.setSemaphore({});
        return;
      }
      console.log(
        'On ' +
        new Date(currentTime).toUTCString() +
        ' found scheduled test covering ' +
        new Date(scheduleSemaphore.start).toUTCString() +
        ' and ' +
        new Date(scheduleSemaphore.end).toUTCString() +
        ' scheduled to run near ' +
        new Date(scheduleSemaphore.choice).toUTCString()
      );
      console.log('Found scheduled measurement ready, triggering.');
      this.storageService.set('lastMeasurement', currentTime);
      try {
        await this.measurementClientService.runTest(
          scheduleSemaphore.intervalType
        );
        console.log('Measurement completed successfully');
        this.setSemaphore({});
        this.setSpecialSemaphore({});
      } catch (error) {
        this.handleMeasurementFailure(error, scheduleSemaphore);
      }
      this.setSemaphore({});
      this.setSpecialSemaphore({});
    }
  }
  private handleMeasurementFailure(error: any, scheduleSemaphore: any) {
    console.error('Measurement failed:', error);
    // Log the error or send it to an error reporting service
    // Optionally, reschedule the measurement
    const rescheduleTime = Date.now() + 15 * 60 * 1000; // Reschedule in 15 minutes
    const newSemaphore = {
      ...scheduleSemaphore,
      choice: rescheduleTime,
    };
    this.setSemaphore(newSemaphore);
  }

  createSpecialIntervalSemaphore(
    start,
    interval_ms
  ): {
    start: number;
    end: number;
    choice: number;
    intervalType: string;
  } {
    const today = new Date();
    let lastMeasurement = this.storageService.get('lastMeasurement');
    const measurementOfReconnect = this.storageService.get(
      'measurementOfReconnect',
      false
    );

    let featureFlags = this.storageService.get('featureFlags');
    featureFlags = featureFlags ? JSON.parse(featureFlags) : {};

    console.log('Feature flags:', featureFlags);
    lastMeasurement = lastMeasurement
      ? new Date(parseInt(lastMeasurement, 10))
      : new Date(0);

    if (featureFlags?.measurement_of_reconnect && measurementOfReconnect) {
      const _10min = 60 * 10 * 1000;
      console.log(
        'Measurement of reconnect found. Scheduling a test in the next 10 minutes.'
      );
      const semaphore = {
        start: today.getTime(),
        end: today.getTime() + _10min,
        choice: today.getTime() + Math.floor(Math.random() * _10min),
        intervalType: 'onReconnect',
      };
      this.storageService.set('measurementOfReconnect', false);
      return semaphore;
    }

    // if there is not measurement made today, schedule a test in the next 30 minutes
    // This day is in local tim
    if (
      featureFlags?.enable_daily_test &&
      (!lastMeasurement || lastMeasurement.getDate() < today.getDate())
    ) {
      const _30min = 60 * 30 * 1000;
      console.log(
        'No last measurement or last measurement was not today. Scheduling a test in the next 30 minutes.'
      );
      const semaphore = {
        start: today.getTime(),
        end: today.getTime() + _30min,
        choice: today.getTime() + Math.floor(Math.random() * _30min),
        intervalType: 'onStart',
      };
      return semaphore;
    }
  }
  createIntervalSemaphore(start, interval_ms) {
    const today = new Date();
    let lastMeasurement = this.storageService.get('lastMeasurement');

    lastMeasurement = lastMeasurement
      ? new Date(parseInt(lastMeasurement, 10))
      : new Date(0);
    const dtStr =
      today.getMonth() + 1 + ' ' + today.getDate() + ' ' + today.getFullYear();
    const scheduledDailySlotA = new Date(dtStr + ' 08:00').getTime();
    const scheduledDailySlotB = new Date(dtStr + ' 12:00').getTime();

    const slotIntervalMs = 60 * 60 * 4 * 1000;

    if (lastMeasurement < scheduledDailySlotA) {
      const startOfSlot =
        start > scheduledDailySlotA ? start : scheduledDailySlotA;
      const choice = startOfSlot + Math.floor(Math.random() * slotIntervalMs);
      console.log(
        'Last measurement was before the first slot, scheduling for slot A'
      );
      return {
        start: scheduledDailySlotA,
        end: scheduledDailySlotA + slotIntervalMs,
        choice,
      };
    } else if (
      lastMeasurement > scheduledDailySlotA &&
      lastMeasurement < scheduledDailySlotB
    ) {
      const startOfSlot =
        start > scheduledDailySlotB ? start : scheduledDailySlotB;
      const choice = startOfSlot + Math.floor(Math.random() * slotIntervalMs);
      console.log(
        'Last measurement was before the second slot, scheduling for slot B'
      );
      return {
        start: scheduledDailySlotB,
        end: scheduledDailySlotB + slotIntervalMs,
        choice,
      };
    } else {
      const startOfSlot = scheduledDailySlotA + 60 * 60 * 24 * 1000;
      const choice = startOfSlot + Math.floor(Math.random() * slotIntervalMs);
      console.log(
        'Last measurement was after the second slot, scheduling for slot A of the next day'
      );
      return {
        start: startOfSlot,
        end: startOfSlot + slotIntervalMs,
        choice,
      };
    }
  }

  createMonthlyIntervalSemaphore(start: number) {
    const startDate = new Date(start);
    const endDate = new Date(
      startDate.getFullYear(),
      startDate.getMonth() + 1,
      startDate.getDate()
    );
    const intervalMs = endDate.getTime() - startDate.getTime();

    return {
      start: startDate.getTime(),
      end: endDate.getTime(),
      choice: startDate.getTime() + Math.floor(Math.random() * intervalMs),
      intervalType: 'monthly',
    };
  }

  createCustomIntervalSemaphore(start, interval_ms) {
    return {
      start: start,
      end: start + interval_ms,
      choice: start + Math.floor(Math.random() * interval_ms),
    };
  }

  createCustomSemaphore() {
    let schedules = this.customScheduleService.getSchedules();
    // bail if there is no schedule
    if (!schedules || schedules.length === 0) {
      return {};
    }

    let now = new Date();
    let nowHour = { date: now.getDay(), timespan: now.getHours() };
    let INTERVAL_MS = 60 * 60 * 1000;
    let epochHour = now.getTime() - (now.getTime() % INTERVAL_MS);

    // next is the first schedule after "now" in the week, with wraparound (concat)
    schedules.sort((a, b) => {
      return this.hourOfWeek(a) < this.hourOfWeek(b) ? 1 : -1;
    });
    let next = schedules
      .filter((s) => {
        return this.hourOfWeek(s) - this.hourOfWeek(nowHour) > 0;
      })
      .concat(schedules)[0];
    let hoursToAdd =
      (this.hourOfWeek(nowHour) >= this.hourOfWeek(next)
        ? 169 /*one week in hours, plus 1 */
        : 0) +
      this.hourOfWeek(next) -
      this.hourOfWeek(nowHour);
    let start = epochHour + hoursToAdd * INTERVAL_MS;
    return this.createCustomIntervalSemaphore(start, INTERVAL_MS);
  }

  hourOfWeek(s) {
    return Number(s.date) * 24 + Number(s.timespan);
  }

  createScheduleSemaphore() {
    let scheduleInterval = this.settingsService.get('scheduleInterval');
    if (scheduleInterval) {
      if (this.scheduleInitializers(scheduleInterval)) {
        let scheduleSemaphore = this.scheduleInitializers(scheduleInterval);
        scheduleSemaphore.intervalType =
          scheduleSemaphore.intervalType ?? scheduleInterval;
        return scheduleSemaphore;
      }
    } else {
      return false;
    }
  }
  IsJsonString(str) {
    try {
      JSON.parse(str);
    } catch (e) {
      return false;
    }
    return true;
  }
  getSemaphore() {
    let next = this.createScheduleSemaphore();
    // console.log(next);
    let scheduledTesting = this.settingsService.get('scheduledTesting');
    let current = this.storageService.get('scheduleSemaphore', []);
    if (this.IsJsonString(current)) {
      current = JSON.parse(current);
    } else {
      current = undefined;
    }
    if (!scheduledTesting) {
      this.sharedService.broadcast('semaphore:refresh', 'semaphore:refresh');
      return this.setSemaphore({});
    } else if (
      current &&
      current.choice &&
      current.intervalType == next.intervalType &&
      next.start >= current.start
    ) {
      return current;
    } else {
      if (next) {
        return this.setSemaphore(next);
      }
    }
  }

  getSpecialSemaphore() {
    let next = this.createSpecialIntervalSemaphore(
      Date.now(),
      60 * 60 * 24 * 1000
    );
    console.log('getSpecialSemaphore next', next);
    if (!next) {
      return {};
    }
    let current = this.storageService.get('scheduleSpecialSemaphore', []);
    if (this.IsJsonString(current)) {
      current = JSON.parse(current);
    } else {
      current = undefined;
    }
    let scheduledTesting = this.settingsService.get('scheduledTesting');
    if (!scheduledTesting) {
      this.sharedService.broadcast('semaphore:refresh', 'semaphore:refresh');
      return this.setSemaphore({});
    }

    if (
      current &&
      current.choice &&
      next.choice &&
      next.start >= current.start
    ) {
      return current;
    } else {
      if (next) {
        return this.setSpecialSemaphore(next);
      }
    }
  }

  async watch() {
    await this.decide(this.getSemaphore());
    await this.decide(this.getSpecialSemaphore());
    this.sharedService.broadcast('semaphore:refresh', 'semaphore:refresh');
  }
}
