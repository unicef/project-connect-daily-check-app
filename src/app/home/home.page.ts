import { Component, ViewChild } from '@angular/core';
import { TranslateService } from '@ngx-translate/core';
import { Router } from '@angular/router';
import { StorageService } from '../services/storage.service';
import { SettingsService } from '../../app/services/settings.service';
import { LoadingService } from '../services/loading.service';
import { SchoolService } from '../services/school.service';
import { ScheduleService } from '../services/schedule.service';
import { School } from '../models/models';
import { NotFound } from '../schoolnotfound/types';

@Component({
  selector: 'app-home',
  templateUrl: 'home.page.html',
  styleUrls: ['home.page.scss'],
})
export class HomePage {
  constructor(
    public router: Router,
    public translate: TranslateService,
    private settingsService: SettingsService,
    private storage: StorageService,
    private schoolService: SchoolService,
    private loading: LoadingService,
    private scheduleService: ScheduleService
  ) {
    translate.setDefaultLang('en');
    const applicationLanguage = this.settingsService.get('applicationLanguage');
    if (applicationLanguage) {
      if (typeof applicationLanguage === 'string') {
        translate.setDefaultLang(applicationLanguage);
      } else {
        translate.setDefaultLang(applicationLanguage.code);
      }
    }
    const loadingMsg =
      '<div class="loadContent"><ion-img src="assets/loader/loader.gif" class="loaderGif"></ion-img><p class="white">Loading...</p></div>';
    const schoolId = this.storage.get('schoolId');
    const school = JSON.parse(this.storage.get('schoolInfo')) as School;
    console.log({ schoolId });
    if (schoolId) {
      this.loading.present(loadingMsg, 4000, 'pdcaLoaderClass', 'null');
      schoolService.getById(schoolId).subscribe(
        (response) => {
          console.log(response);
          const schoolResponse = response.filter(
            (x) => x.country === school.country
          );
          console.log({ schoolResponse });
          if (schoolResponse.length > 0) {
            this.storage.set('schoolInfo', JSON.stringify(response[0]));
            setInterval(() => {
              this.scheduleService.initiate();
            }, 60000);
            this.router.navigate(['/starttest']);
          } else {
            this.storage.set('schoolInfo', null);
            console.log('School not found');
            this.router.navigate([
              'schoolnotfound',
              schoolId,
              0,
              0,
              NotFound.notRegister,
            ]);
            this.storage.set('schoolId', null);
          }
          this.loading.dismiss();
        },
        (err) => {
          console.log(err);
          this.loading.dismiss();
        }
      );
    }
  }

  openExternalUrl(href) {
    this.settingsService.getShell().shell.openExternal(href);
  }
}
