import { ComponentFixture, TestBed, waitForAsync } from '@angular/core/testing';
import { IonicModule } from '@ionic/angular';
import { RouterTestingModule } from '@angular/router/testing';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideHttpClient, withInterceptorsFromDi } from '@angular/common/http';
import { TranslateModule } from '@ngx-translate/core';
import { ConfirmschoolPage } from './confirmschool.page';
import { DatePipe } from '@angular/common';
import { Network } from '@awesome-cordova-plugins/network/ngx';
import { SettingsService } from '../services/settings.service';

describe('ConfirmschoolPage', () => {
  let component: ConfirmschoolPage;
  let fixture: ComponentFixture<ConfirmschoolPage>;

  beforeEach(waitForAsync(() => {
    TestBed.configureTestingModule({
    declarations: [ConfirmschoolPage],
    imports: [IonicModule.forRoot(),
        RouterTestingModule,
        TranslateModule.forRoot()],
    providers: [
        { provide: SettingsService, useValue: { get: () => ({ code: 'en' }), setSetting: () => {}, getFeatureFlags: async () => ({}), currentSettings: { scheduledTesting: false, scheduleInterval: 'daily' }, availableSettings: {} } },
        Network,
        DatePipe,
        provideHttpClient(withInterceptorsFromDi()),
        provideHttpClientTesting()
    ]
}).compileComponents();

    fixture = TestBed.createComponent(ConfirmschoolPage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  }));

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  afterEach(() => {
    TestBed.resetTestingModule();
  });
});
