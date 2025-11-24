import { Injectable } from '@angular/core';
import SpeedTest from '@cloudflare/speedtest';
import { Subject, firstValueFrom } from 'rxjs';
import { HistoryService } from './history.service';
import { SettingsService } from './settings.service';
import { NetworkService } from './network.service';
import { UploadService } from './upload.service';
import { SharedService } from './shared-service.service';
import { environment } from 'src/environments/environment';
import { MeasurementRecord } from './measurement.types';

type ScaleOptions = {
  latencyScale?: number;
  bytesScale?: number;
  countScale?: number;
  packetLossScale?: number;
  responsesWaitTimeScale?: number;
  budgetBytes?: number;
  minBytesPerRequest?: number;
  keepBypassOnSmallSets?: boolean;
  bypassBytesThreshold?: number;
};



type CloudflareConfig = Partial<ConstructorParameters<typeof SpeedTest>[0]> & {
  scale?: ScaleOptions;
};

type BandwidthPoint = {
  bytes?: number;
  bps?: number;
  duration?: number;
  ping?: number;
  measTime?: number;
  serverTime?: number;
  transferSize?: number;
};

type ResultsObject = {
  isFinished: boolean;
  summary: any;
  unloadedLatency: {
    latency: any;
    jitter: any;
    latencyPoints: any;
  };
  downloadedLatency: {
    latency: any;
    jitter: any;
    latencyPoints: any;
  };
  uploadedLatency: {
    latency: any;
    jitter: any;
    latencyPoints: any;
  };
  bandwidth: {
    download: any;
    upload: any;
  };
  bandwidthPoints: {
    download: BandwidthPoint[];
    upload: BandwidthPoint[];
  };
  packetLoss: {
    value: any;
    details: any;
  };
  scores: any;
};

@Injectable({ providedIn: 'root' })
export class CloudflareMeasurementService  {
  constructor(
    private historyService: HistoryService,
    private settingsService: SettingsService,
    private networkService: NetworkService,
    private uploadService: UploadService,
    private sharedService: SharedService
  ) {}

  // -- Contrato de la interfaz --
  measurementStatus = new Subject<any>();
  downloadComplete$ = new Subject<any>();
  uploadComplete$ = new Subject<any>();
  downloadStarted$ = new Subject<any>();
  uploadStarted$ = new Subject<any>();
  progress = 0;
  resultData = { testStatus: {}, passedResults: {} };

  // -- Internos --
  private st?: InstanceType<typeof SpeedTest>;
  private measurementRecord?: MeasurementRecord;
  private startedDownload = false;
  private finishedDownload = false;
  private startedUpload = false;
  private finishedUpload = false;

  async runTest(notes = 'manual'): Promise<void> {
    // 1) Obtener/crear registro base
    this.measurementRecord = await this.createMeasurementRecord(notes);

    // TODO:Change to feature flag
    const raw = localStorage.getItem('cloudflare-config');
    let userCfg: CloudflareConfig = {};
    try {
      userCfg = raw ? JSON.parse(raw) : {};
    } catch {
      userCfg = {};
    }

    // 2) Construir mediciones escaladas (si aplica)
    const measurements = this.buildScaledMeasurements(userCfg.scale);

    // 3) Instancia del SpeedTest
    const cfg: CloudflareConfig = {
      ...userCfg,
      measureDownloadLoadedLatency:
        userCfg?.measureDownloadLoadedLatency ?? true,
      measureUploadLoadedLatency: userCfg?.measureUploadLoadedLatency ?? true,
    };

    if (Array.isArray(userCfg?.measurements)) {
      cfg.measurements = userCfg.measurements;
    } else if (Array.isArray(measurements)) {
      cfg.measurements = measurements;
    }

    this.st = new SpeedTest(cfg);
    this.st.play();

    // 4) Inicio
    // this.broadcast('onstart', { running: true, progress: 0, notes });
    this.broadcastMeasurementStatus('cf_onstart', {});

    // 5) Eventos
    this.st.onResultsChange = (info: { type: string }) => {
      this.updateStageFlags(info?.type);
      this.bumpProgress(info?.type);

      const results = this.st?.results;
      if (!results) return;

      const resultsObject = this.buildResultsObject(results);
      this.resultData.passedResults = resultsObject;
      if (this.measurementRecord) {
        this.measurementRecord.results = resultsObject;
        const downloadSpeed =
          info?.type === 'download'
            ? Number(resultsObject?.bandwidth?.download)
            : undefined;
        if (downloadSpeed !== undefined && Number.isFinite(downloadSpeed)) {
          this.measurementRecord.snapLog?.s2cRate.push(downloadSpeed);
        }

        const uploadSpeed =
          info?.type === 'upload'
            ? Number(resultsObject?.bandwidth?.upload)
            : undefined;
        if (uploadSpeed !== undefined && Number.isFinite(uploadSpeed)) {
          this.measurementRecord.snapLog?.c2sRate.push(uploadSpeed);
        }
      }

      
      console.log(info);
      const intervalType =
        info?.type === 'download'
          ? 'cf_interval_download'
          : info?.type === 'upload'
          ? 'cf_interval_upload'
          : 'cf_interval_other';
      this.broadcastMeasurementStatus(intervalType, {
        running: true,
        progress: this.progress,
        downloadCurrentSpeed:
          resultsObject?.bandwidth?.download?.toFixed(2) || 0,
        uploadCurrentSpeed: resultsObject?.bandwidth?.upload?.toFixed(2) || 0,
        passedResults: resultsObject,
      });

      // Emisiones específicas
      if (
        info?.type === 'download' &&
        this.startedDownload &&
        !this.finishedDownload
      ) {
        this.downloadStarted$.next({ started: true });
      }
      if (
        info?.type === 'upload' &&
        this.startedUpload &&
        !this.finishedUpload
      ) {
        this.uploadStarted$.next({ started: true });
      }
    };

    this.st.onFinish = async (_: any) => {
      const results = this.st?.results;
      const resultsObject = results
        ? this.buildResultsObject(results)
        : undefined;

      if (this.measurementRecord && resultsObject) {
        this.measurementRecord.results = resultsObject;
      }

      // Completar emisiones por dirección si faltan
      if (this.startedDownload && !this.finishedDownload) {
        this.finishedDownload = true;
        this.downloadComplete$.next(resultsObject?.bandwidth?.download ?? {});
      }
      if (this.startedUpload && !this.finishedUpload) {
        this.finishedUpload = true;
        this.uploadComplete$.next(resultsObject?.bandwidth?.upload ?? {});
      }

      this.progress = 1;
      this.resultData.testStatus = { status: 'cf_complete', notes };
      this.resultData.passedResults = resultsObject ?? {};

      await this.finalizeMeasurement(resultsObject);
    };

    this.st.onError = (error: any) => {
      this.broadcastMeasurementStatus('cf_error', {
        error: (error && (error.message ?? String(error))) || 'Unknown error',
        running: false,
      });
    };
  }

