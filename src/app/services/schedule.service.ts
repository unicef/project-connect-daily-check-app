import { Injectable } from '@angular/core';
import { StorageService } from '../services/storage.service';
import { MeasurementClientService } from '../services/measurement-client.service';
import { SettingsService } from '../services/settings.service';
import { CustomScheduleService } from '../services/custom-schedule.service';
import { SharedService } from '../services/shared-service.service';

@Injectable({
  providedIn: 'root'
})
export class ScheduleService {

  constructor(
    private storageService: StorageService,
    private measurementClientService: MeasurementClientService,
    private settingsService: SettingsService,
    private sharedService: SharedService,
    private customScheduleService: CustomScheduleService) { }

  initiate() {
    this.watch();
  }

  initializeScheduleInitializers(){
    this.scheduleInitializers('daily');
    this.scheduleInitializers('weekly');
    this.scheduleInitializers('custom');
  }

  scheduleInitializers(type){
    let result;
    switch(type){
      case 'daily': 
        result = this.createIntervalSemaphore(Date.now(), 60 * 60 * 24 * 1000);
        break;
      case 'weekly':
        result = this.createIntervalSemaphore(Date.now(), 60 * 60 * 24 * 7 * 1000);
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

  decide(scheduleSemaphore) {
    let currentTime = Date.now();
    // console.log(currentTime);
    // console.log(scheduleSemaphore.choice);
    if (scheduleSemaphore.choice !== undefined && currentTime > scheduleSemaphore.choice) {
      console.log('On ' + new Date(currentTime).toUTCString() + ' found scheduled test covering ' +
                new Date(scheduleSemaphore.start).toUTCString() +
                ' and ' + new Date(scheduleSemaphore.end).toUTCString() +
                ' scheduled to run near ' + new Date(scheduleSemaphore.choice).toUTCString());
      console.log('Found scheduled measurement ready, triggering.');
      this.measurementClientService.start();
      // clear semaphore when triggered
      this.setSemaphore({});
    }
  }

  createIntervalSemaphore(start, interval_ms) {
    const today = new Date();
    let dtStr = (today.getMonth()+1)+' '+today.getDate()+' '+ today.getFullYear();
    let scheduledDailySlotA = new Date(dtStr+ ' 08:00').getTime();
    let scheduledDailySlotB = new Date(dtStr+ ' 12:00').getTime();
    // let scheduledDailySlotC = new Date(dtStr+ ' 16:00').getTime();
    let slotIntervalMs = 60 * 60 * 4 * 1000;
    if (start < scheduledDailySlotA){
      return {
        'start': scheduledDailySlotA,
        'end': scheduledDailySlotA + slotIntervalMs,
        'choice': scheduledDailySlotA + Math.floor(Math.random() * slotIntervalMs)
      }
    } else if(start > scheduledDailySlotA && start < scheduledDailySlotB){
      return {
        'start': scheduledDailySlotB,
        'end': scheduledDailySlotB + slotIntervalMs,
        'choice': scheduledDailySlotB + Math.floor(Math.random() * slotIntervalMs)
      }
    } 
    else {
      let timeDiff = start - scheduledDailySlotA;
      return {
        'start': start,
        'end': start + interval_ms,
        'choice': (start + interval_ms) - timeDiff + Math.floor(Math.random() * slotIntervalMs)
      }
    }
  }

  createCustomIntervalSemaphore(start, interval_ms) {
    return {
      'start': start,
      'end': start + interval_ms,
      'choice': start + Math.floor(Math.random() * interval_ms),
    };
  }

  createCustomSemaphore() {
    let schedules = this.customScheduleService.getSchedules();
    // bail if there is no schedule
    if(!schedules || schedules.length === 0) {
      return {};
    }

    let now = new Date();
    let nowHour = { "date": now.getDay(), "timespan": now.getHours() };
    let INTERVAL_MS = 60 * 60 * 1000;
    let epochHour = now.getTime() - (now.getTime() % INTERVAL_MS);

    // next = the first schedule after "now" in the week, with wraparound (concat)
    schedules.sort((a,b) => { return this.hourOfWeek(a) < this.hourOfWeek(b) ? 1 : -1; });
    let next = schedules.filter((s)=> { return this.hourOfWeek(s) - this.hourOfWeek(nowHour) > 0; }).concat(schedules)[0];
    // console.log(next);
    // console.log(this.hourOfWeek(nowHour));
    // console.log(this.hourOfWeek(next));
    let hoursToAdd = (this.hourOfWeek(nowHour) >= this.hourOfWeek(next) ? 169 /*one week in hours, plus 1 */ : 0) + this.hourOfWeek(next) - this.hourOfWeek(nowHour);
    let start = epochHour + (hoursToAdd * INTERVAL_MS);
    // console.log(hoursToAdd);
    return this.createCustomIntervalSemaphore(start, INTERVAL_MS);

  }

  hourOfWeek(s) { 
    return (Number(s.date)*24)+ (Number(s.timespan)); 
  }

  createScheduleSemaphore() {
    let scheduleInterval = this.settingsService.get("scheduleInterval");
    if(scheduleInterval){
      if (this.scheduleInitializers(scheduleInterval)) {
        let scheduleSemaphore = this.scheduleInitializers(scheduleInterval);
        scheduleSemaphore.intervalType = scheduleInterval;
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
    let scheduledTesting = this.settingsService.get("scheduledTesting");
    let  current = this.storageService.get("scheduleSemaphore", []);
    if(this.IsJsonString(current)){
      current = JSON.parse(current);
    } else {
      current = undefined;
    }
    if (!scheduledTesting) {
      this.sharedService.broadcast("semaphore:refresh","semaphore:refresh");
      return this.setSemaphore({});
    } 
    else if (current && current.choice && current.intervalType == next.intervalType && next.start >= current.start){
      // console.log(current);
      return current;
    } 
    else {
      if(next){        
        return this.setSemaphore(next);
      }      
    }
  }
  
  watch() {
    // this.getSemaphore();
    this.decide(this.getSemaphore());
    this.sharedService.broadcast("semaphore:refresh","semaphore:refresh");
  }
}
