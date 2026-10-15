import { ComponentFixture, TestBed, waitForAsync } from '@angular/core/testing';
import { IonicModule } from '@ionic/angular';
import { Router } from '@angular/router';
import { RouterTestingModule } from '@angular/router/testing';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideHttpClient, withInterceptorsFromDi } from '@angular/common/http';
import { TranslateModule } from '@ngx-translate/core';
import { Subject, of, throwError } from 'rxjs';
import { ConfirmschoolPage } from './confirmschool.page';
import { DatePipe } from '@angular/common';
import { SchoolService } from '../services/school.service';
import { LoadingService } from '../services/loading.service';
import { NetworkService } from '../services/network.service';
import { PosthogService } from '../services/posthog.service';
import { RegistrationService } from '../services/registration.service';
import { IdentityService } from '../services/identity.service';

describe('ConfirmschoolPage', () => {
  let component: ConfirmschoolPage;
  let fixture: ComponentFixture<ConfirmschoolPage>;
  let schoolService: jasmine.SpyObj<SchoolService>;
  let registrationService: jasmine.SpyObj<RegistrationService>;
  let identityService: jasmine.SpyObj<IdentityService>;
  const registered = {
    giga_id: '7f60b4e6-3a43-3f90-b7cb-882c3a6bdb80',
    registration_id: '42',
    facility_type: 'school',
  };
  let loading: jasmine.SpyObj<LoadingService>;
  let router: Router;

  /** Drain the microtask queue so the awaited lookups inside confirmSchool run. */
  const flushMicrotasks = async () => {
    for (let i = 0; i < 25; i++) {
      await Promise.resolve();
    }
  };

  beforeEach(waitForAsync(() => {
    // The constructor reads the application language out of saved settings.
    localStorage.setItem(
      'savedSettings',
      JSON.stringify({ applicationLanguage: { code: 'en' } })
    );

    schoolService = jasmine.createSpyObj('SchoolService', [
      'registerFlaggedSchool',
    ]);
    registrationService = jasmine.createSpyObj('RegistrationService', [
      'register',
      'persistRegistration',
    ]);
    registrationService.persistRegistration.and.resolveTo(undefined);
    identityService = jasmine.createSpyObj('IdentityService', [
      'getFacilityType',
      'getInstallationId',
    ]);
    identityService.getFacilityType.and.returnValue('school');
    identityService.getInstallationId.and.returnValue('inst-1');
    loading = jasmine.createSpyObj('LoadingService', ['present', 'dismiss']);
    loading.present.and.resolveTo(undefined);
    loading.dismiss.and.resolveTo(undefined);

    TestBed.configureTestingModule({
      declarations: [ConfirmschoolPage],
      imports: [
        IonicModule.forRoot(),
        RouterTestingModule,
        TranslateModule.forRoot(),
      ],
      providers: [
        DatePipe,
        { provide: SchoolService, useValue: schoolService },
        { provide: RegistrationService, useValue: registrationService },
        { provide: IdentityService, useValue: identityService },
        { provide: LoadingService, useValue: loading },
        // NetworkService pulls in the Ionic Native Network plugin, which has no
        // provider under TestBed; the page only holds the reference.
        { provide: NetworkService, useValue: {} },
        {
          provide: PosthogService,
          useValue: jasmine.createSpyObj('PosthogService', [
            'identify',
            'capture',
            'setSchool',
          ]),
        },
        provideHttpClient(withInterceptorsFromDi()),
        provideHttpClientTesting(),
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(ConfirmschoolPage);
    component = fixture.componentInstance;
    router = TestBed.inject(Router);
    fixture.detectChanges();

    // Route params are not provided by RouterTestingModule here; set the state
    // confirmSchool() reads directly.
    component.school = {
      giga_id_school: '7f60b4e6-3a43-3f90-b7cb-882c3a6bdb80',
      school_id: 'ext-1',
    };
    component.schoolId = 'ext-1';
    component.selectedCountry = 'ES';
    component.detectedCountry = 'ES';
    component.selectedCountryName = 'Spain';

    // The device/network lookups hit Electron IPC and a remote IP service; stub
    // them so the spec exercises the registration flow only.
    spyOn(component, 'getIPAddress').and.resolveTo('203.0.113.10');
    spyOn(component, 'getDeviceInfo').and.resolveTo({
      operatingSystem: 'windows',
    } as any);
    spyOn(component, 'getDeviceId').and.resolveTo({ identifier: 'device-1' });
    spyOn(component, 'getWindowsUsername').and.resolveTo('T001');
    spyOn(component, 'getInstalledPath').and.resolveTo('C:\\app');
    spyOn(component, 'getWifiConnections').and.resolveTo(null);
    spyOn(router, 'navigate').and.resolveTo(true);
  }));

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('registers the device once and navigates to the test screen', async () => {
    registrationService.register.and.returnValue(of(registered as any));

    await component.confirmSchool();

    expect(registrationService.register).toHaveBeenCalledTimes(1);
    expect(registrationService.register).toHaveBeenCalledWith(
      jasmine.objectContaining({
        giga_id_school: registered.giga_id,
        installation_id: 'inst-1',
        country_code: 'ES',
      })
    );
    expect(registrationService.persistRegistration).toHaveBeenCalledWith(
      registered as any,
      component.school,
      'ext-1'
    );
    expect(router.navigate).toHaveBeenCalledWith(['/starttest']);
    expect(loading.dismiss).toHaveBeenCalled();
  });

  it('registers a health facility with giga_id_health and never flags it', async () => {
    component.school = {
      giga_id_health: 'HF-1',
      facilityType: 'health',
      school_id: 'GOV-1',
    };
    component.detectedCountry = 'PT';
    registrationService.register.and.returnValue(
      of({ ...registered, giga_id: 'HF-1', facility_type: 'health' } as any)
    );

    await component.confirmSchool();

    const payload = registrationService.register.calls.mostRecent().args[0];
    expect(payload['giga_id_health']).toBe('HF-1');
    expect(payload['giga_id_school']).toBeUndefined();
    expect(schoolService.registerFlaggedSchool).not.toHaveBeenCalled();
    expect(router.navigate).toHaveBeenCalledWith(['/starttest']);
  });

  it('presents the loader without a duration so it survives a slow registration', async () => {
    registrationService.register.and.returnValue(of(registered as any));

    await component.confirmSchool();

    expect(loading.present).toHaveBeenCalledWith(
      jasmine.any(String),
      undefined,
      'pdcaLoaderClass',
      'null'
    );
  });

  it('ignores repeat taps while a registration is in flight', async () => {
    // Never emits: the first registration stays pending for the whole test.
    registrationService.register.and.returnValue(new Subject<any>());

    const first = component.confirmSchool();
    await flushMicrotasks();
    await component.confirmSchool();
    await component.confirmSchool();
    await flushMicrotasks();

    expect(registrationService.register).toHaveBeenCalledTimes(1);
    expect(component.isRegistering).toBeTrue();
    expect(loading.dismiss).not.toHaveBeenCalled();
    expect(router.navigate).not.toHaveBeenCalled();
    void first;
  });

  it('dismisses the loader, routes out and re-arms the button when registration fails', async () => {
    registrationService.register.and.returnValue(
      throwError(() => new Error('500'))
    );

    await component.confirmSchool();

    expect(loading.dismiss).toHaveBeenCalled();
    expect(router.navigate).toHaveBeenCalledWith([
      'schoolnotfound',
      'ext-1',
      'ES',
      'ES',
      'Spain',
    ]);
    expect(component.isRegistering).toBeFalse();
  });

  it('dismisses the loader and re-arms the button when a pre-registration lookup fails', async () => {
    (component.getWifiConnections as jasmine.Spy).and.rejectWith(
      new Error('ipc down')
    );
    registrationService.register.and.returnValue(of(registered as any));

    await component.confirmSchool();

    expect(registrationService.register).not.toHaveBeenCalled();
    expect(loading.dismiss).toHaveBeenCalled();
    expect(component.isRegistering).toBeFalse();
  });

  it('records a flagged school only when the selected country differs', async () => {
    registrationService.register.and.returnValue(of(registered as any));
    schoolService.registerFlaggedSchool.and.returnValue(of(1));

    await component.confirmSchool();
    expect(schoolService.registerFlaggedSchool).not.toHaveBeenCalled();

    component.isRegistering = false;
    component.detectedCountry = 'PT';
    await component.confirmSchool();
    expect(schoolService.registerFlaggedSchool).toHaveBeenCalledTimes(1);
  });

  afterEach(() => {
    localStorage.clear();
    TestBed.resetTestingModule();
  });
});
