/* eslint-disable @typescript-eslint/naming-convention */
import { Component, OnInit, ViewChild } from '@angular/core';
import { IonAccordionGroup } from '@ionic/angular';
import { ActivatedRoute, Router } from '@angular/router';
import { firstValueFrom, timeout } from 'rxjs';
import { SchoolService } from '../services/school.service';
import { LoadingService } from '../services/loading.service';
import { StorageService } from '../services/storage.service';
import { NetworkService } from '../services/network.service';

import { School } from '../models/models';
import { NotFound, classifyRequestError } from '../schoolnotfound/types';
import { DatePipe } from '@angular/common';
import { environment } from 'src/environments/environment';
import { SettingsService } from '../services/settings.service';
import { SharedService } from '../services/shared-service.service';
import { TranslateService } from '@ngx-translate/core';
import { LocationService } from '../services/location.service';
import { PosthogService } from '../services/posthog.service';
import {
  PENDING_AUTO_REGISTRATION_KEY,
  REGISTER_TIMEOUT_MS,
  RegistrationContextService,
} from '../services/registration-context.service';
import {
  AnalyticsEvent,
  onboardingDurationMs,
  registrationProps,
} from '../analytics/analytics-events';

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
    private storage: StorageService,
    private networkService: NetworkService,
    private settings: SettingsService,
    public loading: LoadingService,
    private datePipe: DatePipe,
    private translate: TranslateService,
    private sharedService: SharedService,
    private locationService: LocationService,
    private posthog: PosthogService,
    private registrationContext: RegistrationContextService
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
    try {
      // 1. Get WiFi list from Electron
      const wifiList = await this.locationService.getWifiAccessPoints();

      // 2. Send WiFi list to backend → backend returns lat/long
      this.locationService.resolveGeolocation(wifiList).subscribe({
        next: (geo: any) => {
          console.log('Received geolocation from backend:', geo);

          // 3. Save lat/long in localStorage, with the access points it came
          // from. The connected access point is not known here, so any BSSID
          // saved with an earlier location is cleared rather than left paired
          // with this one; the first upload that sees the same access points
          // records it.
          this.locationService.saveResolvedGeolocation(geo, wifiList, null);
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

    try {
      /* The loader has no duration, so none of the optional lookups behind
         this may hang it: each one is capped and falls back to null. */
      const schoolData = await this.registrationContext.build({
        giga_id_school: this.school.giga_id_school,
        country_code: this.selectedCountry,
        registration_source: 'manual',
        created: today,
      });

      /* Fire-and-forget, as before: the flagged record is independent of the
         registration outcome and does not gate navigation. */
      if (this.selectedCountry !== this.detectedCountry) {
        this.registerFlaggedSchool(today);
      }

      const response = await firstValueFrom(
        this.schoolService
          .registerSchoolDevice(schoolData)
          .pipe(timeout(REGISTER_TIMEOUT_MS))
      );

      this.storage.set('deviceType', schoolData.os);
      this.storage.set('macAddress', schoolData.mac_address);
      this.storage.set('schoolUserId', response);
      this.storage.set('schoolId', this.schoolId);
      this.storage.set('gigaId', this.school.giga_id_school);
      // This install has a registration of its own now: nothing for the next
      // start to try again, even if an automatic one failed earlier.
      this.storage.set(PENDING_AUTO_REGISTRATION_KEY, '');
      // From here on, events belong to this PC, in this school's group.
      this.posthog.identifyDevice({
        country_code: this.selectedCountry,
      });
      this.posthog.setSchool(this.school.giga_id_school, {
        external_id: this.school.school_id ?? this.schoolId,
        name: this.school.name,
      });
      this.posthog.setCountry(this.selectedCountry);
      // This registration is a new app instance on the PC.
      this.posthog.applyAppInstance({
        registration_source: 'manual',
        giga_id_school: this.school.giga_id_school,
        country_code: this.selectedCountry,
        app_version: environment.app_version,
        registered_at: new Date().toISOString(),
      });
      this.storage.set('ip_address', schoolData.ip_address);
      this.storage.set('version', environment.app_version);
      //this.storage.set('country_code', c.country);
      this.storage.set('country_code', this.selectedCountry);
      this.storage.set('schoolInfo', JSON.stringify(this.school));

      // Set first-time visit flags for new registration flow
      this.storage.setFirstTimeVisit(true);
      this.storage.setRegistrationCompleted(Date.now());

      this.posthog.capture(AnalyticsEvent.RegistrationCompleted, {
        ...registrationProps(schoolData),
        duration_ms: onboardingDurationMs(),
        country_mismatch: this.selectedCountry !== this.detectedCountry,
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
      this.posthog.captureFailure(
        AnalyticsEvent.RegistrationFailed,
        err,
        {
          country_code: this.selectedCountry,
          registration_source: 'manual',
          reason: classifyRequestError(err, NotFound.registrationFailed),
        },
        'registration_failed'
      );
      /* The school was found; registering it failed. Say why, and let
         "Try again" bring the user back here. */
      this.router.navigate(
        [
          'schoolnotfound',
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