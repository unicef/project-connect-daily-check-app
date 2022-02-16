import { Pipe, PipeTransform } from '@angular/core';

@Pipe({
  name: 'formatThroughputDisplay'
})
export class FormatThroughputDisplayPipe implements PipeTransform {

  transform(value: any, ...args: any[]): any {
    let filteredInput;

    if (value !== undefined) {
         filteredInput = String((Number(value) / 1000).toFixed(2)) + " Mbit/s";
    } else {
        filteredInput = '';
    }
    return filteredInput;
  }

}
