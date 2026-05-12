import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import {
  provideHttpClient,
  withInterceptorsFromDi,
} from '@angular/common/http';
import { UploadService } from './upload.service';
import { SettingsService } from '../services/settings.service';
import { StorageService } from './storage.service';
import { HardwareIdService } from './hardware-id.service';
import { IndexedDBService } from './indexed-db.service';
import { LocationService } from './location.service';
import { environment } from 'src/environments/environment';
import { MeasurementRecord } from './measurement.types';

describe('UploadService', () => {
  let service: UploadService;
  let httpMock: HttpTestingController;
  let settingsService: jasmine.SpyObj<SettingsService>;
  let storageService: jasmine.SpyObj<StorageService>;

  beforeEach(() => {
    settingsService = jasmine.createSpyObj('SettingsService', ['get'], {
      currentSettings: { uploadEnabled: true },
    });
    storageService = jasmine.createSpyObj('StorageService', ['get']);
    storageService.get.and.callFake((key: string) => {
      const values: Record<string, string> = {
        schoolUserId: 'browser-1',
        schoolId: 'school-1',
        gigaId: 'giga-1',
        deviceType: 'Win32',
      };
      return values[key] ?? '';
    });

    TestBed.configureTestingModule({
      providers: [
        UploadService,
        provideHttpClient(withInterceptorsFromDi()),
        provideHttpClientTesting(),
        { provide: SettingsService, useValue: settingsService },
        { provide: StorageService, useValue: storageService },
        {
          provide: HardwareIdService,
          useValue: { getHardwareId: () => 'hardware-1' },
        },
        { provide: IndexedDBService, useValue: {} },
        { provide: LocationService, useValue: {} },
      ],
    });

    service = TestBed.inject(UploadService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('posts Cloudflare measurements to the v1 protocol route', () => {
    const record: MeasurementRecord = {
      timestamp: 1778590959511,
      results: {
        summary: {
          download: 1000,
          upload: 200,
          latency: 50,
        },
      },
      uploaded: false,
      accessInformation: {
        ip: '79.116.96.172',
        country: 'ES',
      },
      uuid: '98914924-be94-4801-b04c-1bf9a40f4963',
      version: '2.0.3',
      Notes: 'manual',
      dataUsage: {
        download: 69000000,
        upload: 6800000,
        total: 75800000,
      },
      provider: 'cloudflare',
    };

    settingsService.get.and.returnValue('secret-key');

    service.uploadCloudflareMeasurement(record).subscribe();

    const request = httpMock.expectOne(
      `${environment.restAPI}measurements/cloudflare?key=secret-key`,
    );

    expect(request.request.method).toBe('POST');
    expect(request.request.body.uuid).toBe(record.uuid);
    expect(request.request.body.provider).toBe('cloudflare');
    expect(request.request.body.schoolID).toBe('school-1');
    expect(request.request.body.gigaIDSchool).toBe('giga-1');
    expect(request.request.body.deviceType).toBe('Win32');

    request.flush({ success: true });
  });
});
