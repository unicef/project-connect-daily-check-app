import { Injectable } from '@angular/core';
import { Subject, from } from 'rxjs';
@Injectable({
  providedIn: 'root'
})
export class SharedService {
  listeners: any;
  eventsSubject : any;
  events: any;
  constructor() {
    this.listeners = {};
    this.eventsSubject = new Subject();
    this.events = from(this.eventsSubject);
    this.events.subscribe(
      ({name, args}) => {
        if (this.listeners[name]) {
          for (let listener of this.listeners[name]) {
            listener(...args);
          }
        }
      }
    );
  }

  /**
   * 
   * @param name 
   * @param listener 
   */
  on(name, listener) {
    if (!this.listeners[name]) {
        this.listeners[name] = [];
    }
    this.listeners[name].push(listener);
  }

  /**
   * 
   * @param name 
   * @param args 
   */
  broadcast(name, ...args) {
    this.eventsSubject.next({
        name,
        args
    });
  }
}
