import { Component, ViewChild } from '@angular/core';
import { IonAccordionGroup } from '@ionic/angular';
import { Router, NavigationExtras, ActivatedRoute } from '@angular/router';
import { SchoolService } from '../services/school.service';
import { LoadingService } from '../services/loading.service';
import { SettingsService } from '../services/settings.service';
import { TranslateService } from '@ngx-translate/core';
import { environment } from 'src/environments/environment';
import { LocationService } from '../services/location.service';
import { StorageService } from '../services/storage.service';
import { GeocodeResponse } from '../services/dto/response.dto';

@Component({
  selector: 'app-searchschool',
  templateUrl: 'searchschool.page.html',
  styleUrls: ['searchschool.page.scss'],
  standalone: false,
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

  constructor(
    private router: Router,
    private activatedroute: ActivatedRoute,
    private translate: TranslateService,
    private routeParams: ActivatedRoute,
    private schoolService: SchoolService,
    private settingsService: SettingsService,
    public loading: LoadingService,
    private locationService: LocationService,
    private storage: StorageService,
  ) {
    const appLang = this.settingsService.get('applicationLanguage');
    this.translate.use(appLang.code);
    this.sub = this.activatedroute.params.subscribe((params) => {
      this.selectedCountry = params.selectedCountry;
      this.detectedCountry = params.detectedCountry;
      this.selectedCountryName = params.selectedCountryName;
    });
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
        async (err) => {
          console.log('ERROR: ' + err);
          this.loading.dismiss();
          await this.handleSchoolNotFound(['schoolnotfound', this.schoolId]);
          /* Redirect to no result found page */
        },
        async () => {
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
            await this.handleSchoolNotFound([
              'schoolnotfound',
              this.schoolId,
              this.selectedCountry,
              this.detectedCountry,
            ]);
          }
        },
      );
    }
  }

  /**
   * Search school by id and country code
   */
  searchSchoolBySchooIdAndCountryCode() {
    if (this.schoolId && this.selectedCountry) {
      const loadingMsg =
        // eslint-disable-next-line max-len
        //   '<div class="loadContent"><ion-img src="assets/loader/new_loader.gif" class="loaderGif"></ion-img><p class="green_loader">Searching School IDs</p></div>';
        // this.loading.present(loadingMsg, 40000000, 'pdcaLoaderClass', 'null');
        this.schoolService
          .getBySchoolIdAndCountryCode(this.schoolId, this.selectedCountry)
          .subscribe(
            (response) => {
              this.schoolData = response;
              console.log(this.schoolData);
            },
            async (err) => {
              console.log('ERROR: ' + err);
              await this.handleSchoolNotFound([
                'schoolnotfound',
                this.schoolId,
                this.selectedCountry,
                this.detectedCountry,
                this.selectedCountryName,
              ]);
              /* Redirect to no result found page */
            },
            async () => {
              if (this.schoolData.length > 0) {
                this.router.navigate([
                  'schooldetails',
                  this.schoolId,
                  this.selectedCountry,
                  this.detectedCountry,
                  this.selectedCountryName,
                ]);
              } else {
                /* Redirect to no result found page */
                await this.handleSchoolNotFound([
                  'schoolnotfound',
                  this.schoolId,
                  this.selectedCountry,
                  this.detectedCountry,
                  this.selectedCountryName,
                ]);
              }
            },
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

  /**
   * Gets location info and redirects to provided navigation params
   */
  async handleSchoolNotFound(navigationParams: any[]) {
    this.loading.present();
    const response: GeocodeResponse = await new Promise((resolve) => {
      this.locationService.getCurrentAddress(false).subscribe({
        next: (res: GeocodeResponse) => {
          resolve(res);
        },
        error: () => {
          resolve(null as any);
        },
      });
    });

    if (response) {
      const data: any = JSON.parse(JSON.stringify(response));
      this.storage.set('locationInfo', JSON.stringify(data));
    }
    this.loading.dismiss();
    this.router.navigate(navigationParams);
  }
}
