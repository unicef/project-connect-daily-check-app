import { TestBed } from '@angular/core/testing';
import { provideHttpClient, withInterceptorsFromDi } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';

import { PingResult, PingService } from './ping.service';
import { IndexedDBService } from './indexed-db.service';
import { SettingsService } from './settings.service';
import { StorageService } from './storage.service';
import { SharedService } from './shared-service.service';

/** The service as Angular builds it, with fakes for what it uses. */
function createPingService(fakes: {
  storage: any;
  indexedDB?: any;
  settings?: any;
  shared?: any;
}): PingService {
  TestBed.configureTestingModule({
    providers: [
      provideHttpClient(withInterceptorsFromDi()),
      provideHttpClientTesting(),
      { provide: StorageService, useValue: fakes.storage },
      { provide: IndexedDBService, useValue: fakes.indexedDB ?? {} },
      { provide: SettingsService, useValue: fakes.settings ?? {} },
      {
        provide: SharedService,
        useValue: fakes.shared ?? { broadcast: () => undefined },
      },
    ],
  });
  return TestBed.inject(PingService);
}

/**
 * Lets every pending promise callback run. The mocked clock only runs timers,
 * and a message is a task of its own, which comes after all of them.
 */
function settle(): Promise<void> {
  return new Promise((resolve) => {
    const channel = new MessageChannel();
    channel.port1.onmessage = () => resolve();
    channel.port2.postMessage(null);
  });
}

