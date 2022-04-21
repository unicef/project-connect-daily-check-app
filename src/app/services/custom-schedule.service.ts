import { Injectable } from '@angular/core';
import { StorageService } from '../services/storage.service';

@Injectable({
  providedIn: 'root'
})
export class CustomScheduleService {
  queue = [];
  timeSpan = [
    { "value": 0, "label": "midnight" },
    { "value": 1, "label": "1am" },
    { "value": 2, "label": "2am" },
    { "value": 3, "label": "3am" },
    { "value": 4, "label": "4am" },
    { "value": 5, "label": "5am" },
    { "value": 6, "label": "6am" },
    { "value": 7, "label": "7am" },
    { "value": 8, "label": "8am" },
    { "value": 9, "label": "9am" },
    { "value": 10, "label": "10am" },
    { "value": 11, "label": "11am" },
    { "value": 12, "label": "12pm" },
    { "value": 13, "label": "1pm" },
    { "value": 14, "label": "2pm" },
    { "value": 15, "label": "3pm" },
    { "value": 16, "label": "4pm" },
    { "value": 17, "label": "5pm" },
    { "value": 18, "label": "6pm" },
    { "value": 19, "label": "7pm" },
    { "value": 20, "label": "8pm" },
    { "value": 21, "label": "9pm" },
    { "value": 22, "label": "10pm" },
    { "value": 23, "label": "11pm" }
  ];
  dates = [
    { "value": 0, "label": "Sunday" },
    { "value": 1, "label": "Monday" },
    { "value": 2, "label": "Tuesday" },
    { "value": 3, "label": "Wednesday" },
    { "value": 4, "label": "Thursday" },
    { "value": 5, "label": "Friday" },
    { "value": 6, "label": "Saturday" }
  ];
  constructor(private storageService: StorageService) { }

  IsJsonString(str) {
    try {
        JSON.parse(str);
    } catch (e) {
        return false;
    }
    return true;
  }

  getSchedules() {
    let customSchedule = this.storageService.get('customSchedule');
    if(this.IsJsonString(customSchedule)){
      customSchedule = JSON.parse(customSchedule);
      if(customSchedule.length){
        return customSchedule;
      } else {
        return [];
      }
    }else {
      return [];
    }     
  }

  addSchedule(schedule) {
    console.log(schedule);
    return new Promise((resolve, reject) => {
      if(schedule.timespan === null || schedule.date === null) {
        resolve(null);
      }
      // get stored state
      let newSchedule
      let customSchedule = this.storageService.get('customSchedule');

      if(this.IsJsonString(customSchedule)){
        customSchedule = JSON.parse(customSchedule);
        if(customSchedule.length){
          newSchedule = customSchedule;
        } else {
          newSchedule = [];
        }
      }else {
        newSchedule = [];
      }
      let exists = newSchedule.some((s)=> {
        return (s.timespan == schedule.timespan && s.date == schedule.date);
      });

      if(exists) {
        resolve(null);
      } else {
        newSchedule.push(Object.assign({}, schedule));
        this.storageService.set('customSchedule', JSON.stringify(newSchedule));
        resolve(schedule);
      }
    });
  }

  removeSchedule(schedule) {
    return new Promise((resolve, reject) => {
      let customSchedule = JSON.parse(this.storageService.get('customSchedule', []));     
      let newSchedule = customSchedule.filter((s) => {
        return !(s.timespan == schedule.timespan && s.date == schedule.date);
      });
      this.storageService.set('customSchedule', JSON.stringify(newSchedule));
      // this.emitChange();
      resolve(newSchedule);
    });
  }
}
