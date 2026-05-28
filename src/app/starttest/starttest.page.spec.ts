import { ComponentFixture, TestBed } from '@angular/core/testing';
import { StarttestPage } from './starttest.page';
import { SettingsService } from '../services/settings.service';
import { HistoryService } from '../services/history.service';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { StorageService } from '../services/storage.service';
import { ActivatedRoute, Router } from '@angular/router';
import { of } from 'rxjs';
import { NO_ERRORS_SCHEMA } from '@angular/core';

describe('StarttestPage', () => {
  let component: StarttestPage;
  let fixture: ComponentFixture<StarttestPage>;

  const settingsSpy = jasmine.createSpyObj('SettingsService', [
    'get',
    'getProtocolConfig',
    'openExternalUrl',
  ]);
  settingsSpy.getProtocolConfig.and.resolveTo({
    measurementProvider: 'both',
    betweenTestsDelaySec: 5,
    configSource: 'default',
  });

  const historySpy = jasmine.createSpyObj('HistoryService', ['get']);
  historySpy.get.and.returnValue({ measurements: [] });

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [StarttestPage],
      imports: [TranslateModule.forRoot()],
      schemas: [NO_ERRORS_SCHEMA],
      providers: [
        { provide: SettingsService, useValue: settingsSpy },
        { provide: HistoryService, useValue: historySpy },
        {
          provide: StorageService,
          useValue: {
            get: (key: string) =>
              key === 'schoolId'
                ? 'school-1'
                : key === 'schoolInfo'
                  ? JSON.stringify({ name: 'Test', country: 'ES' })
                  : null,
            getFirstTimeVisit: () => false,
            isRecentRegistration: () => false,
          },
        },
        { provide: ActivatedRoute, useValue: { params: of({}) } },
        { provide: Router, useValue: { navigate: () => {} } },
        TranslateService,
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(StarttestPage);
    component = fixture.componentInstance;
    await component.loadProtocolConfig();
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should show both-provider segment when mode is both', () => {
    expect(component.showBothProviders).toBeTrue();
  });

  it('should return unified docs translation key', () => {
    component.selectedProvider = 'mlab';
    expect(component.getProviderDocsTranslationKey()).toBe(
      'startTest.aboutYourMeasurements'
    );
    component.selectedProvider = 'cloudflare';
    expect(component.getProviderDocsTranslationKey()).toBe(
      'startTest.aboutYourMeasurements'
    );
  });
});
