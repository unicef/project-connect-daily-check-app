import { Pipe, PipeTransform } from '@angular/core';

@Pipe({
  name: 'formatProbabilityMeasurement'
})
export class FormatProbabilityMeasurementPipe implements PipeTransform {

  transform(value: any, ...args: any[]): any {
    return String((Number(value) * 100).toFixed(2)) + "%";
  }

}
