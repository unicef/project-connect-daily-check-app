import { Component, OnInit } from '@angular/core';
import { TranslateService } from '@ngx-translate/core';
import { environment } from 'src/environments/_environment.prod';
import { SettingsService } from '../services/settings.service';

@Component({
  selector: 'app-pcdc-header',
  templateUrl: './pcdc-header.component.html',
  styleUrls: ['./pcdc-header.component.scss'],
})
export class PcdcHeaderComponent implements OnInit {
  languages = environment.languages;
  selectedLanguage: string;
  constructor(
    private translate: TranslateService,
    private settingsService: SettingsService
  ) {
    // Retrieve the selected language from local storage if it exists
    this.selectedLanguage =
      this.settingsService.get('applicationLanguage')?.code ||
      translate.defaultLang;
    translate.use(this.selectedLanguage);
  }
  ngOnInit() {}
  onLanguageChange() {
    // Update local storage when the language changes
    this.settingsService.setSetting(
      'applicationLanguage',
      this.languages.find((l) => l.code === this.selectedLanguage)
    );
    window.location.reload();
  }
  closeApp() {
    this.settingsService
      .getIpcRenderer()
      .ipcRenderer.send('closeFromUi', 'minimize');
  }
}
