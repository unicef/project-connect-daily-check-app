import { Component, OnInit } from '@angular/core';
import { TranslateService } from '@ngx-translate/core';
import { environment as env } from '../../environments/environment';
import { SettingsService } from '../services/settings.service';
import { MenuController } from '@ionic/angular';
import { Capacitor } from '@capacitor/core';

@Component({
  selector: 'app-pcdc-header',
  templateUrl: './pcdc-header.component.html',
  styleUrls: ['./pcdc-header.component.scss'],
  standalone: false,
})
export class PcdcHeaderComponent implements OnInit {
  languages = env?.languages ?? [];
  selectedLanguage: string;
  selectedLanguageName: string;
  test = false;
  appName = env?.appName ?? '';
  appNameSuffix = env?.appNameSuffix ?? '';
  isNative: boolean;
  constructor(
    private translate: TranslateService,
    private settingsService: SettingsService,
    private menuCtrl: MenuController,
  ) {
    // Retrieve the selected language from local storage if it exists
    this.selectedLanguage =
      this.settingsService.get('applicationLanguage')?.code ??
      translate.defaultLang;
    this.selectedLanguageName =
      this.languages.find((l) => l?.code === this.selectedLanguage)?.label ??
      '';
    translate.use(this.selectedLanguage);
    this.test = env?.mode === 'dev';
    this.isNative = Capacitor.getPlatform() === 'android';
  }

  isNativeApp(): boolean {
    return Capacitor.getPlatform() === 'android';
  }
  ngOnInit() {}
  onLanguageChange() {
    this.menuCtrl.enable(true, 'third'); // Ensure the menu is enabled
    this.menuCtrl.open('third');
    // Update local storage when the language changes
    // this.settingsService.setSetting(
    //   'applicationLanguage',
    //   this.languages.find((l) => l?.code === this.selectedLanguage)
    // );
    // this.selectedLanguageName = this.languages.find(
    //   (l) => l?.code === this.selectedLanguage
    // )?.name ?? '';
    // window.location.reload();
  }
  closeApp() {
    this.settingsService.getIpcRenderer().send('closeFromUi', 'minimize');
  }

  openMenu(menuId: string) {
    this.menuCtrl.enable(true, menuId);

    this.menuCtrl.open(menuId);
  }
}
