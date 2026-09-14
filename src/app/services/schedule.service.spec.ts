import { ScheduleService } from './schedule.service';

describe('ScheduleService', () => {
  let service: ScheduleService;
  let store: Record<string, string>;
  let storageService: any;
  let measurementClientService: any;
  let settingsService: any;
  let sharedService: any;
  let networkService: any;

  const MINUTE = 60 * 1000;

  // 2026-08-07 09:00 local time — inside the morning slot (08:00–12:00)
  const NOW = new Date(2026, 7, 7, 9, 0, 0);
  const MORNING_START = new Date(2026, 7, 7, 8, 0, 0).getTime();
  const MORNING_END = new Date(2026, 7, 7, 12, 0, 0).getTime();

  const MORNING_CHOICE = new Date(2026, 7, 7, 8, 30, 0).getTime();

  const morningSemaphore = (overrides: any = {}) => ({
    start: MORNING_START,
    end: MORNING_END,
    choice: MORNING_CHOICE,
    scheduledAt: MORNING_CHOICE,
    slot: 'morning',
    intervalType: 'daily',
    retryAttempts: 0,
    backoffLevel: 0,
    ...overrides,
  });

  const savedSemaphore = () => JSON.parse(store.scheduleSemaphore);

  beforeEach(() => {
    jasmine.clock().install();
    jasmine.clock().mockDate(NOW);

    store = {};
    storageService = {
      get: (key: string) => store[key],
      set: (key: string, value: string) => {
        store[key] = value;
      },
    };
    measurementClientService = {
      runTest: jasmine.createSpy('runTest').and.resolveTo(undefined),
    };
    settingsService = {
      get: jasmine.createSpy('get').and.resolveTo(true),
    };
    sharedService = {
      broadcast: jasmine.createSpy('broadcast'),
      on: jasmine.createSpy('on'),
    };
    networkService = {
      getNetInfo: jasmine.createSpy('getNetInfo').and.resolveTo({ ip: '1.2.3.4' }),
    };

    service = new ScheduleService(
      storageService,
      measurementClientService,
      settingsService,
      sharedService,
      networkService
    );
  });

  afterEach(() => {
    jasmine.clock().uninstall();
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  describe('no-network retries (fixed 1-minute pace)', () => {
    it('reschedules 1 minute ahead when getNetInfo rejects, without raising backoffLevel', async () => {
      networkService.getNetInfo.and.rejectWith(new Error('offline'));

      await service.decide(morningSemaphore());

      const sem = savedSemaphore();
      expect(sem.choice).toBe(NOW.getTime() + MINUTE);
      expect(sem.retryAttempts).toBe(1);
      expect(sem.backoffLevel).toBe(0);
      expect(sem.lastFailReason).toBe('no-network');
      expect(measurementClientService.runTest).not.toHaveBeenCalled();
    });

    it('keeps the 1-minute pace across consecutive offline ticks', async () => {
      networkService.getNetInfo.and.rejectWith(new Error('offline'));

      await service.decide(morningSemaphore());
      jasmine.clock().tick(2 * MINUTE);
      await service.decide(savedSemaphore());

      const sem = savedSemaphore();
      expect(sem.choice).toBe(NOW.getTime() + 2 * MINUTE + MINUTE);
      expect(sem.retryAttempts).toBe(2);
      expect(sem.backoffLevel).toBe(0);
    });

    it('treats a null getNetInfo result as no network', async () => {
      networkService.getNetInfo.and.resolveTo(null);

      await service.decide(morningSemaphore());

      expect(savedSemaphore().lastFailReason).toBe('no-network');
    });
  });

  describe('failed-test retries (exponential backoff)', () => {
    it('backs off 60s * 1.2^n and increments backoffLevel on each failure', async () => {
      measurementClientService.runTest.and.rejectWith(new Error('test broke'));

      await service.decide(morningSemaphore());
      let sem = savedSemaphore();
      expect(sem.choice).toBe(NOW.getTime() + MINUTE); // 60s * 1.2^0
      expect(sem.retryAttempts).toBe(1);
      expect(sem.backoffLevel).toBe(1);
      expect(sem.lastFailReason).toBe('test-failed');

      jasmine.clock().tick(2 * MINUTE);
      await service.decide(sem);
      sem = savedSemaphore();
      expect(sem.choice).toBe(NOW.getTime() + 2 * MINUTE + 1.2 * MINUTE); // 60s * 1.2^1
      expect(sem.retryAttempts).toBe(2);
      expect(sem.backoffLevel).toBe(2);
    });

    it('caps the delay at 10 minutes', async () => {
      measurementClientService.runTest.and.rejectWith(new Error('test broke'));

      await service.decide(morningSemaphore({ backoffLevel: 30 }));

      const sem = savedSemaphore();
      expect(sem.choice).toBe(NOW.getTime() + 10 * MINUTE);
      expect(sem.backoffLevel).toBe(31);
    });
  });

  describe('network recovery', () => {
    it('resets the backoff after a no-network failure once the network is back', async () => {
      measurementClientService.runTest.and.rejectWith(new Error('test broke'));

      await service.decide(
        morningSemaphore({ backoffLevel: 5, lastFailReason: 'no-network' })
      );

      const sem = savedSemaphore();
      expect(sem.backoffLevel).toBe(1); // reset to 0, then this failure bumps it
      expect(sem.choice).toBe(NOW.getTime() + MINUTE); // 60s * 1.2^0
    });
  });

  describe('success and window expiry', () => {
    it('saves lastMeasurement and clears the semaphore on success', async () => {
      await service.decide(morningSemaphore());

      expect(measurementClientService.runTest).toHaveBeenCalledWith('daily', {
        slot: 'morning',
        scheduledAt: MORNING_CHOICE,
      });
      expect(store.lastMeasurement).toBe(NOW.getTime().toString());
      expect(savedSemaphore()).toEqual({});
    });

    it('keeps the originally planned time in scheduledAt across retries', async () => {
      measurementClientService.runTest.and.rejectWith(new Error('test broke'));
      await service.decide(morningSemaphore());

      const rescheduled = savedSemaphore();
      expect(rescheduled.choice).not.toBe(MORNING_CHOICE);
      expect(rescheduled.scheduledAt).toBe(MORNING_CHOICE);

      measurementClientService.runTest.and.resolveTo(undefined);
      jasmine.clock().tick(2 * MINUTE);
      await service.decide(rescheduled);

      expect(measurementClientService.runTest).toHaveBeenCalledWith('daily', {
        slot: 'morning',
        scheduledAt: MORNING_CHOICE,
      });
    });

    it('clears the semaphore when the window already ended', async () => {
      jasmine.clock().mockDate(new Date(2026, 7, 7, 12, 30, 0));

      await service.decide(morningSemaphore());

      expect(savedSemaphore()).toEqual({});
      expect(measurementClientService.runTest).not.toHaveBeenCalled();
    });

    it('gives up instead of rescheduling when the retry would land past the window end', async () => {
      networkService.getNetInfo.and.rejectWith(new Error('offline'));
      jasmine.clock().mockDate(new Date(MORNING_END));

      await service.decide(morningSemaphore());

      expect(savedSemaphore()).toEqual({});
    });

    it('clamps the rescheduled choice to the window end', async () => {
      networkService.getNetInfo.and.rejectWith(new Error('offline'));
      jasmine.clock().mockDate(new Date(MORNING_END - 30 * 1000));

      await service.decide(morningSemaphore());

      expect(savedSemaphore().choice).toBe(MORNING_END);
    });
  });

  describe('legacy semaphores', () => {
    it('handles a pre-2.0.4 semaphore without the new fields', async () => {
      measurementClientService.runTest.and.rejectWith(new Error('test broke'));
      const legacy = morningSemaphore();
      delete legacy.backoffLevel;

      await service.decide(legacy);

      const sem = savedSemaphore();
      expect(sem.choice).toBe(NOW.getTime() + MINUTE);
      expect(sem.backoffLevel).toBe(1);
    });

    it('maps a semaphore still carrying an A/B/C slot code to its name', async () => {
      await service.decide(morningSemaphore({ slot: 'A' }));

      expect(measurementClientService.runTest).toHaveBeenCalledWith('daily', {
        slot: 'morning',
        scheduledAt: MORNING_CHOICE,
      });
    });
  });

  describe('createSlotSemaphore via scheduleInitializers', () => {
    it('creates semaphores with retry fields initialised', async () => {
      store.lastMeasurement = '0';
      const sem = await service.scheduleInitializers('daily');

      expect(sem.retryAttempts).toBe(0);
      expect(sem.backoffLevel).toBe(0);
      expect(sem.slot).toBe('morning');
      expect(sem.scheduledAt).toBe(sem.choice);
      expect(sem.choice).toBeGreaterThanOrEqual(sem.start);
      expect(sem.choice).toBeLessThanOrEqual(sem.end);
    });
  });
});
