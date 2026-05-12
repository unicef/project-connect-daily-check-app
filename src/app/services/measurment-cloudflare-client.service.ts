import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import SpeedTest from '@cloudflare/speedtest';
import { Subject, firstValueFrom } from 'rxjs';
import { HistoryService } from './history.service';
import { SettingsService } from './settings.service';
import { NetworkService } from './network.service';
import { UploadService } from './upload.service';
import { SharedService } from './shared-service.service';
import { StorageService } from './storage.service';
import { environment } from 'src/environments/environment';
import {
  CloudflareMeasurementResults,
  MeasurementRecord,
  MeasurementRunOutcome,
} from './measurement.types';
import { serverInformation } from '../models/models';

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

@Injectable({ providedIn: 'root' })
export class CloudflareMeasurementService  {
  constructor(
    private historyService: HistoryService,
    private settingsService: SettingsService,
    private networkService: NetworkService,
    private uploadService: UploadService,
    private sharedService: SharedService,
    private http: HttpClient,
    private storageService: StorageService
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
  //(Persist UI stage for DEV)
  private lastStage: 'DOWNLOAD' | 'UPLOAD' | null = null;
   // DEV / PROD environment flag
  private readonly isDev = !environment.production;

  async runTest(notes = 'manual'): Promise<void> {
    await this.runToCompletion(notes);
  }

  async runToCompletion(notes = 'manual'): Promise<MeasurementRunOutcome> {
    return new Promise<MeasurementRunOutcome>((resolve) => {
      let settled = false;
      const settle = (outcome: MeasurementRunOutcome) => {
        if (settled) {
          return;
        }
        settled = true;
        resolve(outcome);
      };

      void this.startSpeedTest(notes, settle);
    });
  }

  private async startSpeedTest(
    notes: string,
    settle: (outcome: MeasurementRunOutcome) => void
  ): Promise<void> {
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

    // ===============================
    // RESET STATE (IMPORTANT IN DEV)
    // ===============================
    this.startedDownload = false;
    this.finishedDownload = false;
    this.startedUpload = false;
    this.finishedUpload = false;
    this.lastStage = null;
    this.progress = 0;



    // 4) Inicio
    // this.broadcast('onstart', { running: true, progress: 0, notes });
    // ADDED FOR DEV SPINNER SUPPORT
    // Reset visual state at start


    this.broadcastMeasurementStatus('cf_onstart', {
      running: true,
      progress: 0,
      secondLabel: this.isDev ? 'DOWNLOAD' : null,
    });

   // 5) Eventos
this.st.onResultsChange = (info: { type?: string }) => {
  // ⬅️ CAMBIO 1: type ahora es opcional y se normaliza una sola vez
  const type = info?.type;

  if (type === 'download') {
  this.lastStage = 'DOWNLOAD';
  }

  if (type === 'upload') {
    this.lastStage = 'UPLOAD';
  }

  this.updateStageFlags(type);
  this.bumpProgress(type);

  const results = this.st?.results;
  if (!results) return;

  const resultsObject = this.buildResultsObject(results);
  this.resultData.passedResults = resultsObject;

  if (this.measurementRecord) {
    this.measurementRecord.results = resultsObject;

    // CAMBIO 2: uso de `type` normalizado (misma lógica, más segura)
    const downloadSpeed =
      type === 'download'
        ? Number(resultsObject?.bandwidth?.download)
        : undefined;

    if (downloadSpeed !== undefined && Number.isFinite(downloadSpeed)) {
      this.measurementRecord.snapLog?.s2cRate.push(downloadSpeed);
    }

    const uploadSpeed =
      type === 'upload'
        ? Number(resultsObject?.bandwidth?.upload)
        : undefined;

    if (uploadSpeed !== undefined && Number.isFinite(uploadSpeed)) {
      this.measurementRecord.snapLog?.c2sRate.push(uploadSpeed);
    }
  }

  // console.log se mantiene (útil para debug Cloudflare)
  console.log(info);

  // CAMBIO 3: se usa `type` ya normalizado
  const intervalType =
    type === 'download'
      ? 'cf_interval_download'
      : type === 'upload'
      ? 'cf_interval_upload'
      : 'cf_interval_other';

  // ADDED FOR DEV SPINNER SUPPORT
  // Map Cloudflare type -> UI label
  // CAMBIO: UI tolerante a eventos sin tipo
  // Tolerant mapping for Cloudflare DEV (localhost may not emit type)
  // DEV fallback: if Cloudflare does not emit type,
  // keep a stable visual stage once it starts

   const secondLabel = this.lastStage;

  this.broadcastMeasurementStatus(intervalType, {
    running: true,
    progress: this.progress,
    secondLabel, // THIS IS THE KEY
    downloadCurrentSpeed:
      resultsObject?.bandwidth?.download?.toFixed(2) || 0,
    uploadCurrentSpeed:
      resultsObject?.bandwidth?.upload?.toFixed(2) || 0,
    passedResults: resultsObject,
  });

  // Emisiones específicas
  // CAMBIO 5: se usa `type` (mismo comportamiento, menos riesgo)
  if (type === 'download' && this.startedDownload && !this.finishedDownload) {
    this.downloadStarted$.next({ started: true });
  }

  if (type === 'upload' && this.startedUpload && !this.finishedUpload) {
    this.uploadStarted$.next({ started: true });
  }
};


    this.st.onFinish = async (_: any) => {
      try {
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

        this.broadcastMeasurementStatus('cf_complete', {
          passedResults: resultsObject ?? {},
          running: false,
          progress: 1,
          secondLabel: null,
        });

        await this.finalizeMeasurement(resultsObject);
        settle({ provider: 'cloudflare', status: 'success' });
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        settle({
          provider: 'cloudflare',
          status: 'failure',
          error: errorMessage,
        });
      }
    };

    this.st.onError = (error: any) => {
      const errorMessage =
        (error && (error.message ?? String(error))) || 'Unknown error';
      this.broadcastMeasurementStatus('cf_error', {
        error: errorMessage,
        running: false,
        secondLabel: null, // ADDED FOR DEV SPINNER SUPPORT
      });
      settle({ provider: 'cloudflare', status: 'failure', error: errorMessage });
    };

    // Start test
    this.st.play();
  }

  // ----------------- Helpers -----------------

  /** Construye el objeto results EXACTO al formato solicitado */
  private buildResultsObject(results: any): CloudflareMeasurementResults {
    // Importante: usamos los getters que pediste. Si alguno no existe en la versión,
    // hacemos fallback a undefined para no romper el shape.
    const safe = <T>(fn: () => T) => {
      try {
        return fn();
      } catch {
        return undefined as unknown as T;
      }
    };

    //const obj: ResultsObject = {
    return {
      isFinished: true,

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
  }


  private updateStageFlags(type?: string) {
   if (!type) return;

   if (type === 'download') {
     this.startedDownload = true;
   }

   if (type === 'upload') {
     this.startedUpload = true;
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

    let serverInformation: any = {};
    try {
      serverInformation = await this.getCloudflareServerLocation();
    } catch (err) {
      console.error('Unable to retrieve Cloudflare server location:', err);
    }

    return {
      timestamp: Date.now(),
      results: {},
      snapLog: { s2cRate: [], c2sRate: [] },
      uploaded: false,
      serverInformation,
      accessInformation,
      uuid: '',
      version: environment.app_version,
      Notes: notes,
      dataUsage: { download: 0, upload: 0, total: 0 },
      provider: 'cloudflare',
    };
  }

  /**
   * Gets Cloudflare server location based on colo
   * Caches colo and server location in localStorage
   * Only fetches locations if colo changes
   */
  private async getCloudflareServerLocation(): Promise<Partial<serverInformation>> {
    try {
      // Step 1: Get colo from ip-check endpoint
      const ipCheckResponse = await firstValueFrom(
        this.http.get<{
          colo: string;
          asn: number;
          continent: string;
          country: string;
          region: string;
          city: string;
          latitude: string;
          longitude: string;
          ip_address: string;
          ip_version: string;
        }>('https://ip-check-perf.radar.cloudflare.com/')
      );

      const currentColo = ipCheckResponse.colo;
      if (!currentColo) {
        console.warn('No colo found in ip-check response');
        return {};
      }

      // Step 2: Check cached colo and server location
      const cachedColo = this.storageService.get('cloudflare_colo');
      const cachedServerLocation = this.storageService.get('cloudflare_server_location');

      // Step 3: If colo hasn't changed and we have cached server, return it
      if (cachedColo === currentColo && cachedServerLocation) {
        try {
          return JSON.parse(cachedServerLocation);
        } catch (e) {
          console.warn('Failed to parse cached server location, fetching new one');
        }
      }

      // Step 4: Fetch locations and find matching server
      const locationsResponse = await firstValueFrom(
        this.http.get<Array<{
          iata: string;
          lat: number;
          lon: number;
          cca2: string;
          region: string;
          city: string;
        }>>('https://speed.cloudflare.com/locations')
      );

      // Step 5: Find server with matching IATA
      const server = locationsResponse.find((loc) => loc.iata === currentColo);

      if (!server) {
        console.warn(`No server found for colo: ${currentColo}`);
        return {};
      }

      // Step 6: Parse to serverInformation schema
      const serverInfo: serverInformation = {
        city: server.city || '',
        site: server.iata || '',
        country: server.cca2 || '',
        label: server.city || '',
        metro: server.iata || '',
      };

      // Step 7: Store in localStorage
      await this.storageService.set('cloudflare_colo', currentColo);
      await this.storageService.set('cloudflare_server_location', JSON.stringify(serverInfo));

      return serverInfo;
    } catch (error) {
      console.error('Error getting Cloudflare server location:', error);
      return {};
    }
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

  private async finalizeMeasurement(
    results?: CloudflareMeasurementResults,
  ): Promise<void> {
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
        
        await firstValueFrom(
           this.uploadService.uploadCloudflareMeasurement(measurementRecord)
        );
        measurementRecord.uploaded = true;
        measurementRecord.synced = true;
        this.historyService.add(measurementRecord);
        this.sharedService.broadcast(
          'history:measurement:change',
          'history:measurement:change'
        );
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

  private calculateDataUsage(passedResults?: CloudflareMeasurementResults): {
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
