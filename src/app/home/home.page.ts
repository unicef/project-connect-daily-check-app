import { Component, ViewChild } from '@angular/core';
import { TranslateService } from '@ngx-translate/core';
import { SettingsService } from '../../app/services/settings.service';
@Component({
  selector: 'app-home',
  templateUrl: 'home.page.html',
  styleUrls: ['home.page.scss'],
})
export class HomePage {
  constructor(public translate: TranslateService, private settingsService: SettingsService) {
    translate.setDefaultLang('en');
    let applicationLanguage = this.settingsService.get('applicationLanguage');
    if(applicationLanguage) {
      if( typeof applicationLanguage === 'string'){
        translate.setDefaultLang(applicationLanguage);
      } else {
        translate.setDefaultLang(applicationLanguage.code);
      }      
    }
  }

}
