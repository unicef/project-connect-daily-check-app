import { Component } from '@angular/core';
import { Router } from '@angular/router';
import { TranslateService } from '@ngx-translate/core';
import { SettingsService } from '../../app/services/settings.service';
import { NotFound } from '../schoolnotfound/types';
import { LoadingService } from '../services/loading.service';
import { SchoolService } from '../services/school.service';
import { StorageService } from '../services/storage.service';
import { checkRightGigaId, removeUnregisterSchool, updateFeaturesFlags } from './home.utils';

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
    private loading: LoadingService,
    private schoolService: SchoolService
  ) {
    translate.setDefaultLang('en');
    const applicationLanguage = this.settingsService.get('applicationLanguage');
    if (!applicationLanguage) {
      this.settingsService.setSetting('applicationLanguage', {
        code: 'en',
        name: 'English',
      });
    }
    if (applicationLanguage) {
      if (typeof applicationLanguage === 'string') {
        translate.setDefaultLang(applicationLanguage);
      } else {
        translate.setDefaultLang(applicationLanguage.code);
      }
    }
    const loadingMsg =
      // eslint-disable-next-line max-len
      '<div class="loadContent"><ion-img src="assets/loader/loader.gif" class="loaderGif"></ion-img><p class="white" [translate]="\'loading\'">Loading...</p></div>';
    this.loading.present(loadingMsg, 6000, 'pdcaLoaderClass', 'null');
    if (this.storage.get('schoolId')) {
      let schoolId = this.storage.get('schoolId');
      const gigaId = this.storage.get('gigaId');
      const schoolUserId = this.storage.get('schoolUserId');

      try {
        updateFeaturesFlags(gigaId, schoolUserId, this.storage, this.schoolService)
        // check if the gigaId is correct
        checkRightGigaId(
          this.storage.get('gigaId'),
          schoolService,
          storage
        ).then((res) => {
          schoolId = this.storage.get('schoolId');
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
        });
      } catch (e) {
        console.log(e);
        this.router.navigate(['/starttest']);
        this.loading.dismiss();
      }
    } else {
      this.loading.dismiss();
    }
  }

  openExternalUrl(href) {
    this.settingsService.getShell().shell.openExternal(href);
  }
}
