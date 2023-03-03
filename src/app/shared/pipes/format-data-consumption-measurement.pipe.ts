import { Pipe, PipeTransform } from '@angular/core';

@Pipe({
  name: 'formatDataConsumptionMeasurement'
})
export class FormatDataConsumptionMeasurementPipe implements PipeTransform {

  transform(value: any, ...args: any[]): any {
    if (Number(value) > Math.pow(1000, 3)) {
      return String((Number(value) / Math.pow(1000, 3)).toFixed(2)) + " Gbit";
    }
    return String((Number(value) / Math.pow(1000, 2)).toFixed(2)) + " Mbit";
  }

}
