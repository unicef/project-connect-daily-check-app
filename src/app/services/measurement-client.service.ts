import { Injectable } from '@angular/core';
import * as ndt7 from '../../assets/js/ndt/ndt7.js';
import { BehaviorSubject, Observable, Subject, forkJoin } from 'rxjs';
import { MeasurementService } from './measurement.service';
import { HistoryService } from './history.service';
import { SettingsService } from './settings.service';
import { MlabService } from './mlab.service';
import { NetworkService } from './network.service';
import { UploadService } from './upload.service';
import { SharedService } from './shared-service.service';

@Injectable({
  providedIn: 'root',
})
export class MeasurementClientService {
  public measurementStatus = new Subject<any>();
  private TIME_EXPECTED = 10;
  private readonly measurementNotificationActivity = new BehaviorSubject<any>({}).asObservable();
  private readonly testConfig = {
    userAcceptedDataPolicy: true,
    downloadworkerfile: 'assets/js/ndt/ndt7-download-worker.js',
    uploadworkerfile: 'assets/js/ndt/ndt7-upload-worker.js',
  };

  mlabInformation = {
    city: '',
    url: '',
    ip: [],
    fqdn: '',
    site: '',
    country: '',
    label: '',
    metro: '',
  };

  accessInformation = {
    ip: '',
    city: '',
    region: '',
    country: '',
    label: '',
    metro: '',
    site: '',
    url: '',
    fqdn: '',
    loc: '',
    org: '',
    postal: '',
    timezone: '',
    asn: '',
  };

  resultData = {
    testStatus: {},
    passedResults: {},
  };

  progress = 0;

  private dataUsage = {
    download: 0,
    upload: 0,
    total: 0,
  };

  constructor(
    private historyService: HistoryService,
    private settingsService: SettingsService,
    private mlabService: MlabService,
    private networkService: NetworkService,
    private uploadService: UploadService,
    private sharedService: SharedService
  ) { }

  async runTest(notes = 'manual'): Promise<void> {
    console.log('Starting ndt7 test', ndt7);
    this.broadcastMeasurementStatus('onstart', {});
    const measurementRecord = this.initializeMeasurementRecord(notes);

    try {
      const info = await this.getTestInfo();
      Object.assign(measurementRecord, info);

      const exitCode = await ndt7.test(
        this.testConfig,
        this.getTestCallbacks(measurementRecord)
      );
      console.log('ndt7 test completed with exit code:', exitCode);

      await this.finalizeMeasurement(measurementRecord);
    } catch (error) {
      console.error('Error running ndt7 test:', error);
      this.broadcastMeasurementStatus('error', { error: error.message });
    }
  }

  private initializeMeasurementRecord(notes: string) {
    return {
      timestamp: Date.now(),
      results: {},
      snapLog: { s2cRate: [], c2sRate: [] },
      uploaded: false,
      mlabInformation: this.mlabInformation,
      accessInformation: this.accessInformation,
      uuid: '',
      version: 0,
      Notes: notes,
      dataUsage: this.dataUsage,
    };
  }

  private getTestInfo() {
    return forkJoin({
      accessInformation: this.networkService.getAccessInformation(),
      mlabInformation: this.mlabService.findServer(
        this.settingsService.get('metroSelection')
      ),
    }).toPromise();
  }

  private getTestCallbacks(measurementRecord: any) {
    return {
      serverChosen: this.onServerChosen,
      downloadMeasurement: (data) =>
        this.onDownloadMeasurement(data, measurementRecord),
      downloadComplete: (data) =>
        this.onDownloadComplete(data, measurementRecord),
      uploadMeasurement: (data) =>
        this.onUploadMeasurement(data, measurementRecord),
      uploadComplete: (data) => this.onUploadComplete(data, measurementRecord),
      error: this.onError,
    };
  }

  private onServerChosen = (server: {
    machine: string;
    location: string;
  }): void => {
    console.log('Testing to:', {
      machine: server.machine,
      locations: server.location,
    });
  };

  private onDownloadMeasurement = (data: any, measurementRecord: any): void => {
    if (data.Source === 'client') {
      console.log(`Download: ${data.Data.MeanClientMbps.toFixed(2)} Mb/s`);
      measurementRecord.snapLog.s2cRate.push(data.Data.MeanClientMbps);
      this.updateProgress('interval_s2c', data, data.Data.ElapsedTime);
    }
  };

