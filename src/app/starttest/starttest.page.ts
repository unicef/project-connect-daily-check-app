import {
  Component,
  OnInit,
  ViewChild,
  ChangeDetectorRef,
  ElementRef,
  OnDestroy,
} from '@angular/core';
import { IonAccordionGroup, ModalController } from '@ionic/angular';
import { ActivatedRoute, Router } from '@angular/router';
import { AlertController } from '@ionic/angular';
import { SchoolService } from '../services/school.service';
import { LoadingService } from '../services/loading.service';
import { MenuController } from '@ionic/angular';
import { NetworkService } from '../services/network.service';
import { SettingsService } from '../services/settings.service';
import { MeasurementClientService } from '../services/measurement-client.service';
import { CloudflareMeasurementService } from '../services/measurment-cloudflare-client.service';
import { SharedService } from '../services/shared-service.service';
import { HistoryService } from '../services/history.service';
import { TranslateService } from '@ngx-translate/core';
import { StorageService } from '../services/storage.service';
import { Subscription } from 'rxjs';
import { CountryService } from '../services/country.service';
import { mlabInformation, accessInformation } from '../models/models';
import { FirstTestSuccessModalComponent } from '../components/first-test-success-modal/first-test-success-modal.component';
import { ConfettiService } from '../services/confetti.service';
import { IndexedDBService } from '../services/indexed-db.service';
import { PingService } from '../services/ping.service';

@Component({
  selector: 'app-starttest',
  templateUrl: 'starttest.page.html',
  styleUrls: ['starttest.page.scss'],
  standalone: false,
})
export class StarttestPage implements OnInit, OnDestroy {
  @ViewChild(IonAccordionGroup, { static: true })
  accordionGroup: IonAccordionGroup;
  @ViewChild('errorMsg') el: ElementRef;
  progress: number = 0; // Progress in percentage (0-100)
  currentState = undefined;
  currentRate = undefined;
  currentRateUpload = undefined;
  currentRateDownload = undefined;
  latency = undefined;
  networkName = undefined;
  uploadStatus = undefined;
  uploadRate = undefined;
  isErrorClosed = false;
  connectionInformation: any;
  lastMeasurementId: number;
  selectedCountry: string;
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
  measurementISP: any;
  measurementnetworkServer: any;
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
  isLoaded = false;
  downloadStarted = false;
  uploadStarted = false;

  progressGaugeState = {
    type: 'full',
    minimum: 0,
    current: 0,
    maximum: 1,
    message: 'Start',
    foregroundColor: '#FFFFFF',
    backgroundColor: '#FFFF00',
  };
  onlineStatus: boolean;
  schools: any;
  schoolId: any;
  public currentDate: any;
  public connectionStatus: any;
  private sub: any;
  private downloadSub!: Subscription;
  public lastPingResult: any;
  public pingStatus: string = '---';
  public pingTimestamp: Date | undefined;
  private uploadSub!: Subscription;
  private downloadStartedSub!: Subscription;
  private uploadStartedSub!: Subscription;
  private cloudflareDownloadSub?: Subscription;
  private cloudflareUploadSub?: Subscription;
  private cloudflareDownloadStartedSub?: Subscription;
  private cloudflareUploadStartedSub?: Subscription;
  private cloudflareProgressInterval: any;
  private cloudflareProgressStart = 0;
  private cloudflareProgressValue = 0;
  private isCloudflareProgressActive = false;
  private readonly TIME_FOR_CLOUDFLARE_TEST = 30; // seconds

  downloadTimer: any;
  uploadTimer: any;
  uploadProgressStarted = false; // To ensure we start upload animation only once
  school: any;

  // Registration banner properties
  isFirstVisit: boolean = false;
  showRegistrationBanner: boolean = false;
  registrationStatus: 'completed' | 'testing' | 'done' = 'completed';
  firstTestTriggered: boolean = false;

