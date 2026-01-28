import { Injectable } from '@angular/core';
import ndt7 from '../../assets/js/ndt/ndt7.js';
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
  public downloadComplete$ = new Subject<any>();
  public uploadComplete$ = new Subject<any>();
  public downloadStarted$ = new Subject<any>();
  public uploadStarted$ = new Subject<any>();

  private TIME_EXPECTED = 10;
  private retryAttempts = 0;
  private maxRetries = 3;
  private readonly measurementNotificationActivity = new BehaviorSubject<any>(
    {}
  ).asObservable();
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
  ) {}

  async runTest(notes = 'manual'): Promise<void> {
    console.log('Starting ndt7 test', ndt7);
    this.retryAttempts = 0;
    await this.runTestWithRetry(notes);
  }

  private async runTestWithRetry(notes = 'manual'): Promise<void> {
    this.broadcastMeasurementStatus('onstart', {});
    const measurementRecord = this.initializeMeasurementRecord(notes);

    // Get Windows username, installed path, and WiFi connections
    const windowsUsername = await this.getWindowsUsername();
    const installedPath = await this.getInstalledPath();
    const wifiConnections = await this.getWifiConnections();
    measurementRecord.windowsUsername = windowsUsername;
    measurementRecord.installedPath = installedPath;
    measurementRecord.wifiConnections = wifiConnections;

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

      // Check if this is a locate server error and we can retry
      const isLocateServerError =
        error.message.includes('locate.measurementlab.net') ||
        error.message.includes('Could not understand response') ||
        error.message.includes('fetch');

      if (isLocateServerError && this.retryAttempts < this.maxRetries) {
        this.retryAttempts++;
        console.log(
          `Retrying test due to locate server error. Attempt ${this.retryAttempts}/${this.maxRetries}`
        );

        this.broadcastMeasurementStatus('retrying', {
          attempt: this.retryAttempts,
          maxRetries: this.maxRetries,
          message: `Retrying test... (${this.retryAttempts}/${this.maxRetries})`,
        });

        // Wait a bit before retrying
        await new Promise((resolve) => setTimeout(resolve, 2000));
        return this.runTestWithRetry(notes);
      } else {
        this.broadcastMeasurementStatus('onError', { error: error.message });
      }
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
      windowsUsername: '',
      installedPath: '',
      wifiConnections: null,
    };
  }

  private async getTestInfo() {
    return {
      accessInformation: await this.networkService.getNetInfo(),
      mlabInformation: await this.mlabService
        .findServer(this.settingsService.get('metroSelection'))
        .toPromise(),
    };
  }

  private getTestCallbacks(measurementRecord: any) {
    return {
      serverDiscovery: this.onServerDiscovery,
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

  private onServerDiscovery = (data: { loadbalancer: URL }): void => {
    console.log('Discovering servers from:', data.loadbalancer.toString());
    this.broadcastMeasurementStatus('server_discovery', {
      loadbalancer: data.loadbalancer.toString(),
      message: 'Discovering test servers...',
    });
  };

  private onServerChosen = (server: {
    machine: string;
    location: string;
  }): void => {
    console.log('Testing to:', {
      machine: server.machine,
      locations: server.location,
    });
    this.broadcastMeasurementStatus('server_chosen', {
      server: server,
      message: 'Server selected, preparing test...',
    });
  };

  private onDownloadMeasurement = (data: any, measurementRecord: any): void => {
    if (data.Source === 'client') {
      console.log(`Download: ${data.Data.MeanClientMbps.toFixed(2)} Mb/s`);
      measurementRecord.snapLog.s2cRate.push(data.Data.MeanClientMbps);
      this.downloadStarted$.next(data);
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
    this.downloadComplete$.next(data); // Emit event
    this.updateProgress(
      'finished_s2c',
      data,
      data.LastClientMeasurement.ElapsedTime
    );
  };

  private onUploadMeasurement = (data: any, measurementRecord: any): void => {
    if (data.Source === 'server') {
      const elapsed = data.Data.TCPInfo.ElapsedTime;
      const uploadSpeed = (
        (data.Data.TCPInfo.BytesReceived / data.Data.TCPInfo.ElapsedTime) *
        8
      ).toFixed(2);
      console.log(`Upload: ${uploadSpeed} Mb/s`);
      this.uploadStarted$.next(data);
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
    this.uploadComplete$.next(data); // Emit event
    this.updateProgress('finished_c2s', data, elapsed / 1000000);
  };

  private onError = (err: Error): void => {
    console.error('Error while running the test:', err.message);

    // Check if this is a locate server error
    const isLocateServerError =
      err.message.includes('locate.measurementlab.net') ||
      err.message.includes('Could not understand response') ||
      err.message.includes('fetch');

    const errorType = isLocateServerError
      ? 'locate_server_error'
      : 'test_error';
    const errorMessage = isLocateServerError
      ? 'Failed to discover test servers. Please check your internet connection and try again.'
      : err.message;

    this.broadcastMeasurementStatus('error', {
      error: errorMessage,
      errorType: errorType,
      originalError: err.message,
    });
  };

  private updateProgress(
    testStatus: string,
    passedResults: any,
    elapsedTime: number
  ): void {
    this.progress =
      elapsedTime > this.TIME_EXPECTED * 2
        ? 1.0
        : elapsedTime / (this.TIME_EXPECTED * 2) + 0.5;
    this.broadcastMeasurementStatus(testStatus, {
      passedResults,
      running: true,
      progress: this.progress,
    });
  }

  private async finalizeMeasurement(measurementRecord: any): Promise<void> {
    measurementRecord.uuid =
      measurementRecord.results['NDTResult.S2C'].LastServerMeasurement
        .ConnectionInfo.UUID || '';
    measurementRecord.version = 1;

    const dataUsage = this.calculateDataUsage(measurementRecord.results);
    measurementRecord.dataUsage = dataUsage;

    if (this.settingsService.get('uploadEnabled')) {
      try {
        // Try to upload first before saving to localStorage
        await this.uploadService
          .uploadMeasurement(measurementRecord)
          .toPromise();
        measurementRecord.uploaded = true;
        measurementRecord.synced = true;
      } catch (error) {
        console.error('Upload failed:', error);
        measurementRecord.uploaded = false;
        measurementRecord.synced = false;
      }
    } else {
      // If upload is disabled, mark as not uploaded
      measurementRecord.uploaded = false;
      measurementRecord.synced = false;
    }

    // Now save to localStorage with the correct uploaded status
    this.historyService.add(measurementRecord);
    this.sharedService.broadcast(
      'history:measurement:change',
      'history:measurement:change'
    );

    this.broadcastMeasurementStatus('complete', {
      passedResults: measurementRecord.results,
      running: false,
      progress: 1,
    });
  }

  private calculateDataUsage(passedResults: any): {
    download: number;
    upload: number;
    total: number;
  } {
    const bytesSent =
      Number(
        passedResults['NDTResult.S2C'].LastServerMeasurement.TCPInfo
          .BytesAcked +
          passedResults['NDTResult.C2S'].LastServerMeasurement.TCPInfo
            .BytesAcked
      ) || 0;
    const bytesReceived =
      Number(
        passedResults['NDTResult.S2C'].LastServerMeasurement.TCPInfo
          .BytesReceived +
          passedResults['NDTResult.C2S'].LastServerMeasurement.TCPInfo
            .BytesReceived
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
    this.sharedService.broadcast('measurement:status', 'measurement:status', {
      testStatus,
      ...additionalData,
    });
    this.measurementStatus.next({
      testStatus,
      ...additionalData,
    });
  }

  /**
   * Get Windows username from Electron process
   * @returns Windows username string or fallback value
   */
  private async getWindowsUsername(): Promise<string> {
    try {
      // Check if running in Electron
      if (window && (window as any).electronAPI) {
        console.log('📡 [Windows Username] Requesting Windows username...');
        const usernameInfo = await (
          window as any
        ).electronAPI.getWindowsUsername();

        if (usernameInfo && usernameInfo.username) {
          console.log(
            '✅ [Windows Username] Retrieved username:',
            usernameInfo.username
          );
          return usernameInfo.username;
        } else if (usernameInfo && usernameInfo.error) {
          console.error(
            '❌ [Windows Username] Error retrieving username:',
            usernameInfo.error
          );
          return 'Error';
        }
      } else {
        console.log(
          '⚠️ [Windows Username] Not running in Electron, username not available'
        );
        return 'N/A';
      }
    } catch (error) {
      console.error(
        '❌ [Windows Username] Exception while retrieving username:',
        error
      );
      return 'Error';
    }

    return 'Unknown';
  }

  /**
   * Get application installed path from Electron process
   * @returns Installed path string or fallback value
   */
  private async getInstalledPath(): Promise<string> {
    try {
      // Check if running in Electron
      if (window && (window as any).electronAPI) {
        console.log('📡 [Installed Path] Requesting installed path...');
        const pathInfo = await (window as any).electronAPI.getInstalledPath();

        if (pathInfo && pathInfo.installedPath) {
          console.log(
            '✅ [Installed Path] Retrieved path:',
            pathInfo.installedPath
          );
          return pathInfo.installedPath;
        } else if (pathInfo && pathInfo.error) {
          console.error(
            '❌ [Installed Path] Error retrieving path:',
            pathInfo.error
          );
          return 'Error';
        }
      } else {
        console.log(
          '⚠️ [Installed Path] Not running in Electron, path not available'
        );
        return 'N/A';
      }
    } catch (error) {
      console.error(
        '❌ [Installed Path] Exception while retrieving path:',
        error
      );
      return 'Error';
    }

    return 'Unknown';
  }

  /**
   * Get WiFi connections from Electron process
   * @returns WiFi connections array or null
   */
  private async getWifiConnections(): Promise<any> {
    try {
      // Check if running in Electron
      if (window && (window as any).electronAPI) {
        console.log('📡 [WiFi Connections] Requesting WiFi connections...');
        const wifiInfo = await (window as any).electronAPI.getWifiConnections();

        if (wifiInfo && wifiInfo.wifiConnections) {
          console.log(
            '✅ [WiFi Connections] Retrieved connections:',
            wifiInfo.wifiConnections
          );
          return wifiInfo.wifiConnections;
        } else if (wifiInfo && wifiInfo.error) {
          console.error(
            '❌ [WiFi Connections] Error retrieving connections:',
            wifiInfo.error
          );
          return null;
        }
      } else {
        console.log(
          '⚠️ [WiFi Connections] Not running in Electron, connections not available'
        );
        return null;
      }
    } catch (error) {
      console.error(
        '❌ [WiFi Connections] Exception while retrieving connections:',
        error
      );
      return null;
    }

    return null;
  }
}
