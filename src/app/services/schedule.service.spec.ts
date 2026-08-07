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

  // 2026-08-07 09:00 local time — inside slot A (08:00–12:00)
  const NOW = new Date(2026, 7, 7, 9, 0, 0);
  const SLOT_A_START = new Date(2026, 7, 7, 8, 0, 0).getTime();
  const SLOT_A_END = new Date(2026, 7, 7, 12, 0, 0).getTime();

  const slotASemaphore = (overrides: any = {}) => ({
    start: SLOT_A_START,
    end: SLOT_A_END,
    choice: new Date(2026, 7, 7, 8, 30, 0).getTime(),
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

      await service.decide(slotASemaphore());

      const sem = savedSemaphore();
      expect(sem.choice).toBe(NOW.getTime() + MINUTE);
      expect(sem.retryAttempts).toBe(1);
      expect(sem.backoffLevel).toBe(0);
      expect(sem.lastFailReason).toBe('no-network');
      expect(measurementClientService.runTest).not.toHaveBeenCalled();
    });

    it('keeps the 1-minute pace across consecutive offline ticks', async () => {
      networkService.getNetInfo.and.rejectWith(new Error('offline'));

      await service.decide(slotASemaphore());
      jasmine.clock().tick(2 * MINUTE);
      await service.decide(savedSemaphore());

      const sem = savedSemaphore();
      expect(sem.choice).toBe(NOW.getTime() + 2 * MINUTE + MINUTE);
      expect(sem.retryAttempts).toBe(2);
      expect(sem.backoffLevel).toBe(0);
    });

    it('treats a null getNetInfo result as no network', async () => {
      networkService.getNetInfo.and.resolveTo(null);

      await service.decide(slotASemaphore());

      expect(savedSemaphore().lastFailReason).toBe('no-network');
    });
  });

  describe('failed-test retries (exponential backoff)', () => {
    it('backs off 60s * 1.2^n and increments backoffLevel on each failure', async () => {
      measurementClientService.runTest.and.rejectWith(new Error('test broke'));

      await service.decide(slotASemaphore());
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

      await service.decide(slotASemaphore({ backoffLevel: 30 }));

      const sem = savedSemaphore();
      expect(sem.choice).toBe(NOW.getTime() + 10 * MINUTE);
      expect(sem.backoffLevel).toBe(31);
    });
  });

  describe('network recovery', () => {
    it('resets the backoff after a no-network failure once the network is back', async () => {
      measurementClientService.runTest.and.rejectWith(new Error('test broke'));

      await service.decide(
        slotASemaphore({ backoffLevel: 5, lastFailReason: 'no-network' })
      );

      const sem = savedSemaphore();
      expect(sem.backoffLevel).toBe(1); // reset to 0, then this failure bumps it
      expect(sem.choice).toBe(NOW.getTime() + MINUTE); // 60s * 1.2^0
    });
  });

  describe('success and window expiry', () => {
    it('saves lastMeasurement and clears the semaphore on success', async () => {
      await service.decide(slotASemaphore());

      expect(measurementClientService.runTest).toHaveBeenCalledWith('daily');
      expect(store.lastMeasurement).toBe(NOW.getTime().toString());
      expect(savedSemaphore()).toEqual({});
    });

    it('clears the semaphore when the window already ended', async () => {
      jasmine.clock().mockDate(new Date(2026, 7, 7, 12, 30, 0));

      await service.decide(slotASemaphore());

      expect(savedSemaphore()).toEqual({});
      expect(measurementClientService.runTest).not.toHaveBeenCalled();
    });

    it('gives up instead of rescheduling when the retry would land past the window end', async () => {
      networkService.getNetInfo.and.rejectWith(new Error('offline'));
      jasmine.clock().mockDate(new Date(SLOT_A_END));

      await service.decide(slotASemaphore());

      expect(savedSemaphore()).toEqual({});
    });

    it('clamps the rescheduled choice to the window end', async () => {
      networkService.getNetInfo.and.rejectWith(new Error('offline'));
      jasmine.clock().mockDate(new Date(SLOT_A_END - 30 * 1000));

      await service.decide(slotASemaphore());

      expect(savedSemaphore().choice).toBe(SLOT_A_END);
    });
  });

  describe('legacy semaphores', () => {
    it('handles a pre-2.0.4 semaphore without the new fields', async () => {
      measurementClientService.runTest.and.rejectWith(new Error('test broke'));
      const legacy = slotASemaphore();
      delete legacy.backoffLevel;

      await service.decide(legacy);

      const sem = savedSemaphore();
      expect(sem.choice).toBe(NOW.getTime() + MINUTE);
      expect(sem.backoffLevel).toBe(1);
    });
  });

  describe('createSlotSemaphore via scheduleInitializers', () => {
    it('creates semaphores with retry fields initialised', async () => {
      store.lastMeasurement = '0';
      const sem = await service.scheduleInitializers('daily');

      expect(sem.retryAttempts).toBe(0);
      expect(sem.backoffLevel).toBe(0);
      expect(sem.choice).toBeGreaterThanOrEqual(sem.start);
      expect(sem.choice).toBeLessThanOrEqual(sem.end);
    });
  });
});
