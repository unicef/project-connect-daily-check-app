import { Component } from '@angular/core';
import { Router } from '@angular/router';
import { TranslateService } from '@ngx-translate/core';
import { environment } from 'src/environments/environment';
import { FACILITY_TYPES, FacilityType, FacilityTypeConfig } from '../models/facility';
import { SettingsService } from '../services/settings.service';
import { StorageService } from '../services/storage.service';

@Component({
  selector: 'app-select-facility',
  templateUrl: 'select-facility.page.html',
  styleUrls: ['select-facility.page.scss'],
  standalone: false,
})
export class SelectFacilityPage {
  appName = environment.appName;
  // Always the full static superset — availability is validated per COUNTRY
  // later in the flow (searchcountry shows the error when the selected
  // country doesn't support the chosen facility type).
  facilityTypes: FacilityTypeConfig[] = FACILITY_TYPES;

  constructor(
    private router: Router,
    private storage: StorageService,
    private settingsService: SettingsService,
    private translate: TranslateService
  ) {
    const appLang = this.settingsService.get('applicationLanguage');
    if (appLang) {
      this.translate.use(appLang.code);
    }
  }

  async selectFacility(type: FacilityType) {
    await this.storage.set('facilityType', type);
    this.router.navigate(['/register-school']);
  }
}
