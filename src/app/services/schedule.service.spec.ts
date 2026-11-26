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

  describe('while a test is already running', () => {
    beforeEach(() => {
      measurementClientService.isTestRunning = true;
    });

    it('does not start the scheduled test, and keeps the slot due', async () => {
      await service.decide(morningSemaphore());

      expect(measurementClientService.runTest).not.toHaveBeenCalled();
      expect(networkService.getNetInfo).not.toHaveBeenCalled();
      expect(store.scheduleSemaphore).toBeUndefined();
    });

    it('runs the scheduled test at the next check once it has ended', async () => {
      await service.decide(morningSemaphore());
      measurementClientService.isTestRunning = false;
      await service.decide(morningSemaphore());

      expect(measurementClientService.runTest).toHaveBeenCalledTimes(1);
    });

    it('skips the startup test without counting it as run', async () => {
      await (service as any).runStartupTest();

      expect(measurementClientService.runTest).not.toHaveBeenCalled();
      expect(store[(service as any).STARTUP_TEST_KEY]).toBeUndefined();
    });
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

  describe('analytics events', () => {
    let posthog: { capture: jasmine.Spy };

    beforeEach(() => {
      posthog = { capture: jasmine.createSpy('capture') };
      service = new ScheduleService(
        storageService,
        measurementClientService,
        settingsService,
        sharedService,
        networkService,
        posthog as any
      );
    });

    it('reports a slot whose time came while the PC was off as missed', async () => {
      jasmine.clock().mockDate(new Date(2026, 7, 7, 12, 30, 0));

      await service.decide(morningSemaphore());

      expect(posthog.capture).toHaveBeenCalledOnceWith('scheduled_test_missed', {
        slot: 'morning',
        reason: 'slot_ended_before_run',
        retry_attempts: 0,
      });
    });

    it('reports the window ending after failed tests as missed for that reason', async () => {
      measurementClientService.runTest.and.rejectWith(new Error('test broke'));
      jasmine.clock().mockDate(new Date(MORNING_END));

      await service.decide(morningSemaphore({ retryAttempts: 3 }));

      expect(posthog.capture).toHaveBeenCalledWith('scheduled_test_missed', {
        slot: 'morning',
        reason: 'test_failed',
        retry_attempts: 3,
      });
    });

    it('reports only the first of a run of offline retries', async () => {
      networkService.getNetInfo.and.rejectWith(new Error('offline'));

      await service.decide(morningSemaphore());
      jasmine.clock().mockDate(new Date(NOW.getTime() + 2 * MINUTE));
      await service.decide(savedSemaphore());
      expect(savedSemaphore().retryAttempts).toBe(2);

      const rescheduled = posthog.capture.calls
        .allArgs()
        .filter(([name]) => name === 'scheduled_test_rescheduled');
      expect(rescheduled.length).toBe(1);
      expect(rescheduled[0][1]).toEqual(
        jasmine.objectContaining({ reason: 'no_network', retry_attempt: 1 })
      );
    });

    const eventsNamed = (name: string) =>
      posthog.capture.calls.allArgs().filter(([event]) => event === name);
    const missed = () => eventsNamed('scheduled_test_missed');

    it('reports the startup test finding no network once while offline for hours', async () => {
      store.schoolId = '1';
      networkService.getNetInfo.and.rejectWith(new Error('offline'));
      spyOn(Math, 'random').and.returnValue(0.5);
      spyOn(console, 'log');

      // initiate() plans a new startup test every 10-25 minutes until one runs
      for (let minute = 0; minute < 180; minute++) {
        await service.initiate();
        jasmine.clock().tick(MINUTE);
      }

      const startup = missed().filter(([, props]) => props.slot === 'startup');
      expect(startup).toEqual([
        [
          'scheduled_test_missed',
          { slot: 'startup', reason: 'no_network', retry_attempts: 0 },
        ],
      ]);
    });

    it('reports the startup test finding no network again once it had the network', async () => {
      const runStartupTest = () => (service as any).runStartupTest();
      networkService.getNetInfo.and.rejectWith(new Error('offline'));
      await runStartupTest();
      networkService.getNetInfo.and.resolveTo({ ip: '1.2.3.4' });
      await runStartupTest();
      networkService.getNetInfo.and.rejectWith(new Error('offline'));
      await runStartupTest();

      expect(missed().length).toBe(2);
    });

    describe('checked every minute, as the app does', () => {
      const at = (day: number, hour: number, minute = 0, second = 30) =>
        new Date(2026, 7, day, hour, minute, second).getTime();
      const EVENING_START = at(7, 16, 0, 0);
      const EVENING_END = at(7, 20, 0, 0);
      const NEXT_MORNING_START = at(8, 8, 0, 0);

      const eveningSemaphore = (choice: number, overrides: any = {}) => ({
        start: EVENING_START,
        end: EVENING_END,
        choice,
        scheduledAt: choice,
        slot: 'evening',
        intervalType: 'daily',
        retryAttempts: 0,
        backoffLevel: 0,
        ...overrides,
      });
      const missedEvening = (reason: string, retryAttempts: number) => [
        'scheduled_test_missed',
        { slot: 'evening', reason, retry_attempts: retryAttempts },
      ];

      // AppComponent runs watch() (through initiate()) every minute; the
      // semaphore:refresh it broadcasts makes AppComponent call getSemaphore()
      // once more.
      const checkEveryMinute = async (from: number, to: number) => {
        for (let time = from; time <= to; time += MINUTE) {
          jasmine.clock().mockDate(new Date(time));
          await service.watch();
          await service.getSemaphore();
        }
      };

      beforeEach(() => {
        // The afternoon test ran, so the evening window is the one due
        store.lastMeasurement = at(7, 13, 0, 0).toString();
        spyOn(console, 'log');
      });

      it('online, its time in the last minute of the window: reports it once, through midnight', async () => {
        store.scheduleSemaphore = JSON.stringify(
          eveningSemaphore(EVENING_END - 15 * 1000)
        );

        await checkEveryMinute(at(7, 19, 58), at(7, 20, 5));
        expect(missed()).toEqual([missedEvening('slot_ended_before_run', 0)]);

        await checkEveryMinute(at(7, 20, 6), at(8, 0, 5));
        expect(missed().length).toBe(1);
        expect(measurementClientService.runTest).not.toHaveBeenCalled();
        expect(savedSemaphore().start).toBe(NEXT_MORNING_START);
      });

      it('offline through the window end: reports it once, through midnight', async () => {
        networkService.getNetInfo.and.rejectWith(new Error('offline'));
        store.scheduleSemaphore = JSON.stringify(
          eveningSemaphore(at(7, 19, 30))
        );

        await checkEveryMinute(at(7, 19, 58), at(7, 20, 5));
        expect(missed()).toEqual([missedEvening('no_network', 1)]);

        await checkEveryMinute(at(7, 20, 6), at(8, 0, 5));
        expect(missed().length).toBe(1);
        expect(eventsNamed('scheduled_test_rescheduled').length).toBe(1);
        expect(savedSemaphore().start).toBe(NEXT_MORNING_START);
      });

      it('tests failing through the window end: reports it once, through midnight', async () => {
        measurementClientService.runTest.and.rejectWith(new Error('test broke'));
        store.scheduleSemaphore = JSON.stringify(
          eveningSemaphore(at(7, 19, 57))
        );

        await checkEveryMinute(at(7, 19, 58), at(7, 20, 5));
        expect(missed()).toEqual([missedEvening('test_failed', 1)]);

        await checkEveryMinute(at(7, 20, 6), at(8, 0, 5));
        expect(missed().length).toBe(1);
        expect(measurementClientService.runTest).toHaveBeenCalledTimes(1);
        expect(savedSemaphore().start).toBe(NEXT_MORNING_START);
      });

      it('keeps it at one across an app restart after 20:00', async () => {
        store.scheduleSemaphore = JSON.stringify(
          eveningSemaphore(EVENING_END - 15 * 1000)
        );
        await checkEveryMinute(at(7, 19, 58), at(7, 20, 2));

        service = new ScheduleService(
          storageService,
          measurementClientService,
          settingsService,
          sharedService,
          networkService,
          posthog as any
        );
        await checkEveryMinute(at(7, 21, 0), at(7, 21, 10));

        expect(missed().length).toBe(1);
      });

      it('started after the window ended with its test pending: reports it once', async () => {
        store.scheduleSemaphore = JSON.stringify(
          eveningSemaphore(at(7, 18, 0))
        );

        await checkEveryMinute(at(7, 21, 0), at(7, 21, 10));

        expect(missed()).toEqual([missedEvening('slot_ended_before_run', 0)]);
        expect(measurementClientService.runTest).not.toHaveBeenCalled();
        expect(savedSemaphore().start).toBe(NEXT_MORNING_START);
      });

      [
        { label: 'the afternoon test done', lastMeasurement: at(7, 13, 0, 0) },
        { label: 'never measured', lastMeasurement: undefined },
      ].forEach(({ label, lastMeasurement }) => {
        it(`started after 20:00 with no semaphore and ${label}: reports nothing, schedules the next morning`, async () => {
          if (lastMeasurement === undefined) {
            delete store.lastMeasurement;
          }

          await checkEveryMinute(at(7, 20, 30), at(7, 20, 40));

          expect(missed()).toEqual([]);
          expect(measurementClientService.runTest).not.toHaveBeenCalled();
          expect(savedSemaphore()).toEqual(
            jasmine.objectContaining({
              slot: 'morning',
              start: NEXT_MORNING_START,
            })
          );
        });
      });

      it('asleep from before the window to after midnight: reports it once, then runs the morning test', async () => {
        spyOn(Math, 'random').and.returnValue(0.5); // morning test at 10:00
        store.scheduleSemaphore = JSON.stringify(
          eveningSemaphore(at(7, 18, 0))
        );

        await checkEveryMinute(at(8, 0, 30), at(8, 0, 40));
        expect(missed()).toEqual([missedEvening('slot_ended_before_run', 0)]);
        expect(savedSemaphore()).toEqual(
          jasmine.objectContaining({ slot: 'morning', start: NEXT_MORNING_START })
        );

        await checkEveryMinute(at(8, 9, 58), at(8, 10, 2));
        expect(missed().length).toBe(1);
        expect(measurementClientService.runTest).toHaveBeenCalledOnceWith(
          'daily',
          { slot: 'morning', scheduledAt: at(8, 10, 0, 0) }
        );
      });

      it('a legacy (slot C) semaphore left from days ago: reports it once by name, then schedules the next window', async () => {
        spyOn(Math, 'random').and.returnValue(0.5);
        store.lastMeasurement = at(4, 13, 0, 0).toString();
        store.scheduleSemaphore = JSON.stringify(
          eveningSemaphore(at(4, 18, 0), {
            start: at(4, 16, 0, 0),
            end: at(4, 20, 0, 0),
            slot: 'C',
          })
        );

        await checkEveryMinute(at(7, 20, 30), at(7, 20, 40));
        expect(missed()).toEqual([missedEvening('slot_ended_before_run', 0)]);
        expect(savedSemaphore().start).toBe(NEXT_MORNING_START);
      });

      it('a missed morning still leads to the afternoon test', async () => {
        spyOn(Math, 'random').and.returnValue(0.5); // afternoon test at 14:00
        store.lastMeasurement = at(6, 17, 0, 0).toString();
        store.scheduleSemaphore = JSON.stringify(morningSemaphore());

        await checkEveryMinute(at(7, 13, 58), at(7, 14, 2));

        expect(missed()).toEqual([
          [
            'scheduled_test_missed',
            { slot: 'morning', reason: 'slot_ended_before_run', retry_attempts: 0 },
          ],
        ]);
        expect(measurementClientService.runTest).toHaveBeenCalledOnceWith(
          'daily',
          { slot: 'afternoon', scheduledAt: at(7, 14, 0, 0) }
        );
      });
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

  describe('startup test', () => {
    const runStartupTest = () => (service as any).runStartupTest();

    it('counts a test that passed as the window test and as the startup test', async () => {
      await runStartupTest();

      expect(store.lastMeasurement).toBe(NOW.getTime().toString());
      expect(store.lastStartupTest).toBe(NOW.getTime().toString());
    });

    it('does not count a test that failed as the window test', async () => {
      measurementClientService.runTest.and.rejectWith(new Error('test broke'));

      await runStartupTest();

      // The window's scheduled test still runs, with its own retries.
      expect(store.lastMeasurement).toBeUndefined();
      // But it is today's startup test, so no new one is planned every few
      // minutes for the rest of the day.
      expect(store.lastStartupTest).toBe(NOW.getTime().toString());
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

    const at = (day: number, hour: number, minute = 0) =>
      new Date(2026, 7, day, hour, minute, 0).getTime();
    const cases: [number, number, string, number][] = [
      // [now, last measurement, window scheduled, its start]
      [at(7, 7, 0), at(6, 17), 'morning', at(7, 8)],
      [at(7, 11, 59), at(6, 17), 'morning', at(7, 8)],
      [at(7, 12, 0), at(6, 17), 'afternoon', at(7, 12)],
      [at(7, 15, 59), at(7, 9), 'afternoon', at(7, 12)],
      [at(7, 16, 0), at(7, 9), 'evening', at(7, 16)],
      [at(7, 19, 59), at(7, 13), 'evening', at(7, 16)],
      [at(7, 20, 0), at(7, 13), 'morning', at(8, 8)],
      [at(7, 23, 59), 0, 'morning', at(8, 8)],
      [at(7, 21, 0), at(7, 17), 'morning', at(8, 8)],
      [at(8, 0, 0), at(7, 13), 'morning', at(8, 8)],
    ];
    cases.forEach(([now, last, slot, start]) => {
      it(`at ${new Date(now).toString().slice(4, 21)}, last test ${
        last ? new Date(last).toString().slice(4, 21) : 'never'
      }: schedules the ${slot} from ${new Date(start).toString().slice(4, 21)}`, async () => {
        jasmine.clock().mockDate(new Date(now));
        store.lastMeasurement = last.toString();

        const sem = await service.scheduleInitializers('daily');

        expect(sem.slot).toBe(slot);
        expect(sem.start).toBe(start);
        expect(sem.end).toBeGreaterThan(now);
      });
    });
  });
});
