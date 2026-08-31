/* eslint-disable @typescript-eslint/no-unused-expressions */
/* eslint-disable @typescript-eslint/naming-convention */
import { Component, OnInit, ViewChild } from '@angular/core';
import { IonAccordionGroup } from '@ionic/angular';
import { ActivatedRoute, Router } from '@angular/router';
import { SchoolService } from '../services/school.service';
import { LoadingService } from '../services/loading.service';
import { StorageService } from '../services/storage.service';
import { NetworkService } from '../services/network.service';
import { Geolocation } from '@capacitor/geolocation';

import { School } from '../models/models';
import { Device } from '@capacitor/device';
import { App } from '@capacitor/app';
import { DatePipe } from '@angular/common';
import { environment } from 'src/environments/environment';
import { SettingsService } from '../services/settings.service';
import { SharedService } from '../services/shared-service.service';
import { TranslateService } from '@ngx-translate/core';
import { Capacitor, registerPlugin } from '@capacitor/core';
import { HistoryService } from '../services/history.service';
import { HardwareIdService } from '../services/hardware-id.service';
import { LocationService } from '../services/location.service';
@Component({
  selector: 'app-confirmschool',
  templateUrl: 'confirmschool.page.html',
  styleUrls: ['confirmschool.page.scss'],
  standalone: false,
})
export class ConfirmschoolPage implements OnInit {
  @ViewChild(IonAccordionGroup, { static: true })
  accordionGroup: IonAccordionGroup;
  school: any;
  schoolId: any;
  selectedCountry: any;
  selectedCountryName: any;
  showNotification = true;
  detectedCountry: any;
  sub: any;
  appName = environment.appName;
  isNative: boolean;
  gigaAppPlugin: any;
  constructor(
    private activatedroute: ActivatedRoute,
    public router: Router,
    private schoolService: SchoolService,
    private storage: StorageService,
    private networkService: NetworkService,
    private settings: SettingsService,
    public loading: LoadingService,
    private datePipe: DatePipe,
    private translate: TranslateService,
    private sharedService: SharedService,
    private hardwareIdService: HardwareIdService,
    private locationService: LocationService,
  ) {
    const appLang = this.settings.get('applicationLanguage');
    this.translate.use(appLang.code);
    this.isNative = Capacitor.getPlatform() === 'android';
    if (Capacitor.getPlatform() === 'android') {
      this.gigaAppPlugin = registerPlugin<any>('GigaAppPlugin');
    }
    this.sub = this.activatedroute.params.subscribe((params) => {
      this.schoolId = params.schoolId;
      this.selectedCountry = params.selectedCountry;
      this.detectedCountry = params.detectedCountry;
      this.selectedCountryName = params.selectedCountryName;

      if (this.router.getCurrentNavigation()) {
        this.school = this.router.getCurrentNavigation().extras.state as School;
      }
    });
  }

  async ngOnInit() {
    try {
      if (this.isNative) {
        const geo = await this.getLocation();
        console.log('GeoLocation Save Confirm', `${JSON.stringify(geo)}`);

        this.locationService.saveGeolocation(geo);
      } else {
        // 1. Get WiFi list from Electron
        const wifiList = await this.locationService.getWifiAccessPoints();
        console.log('GIGA METER WIFI LIST:', wifiList);

        // 2. Send WiFi list to backend → backend returns lat/long
        this.locationService.resolveGeolocation(wifiList).subscribe({
          next: (geo: any) => {
            console.log('GIGA METER GEOLOCATION:', JSON.stringify(geo));

            console.log('Received geolocation from backend:', geo);

            // 3. Save lat/long in localStorage
            this.locationService.saveGeolocation(geo);
          },
          error: (err) => {
            console.error('Error resolving geolocation', err);
          },
        });
      }
    } catch (err) {
      console.error('Error fetching WiFi list in ngOnInit', err);
    }
  }

  isNativeApp(): boolean {
    return Capacitor.getPlatform() === 'android';
  }

