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
import { removeUnregisterSchool } from './home.utils';

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
    private loading: LoadingService
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
    this.loading.present(loadingMsg, 6000, 'pdcaLoaderClass', 'null');
    const schoolId = this.storage.get('schoolId');

    if (!isNaN(schoolId)) {
      removeUnregisterSchool(
        schoolId,
        schoolService,
        storage,
        settingsService
      ).then((response) => {
        if (response) {
          loading.dismiss();
          this.router.navigate(['/starttest']);
        } else {
          loading.dismiss();
          this.router.navigate([
            'schoolnotfound',
            schoolId,
            0,
            0,
            NotFound.notRegister,
          ]);
        }
      });
    }
  }

  openExternalUrl(href) {
    this.settingsService.getShell().shell.openExternal(href);
  }
}
