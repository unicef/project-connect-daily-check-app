import { ComponentFixture, TestBed, waitForAsync } from '@angular/core/testing';
import { IonicModule } from '@ionic/angular';
import { RouterTestingModule } from "@angular/router/testing";
import { TranslateModule } from '@ngx-translate/core';
import { InvalidLocationPage } from './invalidlocation.page';
import { ActivatedRoute } from "@angular/router";
import { provideHttpClient, withInterceptorsFromDi } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { SettingsService } from '../services/settings.service';
describe('InvalidLocationPage', () => {
  let component: InvalidLocationPage;
  let fixture: ComponentFixture<InvalidLocationPage>;
  let activatedroute: ActivatedRoute; 

  beforeEach(waitForAsync(() => {
    TestBed.configureTestingModule({
      providers: [
        { provide: SettingsService, useValue: { get: () => ({ code: 'en' }), setSetting: () => {}, getFeatureFlags: async () => ({}), currentSettings: { scheduledTesting: false, scheduleInterval: 'daily' }, availableSettings: {} } },provideHttpClient(withInterceptorsFromDi()), provideHttpClientTesting()],
      declarations: [ InvalidLocationPage ],
      imports: [
        IonicModule.forRoot(), 
        RouterTestingModule, 
        TranslateModule.forRoot()
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(InvalidLocationPage);
    activatedroute = TestBed.inject(ActivatedRoute);
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
