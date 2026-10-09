import { ComponentFixture, TestBed, waitForAsync } from '@angular/core/testing';
import { IonicModule } from '@ionic/angular';
import { Router } from '@angular/router';
import { RouterTestingModule } from '@angular/router/testing';
import { TranslateModule } from '@ngx-translate/core';
import { provideHttpClient, withInterceptorsFromDi } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { Component } from '@angular/core';
import { of } from 'rxjs';

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
    ]);
    hardwareIdService.ensureHardwareId.and.resolveTo(null);
    hardwareIdService.waitForUsableHardwareId.and.resolveTo(null);
    hardwareIdService.isUsableHardwareId.and.callFake(
      (id) => !!id && id !== 'NO_UUID_AVAILABLE'
    );

    schoolService = jasmine.createSpyObj('SchoolService', [
      'checkRegistrationByHardwareId',
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

  afterEach(() => {
    localStorage.clear();
    TestBed.resetTestingModule();
  });
});