  constructor(
    private route: ActivatedRoute,
    public loading: LoadingService,
    public router: Router,
    private menu: MenuController,
    public alertController: AlertController,
    public modalController: ModalController,
    private schoolService: SchoolService,
    private networkService: NetworkService,
    private settingsService: SettingsService,
    private measurementClientService: MeasurementClientService,
    private cloudflareMeasurementService: CloudflareMeasurementService,
    private sharedService: SharedService,
    private historyService: HistoryService,
    public translate: TranslateService,
    private ref: ChangeDetectorRef,
    private storage: StorageService,
    private countryService: CountryService,
    private confettiService: ConfettiService,
    private indexedDBService: IndexedDBService,
    private pingService: PingService
  ) {
    if (this.storage.get('schoolId')) {
      this.school = JSON.parse(this.storage.get('schoolInfo'));
    }
    this.onlineStatus = navigator.onLine;
    this.route.params.subscribe((params) => {
      if (this.onlineStatus) {
        this.measureReady();
      }
    });
    let applicationLanguage = this.settingsService.get('applicationLanguage');
    if (applicationLanguage) {
      if (typeof applicationLanguage === 'string') {
        translate.setDefaultLang(applicationLanguage);
      } else {
        translate.setDefaultLang(applicationLanguage.code);
      }
    }

    window.addEventListener(
      'online',
      () => {
        // Re-sync data with server.
        try {
          console.log('Online');
          this.progress = 0;
          this.onlineStatus = true;
          this.currentState = undefined;
          this.currentRate = undefined;
          this.measureReady();
        } catch (e) {
          console.log(e);
        }
      },
      false
    );

    window.addEventListener(
      'offline',
      () => {
        // Queue up events for server.
        this.onlineStatus = false;
        this.connectionStatus = 'error';
        this.currentRate = 'error';
        this.isErrorClosed = false;
        // Hide registration banners if an error is shown during first test
        this.showRegistrationBanner = false;
      },
      false
    );

    this.sharedService.on('settings:changed', (nameValue) => {
      if (nameValue.name == 'applicationLanguage') {
        translate.use(nameValue.value.code);
      }
      if (nameValue.name == 'metroSelection') {
        this.tryConnectivity();
      }
    });
    if (!this.storage.get('schoolId')) {
      this.router.navigate(['/']);
    }
  }
  ngOnInit() {
    this.schoolId = this.storage.get('schoolId');

    // CRITICAL: Set up all event listeners FIRST before any auto-trigger logic
    this.setupEventListeners();
    this.setupServiceSubscriptions();

    // Initialize country information
    this.initializeCountryData();

    // Load historical data
    this.refreshHistory();
    this.loadLatestMeasurement();
    this.loadLatestPingResult();

    // IMPORTANT: Check for first-time visit LAST to ensure all event listeners are ready
    this.checkFirstTimeVisit();

    // Set up listener for registration completion events
    this.setupRegistrationListener();
  }

  ionViewWillEnter() {
    // Reset error state when returning to the page to prevent stale error states
    this.resetErrorStateIfNeeded();

    // Refresh the latest measurement data in case it was updated while away
    this.loadLatestMeasurement();
    this.loadLatestPingResult();
  }

  private resetErrorStateIfNeeded() {
    // If we're in an error state but not currently running a test, reset to normal state
    if (
      this.connectionStatus === 'error' &&
      this.currentState === undefined &&
      this.onlineStatus
    ) {
      console.log('Resetting stale error state on page return');
      this.connectionStatus = '';
      this.currentRate = undefined;
      this.isErrorClosed = false;
      this.progress = 0;

      // Force change detection to update the UI
      this.ref.detectChanges();
    }
  }

  /**
   * Set up all SharedService event listeners
   */
  private setupEventListeners() {
    console.log('Setting up SharedService event listeners');

    // Critical: measurement:status listener must be registered before any auto-trigger
    this.sharedService.on('measurement:status', this.driveGauge.bind(this));
    this.sharedService.on('measurement:status', this.driveGaugeNdt7.bind(this));
    this.sharedService.on(
      'measurement:status',
      this.driveGaugeCloadflare.bind(this)
    );
    this.sharedService.on(
      'history:measurement:change',
      this.refreshHistory.bind(this)
    );
    this.sharedService.on('history:reset', this.refreshHistory.bind(this));
  }

  /**
   * Set up listener for registration completion to handle first-time flow
   */
  private setupRegistrationListener() {
    // Listen for registration completion events from other components
    this.sharedService.on('registration:completed', () => {
      console.log(
        '🎉 DEBUG: Registration completion event received - re-checking first time visit'
      );
      // Re-check first time visit status after registration
      setTimeout(() => {
        this.checkFirstTimeVisit();
      }, 100); // Small delay to ensure storage is updated
    });
  }

