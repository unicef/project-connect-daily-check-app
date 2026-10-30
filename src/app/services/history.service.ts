import { Injectable } from '@angular/core';
import { StorageService } from '../services/storage.service';
import { UploadService } from '../services/upload.service';
import { SharedService } from '../services/shared-service.service';

@Injectable({
  providedIn: 'root',
})
export class HistoryService {
  DEFAULT_VALUE = { measurements: [] };
  constructor(
    private storageService: StorageService,
    private uploadService: UploadService,
    private sharedService: SharedService
  ) {}

  /**
   * Save history data and return the same
   * @param historicalData
   * @returns historical data
   */
  set(historicalData) {
    return this.storageService.set(
      'historicalData',
      JSON.stringify(historicalData)
    );
  }

  /**
   * Add measurement record beyond the limit for dwonloading into excel
   * @param historicalData
   * @returns historical data
   */
  setAll(historicalData) {
    return this.storageService.set(
      'historicalDataAll',
      JSON.stringify(historicalData)
    );
  }

  /**
   * Fetch all measurement records
   * @returns historical data
   */
  getAll() {
    return JSON.parse(
      this.storageService.get(
        'historicalDataAll',
        JSON.stringify(this.DEFAULT_VALUE)
      )
    );
  }

  /**
   * Fetch latest measurement records
   * @returns historical data
   */
  get() {
    return JSON.parse(
      this.storageService.get(
        'historicalData',
        JSON.stringify(this.DEFAULT_VALUE)
      )
    );
  }

  /**
   * Store measurement information
   * @param measurementRecord
   * @returns historical data
   */
  add(measurementRecord) {
    let historicalData = this.get();
    let allHistoricalData = this.getAll();

    measurementRecord.index = allHistoricalData.measurements.length; // surrogate key, "good nuff" for now
    historicalData.measurements.push(measurementRecord);
    this.sharedService.broadcast(
      'history:measurement:change',
      'history:measurement:change'
    );
    this.set(historicalData);
    allHistoricalData.measurements.push(measurementRecord);
    this.setAll(historicalData);
    /* Remove last history items if the total count is greater than 7 */
    if (historicalData.measurements.length > 7) {
      setTimeout(() => {
        this.hide(historicalData.measurements[0].index);
      }, 1000);
    }
    return historicalData;
  }

  /**
   * Remove historical data based on index from the storage
   * @param index
   * @returns historical data
   */
  hide(index) {
    let historicalData = this.get();
    historicalData.measurements = historicalData.measurements.filter(function (
      measurement
    ) {
      return measurement.index != index;
    });
    this.set(historicalData);
    this.sharedService.broadcast(
      'history:measurement:change',
      'history:measurement:change'
    );
    return historicalData;
  }

  /**
   *
   * @param index
   * @param measurementNote
   * @returns historical data
   */
  annonate(index, measurementNote) {
    let historicalData = this.get();
    historicalData.measurements.some(function (measurement) {
      if (measurement.index == index) {
        measurement.note = measurementNote;
        return true;
      } else {
        return false;
      }
    });
    this.set(historicalData);
    return historicalData;
  }

  /**
   * Mark measurements as synced once the offline queue has delivered them
   * @param uuids test UUIDs of the delivered measurements
   */
  markSynced(uuids: string[]) {
    const delivered = new Set(uuids.filter((uuid) => !!uuid));
    if (!delivered.size) {
      return;
    }
    const flip = (data) => {
      let changed = false;
      data.measurements.forEach((measurement) => {
        if (delivered.has(measurement.uuid) && !measurement.synced) {
          measurement.uploaded = true;
          measurement.synced = true;
          changed = true;
        }
      });
      return changed;
    };

    const historicalData = this.get();
    const allHistoricalData = this.getAll();
    const changed = flip(historicalData);
    if (flip(allHistoricalData)) {
      this.setAll(allHistoricalData);
    }
    if (changed) {
      this.set(historicalData);
      this.sharedService.broadcast(
        'history:measurement:change',
        'history:measurement:change'
      );
    }
  }

  /**
   * Retry upload measurement data into server
   * @param index
   */
  retryUpload(index) {
    console.log('Called retryUpload');
    let historicalData = this.get();
    historicalData.measurements.some((measurement) => {
      if (measurement.index == index) {
        this.sharedService.broadcast('upload:started', 'upload:started', index);
        this.uploadService.uploadMeasurement(measurement).subscribe(
          (response) => {
            measurement.uploaded = true;
            measurement.synced = true;
            this.set(historicalData);
            this.sharedService.broadcast(
              'history:measurement:change',
              'history:measurement:change',
              index
            );
          },
          (error) => {
            let data = error.data;
            let status = error.status;
            measurement.synced = false;
            this.sharedService.broadcast('upload:failure', 'upload:failure', {
              status: status,
              data: data,
            });
          }
        );
        return true;
      } else {
        return false;
      }
    });
  }

  /**
   * Get historical data based on index
   * @param index
   * @returns historical information
   */
  getById(index) {
    let historicalData = this.get();
    let historicalDataAll = this.getAll();
    var measurement = null;
    if (index >= 0 && index < historicalDataAll.measurements.length) {
      historicalData.measurements.some((measurementData) => {
        if (measurementData.index == index) {
          measurement = measurementData;
        }
      });
    }
    return measurement;
  }

  /**
   * Reset historical data
   */
  reset() {
    this.set(this.DEFAULT_VALUE);
    this.setAll(this.DEFAULT_VALUE);
    this.sharedService.broadcast('history:reset', 'history:reset');
  }
}
