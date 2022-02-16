import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { NgPipesModule } from 'ngx-pipes';
import { TruncatePipe } from './pipes/truncate.pipe';
import { MeasurePipePipe } from './pipes/measure-pipe.pipe';
import { FormatThroughputMeasurementPipe } from './pipes/format-throughput-measurement.pipe';
import { FormatThroughputDisplayPipe } from './pipes/format-throughput-display.pipe';
import { FormatLatencyMeasurementPipe } from './pipes/format-latency-measurement.pipe';
import { FormatDataConsumptionMeasurementPipe } from './pipes/format-data-consumption-measurement.pipe';
import { FormatProbabilityMeasurementPipe } from './pipes/format-probability-measurement.pipe';
import { CapitalizePipe } from './pipes/capitalize.pipe';

import { TranslateModule, TranslateLoader } from '@ngx-translate/core';
import { TranslateHttpLoader } from '@ngx-translate/http-loader';

export function createTranslateLoader(http: HttpClient) {
    return new TranslateHttpLoader(http, './assets/i18n/', '.json');
}

@NgModule({
  declarations: [
    MeasurePipePipe, 
    FormatThroughputMeasurementPipe,
    FormatThroughputDisplayPipe,
    FormatLatencyMeasurementPipe,
    FormatDataConsumptionMeasurementPipe,
    FormatProbabilityMeasurementPipe,
    CapitalizePipe,
    TruncatePipe
  ],
  imports: [
    CommonModule,
    NgPipesModule,
    TranslateModule.forRoot({
      defaultLanguage: 'en',
      loader: {
        provide: TranslateLoader,
        useFactory: createTranslateLoader,
        deps: [HttpClient]
      }
    })
  ],
  exports: [
    TranslateModule,
    MeasurePipePipe,
    FormatThroughputMeasurementPipe,
    FormatThroughputDisplayPipe,
    FormatLatencyMeasurementPipe,
    FormatDataConsumptionMeasurementPipe,
    FormatProbabilityMeasurementPipe,
    CapitalizePipe,
    TruncatePipe,
    NgPipesModule
  ],
  providers: [
    MeasurePipePipe,
    FormatThroughputMeasurementPipe,
    FormatThroughputDisplayPipe,
    FormatLatencyMeasurementPipe,
    FormatDataConsumptionMeasurementPipe,
    FormatProbabilityMeasurementPipe,
    CapitalizePipe,
    TruncatePipe
  ]
})
export class SharedModule { }