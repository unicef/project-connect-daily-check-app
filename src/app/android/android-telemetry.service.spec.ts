import { AndroidTelemetryService } from './android-telemetry.service';
import { PosthogService } from '../services/posthog.service';

describe('AndroidTelemetryService', () => {
  let posthog: jasmine.SpyObj<PosthogService>;
  let service: AndroidTelemetryService;

  const update = (data: any) => (service as any).onSpeedTestUpdate(data);

  beforeEach(() => {
    posthog = jasmine.createSpyObj('PosthogService', ['capture']);
    service = new AndroidTelemetryService(posthog);
  });

  it('does nothing outside the native Android app', () => {
    service.start();
    expect((service as any).started).toBeFalse();
  });

  it('maps a completed test to measurement_uploaded', () => {
    update({ testStatus: 'complete', speedTestData: { Notes: 'daily' } });
    expect(posthog.capture).toHaveBeenCalledWith('measurement_uploaded', {
      notes: 'daily',
      source: 'android-native',
      protocol: 'mlab',
      offline_synced: false,
    });
  });

  it('maps an error with a payload to measurement_upload_failed', () => {
    update({
      testStatus: 'onerror',
      speedTestData: { Notes: 'manual' },
      measurementsItem: { Notes: 'manual' },
    });
    expect(posthog.capture).toHaveBeenCalledWith('measurement_upload_failed', {
      notes: 'manual',
      source: 'android-native',
    });
  });

  it('maps an error without results to measurement_failed', () => {
    update({ testStatus: 'onerror', speedTestData: null, measurementsItem: null });
    expect(posthog.capture).toHaveBeenCalledWith('measurement_failed', {
      notes: null,
      source: 'android-native',
      stage: 'test',
    });
  });

  it('flags a payload that could not be built', () => {
    update({
      testStatus: 'onerror',
      speedTestData: null,
      measurementsItem: { Notes: 'startup' },
    });
    expect(posthog.capture).toHaveBeenCalledWith('measurement_failed', {
      notes: 'startup',
      source: 'android-native',
      stage: 'payload',
    });
  });

  it('maps offline to measurement_skipped_offline', () => {
    update({ testStatus: 'offline' });
    expect(posthog.capture).toHaveBeenCalledWith(
      'measurement_skipped_offline',
      { notes: null, source: 'android-native' }
    );
  });

  it('ignores progress updates', () => {
    ['onstart', 'server_discovery', 'server_chosen', 'download', 'upload'].forEach(
      (testStatus) => update({ testStatus })
    );
    expect(posthog.capture).not.toHaveBeenCalled();
  });
});