  private onDownloadComplete = (data: any, measurementRecord: any): void => {
    const serverBw = (data.LastServerMeasurement.BBRInfo.BW * 8) / 1000000;
    const clientGoodput = data.LastClientMeasurement.MeanClientMbps;
    console.log(`Download test is complete:
    Instantaneous server bottleneck bandwidth estimate: ${serverBw} Mbps
    Mean client goodput: ${clientGoodput} Mbps`);
    measurementRecord.results['NDTResult.S2C'] = data;
    this.updateProgress('finished_s2c', data, data.LastClientMeasurement.ElapsedTime);
  };

  private onUploadMeasurement = (data: any, measurementRecord: any): void => {
    if (data.Source === 'server') {
      const elapsed = data.Data.TCPInfo.ElapsedTime;
      const uploadSpeed = (
        (data.Data.TCPInfo.BytesReceived / data.Data.TCPInfo.ElapsedTime) *
        8
      ).toFixed(2);
      console.log(`Upload: ${uploadSpeed} Mb/s`);
      measurementRecord.snapLog.c2sRate.push(Number(uploadSpeed));
      this.updateProgress('interval_c2s', data, elapsed / 1000000);
    }
  };

  private onUploadComplete = (data: any, measurementRecord: any): void => {
    const bytesReceived = data.LastServerMeasurement.TCPInfo.BytesReceived;
    const elapsed = data.LastServerMeasurement.TCPInfo.ElapsedTimex;
    const throughput = (bytesReceived * 8) / elapsed;
    console.log(`Upload test completed in ${(elapsed / 1000000).toFixed(2)}s
      Mean server throughput: ${throughput} Mbps`);
    measurementRecord.results['NDTResult.C2S'] = data;
    this.updateProgress('finished_c2s', data, elapsed / 1000000);
  };

  private onError = (err: Error): void => {
    console.error('Error while running the test:', err.message);
    this.broadcastMeasurementStatus('error', { error: err.message });
  };

  private updateProgress(testStatus: string, passedResults: any, elapsedTime: number): void {
    this.progress = elapsedTime > this.TIME_EXPECTED * 2 ? 1.0 : elapsedTime / (this.TIME_EXPECTED * 2) + 0.5;
    this.broadcastMeasurementStatus(testStatus, {
      passedResults,
      running: true,
      progress: this.progress,
    });
  }

  private async finalizeMeasurement(measurementRecord: any): Promise<void> {
    measurementRecord.uuid =
      measurementRecord.results['NDTResult.S2C'].UUID || '';
    measurementRecord.version = 1;

    const dataUsage = this.calculateDataUsage(measurementRecord.results);
    measurementRecord.dataUsage = dataUsage;

    if (this.settingsService.get('uploadEnabled')) {
      try {
        await this.uploadService
          .uploadMeasurement(measurementRecord)
          .toPromise();
        measurementRecord.uploaded = true;
      } catch (error) {
        console.error('Upload failed:', error);
      }
    }

    this.historyService.add(measurementRecord);
    this.broadcastMeasurementStatus('complete', {
      passedResults: measurementRecord.results,
      running: false,
      progress: 1,
    });
  }

  private calculateDataUsage(passedResults: any): { download: number; upload: number; total: number } {
    const bytesSent = Number(passedResults['NDTResult.S2C'].LastServerMeasurement.TCPInfo.BytesAcked +
      passedResults['NDTResult.C2S'].LastServerMeasurement.TCPInfo.BytesAcked
    ) || 0;
    const bytesReceived = Number(passedResults['NDTResult.S2C'].LastServerMeasurement.TCPInfo.BytesReceived +
      passedResults['NDTResult.C2S'].LastServerMeasurement.TCPInfo.BytesReceived
    ) || 0;

    const totalBytes = bytesSent + bytesReceived;

    this.dataUsage.total += totalBytes;
    this.dataUsage.download += bytesReceived;
    this.dataUsage.upload += bytesSent;

    const totalMB = this.dataUsage.total / (1024 * 1024);
    console.log(
      `Current Test Data Usage: ${totalBytes} bytes - ${(
        totalBytes /
        (1024 * 1024)
      ).toFixed(2)} MB`
    );

    return this.dataUsage;
  }

  private broadcastMeasurementStatus(
    testStatus: string,
    additionalData: any
  ): void {
    this.sharedService.broadcast(
      'measurement:status',
      'measurement:status',
      {
        testStatus,
        ...additionalData,
      }
    );
    this.measurementStatus.next({
      testStatus,
      ...additionalData,
    });
  }
}
