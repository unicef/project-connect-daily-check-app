import { ComponentFixture, TestBed, waitForAsync } from '@angular/core/testing';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { IonicModule } from '@ionic/angular';
import { RouterTestingModule } from "@angular/router/testing";
import { TranslateModule } from '@ngx-translate/core';
import { SchooldetailsPage } from './schooldetails.page';
import { provideHttpClient, withInterceptorsFromDi } from '@angular/common/http';
import { SettingsService } from '../services/settings.service';

describe('SchooldetailsPage', () => {
  let component: SchooldetailsPage;
  let fixture: ComponentFixture<SchooldetailsPage>;

  beforeEach(waitForAsync(() => {
    TestBed.configureTestingModule({
    declarations: [SchooldetailsPage],
    imports: [IonicModule.forRoot(),
        RouterTestingModule,
        TranslateModule.forRoot()],
    providers: [
        { provide: SettingsService, useValue: { get: () => ({ code: 'en' }), setSetting: () => {}, getFeatureFlags: async () => ({}), currentSettings: { scheduledTesting: false, scheduleInterval: 'daily' }, availableSettings: {} } },provideHttpClient(withInterceptorsFromDi()), provideHttpClientTesting()]
}).compileComponents();

    fixture = TestBed.createComponent(SchooldetailsPage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  }));

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
