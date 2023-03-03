import { Pipe, PipeTransform } from '@angular/core';

@Pipe({
  name: 'formatThroughputMeasurement'
})
export class FormatThroughputMeasurementPipe implements PipeTransform {

  transform(value: any, ...args: any[]): any {
    var filteredInput;

    if (value !== undefined) {
         filteredInput = (Number(value) / 1000).toFixed(2); // + " Mbit/s";
    } else {
        filteredInput = '';
    }
    return filteredInput;
  }

}
