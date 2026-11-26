import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { HttpErrorResponse, provideHttpClient, withInterceptorsFromDi } from '@angular/common/http';
import { RouterTestingModule } from '@angular/router/testing';
import { SchoolService } from './school.service';

describe('SchoolService', () => {
  let service: SchoolService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
    imports: [RouterTestingModule],
    providers: [provideHttpClient(withInterceptorsFromDi()), provideHttpClientTesting()]
});
    service = TestBed.inject(SchoolService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  describe('device ID (the analytics person)', () => {
    const DEVICE_ID = '7d0f5c1e-3a52-4f7e-9a0c-2b9f1f6d4e21';

    beforeEach(() => localStorage.removeItem('device_id'));
    afterEach(() => {
      httpMock.verify();
      localStorage.removeItem('device_id');
    });

    it('remembers the device ID a registration returns', () => {
      let userId: unknown;
      service.registerSchoolDevice({}).subscribe((id) => (userId = id));
      httpMock
        .expectOne((r) => r.url.endsWith('dailycheckapp_schools'))
        .flush({ data: { user_id: 'user-1', device_id: DEVICE_ID } });

      expect(userId).toBe('user-1');
      expect(localStorage.getItem('device_id')).toBe(DEVICE_ID);
    });

    it('remembers the device ID from the status check at startup', () => {
      service.checkDeviceStatus('hw-1', 'giga-1').subscribe();
      const request = httpMock.expectOne((r) =>
        r.url.includes('checkDeviceStatus')
      );
      expect(
        request.request.url.endsWith('checkDeviceStatus/hw-1/giga-1')
      ).toBeTrue();
      request.flush({
        data: { exists: true, is_active: true, device_id: DEVICE_ID },
      });

      expect(localStorage.getItem('device_id')).toBe(DEVICE_ID);
    });

    it("asks for this app instance's own device ID when it has an ID", () => {
      service
        .checkDeviceStatus('hw-1', 'giga-1', '3f2b8c1a-6d4e-4f7a-9b2c-1e5d8a7f6c3b')
        .subscribe();
      const request = httpMock.expectOne((r) =>
        r.url.includes('checkDeviceStatus')
      );
      expect(
        request.request.url.endsWith(
          'checkDeviceStatus/hw-1/giga-1?app_instance_id=3f2b8c1a-6d4e-4f7a-9b2c-1e5d8a7f6c3b'
        )
      ).toBeTrue();
      request.flush({
        data: { exists: true, is_active: true, device_id: DEVICE_ID },
      });

      expect(localStorage.getItem('device_id')).toBe(DEVICE_ID);
    });

    it('ignores the device ID of a deactivated installation', () => {
      service.checkDeviceStatus('hw-1', 'giga-1').subscribe();
      httpMock
        .expectOne((r) => r.url.includes('checkDeviceStatus'))
        .flush({ data: { exists: true, is_active: false, device_id: DEVICE_ID } });

      expect(localStorage.getItem('device_id')).toBeNull();
    });

    it("doesn't take a device ID from the PC's registration found by hardware ID", () => {
      // It can be another PC's (a shared firmware UUID): the app registers
      // this app instance next, and takes the device ID from that.
      service.checkRegistrationByHardwareId('hw-1').subscribe();
      httpMock
        .expectOne((r) => r.url.includes('checkExistingInstallation'))
        .flush({ data: { exists: true, user_id: 'user-1', device_id: DEVICE_ID } });

      expect(localStorage.getItem('device_id')).toBeNull();
    });
  });
});
