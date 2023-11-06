import { Component, ViewChild } from '@angular/core';
import { TranslateService } from '@ngx-translate/core';
import { Router } from '@angular/router';
import { StorageService } from '../services/storage.service';
import { SettingsService } from '../../app/services/settings.service';
import { SchoolService } from '../services/school.service';
import { LoadingService } from '../services/loading.service';
import { timedFunction } from '../utils/timedFunction.utils';
import { ResponseDto } from '../services/dto/response.dto';
import { WrongGigaIdSchool } from '../services/dto/school.dto';
import { checkRightGigaId } from './home.utils';

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
    if (this.storage.get('schoolId')) {
      try {
        // check if the gigaId is correct
        checkRightGigaId(
          this.storage.get('schoolId'),
          schoolService,
          storage
        ).then((res) => {
          this.router.navigate(['/starttest']);
          this.loading.dismiss();
        });
      } catch (e) {
        console.log(e);
        this.router.navigate(['/starttest']);
        this.loading.dismiss();
      }
    }
  }

  openExternalUrl(href) {
    this.settingsService.getShell().shell.openExternal(href);
  }
}
