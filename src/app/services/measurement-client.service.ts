import { Injectable } from '@angular/core';
import { MeasurementService } from '../services/measurement.service';
import { HistoryService } from '../services/history.service';
import { SettingsService } from '../services/settings.service';
import { MlabService } from '../services/mlab.service';
import { NetworkService } from '../services/network.service';
import { UploadService } from '../services/upload.service';
import { SharedService } from '../services/shared-service.service';
import { forkJoin } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class MeasurementClientService {
  mlabInformation= {
    "city": "",
    "url": "",
    "ip": [],
    "fqdn": "",
    "site": "",
    "country": "",
    "label": "",
    "metro": ""
  };
  accessInformation = {
    "ip": "", 
    "city": "", 
    "region": "", 
    "country": "", 
    "label":"",
    "metro":"",
    "site":"",
    "url":"",
    "fqdn":"",
    "loc": "", 
    "org": "", 
    "postal": "", 
    "timezone": "", 
    "asn": ""
  };
  resultData = {
    testStatus:{},
    passedResults: {}
  }
  progress = 0;
  constructor(
    private measurementService: MeasurementService,
    private historyService: HistoryService,
    private settingsService: SettingsService,
    private mlabService: MlabService,
    private networkService: NetworkService,
    private uploadService: UploadService,
    private sharedService: SharedService) { }
  
  public incrementProgress(current, state) {
    let CEILINGS = { 'interval_c2s': 0.48, 'interval_s2c': 0.96, 'complete': 1 };

    // necessary because intervals are not emitted when measuring in background mode
    let FLOORS = {
      'preparing_c2s': 0.01,
      'running_c2s': 0.02,
      'finished_c2s': 0.48,
      'preparing_s2c': 0.50,
      'running_s2c': 0.51,
      'finished_s2c': 0.96,
      'complete': 1
    };

    let DELTAS = {
      'onstart': 0.01,
      'preparing_c2s': 0.01,
      'running_c2s': 0.01,
      'interval_c2s': 0.01,
      'finished_c2s': 0.02,
      'preparing_s2c': 0.01,
      'running_s2c': 0.01,
      'interval_s2c': 0.01,
      'finished_s2c': 0.01,
      'preparing_meta': 0.01,
      'finished_meta': 0.01,
      'complete': 0.01,
    };
    let next = Math.max(Math.min(current + (DELTAS[state] || 0), CEILINGS[state] || 1), FLOORS[state] || 0);
    return next;    
  }

  /**
   * Start measuring network speed
   * @returns measurement data
   */
  start() {

    return new Promise((resolve, reject) => {
      let measurementRecord = {
        'timestamp': Date.now(),
        'results': {},
        'snapLog': {'s2cRate': [], 'c2sRate': []},
        'uploaded': false,
        'mlabInformation': this.mlabInformation,
        'accessInformation': this.accessInformation,
        'uuid': '',
        'version':0
      };
      console.log("Called start",this.networkService.getAccessInformation());

      let emitKey = 'measurement:status';
      let progressVal = 0;
      let isCompleted = false;
      forkJoin({
        'accessInformation': this.networkService.getAccessInformation(),
        'mlabInformation': this.mlabService.findServer(this.settingsService.get('metroSelection'))
      }).subscribe(info => {
        Object.assign(measurementRecord, info );
         console.log(info);
        this.measurementService.measurementNotificationActivity.subscribe(resultData =>{
          let testStatus = resultData.testStatus;
          let passedResults = resultData.passedResults;
          progressVal = this.incrementProgress(progressVal, testStatus);
          this.sharedService.broadcast('measurement:status', 'measurement:status', { 'testStatus': testStatus, 'passedResults': passedResults, 'running': true, 'progress': progressVal });
          
          if (testStatus === 'interval_c2s') {
            if (passedResults !== undefined) {
              measurementRecord.snapLog.c2sRate.push(passedResults.c2sRate);
            }
          } else if (testStatus === 'interval_s2c') {
            if (passedResults !== undefined) {
              measurementRecord.snapLog.s2cRate.push(passedResults.s2cRate);
            }
          }
        });
        // console.log(measurementRecord.mlabInformation);
        this.measurementService.start(measurementRecord.mlabInformation.fqdn, 3001, '/ndt_protocol', 200).then(async passedResults => {
          progressVal = this.incrementProgress(progressVal, 'complete');   
          setTimeout(()=>{
            this.sharedService.broadcast('measurement:status', 'measurement:status', { 'testStatus': 'complete', 'passedResults': passedResults, 'running': false, 'progress': progressVal });
          }, 1500);
          
          resolve({
            'action': emitKey,
            'testStatus': 'complete',
            'passedResults': passedResults
          });
          measurementRecord.results = passedResults;
          measurementRecord.uuid = passedResults["NDTResult.S2C.UUID"];
          measurementRecord.version = 1;
          let enabled = this.settingsService.get('uploadEnabled');
          if (enabled) {
            this.uploadService.uploadMeasurement(measurementRecord).subscribe( response => {
              // console.log(response);
              measurementRecord.uploaded = true;
              this.historyService.add(measurementRecord);
            }, error =>{
              let data = error.data;
              let status = error.status;
              // ChromeAppSupport.notify('upload:failure', { "status": status, "data": data })
              this.historyService.add(measurementRecord);
            });
          } else {
            this.historyService.add(measurementRecord);
          }

        }, (error) => {
          console.log(error);
          reject({'error': true});
        });
      });
    });
  }
}