  async getLocation() {
    if (this.isNativeApp()) {
      try {
        const position = await this.ensureLocationPermission();

        console.log(`Position: ${JSON.stringify(position)}`);

        const geolocation = position
          ? {
              location: {
                lat: position.coords.latitude,
                lng: position.coords.longitude,
              },
              accuracy: position.coords.accuracy,
            }
          : null;

        console.log('GIGA METER LOCATION', JSON.stringify(geolocation));
        return geolocation;
      } catch (error) {
        console.error('Failed to get native location', error);
        return null;
      }
    } else {
      return this.locationService.getSavedGeolocation();
    }
  }
  confirmSchool() {
    /* Store school id and giga id inside storage */
    let schoolData = {};
    let flaggedSchoolData = {};
    const today = this.datePipe.transform(
      new Date(),
      'yyyy-MM-ddah:mm:ssZZZZZ',
    );
    const translatedText = this.translate.instant('searchCountry.loading');

    const loadingMsg = `<div class="loadContent"><ion-img src="assets/loader/new_loader.gif" class="loaderGif"></ion-img><p class="green_loader">${translatedText}</p></div>`;
    this.loading.present(loadingMsg, 4000, 'pdcaLoaderClass', 'null');

    // this.networkService.getAccessInformation().subscribe(c => {
    this.getIPAddress().then((c) => {
      this.getDeviceInfo().then((a) => {
        this.getDeviceId().then(async (b) => {
          // Get hardware ID for machine-level registration
          const hardwareId = this.hardwareIdService.getHardwareId();
          const location = await this.getLocation();
          // Get Windows username, installed path, and WiFi connections
          this.getWindowsUsername().then((windowsUsername) => {
            this.getInstalledPath().then((installedPath) => {
              this.getWifiConnections().then((wifiConnections) => {
                schoolData = {
                  giga_id_school: this.school.giga_id_school,
                  mac_address: b.identifier,
                  os: a.operatingSystem,
                  app_version: environment.app_version,
                  created: today,
                  ip_address: c, // c.ip,
                  //country_code: c.country,
                  country_code: this.selectedCountry,
                  device_hardware_id: hardwareId || null, // Add hardware ID
                  windows_username: windowsUsername || null, // Add Windows username
                  installed_path: installedPath || null, // Add installed path
                  wifi_connections: wifiConnections || null, // Add WiFi connections
                  geolocation: location,
                  //school_id: this.school.school_id
                };
                console.log(
                  'GIGA METER SCHOOLDATA',
                  JSON.stringify(schoolData),
                );

                // if(this.school.code === c.country){

                (this.schoolService
                  .registerSchoolDevice(schoolData)
                  .subscribe((response) => {
                    if (a.operatingSystem) {
                      this.storage.set('deviceType', a.operatingSystem);
                    }
                    if (a.name) {
                      this.storage.set('deviceName', a.name);
                    }
                    if (a.model) {
                      this.storage.set('deviceModel', a.model);
                    }
                    if (a.manufacturer) {
                      this.storage.set('deviceManufacturer', a.manufacturer);
                    }
                    if (a.osVersion) {
                      this.storage.set('osVersion', a.osVersion);
                    }
                    this.getAppBuildNumber().then((buildNumber) => {
                      if (buildNumber) {
                        this.storage.set('appBuildNumber', buildNumber);
                      }
                    });
                    this.storage.set('macAddress', b.identifier);
                    this.storage.set('schoolUserId', response);
                    this.storage.set('schoolId', this.schoolId);
                    this.storage.set('gigaId', this.school.giga_id_school);
                    this.storage.set('ip_address', c?.ip);
                    this.storage.set('version', environment.app_version);
                    //this.storage.set('country_code', c.country);
                    this.storage.set('country_code', this.selectedCountry);
                    this.storage.set('school_id', this.school.school_id);
                    this.storage.set('schoolInfo', JSON.stringify(this.school));

                    // Set first-time visit flags for new registration flow
                    this.storage.setFirstTimeVisit(true);
                    this.storage.setRegistrationCompleted(Date.now());

                    if (this.isNative) {
                      //This we need to pass to native background servie to execute the
                      // api calls to publish speed test data
                      const apiKey = environment.token;
                      const baseUrl = environment.restAPI;
                      const clientInfoToken = environment.ipInfoToken;
                      this.storeRegistrationDataAndScheduleSpeedTest(
                        response,
                        this.school.school_id,
                        this.school.giga_id_school,
                        this.selectedCountry,
                        c?.ip,
                        apiKey,
                        baseUrl,
                        clientInfoToken,
                      );
                    }

                    this.loading.dismiss();

                    // Navigate to starttest page normally
                    this.router.navigate(['/starttest']).then(() => {
                      // Broadcast registration completion event after navigation
                      // This will trigger the first-time flow in StartTest component
                      this.sharedService.broadcast('registration:completed');
                    });

                    this.settings.setSetting('scheduledTesting', true);
                  }),
                  (err) => {
                    this.loading.dismiss();
                    this.router.navigate([
                      'schoolnotfound',
                      this.schoolId,
                      this.selectedCountry,
                      this.detectedCountry,
                      this.selectedCountryName,
                    ]);
                    /* Redirect to no result found page */
                  });

                if (this.selectedCountry !== this.detectedCountry) {
                  flaggedSchoolData = {
                    detected_country: this.detectedCountry,
                    selected_country: this.selectedCountry,
                    school_id: this.school.school_id,
                    created: today,
                    giga_id_school: this.school.giga_id_school,
                  };
                  console.log('flagged', flaggedSchoolData);
                  (this.schoolService
                    .registerFlaggedSchool(flaggedSchoolData)
                    .subscribe((response) => {
                      this.storage.set('detectedCountry', this.detectedCountry);
                      this.storage.set('selectedCountry', this.selectedCountry);
                      this.storage.set('schoolId', this.schoolId);
                      //this.loading.dismiss();
                      // this.router.navigate(['/schoolsuccess']);
                    }),
                    (err) => {
                      this.loading.dismiss();
                      //this.router.navigate(['schoolnotfound', this.schoolId, this.selectedCountry, this.detectedCountry]);
                      /* Redirect to no result found page */
                    });
                }

                //}
                //else{

                //   this.loading.dismiss();
                //   this.router.navigate(['invalidlocation',
                //   this.schoolId,
                //      this.school.country,
                //      c.country + " (" +c.city + ")"

                //  ]);

                //}
              }); // Close getWifiConnections().then()
            }); // Close getInstalledPath().then()
          }); // Close getWindowsUsername().then()
        });
      });
    });
  }

