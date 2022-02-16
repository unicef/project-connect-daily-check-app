import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { HttpClientModule } from '@angular/common/http';
import { Network } from '@awesome-cordova-plugins/network/ngx';
import { MeasurementClientService } from './measurement-client.service';

describe('MeasurementClientService', () => {
  let service: MeasurementClientService;
  let httpMock: HttpTestingController;
  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [
        HttpClientModule,
        HttpClientTestingModule
      ],
      providers:[
        Network
      ]
    });
    service = TestBed.inject(MeasurementClientService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
