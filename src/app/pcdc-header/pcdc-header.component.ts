import { Component, OnInit } from '@angular/core';
import { TranslateService } from '@ngx-translate/core';
import { environment as env } from '../../environments/environment';
import { SettingsService } from '../services/settings.service';

@Component({
  selector: 'app-pcdc-header',
  templateUrl: './pcdc-header.component.html',
  styleUrls: ['./pcdc-header.component.scss'],
})
export class PcdcHeaderComponent implements OnInit {
  languages = env.languages;
  selectedLanguage: string;
  selectedLanguageName: string;
  test = false;
  appName = env.appName;
  appNameSuffix = env.appNameSuffix;
  constructor(
    private translate: TranslateService,
    private settingsService: SettingsService
  ) {
    // Retrieve the selected language from local storage if it exists
    this.selectedLanguage =
      this.settingsService.get('applicationLanguage')?.code ||
      translate.defaultLang;
    this.selectedLanguageName = this.languages.find(
      (l) => l.code === this.selectedLanguage
    ).name;
    translate.use(this.selectedLanguage);
    this.test = env.mode === 'dev';
  }
  ngOnInit() { }
  onLanguageChange() {
    // Update local storage when the language changes
    this.settingsService.setSetting(
      'applicationLanguage',
      this.languages.find((l) => l.code === this.selectedLanguage)
    );
    this.selectedLanguageName = this.languages.find(
      (l) => l.code === this.selectedLanguage
    ).name;
    window.location.reload();
  }
  closeApp() {
    this.settingsService
      .getIpcRenderer()
      .ipcRenderer.send('closeFromUi', 'minimize');
  }
}
