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
  describe('device ID calls (TECH-8828)', () => {
    afterEach(() => httpMock.verify());

    it('posts an automatic registration', () => {
      const body = { device_hardware_id: 'UUID-1', disk_serial: 'DISK-1' };
      service.autoRegister(body).subscribe();

      const req = httpMock.expectOne((r) =>
        r.url.endsWith('dailycheckapp_schools/autoRegister')
      );
      expect(req.request.method).toBe('POST');
      expect(req.request.body).toEqual(body);
      req.flush({ success: true, data: { exists: false } });
    });

    it("asks about the app's own registration", () => {
      service.checkRegistrationStatus('MY-REGISTRATION').subscribe();

      const req = httpMock.expectOne((r) =>
        r.url.endsWith(
          'dailycheckapp_schools/checkRegistrationStatus/MY-REGISTRATION'
        )
      );
      expect(req.request.method).toBe('GET');
      req.flush({ success: true, data: { is_active: true } });
    });

    it('logs out its own registration when it has one', () => {
      service.deactivateDevice('UUID-1', 'giga-9', 'MY-REGISTRATION').subscribe();

      const req = httpMock.expectOne((r) =>
        r.url.endsWith('dailycheckapp_schools/deactivate')
      );
      expect(req.request.body).toEqual({
        device_hardware_id: 'UUID-1',
        giga_id_school: 'giga-9',
        user_id: 'MY-REGISTRATION',
      });
      req.flush({ success: true, data: { deactivated: true } });
    });

    it('logs out by hardware ID alone without one', () => {
      service.deactivateDevice('UUID-1', 'giga-9').subscribe();

      const req = httpMock.expectOne((r) =>
        r.url.endsWith('dailycheckapp_schools/deactivate')
      );
      expect(req.request.body).toEqual({
        device_hardware_id: 'UUID-1',
        giga_id_school: 'giga-9',
      });
      req.flush({ success: true, data: { deactivated: true } });
    });
  });
});