  backToSaved(schoolObj) {
    this.router.navigate(
      [
        'schooldetails',
        schoolObj?.school_id || this.schoolId,
        this.selectedCountry,
        this.detectedCountry,
        this.selectedCountryName,
      ],
      { state: schoolObj },
    );
  }

  async storeRegistrationDataAndScheduleSpeedTest(
    browserId: any,
    schoolId: String,
    gigaSchoolId: String,
    countryCode: String,
    ipAddress: String,
    apiKey: String,
    baseUrl: String,
    ipInfoToken: String,
  ) {
    const result = await this.gigaAppPlugin.storeAndScheduleSpeedTest({
      browser_id: browserId || '',
      school_id: schoolId || '',
      giga_school_id: gigaSchoolId || '',
      country_code: countryCode || '',
      ip_address: ipAddress || '',
      mlab_uploadKey: apiKey || '',
      base_url: baseUrl || '',
      ip_info_token: ipInfoToken || '',
    });
    console.log('GIGA Plugin Call Result : ', result);
  }

  async ensureLocationPermission() {
    try {
      const status = await Geolocation.checkPermissions();

      if (status.location !== 'granted') {
        console.log('Location permission not granted');
        return null;
      }

      const position = await Geolocation.getCurrentPosition({
        enableHighAccuracy: true,
        timeout: 15000,
        maximumAge: 30000,
      });

      return position;
    } catch (error) {
      console.error('Error getting location', error);
      return null;
    }
  }
  async getDeviceInfo() {
    try {
      const info = await Device.getInfo();
      return info;
    } catch (error) {
      console.log('Error getting device info:', error);
      // Fall back to an empty object so callers can safely read properties
      // (e.g. a.osVersion) without the whole registration flow breaking.
      return {} as any;
    }
  }

