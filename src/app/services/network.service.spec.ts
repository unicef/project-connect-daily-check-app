import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed, fakeAsync, flushMicrotasks, tick } from '@angular/core/testing';
import { provideHttpClient, withInterceptorsFromDi } from '@angular/common/http';
import { Network } from '@awesome-cordova-plugins/network/ngx';
import { NetworkService, NET_INFO_REQUEST_TIMEOUT_MS } from './network.service';

describe('NetworkService', () => {
  let service: NetworkService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
    imports: [],
    providers: [
        Network,
        provideHttpClient(withInterceptorsFromDi()),
        provideHttpClientTesting()
    ]
});
    service = TestBed.inject(NetworkService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('gives up on lookups that get no answer and falls back to geojs', fakeAsync(() => {
    spyOn(console, 'error');
    const fetchSpy = spyOn(window, 'fetch').and.resolveTo({
      json: () => Promise.resolve({ ip: '1.2.3.4', city: 'Madrid', country_code: 'ES' }),
    } as any);

    let info: any;
    service.getNetInfo().then((result) => (info = result));

    // Three tries, 2 s and 4 s apart, each left unanswered.
    for (const pause of [2000, 4000, 0]) {
      flushMicrotasks();
      const lookup = httpMock.expectOne((r) => r.url === service.ipInfoLiteUrl);
      tick(NET_INFO_REQUEST_TIMEOUT_MS);
      expect(lookup.cancelled).toBeTrue();
      tick(pause);
    }
    flushMicrotasks();

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect((fetchSpy.calls.mostRecent().args[1] as RequestInit).signal).toBeDefined();
    expect(info.ip).toBe('1.2.3.4');
    expect(info.city).toBe('Madrid');
  }));
});