  /**
   * Set up all service subscriptions
   */
  private setupServiceSubscriptions() {
    console.log('Setting up service subscriptions');

    this.downloadSub =
      this.measurementClientService.downloadComplete$.subscribe((data) => {
        this.downloadStarted = false;
        if (this.downloadTimer) {
          clearInterval(this.downloadTimer);
        }
        this.progress = 50;
        this.ref.markForCheck();
      });

    this.downloadStartedSub =
      this.measurementClientService.downloadStarted$.subscribe((data) => {
        this.downloadStarted = true;
        this.uploadStarted = false;
      });

    this.uploadStartedSub =
      this.measurementClientService.uploadStarted$.subscribe((data) => {
        this.uploadStarted = true;
        this.downloadStarted = false;
      });

    this.uploadSub = this.measurementClientService.uploadComplete$.subscribe(
      (data) => {
        this.uploadStarted = false;
        if (this.uploadTimer) {
          clearInterval(this.uploadTimer);
        }
        this.progress = 100;
        this.ref.markForCheck();
      }
    );

    this.cloudflareDownloadSub =
      this.cloudflareMeasurementService.downloadComplete$.subscribe(() => {
        this.downloadStarted = false;
        if (this.downloadTimer) {
          clearInterval(this.downloadTimer);
        }
        this.ref.markForCheck();
      });

    this.cloudflareUploadSub =
      this.cloudflareMeasurementService.uploadComplete$.subscribe(() => {
        this.uploadStarted = false;
        if (this.uploadTimer) {
          clearInterval(this.uploadTimer);
        }
        this.ref.markForCheck();
      });

    this.cloudflareDownloadStartedSub =
      this.cloudflareMeasurementService.downloadStarted$.subscribe(() => {
        this.downloadStarted = true;
        this.uploadStarted = false;
      });

    this.cloudflareUploadStartedSub =
      this.cloudflareMeasurementService.uploadStarted$.subscribe(() => {
        this.uploadStarted = true;
        this.downloadStarted = false;
      });

    window.addEventListener(
      'online',
      () => {
        console.log('Online 1');
      },
      false
    );

    window.addEventListener(
      'offline',
      () => {
        console.log('Offline 1');
      },
      false
    );
  }

  /**
   * Initialize country-related data
   */
  private initializeCountryData() {
    if (this.school?.country) {
      this.countryService.getPcdcCountryByCode(this.school.country).subscribe(
        (response) => {
          this.selectedCountry = response[0].name;
        },
        (err) => {
          console.log('ERROR: ' + err);
          this.loading.dismiss();
        }
      );
    }
  }

  measureReady() {
    try {
      this.tryConnectivity();
      this.isLoaded = true;
    } catch (e) {
      console.log(e);
    }
  }

  tryConnectivity() {
    const translatedText = this.translate.instant('searchCountry.loading');

    this.translate.get('searchCountry.loading').subscribe((translatedText) => {
      const loadingMsg = `
      <div class="loadContent">
        <ion-img src="assets/loader/new_loader.gif" class="loaderGif"></ion-img>
        <p class="green_loader">${translatedText}</p>
      </div>`;

      this.loading.present(loadingMsg, 15000, 'pdcaLoaderClass', 'null');
      this.networkService.getNetInfo().then((res) => {
        this.connectionStatus = 'success';
        if (this.loading.isStillLoading()) {
          this.loading.dismiss();
        }
        if (res) {
          this.accessInformation = res;
          console.log(this.accessInformation);
        }
      });
    });
  }

  refreshHistory() {
    let data = this.historyService.get();
    this.lastMeasurementId = data.measurements.length - 1;

    // Load latest measurement data for dashboard display
    this.loadLatestMeasurement();
    this.loadLatestPingResult();
  }

  /**
   * Load the latest measurement data to display in the Latest measurements section
   */
  loadLatestMeasurement() {
    try {
      let historicalData = this.historyService.get();

      // If we have measurement data, load the latest one
      if (
        historicalData &&
        historicalData.measurements &&
        historicalData.measurements.length > 0
      ) {
        const latestMeasurement =
          historicalData.measurements[historicalData.measurements.length - 1];

        // Populate the dashboard's latest measurement display with historical data
        if (
          latestMeasurement.results &&
          latestMeasurement.results['NDTResult.S2C'] &&
          latestMeasurement.results['NDTResult.C2S']
        ) {
          // Set download and upload rates
          const downloadMbps =
            latestMeasurement.results['NDTResult.S2C'].LastClientMeasurement
              ?.MeanClientMbps;
          const uploadMbps =
            latestMeasurement.results['NDTResult.C2S'].LastClientMeasurement
              ?.MeanClientMbps;

          this.currentRateDownload = downloadMbps
            ? downloadMbps.toFixed(2)
            : undefined;
          this.currentRateUpload = uploadMbps
            ? uploadMbps.toFixed(2)
            : undefined;

          // Calculate latency
          const s2cMinRTT =
            latestMeasurement.results['NDTResult.S2C'].LastServerMeasurement
              ?.BBRInfo?.MinRTT;
          const c2sMinRTT =
            latestMeasurement.results['NDTResult.C2S'].LastServerMeasurement
              ?.BBRInfo?.MinRTT;

          if (s2cMinRTT && c2sMinRTT) {
            this.latency = ((s2cMinRTT + c2sMinRTT) / 2 / 1000).toFixed(0);
          }

          // Set the date from the stored timestamp
          if (latestMeasurement.timestamp) {
            this.currentDate = new Date(latestMeasurement.timestamp);
          }

          // Update server and ISP information
          if (latestMeasurement.mlabInformation?.city) {
            this.measurementnetworkServer =
              latestMeasurement.mlabInformation.city;
          }
          if (latestMeasurement.accessInformation?.org) {
            this.measurementISP = latestMeasurement.accessInformation.org;
          }

          // Trigger change detection to update the UI
          this.ref.markForCheck();

          console.log('Loaded latest measurement data for dashboard display', {
            download: this.currentRateDownload,
            upload: this.currentRateUpload,
            latency: this.latency,
            date: this.currentDate,
            server: this.measurementnetworkServer,
            isp: this.measurementISP,
          });
        }
      } else {
        // No historical data, reset display values
        this.clearLatestMeasurementDisplay();
        console.log(
          'No historical measurement data found, cleared dashboard display'
        );
      }
    } catch (error) {
      console.error('Error loading latest measurement data:', error);
      this.clearLatestMeasurementDisplay();
    }
  }

