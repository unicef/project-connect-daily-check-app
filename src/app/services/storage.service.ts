import { Injectable } from '@angular/core';

@Injectable({
  providedIn: 'root'
})
export class StorageService {

  constructor() { }

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
      if(retVal){
        return retVal;
      } else if(defaultVal) {
        return defaultVal;
      }      
  }
}
