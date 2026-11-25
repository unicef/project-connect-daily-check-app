import { ComponentFixture, TestBed, waitForAsync } from '@angular/core/testing';
import { IonicModule } from '@ionic/angular';
import { Router } from '@angular/router';
import { RouterTestingModule } from '@angular/router/testing';
import { TranslateModule } from '@ngx-translate/core';
import { provideHttpClient, withInterceptorsFromDi } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { Component } from '@angular/core';
import { of, throwError } from 'rxjs';

import {
  HomePage,
  PENDING_APP_INSTANCE_CLAIM_KEY,
  SERIALS_WAIT_MS,
} from './home.page';
import { LoadingService } from '../services/loading.service';
import { HardwareIdService } from '../services/hardware-id.service';
import { SchoolService } from '../services/school.service';
import {
  PENDING_AUTO_REGISTRATION_KEY,
  RegistrationContextService,
} from '../services/registration-context.service';

@Component({ template: '', standalone: false })
class BlankComponent {}

describe('HomePage', () => {
  let component: HomePage;
  let fixture: ComponentFixture<HomePage>;
  let router: Router;
  let schoolService: jasmine.SpyObj<SchoolService>;
  let hardwareIdService: jasmine.SpyObj<HardwareIdService>;
  let registrationContext: jasmine.SpyObj<RegistrationContextService>;

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
      'waitForDeviceIdentifiers',
    ]);
    hardwareIdService.ensureHardwareId.and.resolveTo(null);
    hardwareIdService.waitForDeviceIdentifiers.and.resolveTo({
      baseboard_serial: 'BOARD-1',
      disk_serial: 'DISK-1',
      machine_guid: 'GUID-1',
    });
    hardwareIdService.waitForUsableHardwareId.and.resolveTo(null);
    hardwareIdService.isUsableHardwareId.and.callFake(
      (id) => !!id && id !== 'NO_UUID_AVAILABLE'
    );

    schoolService = jasmine.createSpyObj('SchoolService', [
      'checkRegistrationByHardwareId',
      'registerSchoolDevice',
      'claimAppInstance',
    ]);
    registrationContext = jasmine.createSpyObj('RegistrationContextService', [
      'build',
      'appInstanceIdFor',
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
        {
          provide: RegistrationContextService,
          useValue: registrationContext,
        },
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
      schoolService.checkRegistrationByHardwareId.and.returnValue(
        of({ success: true, data: { exists: true, school_id: '9' } })
      );
      const navigate = spyOn(router, 'navigate').and.resolveTo(true);

      await (component as any).checkMachineRegistration('UUID-1', () => false);

      expect(localStorage.getItem('schoolId')).toBeNull();
      expect(navigate).not.toHaveBeenCalled();
    });

    it('takes the user to the dashboard when the late lookup finds a registration', async () => {
      await router.navigateByUrl('/register-school');
      hardwareIdService.waitForUsableHardwareId.and.resolveTo('UUID-1');
      schoolService.checkRegistrationByHardwareId.and.returnValue(
        of({ success: true, data: { exists: true, school_id: '9' } })
      );
      const navigate = spyOn(router, 'navigate').and.resolveTo(true);

      await (component as any).retryHardwareRegistrationInBackground();

      expect(localStorage.getItem('schoolId')).toBe('9');
      expect(navigate).toHaveBeenCalledWith(['/starttest']);
      expect(component.isCheckingRegistration).toBeFalse();
    });
  });

  describe('registering this app instance', () => {
    // A registration this PC already has, made by another app instance (here,
    // another Windows user).
    const found = {
      exists: true,
      user_id: 'first-user',
      school_id: '9',
      giga_id_school: 'g-1',
      country_code: 'ES',
      os: 'found-os',
      mac_address: 'found-device',
      ip_address: '198.51.100.1',
      app_version: '1.0.0',
    };
    // What this app instance reads about itself.
    const payload = {
      giga_id_school: 'g-1',
      country_code: 'ES',
      os: 'windows',
      mac_address: 'this-device',
      ip_address: '203.0.113.10',
      app_version: '2.0.4',
      windows_username: 'second-user',
      app_instance_id: 'instance-1',
      registration_source: 'auto',
    };
    let navigate: jasmine.Spy;

    beforeEach(() => {
      schoolService.checkRegistrationByHardwareId.and.returnValue(
        of({ success: true, data: found })
      );
      registrationContext.build.and.resolveTo(payload as any);
      navigate = spyOn(router, 'navigate').and.resolveTo(true);
    });

    it('stores a registration of its own, with its own context, at the school found', async () => {
      schoolService.registerSchoolDevice.and.returnValue(
        of('second-user-registration')
      );

      await (component as any).checkMachineRegistration('UUID-1');

      expect(registrationContext.build).toHaveBeenCalledWith({
        giga_id_school: 'g-1',
        country_code: 'ES',
        registration_source: 'auto',
        lookUpLocation: true,
      });
      expect(schoolService.registerSchoolDevice).toHaveBeenCalledWith(payload);
      expect(localStorage.getItem('schoolUserId')).toBe(
        'second-user-registration'
      );
      expect(localStorage.getItem('schoolId')).toBe('9');
      expect(localStorage.getItem('gigaId')).toBe('g-1');
      // This app instance's values, not the found registration's.
      expect(localStorage.getItem('deviceType')).toBe('windows');
      expect(localStorage.getItem('macAddress')).toBe('this-device');
      expect(localStorage.getItem('ip_address')).toBe('203.0.113.10');
      expect(localStorage.getItem('version')).toBe('2.0.4');
      expect(localStorage.getItem(PENDING_AUTO_REGISTRATION_KEY)).toBeFalsy();
      expect(navigate).toHaveBeenCalledWith(['/starttest']);
    });

    it('uses the registration found for now, and tries again on the next start, when storing fails', async () => {
      schoolService.registerSchoolDevice.and.returnValue(
        throwError(() => new Error('offline'))
      );

      await (component as any).checkMachineRegistration('UUID-1');

      expect(localStorage.getItem('schoolUserId')).toBe('first-user');
      expect(localStorage.getItem('macAddress')).toBe('this-device');
      expect(localStorage.getItem(PENDING_AUTO_REGISTRATION_KEY)).toBe('true');
      expect(navigate).toHaveBeenCalledWith(['/starttest']);
    });

    it('uses the registration found as before when this PC cannot be read, and tries again on the next start', async () => {
      registrationContext.build.and.rejectWith(new Error('no device plugin'));

      await (component as any).checkMachineRegistration('UUID-1');

      expect(schoolService.registerSchoolDevice).not.toHaveBeenCalled();
      expect(localStorage.getItem('schoolUserId')).toBe('first-user');
      expect(localStorage.getItem('macAddress')).toBe('found-device');
      expect(localStorage.getItem(PENDING_AUTO_REGISTRATION_KEY)).toBe('true');
      expect(navigate).toHaveBeenCalledWith(['/starttest']);
    });

    it('keeps nothing when the user moved on while it was being stored', async () => {
      schoolService.registerSchoolDevice.and.returnValue(
        of('second-user-registration')
      );
      // Wanted after the lookup and after the wait; not after storing.
      let checks = 0;

      await (component as any).checkMachineRegistration(
        'UUID-1',
        () => ++checks <= 2
      );

      expect(schoolService.registerSchoolDevice).toHaveBeenCalled();
      expect(localStorage.getItem('schoolId')).toBeNull();
      expect(navigate).not.toHaveBeenCalled();
    });

    it('leaves nothing to try again when storing fails after the user moved on', async () => {
      // The user registers by hand instead; a retry on the next start would
      // only send that registration again, as if the app had made it.
      schoolService.registerSchoolDevice.and.returnValue(
        throwError(() => new Error('offline'))
      );
      let checks = 0;

      await (component as any).checkMachineRegistration(
        'UUID-1',
        () => ++checks <= 2
      );

      expect(schoolService.registerSchoolDevice).toHaveBeenCalled();
      expect(localStorage.getItem(PENDING_AUTO_REGISTRATION_KEY)).toBeFalsy();
      expect(localStorage.getItem('schoolId')).toBeNull();
      expect(navigate).not.toHaveBeenCalled();
    });

    it('waits for the serials before registering by itself', async () => {
      const order: string[] = [];
      hardwareIdService.waitForDeviceIdentifiers.and.callFake(async () => {
        order.push('wait');
        return { baseboard_serial: 'BOARD-1', disk_serial: 'DISK-1', machine_guid: null };
      });
      registrationContext.build.and.callFake(async () => {
        order.push('build');
        return payload as any;
      });
      schoolService.registerSchoolDevice.and.returnValue(
        of('second-user-registration')
      );

      await (component as any).checkMachineRegistration('UUID-1');

      expect(hardwareIdService.waitForDeviceIdentifiers).toHaveBeenCalledWith(
        SERIALS_WAIT_MS
      );
      expect(order).toEqual(['wait', 'build']);
    });

    it('does not register by itself when the user moved on while the PC was being read', async () => {
      // Wanted after the lookup, no longer after the wait for the serials.
      let checks = 0;

      await (component as any).checkMachineRegistration(
        'UUID-1',
        () => ++checks === 1
      );

      expect(registrationContext.build).not.toHaveBeenCalled();
      expect(schoolService.registerSchoolDevice).not.toHaveBeenCalled();
      expect(localStorage.getItem('schoolId')).toBeNull();
      expect(navigate).not.toHaveBeenCalled();
    });

    it('is off on a normal start too once the user reached the country step', async () => {
      hardwareIdService.ensureHardwareId.and.resolveTo('UUID-1');
      (component as any).reachedCountryStep = true;

      await (component as any).checkHardwareRegistration();

      expect(schoolService.registerSchoolDevice).not.toHaveBeenCalled();
      expect(localStorage.getItem('schoolId')).toBeNull();
      expect(navigate).not.toHaveBeenCalled();
    });

    it('tries a pending registration again on the next start', async () => {
      localStorage.setItem('gigaId', 'g-1');
      localStorage.setItem('country_code', 'ES');
      localStorage.setItem('schoolUserId', 'first-user');
      localStorage.setItem(PENDING_AUTO_REGISTRATION_KEY, 'true');
      schoolService.registerSchoolDevice.and.returnValue(
        of('second-user-registration')
      );

      await (component as any).retryPendingAutoRegistration();

      expect(registrationContext.build).toHaveBeenCalledWith(
        jasmine.objectContaining({
          giga_id_school: 'g-1',
          country_code: 'ES',
          registration_source: 'auto',
        })
      );
      expect(localStorage.getItem('schoolUserId')).toBe(
        'second-user-registration'
      );
      expect(localStorage.getItem(PENDING_AUTO_REGISTRATION_KEY)).toBeFalsy();
      expect(hardwareIdService.waitForDeviceIdentifiers).toHaveBeenCalledWith(
        SERIALS_WAIT_MS
      );
    });

    it('registers nothing on start when nothing is pending', async () => {
      localStorage.setItem('gigaId', 'g-1');

      await (component as any).retryPendingAutoRegistration();

      expect(schoolService.registerSchoolDevice).not.toHaveBeenCalled();
    });
  });

  describe('an install registered before app instances', () => {
    const claim = () => (component as any).claimAppInstance();

    beforeEach(() => {
      localStorage.setItem('schoolUserId', 'old-user');
      localStorage.setItem('gigaId', 'g-1');
      localStorage.setItem('country_code', 'ES');
      // What the real service does: make an ID for the school and keep it.
      registrationContext.appInstanceIdFor.and.callFake((school: string) => {
        localStorage.setItem('appInstanceId', 'instance-1');
        localStorage.setItem('appInstanceSchool', school);
        return 'instance-1';
      });
    });

    it('makes an app instance ID and attaches it to its registration', async () => {
      schoolService.claimAppInstance.and.returnValue(of({ success: true }));

      await claim();

      expect(registrationContext.appInstanceIdFor).toHaveBeenCalledWith('g-1');
      expect(schoolService.claimAppInstance).toHaveBeenCalledWith(
        'old-user',
        'instance-1'
      );
      expect(localStorage.getItem('appInstanceId')).toBe('instance-1');
      expect(localStorage.getItem(PENDING_APP_INSTANCE_CLAIM_KEY)).toBeFalsy();
      expect(localStorage.getItem('schoolUserId')).toBe('old-user');
    });

    it('tries again on the next start, with the same ID', async () => {
      schoolService.claimAppInstance.and.returnValues(
        throwError(() => ({ status: 0 })),
        of({ success: true })
      );

      await claim();
      expect(localStorage.getItem(PENDING_APP_INSTANCE_CLAIM_KEY)).toBe('true');

      await claim();

      expect(registrationContext.appInstanceIdFor).toHaveBeenCalledTimes(1);
      expect(schoolService.claimAppInstance.calls.allArgs()).toEqual([
        ['old-user', 'instance-1'],
        ['old-user', 'instance-1'],
      ]);
      expect(localStorage.getItem(PENDING_APP_INSTANCE_CLAIM_KEY)).toBeFalsy();
    });

    it("registers on its own when the registration is another install's", async () => {
      // Older apps copied one registration to every Windows user of a PC.
      schoolService.claimAppInstance.and.returnValue(
        throwError(() => ({ status: 409 }))
      );
      registrationContext.build.and.resolveTo({
        giga_id_school: 'g-1',
        country_code: 'ES',
        app_instance_id: 'instance-1',
        registration_source: 'auto',
      } as any);
      schoolService.registerSchoolDevice.and.returnValue(of('own-user'));

      await claim();

      expect(registrationContext.build).toHaveBeenCalledWith(
        jasmine.objectContaining({
          giga_id_school: 'g-1',
          registration_source: 'auto',
        })
      );
      expect(localStorage.getItem('schoolUserId')).toBe('own-user');
      expect(localStorage.getItem(PENDING_APP_INSTANCE_CLAIM_KEY)).toBeFalsy();
      expect(localStorage.getItem(PENDING_AUTO_REGISTRATION_KEY)).toBeFalsy();
    });

    it('leaves an install that has its own app instance alone', async () => {
      localStorage.setItem('appInstanceId', 'instance-own');

      await claim();

      expect(schoolService.claimAppInstance).not.toHaveBeenCalled();
      expect(registrationContext.appInstanceIdFor).not.toHaveBeenCalled();
    });
  });

  afterEach(() => {
    localStorage.clear();
    TestBed.resetTestingModule();
  });
});
