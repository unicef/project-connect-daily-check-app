import { Component, ViewChild } from '@angular/core';
import { TranslateService } from '@ngx-translate/core';
import { Router } from '@angular/router';
import { StorageService } from '../services/storage.service';
import { SettingsService } from '../../app/services/settings.service';
import { SchoolService } from '../services/school.service';
import { LoadingService } from '../services/loading.service';

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
    let applicationLanguage = this.settingsService.get('applicationLanguage');
    if (applicationLanguage) {
      if (typeof applicationLanguage === 'string') {
        translate.setDefaultLang(applicationLanguage);
      } else {
        translate.setDefaultLang(applicationLanguage.code);
      }
    }
    const loadingMsg =
      '<div class="loadContent"><ion-img src="assets/loader/loader.gif" class="loaderGif"></ion-img><p class="white">Loading...</p></div>';
    this.loading.present(loadingMsg, 4000, 'pdcaLoaderClass', 'null');
    if (this.storage.get('schoolId')) {
      try {
        schoolService
          .checkRightGigaId(this.storage.get('gigaId'))
          .subscribe((res) => {
            console.log({ checkRightGigaId: res });
            if (res && res.success) {
              const gigaCorrectId = res.data[0].correct_giga_id;
              const schoolCorrectId = res.data[0].correct_school_id;
              schoolService
                .getById(parseInt(schoolCorrectId, 10))
                .subscribe((response) => {
                  const schools = response.filter(
                    (s) => (s as any).giga_id_school === gigaCorrectId
                  );
                  if (schools.length > 0) {
                    this.storage.set('schoolId', schoolCorrectId);
                    this.storage.set('gigaId', gigaCorrectId);
                    console.log({ rigthGigaId: this.storage.get('gigaId') });
                    this.storage.set('country_code', schools[0].code);
                    this.storage.set('schoolInfo', JSON.stringify(schools[0]));
                  }
                });
              this.router.navigate(['/starttest']);
              this.loading.dismiss();
            } else {
              this.router.navigate(['/starttest']);
              this.loading.dismiss();
            }
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
