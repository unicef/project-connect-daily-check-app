import { Component, ViewChild } from '@angular/core';
import { IonAccordionGroup } from '@ionic/angular';
import { ActivatedRoute, Router } from '@angular/router';
import { LoadingService } from '../services/loading.service';
import { NotFound } from './types';
import { TranslateService } from '@ngx-translate/core';
import { SettingsService } from '../services/settings.service';
import { environment } from 'src/environments/environment';

@Component({
  selector: 'app-schoolnotfound',
  templateUrl: 'schoolnotfound.page.html',
  styleUrls: ['schoolnotfound.page.scss'],
})
export class SchoolnotfoundPage {
  @ViewChild(IonAccordionGroup, { static: true })
  accordionGroup: IonAccordionGroup;
  schools: any;
  schoolId: any;
  sub: any;
  selectedCountry: any;
  detectedCountry: any;
  notFound = true;
  appName = environment.appName;
  constructor(
    private activatedroute: ActivatedRoute,
    public router: Router,
    public loading: LoadingService,
    private translate: TranslateService,
    private settingsService: SettingsService
  ) {
    const appLang = this.settingsService.get('applicationLanguage');
    this.translate.use(appLang.code);

    this.sub = this.activatedroute.params.subscribe((params) => {
      this.notFound = params.notFound === NotFound.notRegister ? false : true;
    });
    this.sub = this.activatedroute.params.subscribe((params) => {
      this.schoolId = params.schoolId;
      this.selectedCountry = params.selectedCountry;
      this.detectedCountry = params.detectedCountry;
      console.log(this.selectedCountry);
    });
  }
}
