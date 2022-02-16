import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
@Injectable({
  providedIn: 'root'
})
export class MeasurementService {
  measurementWorker: any;
  workerDeferred: any;
  deferredNotification: any;
  private rawMeasurementNotificationActivity = new BehaviorSubject<any>({});
  readonly measurementNotificationActivity = this.rawMeasurementNotificationActivity.asObservable();
  state = {
    testSemaphore: false
  };
  constructor() {
    this.measurementWorker = new Worker('assets/js/ndt/ndt-worker.js');   
    this.measurementWorker.addEventListener('error', e =>{
      this.state.testSemaphore = false;
    }, false);
  }

  /**
   * Start speed measurement
   * @param hostname 
   * @param port 
   * @param path 
   * @param update_interval 
   * @returns measurement information
   */
  start(hostname, port, path, update_interval) {
    // workerDeferred = $q.defer();
    return new Promise((resolve, reject) => {
      if (this.state.testSemaphore === false) {
        this.state.testSemaphore = true;
        this.measurementWorker.postMessage({
          'cmd': 'start',
          'hostname': hostname,
          'port': port,
          'path': path,
          'update_interval': update_interval
        });
        this.measurementWorker.addEventListener('message', e =>{
          let passedMessage = e.data;
          switch (passedMessage.cmd) {
            case 'onstart':
              this.deferredNotification = {
                'testStatus': 'onstart'
              };
              this.rawMeasurementNotificationActivity.next(Object.assign({}, this.deferredNotification));
            break;
            case 'onstatechange':
                this.deferredNotification = {
                'testStatus': passedMessage.state,
                'passedResults': passedMessage.results
              };
              this.rawMeasurementNotificationActivity.next(Object.assign({}, this.deferredNotification));
            break;
            case 'onprogress':
              this.deferredNotification = {
                'testStatus': passedMessage.state,
                'passedResults': passedMessage.results
              };
              this.rawMeasurementNotificationActivity.next(Object.assign({}, this.deferredNotification));
            break;
            case 'onfinish':
              this.state.testSemaphore = false;
              passedMessage.results.packetRetransmissions = Number(passedMessage.results.PktsRetrans) /
              Number(passedMessage.results.PktsOut);
              resolve(passedMessage.results);
            break;
            case 'onerror':
              this.state.testSemaphore = false;
              reject(passedMessage.error_message);
              break;
          }
        }, false);
      } else {
        reject('test_running');
      }
    });
  }
}
