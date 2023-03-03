import { TestBed } from '@angular/core/testing';
import { HttpClientModule } from '@angular/common/http';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { ScheduleService } from './schedule.service';
import { Network } from '@awesome-cordova-plugins/network/ngx';

describe('ScheduleService', () => {
  let service: ScheduleService;

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
    service = TestBed.inject(ScheduleService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