  /**
   * Load the latest ping result from IndexedDB to display in the dashboard
   */
  async loadLatestPingResult() {
    try {
      const pingResults = await this.indexedDBService.getPingResults();

      if (pingResults && pingResults.length > 0) {
        // Sort by timestamp to get the latest result
        const sortedResults = pingResults.sort(
          (a, b) =>
            new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
        );

        this.lastPingResult = sortedResults[0];
        this.pingStatus = this.lastPingResult.isConnected
          ? 'Success'
          : 'Failed';
        this.pingTimestamp = new Date(this.lastPingResult.timestamp);
      } else {
        // No ping results available
        this.pingStatus = '---';
        this.pingTimestamp = undefined;
        this.lastPingResult = null;
      }
    } catch (error) {
      console.error('Error loading latest ping result:', error);
      this.pingStatus = '---';
      this.pingTimestamp = undefined;
      this.lastPingResult = null;
    }
  }

  /**
   * Clear the latest measurement display values
   */
  private clearLatestMeasurementDisplay() {
    this.currentRateDownload = undefined;
    this.currentRateUpload = undefined;
    this.latency = undefined;
    this.currentDate = undefined;
    this.measurementnetworkServer = undefined;
    this.measurementISP = undefined;
    // Clear ping data as well
    this.pingStatus = '---';
    this.pingTimestamp = undefined;
    this.lastPingResult = null;
  }

  openFirst() {
    this.menu.enable(true, 'first');
    this.menu.open('first');
  }

  closeMenu() {
    this.menu.open('end');
  }
  closeError() {
    // this.el.nativeElement.style.display = 'none';
    this.isErrorClosed = true;
  }

  getStatusMessage(): string | null {
    // Show status message only during loading states (not during download/upload)
    if (this.currentState && !this.downloadStarted && !this.uploadStarted) {
      // Don't show status message for "Starting" or "Completed" states
      if (
        this.currentState !== 'Starting' &&
        this.currentState !== 'Completed'
      ) {
        return this.currentState;
      }
    }
    return null;
  }

  showTestResult() {
    this.router.navigate(['connectivitytest']);
  }

  async startMeasurement() {
    const provider = (await this.settingsService.getCountryConfig()).measurementProvider;
    console.log('Measurement provider selected:', provider);
    switch (provider) {
      case 'cloudflare':
          this.startCloudflare();
          console.log('Cloudflare measurement started');
        break;
      case 'mlab':
        this.startNDT();
        console.log('NDT7 measurement started');
        break;
    }
  }

  private beginCloudflareProgressSimulation(): void {
    this.stopCloudflareProgressSimulation();
    this.isCloudflareProgressActive = true;
    this.cloudflareProgressStart = Date.now();
    this.cloudflareProgressValue = 0;
    this.updateCloudflareProgress(0, true);

    this.cloudflareProgressInterval = setInterval(() => {
      if (!this.isCloudflareProgressActive) {
        this.stopCloudflareProgressSimulation();
        return;
      }

      const elapsed = Date.now() - this.cloudflareProgressStart;
      const elapsedSeconds = elapsed / 1000;
      const simulated = Math.min(0.95, elapsedSeconds / this.TIME_FOR_CLOUDFLARE_TEST);

      this.updateCloudflareProgress(simulated);
    }, 100);
  }

  private stopCloudflareProgressSimulation(finalProgress?: number): void {
    if (this.cloudflareProgressInterval) {
      clearInterval(this.cloudflareProgressInterval);
      this.cloudflareProgressInterval = null;
    }
    this.isCloudflareProgressActive = false;

    if (typeof finalProgress === 'number') {
      this.updateCloudflareProgress(finalProgress, true);
    }
  }

