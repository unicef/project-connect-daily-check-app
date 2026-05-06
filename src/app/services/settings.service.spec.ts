import { TestBed } from '@angular/core/testing';
import {
  HttpClientTestingModule,
  HttpTestingController,
} from '@angular/common/http/testing';
import {
  SettingsService,
  PROTOCOL_CONFIG_STORAGE_KEY,
} from './settings.service';
import { StorageService } from './storage.service';
import { SharedService } from './shared-service.service';

describe('SettingsService', () => {
  let service: SettingsService;
  let httpMock: HttpTestingController;
  const store: Record<string, string> = {};

  const storageMock = {
    get: (key: string, defaultVal?: string) =>
      store[key] !== undefined ? store[key] : defaultVal ?? null,
    set: (key: string, value: string) => {
      store[key] = value;
      return Promise.resolve(true);
    },
    remove: (key: string) => {
      delete store[key];
      return Promise.resolve(true);
    },
  };

  beforeEach(() => {
    Object.keys(store).forEach((k) => delete store[k]);

    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
      providers: [
        SettingsService,
        { provide: StorageService, useValue: storageMock },
        {
          provide: SharedService,
          useValue: { broadcast: jasmine.createSpy('broadcast'), on: jasmine.createSpy('on') },
        },
      ],
    });

    service = TestBed.inject(SettingsService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('getProtocolConfig fetches and caches fresh response', async () => {
    store['gigaId'] = 'g1';
    store['country_code'] = 'BR';

    const p = service.getProtocolConfig();

    const req = httpMock.expectOne((r) =>
      r.url.includes('protocol-config/resolve')
    );
    expect(req.request.method).toBe('GET');
    req.flush({
      success: true,
      data: {
        measurementProvider: 'cloudflare',
        betweenTestsDelaySec: 3,
        configSource: 'country',
      },
    });

    await expectAsync(p).toBeResolvedTo({
      measurementProvider: 'cloudflare',
      betweenTestsDelaySec: 3,
      configSource: 'country',
    });

    expect(store[PROTOCOL_CONFIG_STORAGE_KEY]).toBeTruthy();
    const cached = JSON.parse(store[PROTOCOL_CONFIG_STORAGE_KEY]);
    expect(cached.payload.measurementProvider).toBe('cloudflare');
    expect(cached.cacheIdentityKey).toBe('g1|BR');
  });

  it('getProtocolConfig returns stale cache immediately and revalidates in background', async () => {
    store['gigaId'] = 'g1';
    store['country_code'] = 'BR';
    const oldEntry = {
      cacheIdentityKey: 'g1|BR',
      savedAt: Date.now() - 7 * 60 * 60 * 1000,
      payload: {
        measurementProvider: 'mlab',
        betweenTestsDelaySec: 0,
        configSource: 'default' as const,
      },
    };
    store[PROTOCOL_CONFIG_STORAGE_KEY] = JSON.stringify(oldEntry);

    const p = service.getProtocolConfig();
    await expectAsync(p).toBeResolvedTo(oldEntry.payload);

    const refresh = httpMock.expectOne((r) =>
      r.url.includes('protocol-config/resolve')
    );
    refresh.flush({
      success: true,
      data: {
        measurementProvider: 'both',
        betweenTestsDelaySec: 1,
        configSource: 'school',
      },
    });

    await new Promise((r) => setTimeout(r, 30));

    const updated = JSON.parse(store[PROTOCOL_CONFIG_STORAGE_KEY]);
    expect(updated.payload.measurementProvider).toBe('both');
  });

  it('getProtocolConfig returns default when fetch fails and cache missing', async () => {
    store['country_code'] = 'BR';

    const p = service.getProtocolConfig();

    const req = httpMock.expectOne((r) =>
      r.url.includes('protocol-config/resolve')
    );
    req.error(new ProgressEvent('error'));

    await expectAsync(p).toBeResolvedTo({
      measurementProvider: 'mlab',
      betweenTestsDelaySec: 0,
      configSource: 'default',
    });
  });

  it('getCountryConfig maps from getProtocolConfig', async () => {
    store['country_code'] = 'BR';

    const p = service.getCountryConfig();

    const req = httpMock.expectOne((r) =>
      r.url.includes('protocol-config/resolve')
    );
    req.flush({
      success: true,
      data: {
        measurementProvider: 'cloudflare',
        betweenTestsDelaySec: 0,
        configSource: 'country',
      },
    });

    await expectAsync(p).toBeResolvedTo({
      measurementProvider: 'cloudflare',
    });
  });

  it('invalidateProtocolConfigCache clears protocol cache', async () => {
    store[PROTOCOL_CONFIG_STORAGE_KEY] = '{"x":1}';
    await service.invalidateProtocolConfigCache();
    expect(store[PROTOCOL_CONFIG_STORAGE_KEY]).toBeUndefined();
  });
});