  // ----------------- Helpers -----------------

  /** Construye el objeto results EXACTO al formato solicitado */
  private buildResultsObject(results: any): ResultsObject {
    // Importante: usamos los getters que pediste. Si alguno no existe en la versión,
    // hacemos fallback a undefined para no romper el shape.
    const safe = <T>(fn: () => T) => {
      try {
        return fn();
      } catch {
        return undefined as unknown as T;
      }
    };

    const obj: ResultsObject = {
      isFinished: safe(() => results.isFinished) as unknown as boolean,

      summary: safe(() => results.getSummary()),

      unloadedLatency: {
        latency: safe(() => results.getUnloadedLatency()),
        jitter: safe(() => results.getUnloadedJitter()),
        latencyPoints: safe(() => results.getUnloadedLatencyPoints()),
      },

      downloadedLatency: {
        latency: safe(() => results.getDownLoadedLatency()),
        jitter: safe(() => results.getDownLoadedJitter()),
        latencyPoints: safe(() => results.getDownLoadedLatencyPoints()),
      },

      uploadedLatency: {
        latency: safe(() => results.getUpLoadedLatency()),
        jitter: safe(() => results.getUpLoadedJitter()),
        latencyPoints: safe(() => results.getUpLoadedLatencyPoints()),
      },

      bandwidth: {
        download: safe(() => results.getDownloadBandwidth()),
        upload: safe(() => results.getUploadBandwidth()),
      },
      bandwidthPoints: {
        download:
          safe(() => results.getDownloadBandwidthPoints()) ?? [],
        upload: safe(() => results.getUploadBandwidthPoints()) ?? [],
      },

      packetLoss: {
        value: safe(() => results.getPacketLoss()),
        details: safe(() => results.getPacketLossDetails()),
      },

      scores: safe(() => results.getScores()),
    };

    return obj;
  }

  /** Marca inicios/finales heurísticos por etapa para emitir started/complete */
  private updateStageFlags(type?: string) {
    if (!type) return;
    if (type === 'download') {
      this.startedDownload = true;
    } else if (this.startedDownload && !this.finishedDownload) {
      this.finishedDownload = true;
      this.downloadComplete$.next({});
    }

    if (type === 'upload') {
      this.startedUpload = true;
    } else if (this.startedUpload && !this.finishedUpload) {
      this.finishedUpload = true;
      this.uploadComplete$.next({});
    }
  }

  /** Progreso suave en función del tipo reportado */
  private bumpProgress(type?: string) {
    const add =
      type === 'latency'
        ? 0.08
        : type === 'download'
        ? 0.14
        : type === 'upload'
        ? 0.14
        : type === 'packetLoss'
        ? 0.1
        : 0.05;

    this.progress = Math.min(0.98, (this.progress || 0) + add);
  }