  private updateCloudflareProgress(value: number, force = false): void {
    const bounded = Math.min(1, value);
    if (!force && bounded <= this.cloudflareProgressValue) {
      return;
    }

    this.cloudflareProgressValue = bounded;
    this.progressGaugeState.current = bounded;
    this.progress = Math.floor(bounded * 100);
    this.ref.markForCheck();
  }

  startCloudflare() {
    try {
      this.uploadProgressStarted = false;
      this.downloadStarted = false;
      this.uploadStarted = false;
      this.measurementnetworkServer = '';
      this.measurementISP = '';
      this.progress = 0;
      this.progressGaugeState.current = this.progressGaugeState.minimum;

      if (this.downloadTimer) {
        clearInterval(this.downloadTimer);
        this.downloadTimer = null;
      }
      if (this.uploadTimer) {
        clearInterval(this.uploadTimer);
        this.uploadTimer = null;
      }

      this.currentState = 'Starting';
      this.uploadStatus = undefined;
      this.latency = undefined;
      this.connectionStatus = '';
      this.uploadProgressStarted = false;
      this.beginCloudflareProgressSimulation();
      this.cloudflareMeasurementService.runTest();
    } catch (e) {
      console.error(e);
    }
  }

  startNDT(notes: string = 'manual') {
    try {
      this.uploadProgressStarted = false;
      this.downloadStarted = false;
      this.uploadStarted = false;
      this.measurementnetworkServer = '';
      this.measurementISP = '';
      this.progress = 0;

      // Clear any ongoing timers
      if (this.downloadTimer) {
        clearInterval(this.downloadTimer);
        this.downloadTimer = null;
      }
      if (this.uploadTimer) {
        clearInterval(this.uploadTimer);
        this.uploadTimer = null;
      }

      this.currentState = 'Starting';
      this.uploadStatus = undefined;
      this.latency = undefined;
      this.connectionStatus = ''; // Reset connection status
      this.currentRate = undefined; // Reset current rate
      this.isErrorClosed = false; // Reset error closed state
      this.uploadProgressStarted = false;
      this.stopCloudflareProgressSimulation();
      this.measurementClientService.runTest(notes);
    } catch (e) {
      console.log(e);
    }
  }

  startDownloadProgress() {
    const target = 50;
    const duration = 10000; // total animation duration in ms (10 seconds)
    const interval = 200; // update every 200ms
    const steps = duration / interval;
    const stepSize = (target - this.progress) / steps;

    // Clear existing timer
    if (this.downloadTimer) {
      clearInterval(this.downloadTimer);
      this.downloadTimer = null;
    }

    // Reset progress if needed
    if (this.progress > target) {
      this.progress = 0;
    }

    let elapsedSteps = 0;

    this.downloadTimer = setInterval(() => {
      if (this.downloadStarted && this.progress < target) {
        this.progress += stepSize;
        elapsedSteps++;

        if (this.progress >= target || elapsedSteps >= steps) {
          this.progress = target;
          clearInterval(this.downloadTimer);
          this.downloadTimer = null;
        }

        this.ref.detectChanges(); // trigger UI update
      } else {
        clearInterval(this.downloadTimer);
        this.downloadTimer = null;
      }
    }, interval);
  }

  // Animate progress from 50 to 100
  startUploadProgress() {
    const target = 100;
    const interval = 200; // update every 50ms
    this.uploadTimer = setInterval(() => {
      if (this.progress < target) {
        this.progress += 1;
        if (this.progress >= target) {
          this.progress = target;
          clearInterval(this.uploadTimer);
        }
        this.ref.markForCheck();
      } else {
        clearInterval(this.uploadTimer);
      }
    }, interval);
  }

  driveGauge(event, data) {
    if (event === 'measurement:status') {
      console.log('driveGauge called with measurement:status event', { data });
      console.log(
        'isFirstVisit:',
        this.isFirstVisit,
        'registrationStatus:',
        this.registrationStatus
      );
      // Delegate to specific handlers
      this.driveGaugeNdt7(event, data);
      this.driveGaugeCloadflare(event, data);
    }
  }

