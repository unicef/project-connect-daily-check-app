import { Component, ViewChild } from '@angular/core';
import { IonAccordionGroup } from '@ionic/angular';
import { ActivatedRoute, Router } from '@angular/router';
import { LoadingService } from '../services/loading.service';
import { TranslateService } from '@ngx-translate/core';
import { SettingsService } from '../services/settings.service';
import { IdentityService } from '../services/identity.service';

@Component({
    selector: 'app-invalidlocation',
    templateUrl: 'invalidlocation.page.html',
    styleUrls: ['invalidlocation.page.scss'],
    standalone: false
})
export class InvalidLocationPage {
  @ViewChild(IonAccordionGroup, { static: true })
  accordionGroup: IonAccordionGroup;
  schools: any;
  schoolId: any;
  selectedCountry: any;
  country: any;
  sub: any;
  facilityLabelKey = 'facilityType.school';
  constructor(
    private activatedroute: ActivatedRoute,
    public router: Router,
    public loading: LoadingService,
    private translate: TranslateService,
    private settingsService: SettingsService,
    private identityService: IdentityService
  ) {
    const appLang = this.settingsService.get('applicationLanguage');
    this.translate.use(appLang.code);
    this.facilityLabelKey = `facilityType.${this.identityService.getFacilityType()}`;
    this.sub = this.activatedroute.params.subscribe((params) => {
      this.schoolId = params.schoolId;
      this.selectedCountry = params.selectedCountry;
      this.country = params.country;
    });
  }
}
