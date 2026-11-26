import { AnalyticsHeartbeatService, localDay } from './analytics-heartbeat.service';

describe('AnalyticsHeartbeatService', () => {
  const NOW = new Date(2026, 10, 25, 10, 0, 0);
  const HOUR = 60 * 60 * 1000;
  let posthog: { capture: jasmine.Spy; registerProperties: jasmine.Spy };
  let indexedDB: any;
  let store: Record<string, string>;
  let settings: Record<string, any>;
  let service: AnalyticsHeartbeatService;

  beforeEach(() => {
    localStorage.removeItem(AnalyticsHeartbeatService.LAST_SENT_KEY);
    posthog = {
      capture: jasmine.createSpy('capture'),
      registerProperties: jasmine.createSpy('registerProperties'),
    };
    indexedDB = {
      getPendingMeasurements: jasmine
        .createSpy('getPendingMeasurements')
        .and.resolveTo([{ id: 1 }, { id: 2 }]),
      getPingResults: jasmine.createSpy('getPingResults').and.resolveTo([
        // Inside the last 24 hours
        { timestamp: new Date(NOW.getTime() - HOUR), isConnected: true, isSynced: true },
        { timestamp: new Date(NOW.getTime() - 2 * HOUR), isConnected: false, errorMessage: 'SpeedTest timeout', isSynced: false },
        { timestamp: new Date(NOW.getTime() - 3 * HOUR), isConnected: false, errorMessage: 'SpeedTest timeout', isSynced: false },
        // Older: not counted in the 24-hour figures
        { timestamp: new Date(NOW.getTime() - 30 * HOUR), isConnected: true, isSynced: true },
      ]),
    };
    store = {
      schoolId: 'spaintestschool5',
      lastMeasurement: String(NOW.getTime() - 5 * HOUR),
    };
    settings = { scheduledTesting: true, uploadEnabled: true };
    service = new AnalyticsHeartbeatService(
      posthog as any,
      indexedDB,
      { get: (key: string) => store[key] } as any,
      { get: (key: string) => settings[key] } as any,
      {
        getDeviceIdentity: jasmine.createSpy('getDeviceIdentity').and.resolveTo({
          app_build_number: 'abc1234',
          os_version: 'Microsoft Windows 11 Pro 10.0.26200',
        }),
      } as any
    );
  });

  afterEach(() => {
    localStorage.removeItem(AnalyticsHeartbeatService.LAST_SENT_KEY);
  });

  it("sends the device's health once a day", async () => {
    expect(await service.sendIfDue(NOW)).toBeTrue();
    expect(await service.sendIfDue(new Date(NOW.getTime() + HOUR))).toBeFalse();

    expect(posthog.capture).toHaveBeenCalledOnceWith('device_heartbeat', {
      registered: true,
      has_app_instance_id: false,
      registration_pending: false,
      app_instance_claim_pending: false,
      scheduled_testing: true,
      upload_enabled: true,
      online: navigator.onLine,
      hours_since_last_measurement: 5,
      pending_measurements: 2,
      ping_attempts_24h: 3,
      ping_successes_24h: 1,
      ping_unsynced: 2,
      top_ping_error: 'SpeedTest timeout',
    });
  });

  it('sends again the next day', async () => {
    await service.sendIfDue(NOW);
    expect(await service.sendIfDue(new Date(NOW.getTime() + 24 * HOUR))).toBeTrue();
    expect(posthog.capture).toHaveBeenCalledTimes(2);
  });

  it('still sends when a local read fails', async () => {
    indexedDB.getPingResults.and.rejectWith(new Error('IndexedDB gone'));

    await service.sendIfDue(NOW);

    expect(posthog.capture).toHaveBeenCalledWith(
      'device_heartbeat',
      jasmine.objectContaining({ ping_attempts_24h: null, pending_measurements: 2 })
    );
  });

  it('names a ping that got no reply when that is the commonest failure', async () => {
    indexedDB.getPingResults.and.resolveTo([
      { timestamp: new Date(NOW.getTime() - HOUR), isConnected: false, errorMessage: null },
      { timestamp: new Date(NOW.getTime() - 2 * HOUR), isConnected: false, errorMessage: null },
      { timestamp: new Date(NOW.getTime() - 3 * HOUR), isConnected: false, errorMessage: 'DNS resolution failed' },
    ]);

    await service.sendIfDue(NOW);

    expect(posthog.capture).toHaveBeenCalledWith(
      'device_heartbeat',
      jasmine.objectContaining({ top_ping_error: 'no_reply', ping_successes_24h: 0 })
    );
  });

  it('adds the build and OS version to every event', async () => {
    await service.registerDeviceProperties();

    expect(posthog.registerProperties).toHaveBeenCalledOnceWith({
      build_commit: 'abc1234',
      os_version: 'Microsoft Windows 11 Pro 10.0.26200',
    });
  });

  it('names the day in local time', () => {
    expect(localDay(new Date(2026, 0, 5, 23, 59))).toBe('2026-01-05');
  });
});
