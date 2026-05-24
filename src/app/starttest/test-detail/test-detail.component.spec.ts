import { ComponentFixture, TestBed } from '@angular/core/testing';
import { TestDetailComponent } from './test-detail.component';
import { StorageService } from 'src/app/services/storage.service';
import { HistoryService } from 'src/app/services/history.service';
import { CountryService } from 'src/app/services/country.service';
import { LocationService } from 'src/app/services/location.service';
import { SettingsService } from 'src/app/services/settings.service';
import { Router } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { of } from 'rxjs';

describe('TestDetailComponent', () => {
  let component: TestDetailComponent;
  let fixture: ComponentFixture<TestDetailComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [TestDetailComponent],
      imports: [TranslateModule.forRoot()],
      providers: [
        {
          provide: StorageService,
          useValue: {
            get: (key: string) =>
              key === 'schoolId'
                ? 'school-1'
                : key === 'schoolInfo'
                  ? JSON.stringify({ name: 'Test School', country: 'ES' })
                  : null,
          },
        },
        {
          provide: HistoryService,
          useValue: {
            get: () => ({
              measurements: [
                {
                  timestamp: 2000,
                  provider: 'cloudflare',
                  results: {
                    summary: { download: 10485760, upload: 2097152, latency: 22 },
                  },
                  serverInformation: { city: 'London' },
                  accessInformation: { org: 'BT' },
                  uploaded: false,
                  uuid: 'b',
                  version: 1,
                  Notes: 'manual',
                  dataUsage: {},
                },
                {
                  timestamp: 1000,
                  provider: 'mlab',
                  results: {
                    'NDTResult.S2C': {
                      LastClientMeasurement: { MeanClientMbps: 10 },
                      LastServerMeasurement: { BBRInfo: { MinRTT: 20000 } },
                    },
                    'NDTResult.C2S': {
                      LastClientMeasurement: { MeanClientMbps: 5 },
                      LastServerMeasurement: { BBRInfo: { MinRTT: 22000 } },
                    },
                  },
                  mlabInformation: { label: 'Madrid' },
                  accessInformation: { org: 'Telecom' },
                  uploaded: false,
                  uuid: 'a',
                  version: 1,
                  Notes: 'manual',
                  dataUsage: {},
                },
              ],
            }),
          },
        },
        {
          provide: CountryService,
          useValue: {
            getPcdcCountryByCode: () => of([{ name: 'Spain' }]),
          },
        },
        { provide: LocationService, useValue: { getSavedGeolocation: () => null } },
        {
          provide: SettingsService,
          useValue: { openExternalUrl: () => {} },
        },
        { provide: Router, useValue: { events: of() } },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(TestDetailComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should not render top ISP/server metadata block', () => {
    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('.horizontal-list')).toBeNull();
  });

  it('should sort by protocol when header clicked', () => {
    component.onSortColumn('protocol');
    expect(component.sortKey).toBe('protocol');
    expect(component.measurementsData[0].protocolLabel).toBe('Cloudflare');
    component.onSortColumn('protocol');
    expect(component.measurementsData[0].protocolLabel).toBe('M-Lab');
  });
});
