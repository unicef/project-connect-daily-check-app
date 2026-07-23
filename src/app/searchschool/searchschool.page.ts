import { Component, ViewChild } from '@angular/core';
import { IonAccordionGroup } from '@ionic/angular';
import { Router, NavigationExtras, ActivatedRoute } from '@angular/router';
import { SchoolService } from '../services/school.service';
import { FacilityService } from '../services/facility.service';
import { IdentityService } from '../services/identity.service';
import { LoadingService } from '../services/loading.service';
import { SettingsService } from '../services/settings.service';
import { TranslateService } from '@ngx-translate/core';
import { environment } from 'src/environments/environment';
import { getFacilityConfig } from '../models/facility';
@Component({
    selector: 'app-searchschool',
    templateUrl: 'searchschool.page.html',
    styleUrls: ['searchschool.page.scss'],
    standalone: false
})
export class SearchschoolPage {
  @ViewChild(IonAccordionGroup, { static: true })
  accordionGroup: IonAccordionGroup;
  schoolId: any;
  isDisabled = true;
  schoolData: any;
  isLoading = false;
  selectedCountry: any;
  selectedCountryName: any;
  detectedCountry: any;
  sub: any;
  appName = environment.appName;
  private loadingMsg =
    // eslint-disable-next-line max-len
    '<div class="loadContent"><ion-img src="assets/loader/new_loader.gif" class="loaderGif"></ion-img><p class="white" [translate]="\'searchSchool.search\'"></p></div>';

  facilityType = 'school';
  facilityLabelKey = 'facilityType.school';
  lookupIdLabelKey = 'idLabel.school';
  provideIdKey = 'searchSchool.provide-school-id';
  placeholderIdKey = 'searchSchool.placeholder-school-id';

  constructor(
    private router: Router,
    private activatedroute: ActivatedRoute,
    private translate: TranslateService,
    private routeParams: ActivatedRoute,
    private schoolService: SchoolService,
    private facilityService: FacilityService,
    private identityService: IdentityService,
    private settingsService: SettingsService,
    public loading: LoadingService
  ) {
    const appLang = this.settingsService.get('applicationLanguage');
    this.translate.use(appLang.code);
    this.facilityType = this.identityService.getFacilityType();
    this.facilityLabelKey = `facilityType.${this.facilityType}`;
    this.lookupIdLabelKey = getFacilityConfig(
      this.facilityType as any
    ).lookupIdLabelKey;
    if (this.facilityType === 'health') {
      this.provideIdKey = 'searchSchool.provide-govt-id';
      this.placeholderIdKey = 'searchSchool.placeholder-govt-id';
    }
    this.sub = this.activatedroute.params.subscribe((params) => {
      this.selectedCountry = params.selectedCountry;
      this.detectedCountry = params.detectedCountry;
      this.selectedCountryName = params.selectedCountryName;
    });
  }

  ionViewWillEnter() {
    // Re-read on every entry — Ionic caches page instances in the nav stack,
    // so a constructor-time read can be stale after switching facility type.
    this.facilityType = this.identityService.getFacilityType();
    this.facilityLabelKey = `facilityType.${this.facilityType}`;
    this.lookupIdLabelKey = getFacilityConfig(
      this.facilityType as any
    ).lookupIdLabelKey;
    if (this.facilityType === 'health') {
      this.provideIdKey = 'searchSchool.provide-govt-id';
      this.placeholderIdKey = 'searchSchool.placeholder-govt-id';
    } else {
      this.provideIdKey = 'searchSchool.provide-school-id';
      this.placeholderIdKey = 'searchSchool.placeholder-school-id';
    }
  }

  /**
   * Search school by id
   */
  searchSchoolById() {
    if (this.schoolId) {
      // this.loading.present(this.loadingMsg, 3000, 'pdcaLoaderClass', 'null');
      this.schoolService.getById(this.schoolId).subscribe(
        (response) => {
          this.schoolData = response;
          console.log(this.schoolData);
        },
        (err) => {
          console.log('ERROR: ' + err);
          this.loading.dismiss();
          this.router.navigate(['schoolnotfound', this.schoolId]);
          /* Redirect to no result found page */
        },
        () => {
          this.loading.dismiss();
          if (this.schoolData.length > 0) {
            this.router.navigate([
              'schooldetails',
              this.schoolId,
              this.selectedCountry,
              this.detectedCountry,
            ]);
          } else {
            /* Redirect to no result found page */
            this.router.navigate([
              'schoolnotfound',
              this.schoolId,
              this.selectedCountry,
              this.detectedCountry,
            ]);
          }
        }
      );
    }
  }

  /**
   * Search school by id and country code
   */
  searchSchoolBySchooIdAndCountryCode() {
    if (this.schoolId && this.selectedCountry) {
      this.facilityService
        .lookup(this.facilityType as any, this.selectedCountry, this.schoolId)
        .subscribe(
          (facilities) => {
            this.schoolData = facilities;
            console.log(this.schoolData);
          },
          (err) => {
            console.log('ERROR: ' + err);
            this.loading.dismiss();
            this.router.navigate([
              'schoolnotfound',
              this.schoolId,
              this.selectedCountry,
              this.detectedCountry,
              this.selectedCountryName
            ]);
            /* Redirect to no result found page */
          },
          () => {
            this.loading.dismiss();
            if (this.schoolData.length > 0) {
              this.router.navigate([
                'schooldetails',
                this.schoolId,
                this.selectedCountry,
                this.detectedCountry,
                this.selectedCountryName
              ]);
            } else {
              /* Redirect to no result found page */
              this.router.navigate([
                'schoolnotfound',
                this.schoolId,
                this.selectedCountry,
                this.detectedCountry,
                this.selectedCountryName
              ]);
            }
          }
        );
    }
  }

  /**
   * Validate if the provided school id is provided and length
   * is greater than 4. Based on that search school button will be enabled
   *
   * @param schoolId
   */
  validateSchoolId(schoolId) {
    if (schoolId && schoolId.length >= 2) {
      this.isDisabled = false;
    } else {
      this.isDisabled = true;
    }
  }
}
