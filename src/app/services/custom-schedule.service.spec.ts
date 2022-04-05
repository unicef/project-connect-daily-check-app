import { TestBed } from '@angular/core/testing';

import { CustomScheduleService } from './custom-schedule.service';

describe('CustomScheduleService', () => {
  let service: CustomScheduleService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(CustomScheduleService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
