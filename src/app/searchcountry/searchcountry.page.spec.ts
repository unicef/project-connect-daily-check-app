import { ComponentFixture, TestBed, waitForAsync } from '@angular/core/testing';
import { IonicModule } from '@ionic/angular';

import { SearchcountryPage } from './searchcountry.page';
import { provideHttpClient, withInterceptorsFromDi } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { Network } from '@awesome-cordova-plugins/network/ngx';
import { SettingsService } from '../services/settings.service';
import { TranslateModule } from '@ngx-translate/core';

describe('SearchcountryPage', () => {
  let component: SearchcountryPage;
  let fixture: ComponentFixture<SearchcountryPage>;

  beforeEach(waitForAsync(() => {
    TestBed.configureTestingModule({
      providers: [
        { provide: SettingsService, useValue: { get: () => ({ code: 'en' }), setSetting: () => {}, getFeatureFlags: async () => ({}), currentSettings: { scheduledTesting: false, scheduleInterval: 'daily' }, availableSettings: {} } },
        Network,provideHttpClient(withInterceptorsFromDi()), provideHttpClientTesting()],
      declarations: [ SearchcountryPage ],
      imports: [IonicModule.forRoot(), TranslateModule.forRoot()]
    }).compileComponents();

    fixture = TestBed.createComponent(SearchcountryPage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  }));

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
