import { Component, OnInit } from '@angular/core';
import { TranslateService } from '@ngx-translate/core';
import { environment } from 'src/environments/_environment.prod';
import { SettingsService } from '../services/settings.service';
import { Language } from '../services/settings/types';

@Component({
  selector: 'app-pcdc-header',
  templateUrl: './pcdc-header.component.html',
  styleUrls: ['./pcdc-header.component.scss'],
})
export class PcdcHeaderComponent implements OnInit {
  languages: Language[];
  selectedLanguage: string;
  constructor(
    private translate: TranslateService,
    private settingsService: SettingsService
  ) {
    this.languages = this.settingsService.get('applicationLanguage').options;
    // Retrieve the selected language from local storage if it exists
    this.selectedLanguage =
      this.settingsService.get('applicationLanguage')?.code ||
      translate.defaultLang;
    translate.use(this.selectedLanguage);
  }
  ngOnInit() { }
  onLanguageChange() {
    const currentLanguageObj = this.settingsService.get('applicationLanguage');
    const newLanguage = this.languages.find((l) => l.code === this.selectedLanguage);
    // Update local storage when the language changes
    this.settingsService.setSetting(
      'applicationLanguage',
      {
        ...currentLanguageObj,
        ...newLanguage
      }

    );
    window.location.reload();
  }
  closeApp() {
    this.settingsService
      .getIpcRenderer()
      .ipcRenderer.send('closeFromUi', 'minimize');
  }
}
