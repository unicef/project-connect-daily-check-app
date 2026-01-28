/* eslint-disable @typescript-eslint/no-unused-expressions */
/* eslint-disable @typescript-eslint/naming-convention */
import { Component, ViewChild } from '@angular/core';
import { IonAccordionGroup } from '@ionic/angular';
import { ActivatedRoute, Router } from '@angular/router';
import { SchoolService } from '../services/school.service';
import { LoadingService } from '../services/loading.service';
import { StorageService } from '../services/storage.service';
import { NetworkService } from '../services/network.service';

import { School } from '../models/models';
import { Device } from '@capacitor/device';
import { DatePipe } from '@angular/common';
import { environment } from 'src/environments/environment';
import { SettingsService } from '../services/settings.service';
import { SharedService } from '../services/shared-service.service';
import { TranslateService } from '@ngx-translate/core';
import { HardwareIdService } from '../services/hardware-id.service';
@Component({
  selector: 'app-confirmschool',
  templateUrl: 'confirmschool.page.html',
  styleUrls: ['confirmschool.page.scss'],
  standalone: false,
})
export class ConfirmschoolPage {
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
    private hardwareIdService: HardwareIdService
  ) {
    const appLang = this.settings.get('applicationLanguage');
    this.translate.use(appLang.code);
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

  confirmSchool() {
    /* Store school id and giga id inside storage */
    let schoolData = {};
    let flaggedSchoolData = {};
    const today = this.datePipe.transform(
      new Date(),
      'yyyy-MM-ddah:mm:ssZZZZZ'
    );
    const translatedText = this.translate.instant('searchCountry.loading');

    const loadingMsg = `<div class="loadContent"><ion-img src="assets/loader/new_loader.gif" class="loaderGif"></ion-img><p class="green_loader">${translatedText}</p></div>`;
    this.loading.present(loadingMsg, 4000, 'pdcaLoaderClass', 'null');

    // this.networkService.getAccessInformation().subscribe(c => {
    this.getIPAddress().then((c) => {
      this.getDeviceInfo().then((a) => {
        this.getDeviceId().then((b) => {
          // Get hardware ID for machine-level registration
          const hardwareId = this.hardwareIdService.getHardwareId();

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
                  //school_id: this.school.school_id
                };

                // if(this.school.code === c.country){

                this.schoolService
                  .registerSchoolDevice(schoolData)
                  .subscribe((response) => {
                    this.storage.set('deviceType', a.operatingSystem);
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
                  };

                if (this.selectedCountry !== this.detectedCountry) {
                  flaggedSchoolData = {
                    detected_country: this.detectedCountry,
                    selected_country: this.selectedCountry,
                    school_id: this.school.school_id,
                    created: today,
                    giga_id_school: this.school.giga_id_school,
                  };
                  console.log('flagged', flaggedSchoolData);
                  this.schoolService
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
                    };
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
      { state: schoolObj }
    );
  }

  async getDeviceInfo() {
    const info = await Device.getInfo();
    return info;
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
            usernameInfo.username
          );
          return usernameInfo.username;
        } else if (usernameInfo && usernameInfo.error) {
          console.error(
            '❌ [Windows Username] Error retrieving username:',
            usernameInfo.error
          );
          return null;
        }
      } else {
        console.log(
          '⚠️ [Windows Username] Not running in Electron, username not available'
        );
        return null;
      }
    } catch (error) {
      console.error(
        '❌ [Windows Username] Exception while retrieving username:',
        error
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
            pathInfo.installedPath
          );
          return pathInfo.installedPath;
        } else if (pathInfo && pathInfo.error) {
          console.error(
            '❌ [Installed Path] Error retrieving path:',
            pathInfo.error
          );
          return null;
        }
      } else {
        console.log(
          '⚠️ [Installed Path] Not running in Electron, path not available'
        );
        return null;
      }
    } catch (error) {
      console.error(
        '❌ [Installed Path] Exception while retrieving path:',
        error
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
