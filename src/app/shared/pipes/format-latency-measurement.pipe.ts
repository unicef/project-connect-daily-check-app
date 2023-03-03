import { Pipe, PipeTransform } from '@angular/core';

@Pipe({
  name: 'formatLatencyMeasurement'
})
export class FormatLatencyMeasurementPipe implements PipeTransform {

  transform(value: any, ...args: any[]): any {
    if(value)
      return String(Number(value)) + " ms";
    else
      return '';
  }

}