  driveGaugeCloadflare(event, data) {
    if (event !== 'measurement:status') {
      return;
    }

    if (!data || data.provider !== 'cloudflare') {
      return;
    }

    const testStatus = data.testStatus;
    const convertToMbpsOrDefault = (value: number | undefined, digits = 2) => {
      if (value === undefined || !Number.isFinite(value)) {
        return '0.00';
      }
      return (value/ 1048576).toFixed(digits);
    };

    switch (testStatus) {
      case 'cf_error':
        // this.stopCloudflareProgressSimulation();
        this.connectionStatus = 'error';
        this.currentRate = 'error';
        this.downloadStarted = false;
        this.uploadStarted = false;
        this.gaugeError();
        console.log('Cloudflare test error');
        // this.progress = 100;
        // if (this.downloadTimer) {
        //   clearInterval(this.downloadTimer);
        //   this.downloadTimer = null;
        // }
        // if (this.uploadTimer) {
        //   clearInterval(this.uploadTimer);
        //   this.uploadTimer = null;
        // }
        this.ref.markForCheck();
        return;

      case 'cf_onstart':
        if (!this.isCloudflareProgressActive) {
          this.beginCloudflareProgressSimulation();
        }
        this.currentState = 'Starting';
        this.currentRate = undefined;
        this.currentRateUpload = undefined;
        this.currentRateDownload = undefined;
        this.latency = undefined;
        this.updateCloudflareProgress(0, true);
        this.ref.markForCheck();
        return;

      case 'cf_interval_download': {
        const downloadMbps = Number(data.downloadCurrentSpeed ?? 0);
        this.currentState = 'Running Test (Download)';
        this.currentRate = convertToMbpsOrDefault(downloadMbps);
        this.currentRateDownload = this.currentRate;
        this.ref.markForCheck();
        return;
      }

      case 'cf_interval_upload': {
        const uploadMbps = Number(data.uploadCurrentSpeed ?? 0);
        this.currentState = 'Running Test (Upload)';
        this.currentRate = convertToMbpsOrDefault(uploadMbps);
        this.currentRateUpload = this.currentRate;
        this.ref.markForCheck();
        return;
      }

      case 'cf_complete': {
        this.stopCloudflareProgressSimulation(1);
        const results = data.passedResults || {};
        const summary = results?.summary ?? {};
        const downloadSummary = Number(
          summary.download ?? data.downloadCurrentSpeed ?? 0
        );
        const uploadSummary = Number(
          summary.upload ?? data.uploadCurrentSpeed ?? 0
        );
        const latencySummary = Number(
          summary.latency ?? results?.unloadedLatency?.latency ?? 0
        );

        this.currentState = 'Completed';
        this.currentDate = new Date();
        this.currentRate = convertToMbpsOrDefault(downloadSummary);
        this.currentRateDownload = convertToMbpsOrDefault(downloadSummary);
        this.currentRateUpload = convertToMbpsOrDefault(uploadSummary);
        this.latency = Number.isFinite(latencySummary)
          ? latencySummary.toFixed(0)
          : undefined;
        console.log("On complete data:", data);
        this.progress = 100;
        this.progressGaugeState.current = this.progressGaugeState.maximum;
        this.connectionStatus = 'success';
        this.downloadStarted = false;
        this.uploadStarted = false;
        this.uploadProgressStarted = false;

        const historicalData = this.historyService.get();
        const cloudflareMeasurements = historicalData?.measurements;
        const lastMeasurement =
          Array.isArray(cloudflareMeasurements) &&
          cloudflareMeasurements.length > 0
            ? cloudflareMeasurements[cloudflareMeasurements.length - 1]
            : undefined;
        if (lastMeasurement) {
          this.measurementnetworkServer =
            lastMeasurement?.mlabInformation?.city || '';
          this.measurementISP = lastMeasurement?.accessInformation?.org || '';
        }

        this.ref.markForCheck();
        this.refreshHistory();
        return;
      }

      default:
        this.ref.markForCheck();
    }
  }

