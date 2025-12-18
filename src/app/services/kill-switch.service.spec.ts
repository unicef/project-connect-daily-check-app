import { TestBed } from '@angular/core/testing';

import { KillSwitchService } from './kill-switch.service';

describe('KillSwitchService', () => {
  let service: KillSwitchService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(KillSwitchService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
