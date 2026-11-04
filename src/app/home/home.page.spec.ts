import { ComponentFixture, TestBed, waitForAsync } from '@angular/core/testing';
import { IonicModule } from '@ionic/angular';
import { Router } from '@angular/router';
import { RouterTestingModule } from '@angular/router/testing';
import { TranslateModule } from '@ngx-translate/core';
import { provideHttpClient, withInterceptorsFromDi } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { Component } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { of, throwError } from 'rxjs';

import { HomePage } from './home.page';
import { LoadingService } from '../services/loading.service';
import { HardwareIdService } from '../services/hardware-id.service';
import { SchoolService } from '../services/school.service';

@Component({ template: '', standalone: false })
class BlankComponent {}

describe('HomePage', () => {
  let component: HomePage;
  let fixture: ComponentFixture<HomePage>;
  let router: Router;
  let schoolService: jasmine.SpyObj<SchoolService>;
  let hardwareIdService: jasmine.SpyObj<HardwareIdService>;

  beforeEach(waitForAsync(() => {
    localStorage.clear();
    const loading = jasmine.createSpyObj('LoadingService', ['present', 'dismiss']);
    loading.present.and.resolveTo(undefined);
    loading.dismiss.and.resolveTo(undefined);

    // No hardware ID at startup and none on retry: the page sits on the
    // welcome screen, which is the state the gate tests start from.
    hardwareIdService = jasmine.createSpyObj('HardwareIdService', [
      'ensureHardwareId',
      'waitForUsableHardwareId',
      'isUsableHardwareId',
      'getDeviceIdentifiers',
    ]);
    hardwareIdService.getDeviceIdentifiers.and.returnValue({
      device_hardware_id: 'UUID-1',
      baseboard_serial: 'BOARD-1',
      disk_serial: 'DISK-1',
      machine_guid: 'GUID-1',
    });
    hardwareIdService.ensureHardwareId.and.resolveTo(null);
    hardwareIdService.waitForUsableHardwareId.and.resolveTo(null);
    hardwareIdService.isUsableHardwareId.and.callFake(
      (id) => !!id && id !== 'NO_UUID_AVAILABLE'
    );

    schoolService = jasmine.createSpyObj('SchoolService', [
      'checkRegistrationByHardwareId',
      'autoRegister',
      'checkRegistrationStatus',
      'checkDeviceStatus',
    ]);

    TestBed.configureTestingModule({
      declarations: [HomePage, BlankComponent],
      imports: [
        IonicModule.forRoot(),
        RouterTestingModule.withRoutes([
          { path: 'home', component: BlankComponent },
          { path: 'register-school', component: BlankComponent },
          { path: 'searchcountry', component: BlankComponent },
          { path: 'starttest', component: BlankComponent },
        ]),
        TranslateModule.forRoot(),
      ],
      providers: [
        { provide: LoadingService, useValue: loading },
        { provide: HardwareIdService, useValue: hardwareIdService },
        { provide: SchoolService, useValue: schoolService },
        provideHttpClient(withInterceptorsFromDi()),
        provideHttpClientTesting(),
      ],
    }).compileComponents();

    router = TestBed.inject(Router);
    fixture = TestBed.createComponent(HomePage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  }));

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  describe('auto-registration gate', () => {
    const canAutoRegister = () => (component as any).canAutoRegister();

    it('stays open on the welcome and register-school screens', async () => {
      await router.navigateByUrl('/home');
      expect(canAutoRegister()).toBeTrue();
      await router.navigateByUrl('/register-school');
      expect(canAutoRegister()).toBeTrue();
    });

    it('closes for good once the user reaches the country step', async () => {
      await router.navigateByUrl('/register-school');
      await router.navigateByUrl('/searchcountry');
      expect(canAutoRegister()).toBeFalse();

      await router.navigateByUrl('/register-school');
      expect(canAutoRegister()).toBeFalse();
    });

    it('closes once the device is registered', async () => {
      await router.navigateByUrl('/home');
      localStorage.setItem('schoolId', '123');
      expect(canAutoRegister()).toBeFalse();
    });

    it('ignores a late lookup answer if the user moved on meanwhile', async () => {
      schoolService.autoRegister.and.returnValue(
        of({ success: true, data: { exists: true, school_id: '9' } })
      );
      const navigate = spyOn(router, 'navigate').and.resolveTo(true);

      await (component as any).checkMachineRegistration('UUID-1', () => false);

      expect(localStorage.getItem('schoolId')).toBeNull();
      expect(navigate).not.toHaveBeenCalled();
      // Nothing is registered for a user who moved on.
      expect(schoolService.autoRegister).not.toHaveBeenCalled();
    });

    it('takes the user to the dashboard when the late lookup finds a registration', async () => {
      await router.navigateByUrl('/register-school');
      hardwareIdService.waitForUsableHardwareId.and.resolveTo('UUID-1');
      schoolService.autoRegister.and.returnValue(
        of({ success: true, data: { exists: true, school_id: '9' } })
      );
      const navigate = spyOn(router, 'navigate').and.resolveTo(true);

      await (component as any).retryHardwareRegistrationInBackground();

      expect(localStorage.getItem('schoolId')).toBe('9');
      expect(navigate).toHaveBeenCalledWith(['/starttest']);
      expect(component.isCheckingRegistration).toBeFalse();
    });
  });

  describe('automatic registration (TECH-8828)', () => {
    const found = {
      success: true,
      data: {
        exists: true,
        user_id: 'NEW-REGISTRATION',
        school_id: '9',
        giga_id_school: 'giga-9',
      },
    };

    it('sends the hardware values and stores the registration it gets back', async () => {
      schoolService.autoRegister.and.returnValue(of(found));
      const navigate = spyOn(router, 'navigate').and.resolveTo(true);

      await (component as any).checkMachineRegistration('UUID-1');

      expect(schoolService.autoRegister).toHaveBeenCalledWith(
        jasmine.objectContaining({
          device_hardware_id: 'UUID-1',
          baseboard_serial: 'BOARD-1',
          disk_serial: 'DISK-1',
          machine_guid: 'GUID-1',
        })
      );
      expect(schoolService.checkRegistrationByHardwareId).not.toHaveBeenCalled();
      expect(localStorage.getItem('schoolUserId')).toBe('NEW-REGISTRATION');
      expect(localStorage.getItem('schoolId')).toBe('9');
      expect(navigate).toHaveBeenCalledWith(['/starttest']);
    });

    it('reuses the existing registration when the backend has no automatic registration yet', async () => {
      schoolService.autoRegister.and.returnValue(
        throwError(() => new HttpErrorResponse({ status: 404 }))
      );
      schoolService.checkRegistrationByHardwareId.and.returnValue(of(found));
      spyOn(router, 'navigate').and.resolveTo(true);

      await (component as any).checkMachineRegistration('UUID-1');

      expect(schoolService.checkRegistrationByHardwareId).toHaveBeenCalledWith(
        'UUID-1'
      );
      expect(localStorage.getItem('schoolId')).toBe('9');
    });

    it('leaves the user on registration when the backend fails', async () => {
      schoolService.autoRegister.and.returnValue(
        throwError(() => new HttpErrorResponse({ status: 500 }))
      );
      const navigate = spyOn(router, 'navigate').and.resolveTo(true);

      await (component as any).checkMachineRegistration('UUID-1');

      expect(schoolService.checkRegistrationByHardwareId).not.toHaveBeenCalled();
      expect(localStorage.getItem('schoolId')).toBeNull();
      expect(navigate).not.toHaveBeenCalled();
    });

    it('stays on registration when there is nothing to register from', async () => {
      schoolService.autoRegister.and.returnValue(
        of({ success: true, data: { exists: false } })
      );
      const navigate = spyOn(router, 'navigate').and.resolveTo(true);

      await (component as any).checkMachineRegistration('UUID-1');

      expect(localStorage.getItem('schoolId')).toBeNull();
      expect(navigate).not.toHaveBeenCalled();
    });
  });

  describe('start-up check of the existing registration (TECH-8828)', () => {
    beforeEach(() => {
      localStorage.setItem('schoolUserId', 'MY-REGISTRATION');
      localStorage.setItem('gigaId', 'giga-9');
      // Forget the page's own start-up lookups from before the test.
      hardwareIdService.ensureHardwareId.calls.reset();
    });

    it("checks the app's own registration, without a hardware ID", async () => {
      schoolService.checkRegistrationStatus.and.returnValue(
        of({ success: true, data: { exists: true, is_active: true } })
      );
      const proceed = spyOn(
        component as any,
        'proceedWithExistingRegistration'
      );

      await (component as any).checkDeviceStatusAndProceed();

      expect(schoolService.checkRegistrationStatus).toHaveBeenCalledWith(
        'MY-REGISTRATION'
      );
      expect(schoolService.checkDeviceStatus).not.toHaveBeenCalled();
      expect(hardwareIdService.ensureHardwareId).not.toHaveBeenCalled();
      expect(proceed).toHaveBeenCalled();
    });

    it('clears the registration when it was logged out', async () => {
      schoolService.checkRegistrationStatus.and.returnValue(
        of({ success: true, data: { exists: true, is_active: false } })
      );
      hardwareIdService.ensureHardwareId.and.resolveTo('UUID-1');
      schoolService.autoRegister.and.returnValue(
        of({ success: true, data: { exists: false } })
      );

      await (component as any).checkDeviceStatusAndProceed();

      expect(localStorage.getItem('schoolUserId')).toBeNull();
      expect(schoolService.autoRegister).toHaveBeenCalled();
    });

    it('falls back to the hardware ID check on an older backend', async () => {
      schoolService.checkRegistrationStatus.and.returnValue(
        throwError(() => new HttpErrorResponse({ status: 404 }))
      );
      hardwareIdService.ensureHardwareId.and.resolveTo('UUID-1');
      schoolService.checkDeviceStatus.and.returnValue(
        of({ success: true, data: { exists: true, is_active: true } })
      );
      const proceed = spyOn(
        component as any,
        'proceedWithExistingRegistration'
      );

      await (component as any).checkDeviceStatusAndProceed();

      expect(schoolService.checkDeviceStatus).toHaveBeenCalledWith(
        'UUID-1',
        'giga-9'
      );
      expect(proceed).toHaveBeenCalled();
    });
  });

  afterEach(() => {
    localStorage.clear();
    TestBed.resetTestingModule();
  });
});
