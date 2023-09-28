import { Component } from '@angular/core';
import { MenuController } from '@ionic/angular';
import { TranslateService } from '@ngx-translate/core';
import { StorageService } from '../app/services/storage.service';
import { SettingsService } from './services/settings.service';
import { SharedService } from './services/shared-service.service';
import { HistoryService } from './services/history.service';
import { ScheduleService } from './services/schedule.service';
import { environment } from '../environments/environment' // './esrc/environments/environment';

// const shell = require('electron').shell;
@Component({
  selector: 'app-root',
  templateUrl: 'app.component.html',
  styleUrls: ['app.component.scss'],
})
export class AppComponent {
  school:any;
  historyState: any;
  availableSettings: any;
  scheduleSemaphore: any;
  app_version: any;
  constructor(
    private menu:MenuController,
    private storage: StorageService,
    public translate: TranslateService,
    private sharedService: SharedService,
    private historyService: HistoryService,
    private settingsService: SettingsService,
    private scheduleService: ScheduleService
  ) {
      translate.setDefaultLang('en');
      this.app_version = environment.app_version;
      if(this.storage.get('schoolId')){
        this.school = JSON.parse(this.storage.get('schoolInfo'));
      }
      this.sharedService.on('settings:changed', (nameValue: { name: string; value: { code: string; } })=>{
        if (nameValue.name == 'applicationLanguage') {
          translate.use(nameValue.value.code);
        }
      });

      this.settingsService.setSetting('scheduledTesting', this.settingsService.currentSettings.scheduledTesting);
      this.settingsService.setSetting('scheduleInterval', this.settingsService.currentSettings.scheduleInterval);
      this.availableSettings = this.settingsService.availableSettings;
      if(this.settingsService.currentSettings.scheduledTesting) {
        this.refreshSchedule();
      }
      this.sharedService.on('semaphore:refresh',this.refreshSchedule.bind(this));
      
      this.sharedService.on("history:measurement:change", this.refreshHistory.bind(this));
      this.refreshHistory();
      if(this.storage.get('schoolId')){
        setInterval(() => {
          this.scheduleService.initiate(); 
        }, 60000);
      }
  }

  openSecond() {
    if(this.storage.get('schoolId')){
      this.school = JSON.parse(this.storage.get('schoolInfo'));
    }
    this.menu.enable(true, 'second');
    this.menu.open('second');
  }

  openThird() {
    this.menu.enable(true, 'third');
    this.menu.open('third');
  }

  openFourth() {
    this.menu.enable(true, 'fourth');
    this.menu.open('fourth');
  }

  closeMenu() {
    this.menu.enable(true, 'first');
    this.menu.close();
  }

  backMenu() {
    this.closeMenu();
    this.menu.enable(true, 'first');
    this.menu.open('first');
  }

  refreshHistory() {
    let data = this.historyService.get();
    let dataConsumed = data.measurements.reduce(function(p: any,c: { results: { [x: string]: any; }; }) { 
      return p + c.results['receivedBytes']; 
    }, 0);
    this.historyState = { "dataConsumed": dataConsumed };
  }

  refreshSchedule() {
    this.scheduleSemaphore = this.scheduleService.getSemaphore();
  }

  openExternalUrl(href){
    this.settingsService.getShell().shell.openExternal(href);
  }
}
