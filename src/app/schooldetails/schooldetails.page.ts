import { Component, ViewChild } from '@angular/core';
import { IonAccordionGroup } from '@ionic/angular';
import { ActivatedRoute, Router } from '@angular/router';
import { SchoolService } from '../services/school.service';
import { LoadingService } from '../services/loading.service';
import { SettingsService } from '../services/settings.service';
import { TranslateService } from '@ngx-translate/core';
import { classifyRequestError } from '../schoolnotfound/types';
@Component({
  selector: 'app-schooldetails',
  templateUrl: 'schooldetails.page.html',
  styleUrls: ['schooldetails.page.scss'],
  standalone: false
})
export class SchooldetailsPage {
  @ViewChild(IonAccordionGroup, { static: true })
  accordionGroup: IonAccordionGroup;
  schools: any;
  schoolId: any;
  selectedSchool: any;
  isDisabled = true;
  selectedCountry: any;
  selectedCountryName: any;
  detectedCountry: any;
  /** The last search errored (as opposed to finding nothing). */
  private searchFailed = false;
  private sub: any;
  private translatedText = this.translate.instant('schoolDetails.searchSchool');

  private loadingMsg =
    // eslint-disable-next-line max-len
    `<div class="loadContent"><ion-img src="assets/loader/new_loader.gif" class="loaderGif"></ion-img><p class="green_loader">${this.translatedText}</p></div>`;
  constructor(
    private activatedroute: ActivatedRoute,
    public loading: LoadingService,
    private settingsService: SettingsService,
    private router: Router,
    private schoolService: SchoolService,
    private translate: TranslateService
  ) {
    const appLang = this.settingsService.get('applicationLanguage');
    this.translate.use(appLang.code);
    this.sub = this.activatedroute.params.subscribe((params) => {
      this.schoolId = params.schoolId;
      this.selectedCountry = params.selectedCountry;
      this.detectedCountry = params.detectedCountry;
      this.selectedCountryName = params.selectedCountryName
      this.selectedSchool = {};
      this.searchSchoolBySchooIdAndCountryCode();
      //this.searchSchoolById(this.schoolId);
    });
  }

  /**
   * Get school information by id
   *
   * @param id
   */
  searchSchoolById(id) {

    this.translate.get('schoolDetails.searchSchool').subscribe((translatedText) => {
      const loadingMsg = `
      <div class="loadContent">
        <ion-img src="assets/loader/new_loader.gif" class="loaderGif"></ion-img>
        <p class="green_loader">${translatedText}</p>
      </div>`;

      this.loading.present(loadingMsg, 15000, 'pdcaLoaderClass', 'null');
      this.schoolService.getById(id).subscribe(
        (response) => {
          this.schools = response;
        },
        (err) => {
          this.loading.dismiss();
        },
        () => {
          this.loading.dismiss();
        }
      );
    })

  }

  /**
   * Search school by id and country code
   */
  searchSchoolBySchooIdAndCountryCode() {
    if (this.schoolId && this.selectedCountry) {
      this.searchFailed = false;
      this.translate.get('schoolDetails.searchSchool').subscribe((translatedText) => {
        const loadingMsg = `
          <div class="loadContent">
            <ion-img src="assets/loader/new_loader.gif" class="loaderGif"></ion-img>
            <p class="green_loader">${translatedText}</p>
          </div>`;

        this.loading.present(loadingMsg, 15000, 'pdcaLoaderClass', 'null');
        this.schoolService
          .getBySchoolIdAndCountryCode(this.schoolId, this.selectedCountry)
          .subscribe(
            (response) => {
              this.schools = response;
              console.log(this.schools);
            },
            (err) => {
              console.log('ERROR: ' + err);
              this.loading.dismiss();
              this.searchFailed = true;
              /* The search itself failed: say why instead of "not found" */
              this.router.navigate(
                [
                  'schoolnotfound',
                  this.schoolId,
                  this.selectedCountry,
                  this.detectedCountry,
                  this.selectedCountryName
                ],
                { queryParams: { reason: classifyRequestError(err) } }
              );
            },
            () => {
              this.loading.dismiss();
              if (Array.isArray(this.schools) && this.schools.length > 0) {
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
      })

    }
  }

  /**
   * "Try again" on the error page goes back here. Ionic reuses this instance
   * and the route params have not changed, so re-run the search that failed.
   */
  ionViewWillEnter() {
    if (this.searchFailed) {
      this.searchSchoolBySchooIdAndCountryCode();
    }
  }

  confirmSchool(schoolObj) {
    this.selectedSchool = schoolObj;
    this.router.navigate(
      [
        'confirmschool',
        this.selectedSchool.school_id,
        this.selectedCountry,
        this.detectedCountry,
        this.selectedCountryName
      ],
      { state: this.selectedSchool }
    );
  }

  backToSearchDetail(schoolObj) {
    this.selectedSchool = schoolObj;
    this.router.navigate(
      [
        'searchschool',
        this.selectedCountry,
        this.detectedCountry,
        this.selectedCountryName
      ]);
  }

  schoolSelection(schoolObj) {
    this.selectedSchool = schoolObj;
  }

  validateSelectedSchool(gigaId) {
    console.log(gigaId);
    if (gigaId) {
      this.isDisabled = false;
    } else {
      this.isDisabled = true;
    }
  }

  openExternalUrl(href) {
    this.settingsService.getShell().shell.openExternal(href);
  }

  ngOnDestroy() {
    this.sub.unsubscribe();
  }
}
