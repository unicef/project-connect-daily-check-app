import { Component, ViewChild } from '@angular/core';
import { IonAccordionGroup } from '@ionic/angular';
import { ActivatedRoute, Router } from '@angular/router';
import { SchoolService } from '../services/school.service';
import { LoadingService } from '../services/loading.service';
import { SettingsService } from '../services/settings.service';
import { TranslateService } from '@ngx-translate/core';
@Component({
  selector: 'app-schooldetails',
  templateUrl: 'schooldetails.page.html',
  styleUrls: ['schooldetails.page.scss'],
})
export class SchooldetailsPage {
  @ViewChild(IonAccordionGroup, { static: true })
  accordionGroup: IonAccordionGroup;
  schools: any;
  schoolId: any;
  selectedSchool: any;
  isDisabled = true;
  selectedCountry: any;
  detectedCountry: any;
  private sub: any;
  private loadingMsg =
    // eslint-disable-next-line max-len
    '<div class="loadContent"><ion-img src="assets/loader/loader.gif" class="loaderGif"></ion-img><p class="white" [translate]= "\'schoolDetails.search\'"></p></div>';
  constructor(
    private activatedroute: ActivatedRoute,
    public loading: LoadingService,
    private settingsService: SettingsService,
    private router: Router,
    private schoolService: SchoolService,
    private translate: TranslateService
  ) {
    this.sub = this.activatedroute.params.subscribe((params) => {
      this.schoolId = params.schoolId;
      this.selectedCountry = params.selectedCountry;
      this.detectedCountry = params.detectedCountry;
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
    this.loading.present(this.loadingMsg, 3000, 'pdcaLoaderClass', 'null');
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
  }

  /**
   * Search school by id and country code
   */
  searchSchoolBySchooIdAndCountryCode() {
    if (this.schoolId && this.selectedCountry) {
      this.loading.present(this.loadingMsg, 3000, 'pdcaLoaderClass', 'null');
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
            this.router.navigate([
              'schoolnotfound',
              this.schoolId,
              this.selectedCountry,
              this.detectedCountry,
            ]);
            /* Redirect to no result found page */
          },
          () => {
            this.loading.dismiss();
            if (this.schools.length > 0) {
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

  confirmSchool(schoolObj) {
    this.selectedSchool = schoolObj;
    this.router.navigate(
      [
        'confirmschool',
        this.selectedSchool.school_id,
        this.selectedCountry,
        this.detectedCountry,
      ],
      { state: this.selectedSchool }
    );
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