  driveGaugeNdt7(event, data) {
    if (event === 'measurement:status') {
      if (!data || data.provider === 'cloudflare') {
        return;
      }
      console.log({ data });
      if (data.testStatus === 'error') {
        this.connectionStatus = 'error';
        this.currentRate = 'error';
        this.currentState = undefined;
        this.progress = 0; // Reset progress to allow clicking
        // Hide registration banners if an error is shown during first test
        this.showRegistrationBanner = false;
      }
      if (data.testStatus === 'onstart') {
        this.currentState = 'Starting';
        this.currentRate = undefined;
        this.currentRateUpload = undefined;
        this.currentRateDownload = undefined;
        this.progress = 0;
      } else if (data.testStatus === 'server_discovery') {
        this.currentState = this.translate.instant(
          'startTest.discoveringServers'
        );
        this.progress = 0.1;
      } else if (data.testStatus === 'server_chosen') {
        this.currentState = this.translate.instant('startTest.serverSelected');
        this.progress = 0.2;
      } else if (data.testStatus === 'retrying') {
        this.currentState = this.translate.instant('startTest.retrying', {
          attempt: data.attempt,
          maxRetries: data.maxRetries,
        });
        this.progress = 0.05;
      } else if (data.testStatus === 'interval_c2s') {
        console.log('Running Test (Upload)');
        this.currentState = this.translate.instant('startTest.runningTestUpload');
        this.currentRate = (
          (data.passedResults.Data.TCPInfo.BytesReceived /
            data.passedResults.Data.TCPInfo.ElapsedTime) *
          8
        ).toFixed(2);
        this.currentRateUpload = this.currentRate;
        if (!this.uploadProgressStarted) {
          this.uploadProgressStarted = true;
          this.startUploadProgress();
        }
      } else if (data.testStatus === 'interval_s2c') {
        this.currentState = this.translate.instant('startTest.runningTestDownload');
        this.currentRate = data.passedResults.Data.MeanClientMbps?.toFixed(2);
        this.currentRateDownload =
          data.passedResults.Data.MeanClientMbps?.toFixed(2);
        if (this.downloadStarted) {
          this.startDownloadProgress();
        }
      } else if (data.testStatus === 'complete') {
        this.currentState = 'Completed';
        this.currentDate = new Date();
        this.currentRate =
          data.passedResults[
            'NDTResult.S2C'
          ].LastClientMeasurement.MeanClientMbps?.toFixed(2);
        this.currentRateUpload =
          data.passedResults[
            'NDTResult.C2S'
          ].LastClientMeasurement.MeanClientMbps?.toFixed(2);
        this.currentRateDownload =
          data.passedResults[
            'NDTResult.S2C'
          ].LastClientMeasurement.MeanClientMbps?.toFixed(2);
        this.progressGaugeState.current = this.progressGaugeState.maximum;
        this.latency = (
          (data.passedResults['NDTResult.S2C'].LastServerMeasurement.BBRInfo
            .MinRTT +
            data.passedResults['NDTResult.C2S'].LastServerMeasurement.BBRInfo
              .MinRTT) /
          2 /
          1000
        ).toFixed(0);
        const historicalData = this.historyService.get();
        const measurements = historicalData?.measurements;
        if (Array.isArray(measurements) && measurements.length) {
          const lastMeasurement = measurements[measurements.length - 1];
          this.measurementnetworkServer =
            lastMeasurement?.mlabInformation?.city || '';
          this.measurementISP = lastMeasurement?.accessInformation?.org || '';
        }
        this.ref.markForCheck();
        this.refreshHistory();

        // Handle first test completion for new registrations
        this.handleFirstTestCompletion();
      } else if (data.testStatus === 'onerror') {
        this.gaugeError();
        this.currentState = undefined;
        this.currentRate = undefined;
        this.ref.markForCheck();
        // Hide registration banners if an error is shown during first test
        this.showRegistrationBanner = false;
      }
      if (data.testStatus !== 'complete' && typeof data.progress === 'number') {
        this.progressGaugeState.current = data.progress;
      }
    }
  }
  async presentTestFailModal() {
    const alert = await this.alertController.create({
      cssClass: 'my-custom-class',
      header: this.translate.instant('TEST FAILED'),
      message:
        '<strong>' +
        this.translate.instant(
          'The connection was interupted before testing could be completed.'
        ) +
        '</strong>',
      buttons: [
        {
          text: 'Okay',
          handler: () => {},
        },
      ],
    });
    await alert.present();
  }

  async presentAlertConfirm() {
    const alert = await this.alertController.create({
      cssClass: 'my-custom-class',
      header: this.translate.instant('Error'),
      message:
        '<strong>' +
        this.translate.instant(
          'Measurement server is not responding. Please close the app from system tray and try after sometime'
        ) +
        '</strong>',
      buttons: [
        {
          text: 'Okay',
          handler: () => {},
        },
      ],
    });
    await alert.present();
  }

  gaugeError() {
    this.progressGaugeState.current = this.progressGaugeState.maximum;
  }

  /**
   * Check if this is the first visit after registration
   */
  checkFirstTimeVisit() {
    this.isFirstVisit = this.storage.getFirstTimeVisit();

    if (this.isFirstVisit && this.storage.isRecentRegistration()) {
      // if (1) {
      this.showRegistrationBanner = true;
      this.registrationStatus = 'completed';

      // Auto-trigger first test after a short delay
      setTimeout(() => {
        this.autoTriggerFirstTest();
      }, 500); // 2 second delay to show the banner first
    } else if (this.isFirstVisit) {
      // Clear stale first visit flag if registration is old
      this.storage.clearFirstTimeVisit();
      this.isFirstVisit = false;
    }
  }

