import { ComponentFixture, TestBed, waitForAsync } from '@angular/core/testing';
import { IonicModule } from '@ionic/angular';
import { SchoolsuccessPage } from './schoolsuccess.page';
import { RouterTestingModule } from "@angular/router/testing";
import { provideHttpClient, withInterceptorsFromDi } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { TranslateModule } from '@ngx-translate/core';
import { SettingsService } from '../services/settings.service';
import { Network } from '@awesome-cordova-plugins/network/ngx';
describe('SchoolsuccessPage', () => {
  let component: SchoolsuccessPage;
  let fixture: ComponentFixture<SchoolsuccessPage>;

  beforeEach(waitForAsync(() => {
    TestBed.configureTestingModule({
      providers: [
        Network,
        { provide: SettingsService, useValue: { get: () => ({ code: 'en' }), setSetting: () => {}, getFeatureFlags: async () => ({}), currentSettings: { scheduledTesting: false, scheduleInterval: 'daily' }, availableSettings: {} } },provideHttpClient(withInterceptorsFromDi()), provideHttpClientTesting()],
      declarations: [ SchoolsuccessPage ],
      imports: [TranslateModule.forRoot(), IonicModule.forRoot(), RouterTestingModule]
    }).compileComponents();

    fixture = TestBed.createComponent(SchoolsuccessPage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  }));

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