  async getAppBuildNumber() {
    try {
      const info = await App.getInfo();
      return info.build;
    } catch (error) {
      // Not available on this platform (e.g. web/Electron).
      return null;
    }
  }

  async getIPAddress() {
    try {
      const response = await fetch('https://ipv4.geojs.io/v1/ip/geo.json');
      const data = await response.json();
      const ipAddress = data.ip;
      return ipAddress;
    } catch (error) {
      console.log('Error:', error);
      return null;
    }
  }

  async getDeviceId() {
    const deviceId = await Device.getId();
    return deviceId;
  }

  async getWindowsUsername(): Promise<string> {
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
            usernameInfo.username,
          );
          return usernameInfo.username;
        } else if (usernameInfo && usernameInfo.error) {
          console.error(
            '❌ [Windows Username] Error retrieving username:',
            usernameInfo.error,
          );
          return null;
        }
      } else {
        console.log(
          '⚠️ [Windows Username] Not running in Electron, username not available',
        );
        return null;
      }
    } catch (error) {
      console.error(
        '❌ [Windows Username] Exception while retrieving username:',
        error,
      );
      return null;
    }

    return null;
  }

  async getInstalledPath(): Promise<string> {
    try {
      // Check if running in Electron
      if (window && (window as any).electronAPI) {
        console.log('📡 [Installed Path] Requesting installed path...');
        const pathInfo = await (window as any).electronAPI.getInstalledPath();

        if (pathInfo && pathInfo.installedPath) {
          console.log(
            '✅ [Installed Path] Retrieved path:',
            pathInfo.installedPath,
          );
          return pathInfo.installedPath;
        } else if (pathInfo && pathInfo.error) {
          console.error(
            '❌ [Installed Path] Error retrieving path:',
            pathInfo.error,
          );
          return null;
        }
      } else {
        console.log(
          '⚠️ [Installed Path] Not running in Electron, path not available',
        );
        return null;
      }
    } catch (error) {
      console.error(
        '❌ [Installed Path] Exception while retrieving path:',
        error,
      );
      return null;
    }

    return null;
  }

  async getWifiConnections(): Promise<any> {
    try {
      // Check if running in Electron
      if (window && (window as any).electronAPI) {
        console.log('📡 [WiFi Connections] Requesting WiFi connections...');
        const wifiInfo = await (window as any).electronAPI.getWifiConnections();

        if (wifiInfo && wifiInfo.wifiConnections) {
          console.log(
            '✅ [WiFi Connections] Retrieved connections:',
            wifiInfo.wifiConnections,
          );
          return wifiInfo.wifiConnections;
        } else if (wifiInfo && wifiInfo.error) {
          console.error(
            '❌ [WiFi Connections] Error retrieving connections:',
            wifiInfo.error,
          );
          return null;
        }
      } else {
        console.log(
          '⚠️ [WiFi Connections] Not running in Electron, connections not available',
        );
        return null;
      }
    } catch (error) {
      console.error(
        '❌ [WiFi Connections] Exception while retrieving connections:',
        error,
      );
      return null;
    }

    return null;
  }

  closeNotification() {
    this.showNotification = false;
  }

  backToSearchDetail() {
    this.router.navigate([
      'searchschool',
      this.selectedCountry,
      this.detectedCountry,
      this.selectedCountryName,
    ]);
  }
}
