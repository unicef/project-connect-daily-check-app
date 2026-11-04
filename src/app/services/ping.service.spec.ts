import { TestBed } from '@angular/core/testing';
import { provideHttpClient, withInterceptorsFromDi } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';

import { PingResult, PingService } from './ping.service';

describe('PingService', () => {
  let service: PingService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptorsFromDi()),
        provideHttpClientTesting(),
      ],
    });
    service = TestBed.inject(PingService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});

describe('PingService before a speed test', () => {
  const MINUTE = 60 * 1000;
  // 22:00 local time, outside the 8:00-20:00 hours of the regular ping.
  const NOW = new Date(2026, 10, 3, 22, 0, 0);

  let service: PingService;
  let store: Record<string, string>;
  let indexedDBService: any;
  let settingsService: any;
  let checkConnectivity: jasmine.Spy;

  const pingResult: PingResult = {
    timestamp: NOW,
    isConnected: true,
    errorMessage: null,
    browserId: 'browser-1',
    app_local_uuid: 'uuid-1',
    latency: 42,
  };
  const pingAt = (time: number) => ({ timestamp: new Date(time) });

  beforeEach(() => {
    jasmine.clock().install();
    jasmine.clock().mockDate(NOW);

    store = { schoolId: 'school-1' };
    const storage: any = { get: (key: string) => store[key] };
    indexedDBService = {
      getPingResults: jasmine.createSpy('getPingResults').and.resolveTo([]),
      savePingResult: jasmine.createSpy('savePingResult').and.resolveTo(),
    };
    settingsService = {
      getFeatureFlags: jasmine
        .createSpy('getFeatureFlags')
        .and.resolveTo({ pingService: true }),
    };

    service = new PingService(
      null,
      indexedDBService,
      settingsService,
      storage
    );
    checkConnectivity = spyOn(service, 'checkConnectivity').and.resolveTo(
      pingResult
    );
  });

  afterEach(() => {
    jasmine.clock().uninstall();
  });

  it('pings and saves the result, even outside 8:00-20:00', async () => {
    expect(await service.performCheck()).toBeNull();

    await service.pingBeforeSpeedTest();

    expect(checkConnectivity).toHaveBeenCalledTimes(1);
    expect(indexedDBService.savePingResult).toHaveBeenCalledWith(pingResult);
  });

  it('skips the ping when there was one in the last 15 minutes', async () => {
    indexedDBService.getPingResults.and.resolveTo([
      pingAt(NOW.getTime() - 3 * 60 * MINUTE),
      pingAt(NOW.getTime() - 14 * MINUTE),
    ]);

    await service.pingBeforeSpeedTest();

    expect(checkConnectivity).not.toHaveBeenCalled();
    expect(indexedDBService.savePingResult).not.toHaveBeenCalled();
  });

  it('pings when the last ping is 15 minutes old', async () => {
    indexedDBService.getPingResults.and.resolveTo([
      pingAt(NOW.getTime() - 15 * MINUTE),
    ]);

    await service.pingBeforeSpeedTest();

    expect(indexedDBService.savePingResult).toHaveBeenCalledWith(pingResult);
  });

  it('does not count a ping dated in the future', async () => {
    // The PC's clock was ahead when this ping was taken.
    indexedDBService.getPingResults.and.resolveTo([
      pingAt(NOW.getTime() + 60 * MINUTE),
    ]);

    await service.pingBeforeSpeedTest();

    expect(indexedDBService.savePingResult).toHaveBeenCalledWith(pingResult);
  });

  it('does not ping on a PC that is not registered', async () => {
    delete store.schoolId;

    await service.pingBeforeSpeedTest();

    expect(checkConnectivity).not.toHaveBeenCalled();
  });

  it('does not ping when pings are turned off for the school', async () => {
    settingsService.getFeatureFlags.and.resolveTo({ pingService: false });

    await service.pingBeforeSpeedTest();

    expect(checkConnectivity).not.toHaveBeenCalled();
  });

  it('never throws, so the speed test still runs', async () => {
    indexedDBService.savePingResult.and.rejectWith(new Error('disk full'));

    await expectAsync(service.pingBeforeSpeedTest()).toBeResolved();
  });
});

describe('PingService connectivity check', () => {
  let service: PingService;
  let fake: any;
  let created: Promise<void>;
  let replies: number[];

  // Stands in for the Cloudflare check, with the replies it has had so far.
  const median = (values: number[]) => {
    const sorted = [...values].sort((a, b) => a - b);
    const mid = (sorted.length - 1) / 2;
    return (sorted[Math.floor(mid)] + sorted[Math.ceil(mid)]) / 2;
  };

  beforeEach(() => {
    jasmine.clock().install();
    replies = [];
    const storage: any = { get: () => 'school-user-1' };
    service = new PingService(null, null, null, storage);

    let markCreated: () => void;
    created = new Promise((resolve) => (markCreated = resolve));
    spyOn<any>(service, 'createSpeedTest').and.callFake(() => {
      fake = {
        onFinish: null,
        pause: jasmine.createSpy('pause'),
        results: {
          getUnloadedLatencyPoints: () => {
            if (!replies.length) {
              // What the library does before its first reply.
              throw new TypeError("Cannot read properties of undefined (reading 'map')");
            }
            return replies;
          },
          getUnloadedLatency: () => median(replies),
        },
      };
      markCreated();
      return fake;
    });
  });

  afterEach(() => {
    jasmine.clock().uninstall();
  });

  it('is connected when all replies come back in time', async () => {
    const result = service.checkConnectivity();
    await created;
    replies = [40.5, 42.123, 50];
    fake.onFinish(fake.results);

    expect((await result).isConnected).toBeTrue();
    expect((await result).latency).toBe(42.12);
  });

  it('is not connected when the check gives up without a reply', async () => {
    // Cloudflare can't be reached: the library retries, gives up and
    // still calls onFinish.
    const result = service.checkConnectivity();
    await created;
    fake.results.getUnloadedLatencyPoints = () => [];
    fake.results.getUnloadedLatency = () => 0;
    fake.onFinish(fake.results);

    expect((await result).isConnected).toBeFalse();
    expect((await result).latency).toBeNull();
  });

  it("empties the browser's request timings before the check", async () => {
    // Otherwise, once that list is full, every reply looks like a failure.
    const clear = spyOn(performance, 'clearResourceTimings');
    const result = service.checkConnectivity();
    await created;

    expect(clear).toHaveBeenCalledBefore(service['createSpeedTest'] as jasmine.Spy);
    fake.onFinish(fake.results);
    await result;
  });

  it('is connected on a slow link, when only some replies come back in 5 seconds', async () => {
    const result = service.checkConnectivity();
    await created;
    replies = [650.4, 702.25, 690.1];
    jasmine.clock().tick(5000);

    expect((await result).isConnected).toBeTrue();
    expect((await result).latency).toBe(690.1);
    expect(fake.pause).toHaveBeenCalled();
  });

  it('is not connected when no reply comes back in 5 seconds', async () => {
    const result = service.checkConnectivity();
    await created;
    jasmine.clock().tick(5000);

    expect((await result).isConnected).toBeFalse();
    expect((await result).latency).toBeNull();
    expect(fake.pause).toHaveBeenCalled();
  });

  it('waits the full 5 seconds before deciding', async () => {
    const result = service.checkConnectivity();
    await created;
    replies = [650.4];
    let settled = false;
    result.then(() => (settled = true));

    jasmine.clock().tick(4999);
    await Promise.resolve();
    expect(settled).toBeFalse();

    jasmine.clock().tick(1);
    expect((await result).isConnected).toBeTrue();
  });
});
