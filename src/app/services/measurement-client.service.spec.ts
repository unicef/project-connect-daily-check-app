import { TestBed } from '@angular/core/testing';

import { MeasurementClientService } from './measurement-client.service';

describe('MeasurementClientService', () => {
  let service: MeasurementClientService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(MeasurementClientService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
