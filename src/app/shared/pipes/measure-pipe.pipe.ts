import { Pipe, PipeTransform } from '@angular/core';

@Pipe({
  name: 'measurePipe'
})
export class MeasurePipePipe implements PipeTransform {

  transform(value: any, ...args: any[]): any {
    // return function(value) {
      var filteredInput;
  
      if (value !== undefined) {
           filteredInput = String((Number(value) / 1000).toFixed(2));
      } else {
          filteredInput = '';
      }
      return filteredInput;
    // };
    // return value.split('').reverse().join('');
  }

}
