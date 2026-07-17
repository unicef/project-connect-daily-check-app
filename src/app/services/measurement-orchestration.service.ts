import { Injectable } from '@angular/core';
import { SettingsService } from './settings.service';
import { MeasurementClientService } from './measurement-client.service';
import { CloudflareMeasurementService } from './measurment-cloudflare-client.service';
import { SharedService } from './shared-service.service';
import { MeasurementRunOutcome } from './measurement.types';

export type MeasurementOrchestrationStage =
  | 'mlab:start'
  | 'mlab:done'
  | 'wait'
  | 'cloudflare:start'
  | 'cloudflare:done';

export type MeasurementSequenceOverallStatus =
  | 'success'
  | 'partial_failure'
  | 'failure';

export interface MeasurementSequenceSummary {
  measurementProviders: string[];
  betweenTestsDelaySec: number;
  stages: MeasurementRunOutcome[];
  overallStatus: MeasurementSequenceOverallStatus;
}

export interface RunSequenceOptions {
  signal?: AbortSignal;
}

@Injectable({
  providedIn: 'root',
})
export class MeasurementOrchestrationService {
  private activeSequence: Promise<MeasurementSequenceSummary> | null = null;

  constructor(
    private settingsService: SettingsService,
    private measurementClientService: MeasurementClientService,
    private cloudflareMeasurementService: CloudflareMeasurementService,
    private sharedService: SharedService
  ) {}

  runSequence(
    notes: string,
    options: RunSequenceOptions = {}
  ): Promise<MeasurementSequenceSummary> {
    if (this.activeSequence) {
      return this.activeSequence;
    }

    const sequencePromise = this.executeSequence(notes, options).finally(() => {
      if (this.activeSequence === sequencePromise) {
        this.activeSequence = null;
      }
    });
    this.activeSequence = sequencePromise;
    return sequencePromise;
  }

  private async executeSequence(
    notes: string,
    options: RunSequenceOptions
  ): Promise<MeasurementSequenceSummary> {
    const cfg = await this.settingsService.getProtocolConfig();
    const providers = cfg.measurementProviders ?? [];
    const hasCloudflare = providers.includes('cloudflare');
    // mlab is the universal default: run it when explicitly requested or when no
    // provider resolved to something runnable.
    const hasMlab = providers.includes('mlab') || (!hasCloudflare);
    const betweenTestsDelaySec = Math.max(0, cfg.betweenTestsDelaySec ?? 0);
    const stages: MeasurementRunOutcome[] = [];

    if (hasMlab && hasCloudflare) {
      this.emitStage('mlab:start', notes);
      stages.push(await this.runMlab(notes));
      this.emitStage('mlab:done', notes);

      this.emitStage('wait', notes, { betweenTestsDelaySec });
      await this.delay(betweenTestsDelaySec * 1000, options.signal);

      if (options.signal?.aborted) {
        return {
          measurementProviders: providers,
          betweenTestsDelaySec,
          stages,
          overallStatus: this.resolveOverallStatus(stages),
        };
      }

      this.emitStage('cloudflare:start', notes);
      stages.push(await this.runCloudflare(notes));
      this.emitStage('cloudflare:done', notes);
    } else if (hasCloudflare) {
      this.emitStage('cloudflare:start', notes);
      stages.push(await this.runCloudflare(notes));
      this.emitStage('cloudflare:done', notes);
    } else {
      this.emitStage('mlab:start', notes);
      stages.push(await this.runMlab(notes));
      this.emitStage('mlab:done', notes);
    }

    return {
      measurementProviders: providers,
      betweenTestsDelaySec,
      stages,
      overallStatus: this.resolveOverallStatus(stages),
    };
  }

  private async runMlab(notes: string): Promise<MeasurementRunOutcome> {
    try {
      return await this.measurementClientService.runToCompletion(notes);
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      return { provider: 'mlab', status: 'failure', error: errorMessage };
    }
  }

  private async runCloudflare(notes: string): Promise<MeasurementRunOutcome> {
    try {
      return await this.cloudflareMeasurementService.runToCompletion(notes);
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      return { provider: 'cloudflare', status: 'failure', error: errorMessage };
    }
  }

  private resolveOverallStatus(
    stages: MeasurementRunOutcome[]
  ): MeasurementSequenceOverallStatus {
    if (!stages.length) {
      return 'failure';
    }

    const successes = stages.filter((stage) => stage.status === 'success').length;
    if (successes === stages.length) {
      return 'success';
    }
    if (successes > 0) {
      return 'partial_failure';
    }
    return 'failure';
  }

  private emitStage(
    stage: MeasurementOrchestrationStage,
    notes: string,
    extra: Record<string, unknown> = {}
  ): void {
    console.info('[measurement-orchestration]', stage, { notes, ...extra });
    this.sharedService.broadcast('measurement:orchestration', 'measurement:orchestration', {
      stage,
      notes,
      ...extra,
    });
  }

  private delay(ms: number, signal?: AbortSignal): Promise<void> {
    if (ms <= 0) {
      return Promise.resolve();
    }

    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        signal?.removeEventListener('abort', onAbort);
        resolve();
      }, ms);

      const onAbort = () => {
        clearTimeout(timeoutId);
        reject(this.createAbortError());
      };

      if (signal?.aborted) {
        clearTimeout(timeoutId);
        reject(this.createAbortError());
        return;
      }

      signal?.addEventListener('abort', onAbort, { once: true });
    });
  }

  private createAbortError(): Error {
    return new DOMException('Measurement sequence aborted', 'AbortError');
  }
}
