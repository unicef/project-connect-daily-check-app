import { Component, ViewChild } from '@angular/core';
import { TranslateService } from '@ngx-translate/core';
import { Router } from "@angular/router";
import { StorageService } from '../services/storage.service';
import { SettingsService } from '../../app/services/settings.service';

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
    private storage: StorageService
  ) {
    translate.setDefaultLang('en');
    let applicationLanguage = this.settingsService.get('applicationLanguage');
    if(applicationLanguage) {
      if( typeof applicationLanguage === 'string'){
        translate.setDefaultLang(applicationLanguage);
      } else {
        translate.setDefaultLang(applicationLanguage.code);
      }      
    }
    if(this.storage.get('schoolId')){
      this.router.navigate(['/starttest']);
    }
  }

  openExternalUrl(href){
    this.settingsService.getShell().shell.openExternal(href);
  }
}
