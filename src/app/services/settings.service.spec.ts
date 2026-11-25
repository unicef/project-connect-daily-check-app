import { TestBed, fakeAsync, flushMicrotasks, tick } from '@angular/core/testing';
import { provideHttpClient, withInterceptorsFromDi } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';

import { FEATURE_FLAGS_TIMEOUT_MS, SettingsService } from './settings.service';

describe('SettingsService', () => {
  let service: SettingsService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptorsFromDi()),
        provideHttpClientTesting(),
      ],
    });
    service = TestBed.inject(SettingsService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('keeps the saved flags when the refresh gets no answer', fakeAsync(() => {
    // Older than the 6 hours they are kept for, so they are refreshed.
    const saved = { pingService: true, updateDate: Date.now() - 7 * 60 * 60 * 1000 };
    spyOn(service['storageSerivce'], 'get').and.callFake((key: string) => {
      if (key === 'gigaId') return 'giga-1';
      if (key === 'featureFlags') return JSON.stringify(saved);
      return null;
    });
    spyOn(console, 'log');

    let flags: any;
    service.getFeatureFlags().then((result) => (flags = result));
    flushMicrotasks();
    const refresh = httpMock.expectOne((r) =>
      r.url.endsWith('schools/features_flags/giga-1')
    );

    tick(FEATURE_FLAGS_TIMEOUT_MS);
    flushMicrotasks();

    expect(refresh.cancelled).toBeTrue();
    expect(flags).toEqual(saved);
  }));
});
