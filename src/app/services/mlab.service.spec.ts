import { TestBed } from '@angular/core/testing';

import { MlabService } from './mlab.service';

describe('MlabService', () => {
  let service: MlabService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(MlabService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
