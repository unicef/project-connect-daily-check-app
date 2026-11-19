/* eslint-disable @typescript-eslint/naming-convention */
import { Component, OnInit, ViewChild } from '@angular/core';
import { IonAccordionGroup } from '@ionic/angular';
import { ActivatedRoute, Router } from '@angular/router';
import { firstValueFrom, timeout } from 'rxjs';
import { SchoolService } from '../services/school.service';
import { RegistrationService } from '../services/registration.service';
import { IdentityService } from '../services/identity.service';
import { LoadingService } from '../services/loading.service';
import { StorageService } from '../services/storage.service';
import { NetworkService } from '../services/network.service';
import { getFacilityConfig } from '../models/facility';

import { School } from '../models/models';
import { NotFound, classifyRequestError } from '../schoolnotfound/types';
import { Device } from '@capacitor/device';
import { DatePipe } from '@angular/common';
import { environment } from 'src/environments/environment';
import { SettingsService } from '../services/settings.service';
import { SharedService } from '../services/shared-service.service';
import { TranslateService } from '@ngx-translate/core';
import { HardwareIdService } from '../services/hardware-id.service';
import { LocationService } from '../services/location.service';
import { PosthogService } from '../services/posthog.service';
import { withTimeout } from '../utils/with-timeout.utils';

/** Cap for each optional lookup (IP, Windows username, install path, WiFi). */
const LOOKUP_TIMEOUT_MS = 10000;
/** Cap for the registration request itself. */
const REGISTER_TIMEOUT_MS = 30000;