  /** Construye una lista de mediciones escaladas a partir de ScaleOptions */
  private buildScaledMeasurements(scale?: ScaleOptions) {
    if (!scale) return undefined; // que el SDK use sus defaults
    const bytesScale = scale.bytesScale ?? 1;
    const countScale = scale.countScale ?? 1;
    const packetLossScale = scale.packetLossScale ?? 1;
    const responsesWaitTimeScale = scale.responsesWaitTimeScale ?? 1;

    const B = (n: number) =>
      Math.max(Math.floor(n * bytesScale), scale.minBytesPerRequest ?? 1);
    const C = (n: number) => Math.max(Math.floor(n * countScale), 1);

    const arr: any[] = [
      { type: 'latency', numPackets: C(1) },
      {
        type: 'download',
        bytes: B(1e5),
        count: C(1),
        bypassMinDuration: scale.keepBypassOnSmallSets ?? true,
      },
      { type: 'latency', numPackets: C(20) },
      { type: 'download', bytes: B(1e5), count: C(9) },
      { type: 'download', bytes: B(1e6), count: C(8) },
      { type: 'upload', bytes: B(1e5), count: C(8) },
      {
        type: 'packetLoss',
        numPackets: Math.max(Math.floor(1e3 * packetLossScale), 1),
        responsesWaitTime: Math.floor(3000 * responsesWaitTimeScale),
      },
      { type: 'upload', bytes: B(1e6), count: C(6) },
      { type: 'download', bytes: B(1e7), count: C(6) },
      { type: 'upload', bytes: B(1e7), count: C(4) },
      { type: 'download', bytes: B(2.5e7), count: C(4) },
      { type: 'upload', bytes: B(2.5e7), count: C(4) },
      { type: 'download', bytes: B(1e8), count: C(3) },
      { type: 'upload', bytes: B(5e7), count: C(3) },
      { type: 'download', bytes: B(2.5e8), count: C(2) },
    ];

    if (scale.budgetBytes || scale.bypassBytesThreshold) {
      let total = 0;
      const budget = scale.budgetBytes ?? Number.POSITIVE_INFINITY;
      const threshold = scale.bypassBytesThreshold ?? Number.POSITIVE_INFINITY;
      for (const m of arr) {
        if (m.type === 'download' || m.type === 'upload') {
          const thisSet = m.bytes * m.count;
          if (total + thisSet > budget) m.bypassMinDuration = true;
          if (m.bytes >= threshold) m.bypassMinDuration = true;
          total += thisSet;
        }
      }
    }
    return arr;
  }

  private async createMeasurementRecord(notes: string): Promise<MeasurementRecord> {
    let accessInformation: any = {};
    try {
      accessInformation = await this.networkService.getNetInfo();
    } catch (err) {
      console.error('Unable to retrieve access information:', err);
    }

    return {
      timestamp: Date.now(),
      results: {},
      snapLog: { s2cRate: [], c2sRate: [] },
      uploaded: false,
      mlabInformation: {},
      accessInformation,
      uuid: '',
      version: environment.app_version,
      Notes: notes,
      dataUsage: { download: 0, upload: 0, total: 0 },
      provider: 'cloudflare',
    };
  }

  private broadcastMeasurementStatus(
    testStatus: string,
    additionalData: any = {}
  ): void {
    const payload = {
      testStatus,
      ...additionalData,
      provider: 'cloudflare' as const,
    };

    this.sharedService.broadcast(
      'measurement:status',
      'measurement:status',
      payload
    );
    this.measurementStatus.next(payload);
  }

  private async finalizeMeasurement(results?: ResultsObject): Promise<void> {
    if (!this.measurementRecord) {
      this.measurementRecord = await this.createMeasurementRecord('auto');
    }

    const measurementRecord = this.measurementRecord;
    measurementRecord.results = results ?? {};
    measurementRecord.uuid = measurementRecord.uuid || crypto.randomUUID();
    measurementRecord.version = environment.app_version;
    measurementRecord.dataUsage = this.calculateDataUsage(results);

    if ('snapLog' in measurementRecord) {
      delete (measurementRecord as any).snapLog;
    }
    if (measurementRecord.results && 'bandwidthPoints' in (measurementRecord.results as any)) {
      delete (measurementRecord.results as any).bandwidthPoints;
    }
    
    if (this.settingsService.get('uploadEnabled')) {
      try {
        measurementRecord.provider = 'cloudflare';
        this.historyService.add(measurementRecord);
        this.sharedService.broadcast(
          'history:measurement:change',
          'history:measurement:change'
        );
        await firstValueFrom(
           this.uploadService.uploadCloudflareMeasurement(measurementRecord)
        );
        measurementRecord.uploaded = true;
      } catch (error) {
        console.error('Upload failed:', error);
      }
    }

    this.broadcastMeasurementStatus('cf_complete', {
      passedResults: measurementRecord.results,
      running: false,
      progress: 1,
    });
  }

  private calculateDataUsage(passedResults?: ResultsObject): {
    download: number;
    upload: number;
    total: number;
  } {
    if (!passedResults) {
      return { download: 0, upload: 0, total: 0 };
    }

    const downloadBytes = (passedResults.bandwidthPoints?.download || []).reduce(
      (total, point) => total + Number(point?.bytes ?? 0),
      0
    );
    const uploadBytes = (passedResults.bandwidthPoints?.upload || []).reduce(
      (total, point) => total + Number(point?.bytes ?? 0),
      0
    );

    return {
      download: downloadBytes,
      upload: uploadBytes,
      total: downloadBytes + uploadBytes,
    };
  }
}
