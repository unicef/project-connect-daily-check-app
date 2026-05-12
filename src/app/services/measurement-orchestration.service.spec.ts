import { TestBed, fakeAsync, tick } from '@angular/core/testing';
import { MeasurementOrchestrationService } from './measurement-orchestration.service';
import { SettingsService } from './settings.service';
import { MeasurementClientService } from './measurement-client.service';
import { CloudflareMeasurementService } from './measurment-cloudflare-client.service';
import { SharedService } from './shared-service.service';
import { MeasurementRunOutcome } from './measurement.types';

describe('MeasurementOrchestrationService', () => {
  let service: MeasurementOrchestrationService;
  let settingsService: jasmine.SpyObj<SettingsService>;
  let mlabService: jasmine.SpyObj<MeasurementClientService>;
  let cloudflareService: jasmine.SpyObj<CloudflareMeasurementService>;
  let sharedService: jasmine.SpyObj<SharedService>;

  const successMlab: MeasurementRunOutcome = {
    provider: 'mlab',
    status: 'success',
  };
  const failureMlab: MeasurementRunOutcome = {
    provider: 'mlab',
    status: 'failure',
    error: 'mlab failed',
  };
  const successCloudflare: MeasurementRunOutcome = {
    provider: 'cloudflare',
    status: 'success',
  };
  const failureCloudflare: MeasurementRunOutcome = {
    provider: 'cloudflare',
    status: 'failure',
    error: 'cloudflare failed',
  };

  beforeEach(() => {
    settingsService = jasmine.createSpyObj('SettingsService', ['getProtocolConfig']);
    mlabService = jasmine.createSpyObj('MeasurementClientService', [
      'runToCompletion',
    ]);
    cloudflareService = jasmine.createSpyObj('CloudflareMeasurementService', [
      'runToCompletion',
    ]);
    sharedService = jasmine.createSpyObj('SharedService', ['broadcast']);

    TestBed.configureTestingModule({
      providers: [
        MeasurementOrchestrationService,
        { provide: SettingsService, useValue: settingsService },
        { provide: MeasurementClientService, useValue: mlabService },
        { provide: CloudflareMeasurementService, useValue: cloudflareService },
        { provide: SharedService, useValue: sharedService },
      ],
    });

    service = TestBed.inject(MeasurementOrchestrationService);
  });

  it('runs only mlab when provider is mlab', async () => {
    settingsService.getProtocolConfig.and.resolveTo({
      measurementProvider: 'mlab',
      betweenTestsDelaySec: 0,
      configSource: 'default',
    });
    mlabService.runToCompletion.and.resolveTo(successMlab);

    const summary = await service.runSequence('manual');

    expect(mlabService.runToCompletion).toHaveBeenCalledWith('manual');
    expect(cloudflareService.runToCompletion).not.toHaveBeenCalled();
    expect(summary.overallStatus).toBe('success');
    expect(summary.stages).toEqual([successMlab]);
  });

  it('runs only cloudflare when provider is cloudflare', async () => {
    settingsService.getProtocolConfig.and.resolveTo({
      measurementProvider: 'cloudflare',
      betweenTestsDelaySec: 0,
      configSource: 'default',
    });
    cloudflareService.runToCompletion.and.resolveTo(successCloudflare);

    const summary = await service.runSequence('scheduled');

    expect(cloudflareService.runToCompletion).toHaveBeenCalledWith('scheduled');
    expect(mlabService.runToCompletion).not.toHaveBeenCalled();
    expect(summary.overallStatus).toBe('success');
    expect(summary.stages).toEqual([successCloudflare]);
  });

  it('runs mlab then cloudflare in both mode and respects delay', fakeAsync(() => {
    settingsService.getProtocolConfig.and.resolveTo({
      measurementProvider: 'both',
      betweenTestsDelaySec: 2,
      configSource: 'school',
    });
    mlabService.runToCompletion.and.resolveTo(successMlab);
    cloudflareService.runToCompletion.and.resolveTo(successCloudflare);

    let summary: Awaited<ReturnType<typeof service.runSequence>> | undefined;
    service.runSequence('manual').then((result) => {
      summary = result;
    });

    tick();
    expect(mlabService.runToCompletion).toHaveBeenCalled();
    expect(cloudflareService.runToCompletion).not.toHaveBeenCalled();

    tick(2000);
    expect(cloudflareService.runToCompletion).toHaveBeenCalledWith('manual');
    expect(summary?.overallStatus).toBe('success');
    expect(summary?.stages).toEqual([successMlab, successCloudflare]);
  }));

  it('still runs cloudflare when mlab fails in both mode', async () => {
    settingsService.getProtocolConfig.and.resolveTo({
      measurementProvider: 'both',
      betweenTestsDelaySec: 0,
      configSource: 'default',
    });
    mlabService.runToCompletion.and.resolveTo(failureMlab);
    cloudflareService.runToCompletion.and.resolveTo(successCloudflare);

    const summary = await service.runSequence('manual');

    expect(mlabService.runToCompletion).toHaveBeenCalled();
    expect(cloudflareService.runToCompletion).toHaveBeenCalled();
    expect(summary.overallStatus).toBe('partial_failure');
    expect(summary.stages).toEqual([failureMlab, successCloudflare]);
  });

  it('marks both failures as failure overall status', async () => {
    settingsService.getProtocolConfig.and.resolveTo({
      measurementProvider: 'both',
      betweenTestsDelaySec: 0,
      configSource: 'default',
    });
    mlabService.runToCompletion.and.resolveTo(failureMlab);
    cloudflareService.runToCompletion.and.resolveTo(failureCloudflare);

    const summary = await service.runSequence('manual');

    expect(summary.overallStatus).toBe('failure');
    expect(summary.stages).toEqual([failureMlab, failureCloudflare]);
  });

  it('emits orchestration stage markers', async () => {
    settingsService.getProtocolConfig.and.resolveTo({
      measurementProvider: 'mlab',
      betweenTestsDelaySec: 0,
      configSource: 'default',
    });
    mlabService.runToCompletion.and.resolveTo(successMlab);

    await service.runSequence('manual');

    expect(sharedService.broadcast).toHaveBeenCalledWith(
      'measurement:orchestration',
      'measurement:orchestration',
      jasmine.objectContaining({ stage: 'mlab:start', notes: 'manual' })
    );
    expect(sharedService.broadcast).toHaveBeenCalledWith(
      'measurement:orchestration',
      'measurement:orchestration',
      jasmine.objectContaining({ stage: 'mlab:done', notes: 'manual' })
    );
  });
});