@Component({
  selector: 'app-confirmschool',
  templateUrl: 'confirmschool.page.html',
  styleUrls: ['confirmschool.page.scss'],
  standalone: false,
})
export class ConfirmschoolPage implements OnInit{
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
  facilityLabelKey = 'facilityType.school';
  /**
   * Registration in flight. Guards `confirmSchool()` against repeat taps: every
   * extra tap used to start an independent registration chain, and each one
   * inserted another `dailycheckapp_school` row with a fresh `user_id`.
   */
  isRegistering = false;
  constructor(
    private activatedroute: ActivatedRoute,
    public router: Router,
    private schoolService: SchoolService,
    private registrationService: RegistrationService,
    private identityService: IdentityService,
    private storage: StorageService,
    private networkService: NetworkService,
    private settings: SettingsService,
    public loading: LoadingService,
    private datePipe: DatePipe,
    private translate: TranslateService,
    private sharedService: SharedService,
    private hardwareIdService: HardwareIdService,
    private locationService: LocationService,
    private posthog: PosthogService
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

  
  async ngOnInit() {
    this.facilityLabelKey = `facilityType.${this.identityService.getFacilityType()}`;
    try {
      // 1. Get WiFi list from Electron
      const wifiList = await this.locationService.getWifiAccessPoints();

      // 2. Send WiFi list to backend → backend returns lat/long
      this.locationService.resolveGeolocation(wifiList).subscribe({
        next: (geo: any) => {
          console.log('Received geolocation from backend:', geo);

          // 3. Save lat/long in localStorage
          this.locationService.saveGeolocation(geo);
        },
        error: (err) => {
          console.error('Error resolving geolocation', err);
        }
      });
    } catch (err) {
      console.error('Error fetching WiFi list in ngOnInit', err);
    }
  }

  async confirmSchool() {
    /* One registration per confirmation: repeat taps are ignored while the
       previous one is still in flight. */
    if (this.isRegistering) {
      return;
    }
    this.isRegistering = true;

    /* Store school id and giga id inside storage */
    const today = this.datePipe.transform(
      new Date(),
      'yyyy-MM-ddah:mm:ssZZZZZ'
    );
    const translatedText = this.translate.instant('searchCountry.loading');

    const loadingMsg = `<div class="loadContent"><ion-img src="assets/loader/new_loader.gif" class="loaderGif"></ion-img><p class="green_loader">${translatedText}</p></div>`;
    /* No duration: the loader stays up until the registration settles. With a
       fixed duration it vanished after 4s while the flow was still running, and
       the seemingly idle screen invited another tap. */
    this.loading.present(loadingMsg, undefined, 'pdcaLoaderClass', 'null');

    const facilityType =
      this.school?.facilityType ?? this.identityService.getFacilityType();

    try {
      const deviceInfo = await this.getDeviceInfo();
      const deviceId = await this.getDeviceId();
      // Get hardware ID for machine-level registration
      const hardwareId = this.hardwareIdService.getHardwareId();
      // The serials and Windows install ID (TECH-8828) are not sent: the v2
      // registration endpoint rejects fields it does not know yet.
      /* The loader has no duration, so none of these optional lookups may hang
         it: each one is capped and falls back to null, and they run together
         so the worst case is one cap rather than the sum. */
      const [ipAddress, windowsUsername, installedPath, wifiConnections] =
        await Promise.all([
          withTimeout(LOOKUP_TIMEOUT_MS, this.getIPAddress(), null),
          withTimeout(LOOKUP_TIMEOUT_MS, this.getWindowsUsername(), null),
          withTimeout(LOOKUP_TIMEOUT_MS, this.getInstalledPath(), null),
          withTimeout(LOOKUP_TIMEOUT_MS, this.getWifiConnections(), null),
        ]);

      const gigaId =
        facilityType === 'health'
          ? this.school.giga_id_health
          : this.school.giga_id_school;

      const registrationData = {
        [facilityType === 'health' ? 'giga_id_health' : 'giga_id_school']:
          gigaId,
        mac_address: deviceId.identifier,
        os: deviceInfo.operatingSystem,
        app_version: environment.app_version,
        ip_address: ipAddress,
        country_code: this.selectedCountry,
        installation_id: this.identityService.getInstallationId(),
        device_hardware_id: hardwareId || null,
        windows_username: windowsUsername || null,
        installed_path: installedPath || null,
        wifi_connections: wifiConnections || null,
      };

      /* Fire-and-forget, as before: the flagged record is independent of the
         registration outcome and does not gate navigation. Schools only: the
         flagged table is keyed on giga_id_school. */
      if (
        facilityType === 'school' &&
        this.selectedCountry !== this.detectedCountry
      ) {
        this.registerFlaggedSchool(today);
      }

      const response = await firstValueFrom(
        this.registrationService
          .register(registrationData as any)
          .pipe(timeout(REGISTER_TIMEOUT_MS))
      );

      // New keys only — legacy keys stay untouched
      await this.registrationService.persistRegistration(
        response,
        this.school,
        this.schoolId
      );
      // Shared device-metadata keys (same on both vintages)
      this.storage.set('deviceType', deviceInfo.operatingSystem);
      this.storage.set('macAddress', deviceId.identifier);
      // From here on, events belong to this PC, in this facility's group.
      this.posthog.identifyDevice({
        country_code: this.selectedCountry,
        facility_type: response.facility_type,
      });
      this.posthog.setSchool(response.giga_id);
      this.storage.set('ip_address', ipAddress?.ip);
      this.storage.set('version', environment.app_version);
      this.storage.set('country_code', this.selectedCountry);

      // Set first-time visit flags for new registration flow
      this.storage.setFirstTimeVisit(true);
      this.storage.setRegistrationCompleted(Date.now());

      this.posthog.capture('registration_completed', {
        country_code: this.selectedCountry,
        facility_type: response.facility_type,
      });

      // Navigate to starttest page normally
      await this.router.navigate(['/starttest']);
      // Broadcast registration completion event after navigation
      // This will trigger the first-time flow in StartTest component
      this.sharedService.broadcast('registration:completed');

      this.settings.setSetting('scheduledTesting', true);
    } catch (err) {
      /* Registration failed, or the device/network lookups that precede it did.
         Either way the screen must not hang: dismiss and route out so the user
         can retry. */
      console.error('❌ [ConfirmSchool] Registration failed:', err);
      /* The facility was found; registering it failed. Say why, and let
         "Try again" bring the user back here. */
      this.router.navigate(
        [
          getFacilityConfig(facilityType as any).notFoundRoute,
          this.schoolId,
          this.selectedCountry,
          this.detectedCountry,
          this.selectedCountryName,
        ],
        {
          queryParams: {
            reason: classifyRequestError(err, NotFound.registrationFailed),
          },
        }
      );
    } finally {
      this.dismissLoader();
      this.isRegistering = false;
    }
  }

  /**
   * Record a country mismatch (detected vs selected). Independent of the school
   * registration: it never gates navigation.
   */
  private registerFlaggedSchool(today: string) {
    const flaggedSchoolData = {
      detected_country: this.detectedCountry,
      selected_country: this.selectedCountry,
      school_id: this.school.school_id,
      created: today,
      giga_id_school: this.school.giga_id_school,
    };
    console.log('flagged', flaggedSchoolData);
    this.schoolService.registerFlaggedSchool(flaggedSchoolData).subscribe({
      next: () => {
        this.storage.set('detectedCountry', this.detectedCountry);
        this.storage.set('selectedCountry', this.selectedCountry);
        this.storage.set('schoolId', this.schoolId);
      },
      error: (err) => {
        console.error('❌ [ConfirmSchool] Flagged school failed:', err);
      },
    });
  }

  /**
   * Close the loader. The controller rejects when there is no overlay to
   * dismiss (e.g. the flow finished before `present()` resolved), which is
   * harmless here but would surface as an unhandled rejection.
   */
  private dismissLoader() {
    this.loading.dismiss().catch(() => undefined);
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