/** Moves the mocked clock on, with what was waiting on it done before and after. */
async function advance(ms: number): Promise<void> {
  await settle();
  jasmine.clock().tick(ms);
  await settle();
}

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
  let sharedService: any;
  let checkConnectivity: jasmine.Spy;

  const pingResult: PingResult = {
    timestamp: NOW,
    isConnected: true,
    errorMessage: null,
    browserId: 'browser-1',
    app_local_uuid: 'uuid-1',
    latency: 42,
  };
  const failedPing: PingResult = {
    timestamp: NOW,
    isConnected: false,
    errorMessage: 'gave_up',
    browserId: 'browser-1',
    app_local_uuid: 'uuid-0',
    latency: null,
  };
  const pingAt = (time: number) => ({
    timestamp: new Date(time),
    isConnected: true,
  });

  beforeEach(() => {
    jasmine.clock().install();
    jasmine.clock().mockDate(NOW);
    spyOn(performance, 'now').and.callFake(() => Date.now());

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
    sharedService = { broadcast: jasmine.createSpy('broadcast') };

    service = createPingService({
      storage,
      indexedDB: indexedDBService,
      settings: settingsService,
      shared: sharedService,
    });
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

  it('pings when the ping in the last 15 minutes failed', async () => {
    // e.g. the PC had just woken from sleep: this one may get a reply.
    indexedDBService.getPingResults.and.resolveTo([
      { timestamp: new Date(NOW.getTime() - 5 * MINUTE), isConnected: false },
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

  it('checks again 5 seconds after a check that gets no reply, and stores only that check', async () => {
    checkConnectivity.and.returnValues(
      Promise.resolve(failedPing),
      Promise.resolve(pingResult)
    );

    const done = service.pingBeforeSpeedTest();
    await advance(5000 - 1);
    expect(checkConnectivity).toHaveBeenCalledTimes(1);
    expect(indexedDBService.savePingResult).not.toHaveBeenCalled();

    await advance(1);
    await done;
    expect(checkConnectivity).toHaveBeenCalledTimes(2);
    expect(indexedDBService.savePingResult).toHaveBeenCalledOnceWith(pingResult);
  });

  it('stores the second check, once, when both get no reply', async () => {
    const secondFailure: PingResult = {
      ...failedPing,
      errorMessage: 'timeout',
      app_local_uuid: 'uuid-2',
    };
    checkConnectivity.and.returnValues(
      Promise.resolve(failedPing),
      Promise.resolve(secondFailure)
    );

    const done = service.pingBeforeSpeedTest();
    await advance(5000);
    await done;

    expect(checkConnectivity).toHaveBeenCalledTimes(2);
    expect(indexedDBService.savePingResult).toHaveBeenCalledOnceWith(
      secondFailure
    );
  });

  it('lets the start page know once the ping is stored', async () => {
    await service.pingBeforeSpeedTest();

    expect(sharedService.broadcast).toHaveBeenCalledOnceWith('ping:saved');
    expect(indexedDBService.savePingResult).toHaveBeenCalledBefore(
      sharedService.broadcast
    );
  });
});

describe('PingService every 15 minutes', () => {
  const MINUTE = 60 * 1000;
  // 10:00 local time, inside the 8:00-20:00 hours of the regular ping.
  const NOW = new Date(2026, 10, 3, 10, 0, 0);
  // Names the PC's user, as a Windows path does.
  const PRIVATE_TEXT = 'C:\\Users\\teacher-amina\\AppData\\Local\\Giga Meter';

  let service: PingService;
  let store: Record<string, string>;
  let storageThrows: boolean;
  let indexedDBService: any;
  let sharedService: any;
  let onLine: jasmine.Spy;

  type Outcome = 'reply' | 'give_up' | 'no_reply' | 'throw';

  /** Stands in for the Cloudflare check: each check ends as the next outcome says. */
  const scriptChecks = (outcomes: Outcome[]): jasmine.Spy =>
    spyOn<any>(service, 'createSpeedTest').and.callFake(() => {
      const outcome = outcomes.shift();
      if (outcome === 'throw') {
        throw new Error(`Cannot load ${PRIVATE_TEXT}\\speedtest.js`);
      }
      const replies = outcome === 'reply' ? [40] : [];
      const fake: any = {
        onFinish: null,
        pause: () => undefined,
        results: {
          getUnloadedLatencyPoints: () => replies,
          getUnloadedLatency: () => (replies.length ? replies[0] : 0),
        },
      };
      if (outcome !== 'no_reply') {
        // Once the service has set onFinish, as the library's own comes.
        Promise.resolve().then(() => fake.onFinish(fake.results));
      }
      return fake;
    });

  /** Starts the regular ping and lets the first one run. */
  const firstPing = async () => {
    await service.startPeriodicChecks(15 * MINUTE, () => undefined);
    await advance(15 * MINUTE);
  };

  const stored = (): PingResult =>
    indexedDBService.savePingResult.calls.mostRecent()?.args[0];

  beforeEach(() => {
    jasmine.clock().install();
    jasmine.clock().mockDate(NOW);
    spyOn(performance, 'now').and.callFake(() => Date.now());
    onLine = spyOnProperty(navigator, 'onLine').and.returnValue(true);

    store = { schoolId: 'school-1', schoolUserId: 'school-user-1' };
    storageThrows = false;
    const storage: any = {
      get: (key: string) => {
        if (storageThrows && key === 'schoolUserId') {
          throw new Error(`Access denied: ${PRIVATE_TEXT}\\Local Storage`);
        }
        return store[key];
      },
    };
    indexedDBService = {
      getPingResults: jasmine.createSpy('getPingResults').and.resolveTo([]),
      savePingResult: jasmine.createSpy('savePingResult').and.resolveTo(),
    };
    sharedService = { broadcast: jasmine.createSpy('broadcast') };

    service = createPingService({
      storage,
      indexedDB: indexedDBService,
      settings: {
        getFeatureFlags: jasmine
          .createSpy('getFeatureFlags')
          .and.resolveTo({ pingService: true }),
      },
      shared: sharedService,
    });
  });

  afterEach(() => {
    jasmine.clock().uninstall();
  });

  it('stores a ping that gets a reply at once, without checking again', async () => {
    const createSpeedTest = scriptChecks(['reply']);

    await firstPing();
    expect(indexedDBService.savePingResult).toHaveBeenCalledOnceWith(
      jasmine.objectContaining({
        isConnected: true,
        errorMessage: null,
        latency: 40,
      })
    );

    await advance(60 * 1000);
    expect(createSpeedTest).toHaveBeenCalledTimes(1);
    expect(indexedDBService.savePingResult).toHaveBeenCalledTimes(1);
  });

  it('checks again 30 seconds after a check that gets no reply, and stores only that check', async () => {
    // The PC has just woken from sleep, and its Wi-Fi is not back yet.
    const createSpeedTest = scriptChecks(['give_up', 'reply']);

    await firstPing();
    await advance(30 * 1000 - 1);
    expect(createSpeedTest).toHaveBeenCalledTimes(1);
    expect(indexedDBService.savePingResult).not.toHaveBeenCalled();

    await advance(1);
    expect(createSpeedTest).toHaveBeenCalledTimes(2);
    expect(indexedDBService.savePingResult).toHaveBeenCalledOnceWith(
      jasmine.objectContaining({
        isConnected: true,
        errorMessage: null,
        latency: 40,
      })
    );
  });

  it('waits the full 30 seconds even when its timer fires early', async () => {
    let clockBehind = 0;
    (performance.now as jasmine.Spy).and.callFake(
      () => Date.now() - clockBehind
    );
    const createSpeedTest = scriptChecks(['give_up', 'reply']);

    await firstPing();
    // The timer fires when only 20 of the 30 seconds have gone by.
    clockBehind = 10 * 1000;
    await advance(30 * 1000);
    expect(createSpeedTest).toHaveBeenCalledTimes(1);

    await advance(10 * 1000);
    expect(createSpeedTest).toHaveBeenCalledTimes(2);
  });

  it('stores gave_up, once, when both checks give up', async () => {
    const createSpeedTest = scriptChecks(['give_up', 'give_up']);

    await firstPing();
    await advance(30 * 1000);

    expect(createSpeedTest).toHaveBeenCalledTimes(2);
    expect(indexedDBService.savePingResult).toHaveBeenCalledOnceWith(
      jasmine.objectContaining({
        isConnected: false,
        errorMessage: 'gave_up',
        latency: null,
      })
    );
  });

  it('stores timeout, once, when neither check gets a reply in 5 seconds', async () => {
    const createSpeedTest = scriptChecks(['no_reply', 'no_reply']);

    await firstPing();
    await advance(5000);
    await advance(30 * 1000);
    await advance(5000);

    expect(createSpeedTest).toHaveBeenCalledTimes(2);
    expect(indexedDBService.savePingResult).toHaveBeenCalledOnceWith(
      jasmine.objectContaining({ isConnected: false, errorMessage: 'timeout' })
    );
  });

  it('stores offline when Windows reports no network', async () => {
    onLine.and.returnValue(false);
    scriptChecks(['give_up', 'give_up']);

    await firstPing();
    await advance(30 * 1000);

    expect(indexedDBService.savePingResult).toHaveBeenCalledOnceWith(
      jasmine.objectContaining({ isConnected: false, errorMessage: 'offline' })
    );
  });

  it('stores error, and not its text, when the check throws', async () => {
    scriptChecks(['throw', 'throw']);

    await firstPing();
    await advance(30 * 1000);

    expect(indexedDBService.savePingResult).toHaveBeenCalledTimes(1);
    expect(stored()?.errorMessage).toBe('error');
    expect(JSON.stringify(stored())).not.toContain('teacher-amina');
  });

  it('stores error, and not its text, when reading the PC fails', async () => {
    storageThrows = true;

    await firstPing();
    await advance(30 * 1000);

    expect(indexedDBService.savePingResult).toHaveBeenCalledTimes(1);
    expect(stored()?.errorMessage).toBe('error');
    expect(JSON.stringify(stored())).not.toContain('teacher-amina');
  });

  it('lets the start page know once the ping is stored', async () => {
    scriptChecks(['reply']);

    await firstPing();

    expect(sharedService.broadcast).toHaveBeenCalledOnceWith('ping:saved');
    expect(indexedDBService.savePingResult).toHaveBeenCalledBefore(
      sharedService.broadcast
    );
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
    service = createPingService({ storage });

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

  it("records this install's app instance ID with the ping", async () => {
    (service as any).storage = {
      get: (key: string) =>
        key === 'appInstanceId' ? 'instance-1' : 'school-user-1',
    };
    const result = service.checkConnectivity();
    await created;
    replies = [40];
    fake.onFinish(fake.results);

    expect((await result).app_instance_id).toBe('instance-1');
    expect((await result).browserId).toBe('school-user-1');
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
