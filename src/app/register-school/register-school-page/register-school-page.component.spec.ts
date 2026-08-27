import { ComponentFixture, TestBed, waitForAsync } from '@angular/core/testing';
import { IonicModule } from '@ionic/angular';

import { RegisterSchoolPageComponent } from './register-school-page.component';
import { provideHttpClient, withInterceptorsFromDi } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { SettingsService } from '../../services/settings.service';
import { TranslateModule } from '@ngx-translate/core';

describe('RegisterSchoolPageComponent', () => {
  let component: RegisterSchoolPageComponent;
  let fixture: ComponentFixture<RegisterSchoolPageComponent>;

  beforeEach(waitForAsync(() => {
    TestBed.configureTestingModule({
      providers: [
        { provide: SettingsService, useValue: { get: () => ({ code: 'en' }), setSetting: () => {}, getFeatureFlags: async () => ({}), currentSettings: { scheduledTesting: false, scheduleInterval: 'daily' }, availableSettings: {} } },provideHttpClient(withInterceptorsFromDi()), provideHttpClientTesting()],
      declarations: [ RegisterSchoolPageComponent ],
      imports: [IonicModule.forRoot(), TranslateModule.forRoot()]
    }).compileComponents();

    fixture = TestBed.createComponent(RegisterSchoolPageComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  }));

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
