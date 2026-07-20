import { TestBed } from '@angular/core/testing';

import { PingService } from './ping.service';
import { provideHttpClient, withInterceptorsFromDi } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';

describe('PingService', () => {
  let service: PingService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(withInterceptorsFromDi()), provideHttpClientTesting()],});
    service = TestBed.inject(PingService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