  /**
   * Auto-trigger the first test for new registrations
   */
  async autoTriggerFirstTest() {
    if (
      !this.firstTestTriggered &&
      this.onlineStatus &&
      this.currentState === undefined
    ) {
      this.firstTestTriggered = true;
      this.registrationStatus = 'testing';

      console.log(
        'Auto-triggering first test for new registration - event listeners are ready'
      );

      // Additional safety: ensure driveGauge listener is registered
      if (
        this.sharedService.listeners &&
        this.sharedService.listeners['measurement:status']
      ) {
        console.log('Confirmed: measurement:status listener is registered');
      } else {
        console.warn(
          'Warning: measurement:status listener may not be registered yet'
        );
      }

      // Run ping test first, then start the NDT test
      try {
        console.log('Running ping test before first NDT test...');
        const pingResult = await this.pingService.performCheck();

        if (pingResult) {
          console.log('Ping test completed successfully:', pingResult);
          // Save the ping result
          await this.indexedDBService.savePingResult(pingResult);
          // Update the ping display
          await this.loadLatestPingResult();
        } else {
          console.log('Ping test skipped (outside active hours or failed)');
        }
      } catch (error) {
        console.error('Error during ping test:', error);
        // Continue with NDT test even if ping fails
      }

      // Start the NDT test
      this.startNDT('first');
    } else {
      console.log('Auto-trigger conditions not met:', {
        firstTestTriggered: this.firstTestTriggered,
        onlineStatus: this.onlineStatus,
        currentState: this.currentState,
      });
    }
  }

  /**
   * Dismiss the registration banner
   */
  dismissBanner() {
    this.showRegistrationBanner = false;
    if (this.isFirstVisit) {
      this.storage.clearFirstTimeVisit();
      this.isFirstVisit = false;
    }
  }

  /**
   * Handle test completion for first-time users
   */
  async handleFirstTestCompletion() {
    if (this.isFirstVisit && this.registrationStatus === 'testing') {
      this.registrationStatus = 'done';

      // Show success modal after a short delay
      setTimeout(async () => {
        await this.showFirstTestSuccessModal();
      }, 300);
    }
  }

  /**
   * Show the first test success modal
   */
  async showFirstTestSuccessModal() {
    const modal = await this.modalController.create({
      component: FirstTestSuccessModalComponent,
      cssClass: 'first-test-success-modal',
      backdropDismiss: true,
      componentProps: {
        schoolInfo: this.school,
        selectedCountry: this.selectedCountry,
        schoolId: this.schoolId,
      },
    });

    modal.onDidDismiss().then(() => {
      // Clear first visit flag and dismiss banner after modal is closed
      this.dismissBanner();
      // Stop confetti when modal is dismissed
      this.confettiService.stopConfetti();
    });

    // Start confetti animation when modal is presented
    await modal.present();

    // Add a small delay to ensure modal is visible before starting confetti
    setTimeout(() => {
      this.confettiService.startConfetti(5000); // 5 seconds of confetti
    }, 300);

    return modal;
  }

  /**
   * Testing methods for development purposes
   * These should be removed in production
   */

  /**
   * Test confetti animation (development only)
   */
  testConfetti(): void {
    this.confettiService.startConfetti(3000);
  }

  /**
   * Test fireworks confetti (development only)
   */
  testFireworksConfetti(): void {
    this.confettiService.celebrateWithFireworks();
  }

  /**
   * Test school colors confetti (development only)
   */
  testSchoolConfetti(): void {
    this.confettiService.schoolColorsConfetti();
  }

  /**
   * Show the first-time modal for testing purposes
   */
  async showFirstTimeModalForTesting() {
    console.log('Testing: Showing first-time modal');
    await this.showFirstTestSuccessModal();
  }

  /**
   * Show notification banners for testing purposes
   */
  showNotificationForTesting() {
    console.log('Testing: Showing notification banners');
    this.showRegistrationBanner = true;
    this.registrationStatus = 'completed';
    this.isFirstVisit = true;

    // Simulate progression through notification states
    setTimeout(() => {
      this.registrationStatus = 'testing';
      this.ref.markForCheck();
    }, 2000);

    setTimeout(() => {
      this.registrationStatus = 'done';
      this.ref.markForCheck();
    }, 4000);
  }

  /**
   * Hide all testing elements and reset state
   */
  hideTestingElements() {
    console.log('Testing: Resetting all testing elements');
    this.showRegistrationBanner = false;
    this.isFirstVisit = false;
    this.registrationStatus = 'completed';
    this.firstTestTriggered = false;
    this.ref.markForCheck();
  }

  ngOnDestroy() {
    this.downloadSub.unsubscribe();
    this.uploadSub.unsubscribe();
    this.downloadStartedSub.unsubscribe();
    this.uploadStartedSub.unsubscribe();
    this.cloudflareDownloadSub?.unsubscribe();
    this.cloudflareUploadSub?.unsubscribe();
    this.cloudflareDownloadStartedSub?.unsubscribe();
    this.cloudflareUploadStartedSub?.unsubscribe();
    this.stopCloudflareProgressSimulation();
  }
}
