import { ComponentFixture, TestBed, waitForAsync } from '@angular/core/testing';
import { IonicModule } from '@ionic/angular';
import { Router } from '@angular/router';
import { RouterTestingModule } from '@angular/router/testing';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
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
import { LocationService } from '../services/location.service';
import {
  PENDING_AUTO_REGISTRATION_KEY,
  RegistrationContextService,
} from '../services/registration-context.service';

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
  let context: RegistrationContextService;

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
            'identifyDevice',
            'capture',
            'captureFailure',
            'setSchool',
            'setCountry',
            'applyAppInstance',
          ]),
        },
        provideHttpClient(withInterceptorsFromDi()),
        provideHttpClientTesting(),
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(ConfirmschoolPage);
    component = fixture.componentInstance;
    router = TestBed.inject(Router);
    context = TestBed.inject(RegistrationContextService);
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
    spyOn(context, 'getIPAddress').and.resolveTo('203.0.113.10');
    spyOn(context, 'getDeviceInfo').and.resolveTo({
      operatingSystem: 'windows',
    } as any);
    spyOn(context, 'getDeviceId').and.resolveTo({ identifier: 'device-1' });
    spyOn(context, 'getWindowsUsername').and.resolveTo('T001');
    spyOn(context, 'getInstalledPath').and.resolveTo('C:\\app');
    spyOn(context, 'getWifiConnections').and.resolveTo(null);
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

  it("puts the device in its school's analytics group, with the school's external ID and name", async () => {
    component.school = { ...component.school, name: 'Escuela Uno' };
    registrationService.register.and.returnValue(of(registered as any));
    const posthog = TestBed.inject(PosthogService) as jasmine.SpyObj<PosthogService>;

    await component.confirmSchool();

    expect(posthog.setSchool).toHaveBeenCalledWith(
      '7f60b4e6-3a43-3f90-b7cb-882c3a6bdb80',
      { external_id: 'ext-1', name: 'Escuela Uno' }
    );
  });

  it('leaves nothing for the next start to try again once registered by hand', async () => {
    // An automatic registration failed earlier in this install.
    localStorage.setItem(PENDING_AUTO_REGISTRATION_KEY, 'true');
    registrationService.register.and.returnValue(of(registered as any));

    await component.confirmSchool();

    expect(localStorage.getItem(PENDING_AUTO_REGISTRATION_KEY)).toBeFalsy();
  });

  it('keeps a pending automatic registration when registering by hand fails', async () => {
    localStorage.setItem(PENDING_AUTO_REGISTRATION_KEY, 'true');
    registrationService.register.and.returnValue(
      throwError(() => new Error('500'))
    );

    await component.confirmSchool();

    expect(localStorage.getItem(PENDING_AUTO_REGISTRATION_KEY)).toBe('true');
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
    expect(router.navigate).toHaveBeenCalledWith(
      ['schoolnotfound', 'ext-1', 'ES', 'ES', 'Spain'],
      { queryParams: { reason: 'registrationFailed' } }
    );
    expect(component.isRegistering).toBeFalse();
  });

  it('registers with null when an optional pre-registration lookup fails', async () => {
    (context.getWifiConnections as jasmine.Spy).and.rejectWith(
      new Error('ipc down')
    );
    registrationService.register.and.returnValue(of(registered as any));

    await component.confirmSchool();

    expect(registrationService.register).toHaveBeenCalledWith(
      jasmine.objectContaining({ wifi_connections: null })
    );
    expect(router.navigate).toHaveBeenCalledWith(['/starttest']);
    expect(component.isRegistering).toBeFalse();
  });

  it('sends the hardware ID but not the serials the v2 endpoint does not take', async () => {
    localStorage.setItem(
      'system_hardware_id',
      JSON.stringify({
        hardwareId: 'UUID-1',
        baseboard_serial: 'BOARD-1',
        disk_serial: 'DISK-1',
        machine_guid: 'GUID-1',
      })
    );
    registrationService.register.and.returnValue(of(registered as any));

    await component.confirmSchool();

    const payload = registrationService.register.calls.mostRecent().args[0];
    expect(payload['device_hardware_id']).toBe('UUID-1');
    expect(payload['baseboard_serial']).toBeUndefined();
    expect(payload['disk_serial']).toBeUndefined();
    expect(payload['machine_guid']).toBeUndefined();
    localStorage.removeItem('system_hardware_id');
  });

  describe('app instance', () => {
    const UUID =
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

    it('keeps a new app instance ID for the facility without sending it to /api/v2', async () => {
      registrationService.register.and.returnValue(of(registered as any));

      await component.confirmSchool();

      const payload = registrationService.register.calls.mostRecent().args[0];
      expect(payload['app_instance_id']).toBeUndefined();
      expect(payload['registration_source']).toBeUndefined();
      expect(localStorage.getItem('appInstanceId')).toMatch(UUID);
    });

    it('keeps the same app instance ID when registering again at the facility', async () => {
      registrationService.register.and.returnValues(
        throwError(() => new Error('timeout')),
        of(registered as any)
      );

      await component.confirmSchool();
      const first = localStorage.getItem('appInstanceId');
      await component.confirmSchool();

      expect(localStorage.getItem('appInstanceId')).toBe(first);
    });

    it('makes a new app instance ID for another facility', async () => {
      registrationService.register.and.returnValues(
        throwError(() => new Error('500')),
        of(registered as any)
      );

      await component.confirmSchool();
      const first = localStorage.getItem('appInstanceId');
      component.school = {
        giga_id_school: '0a3c6c1e-9b1d-3a8f-8f41-5e2b7d9c4a10',
        school_id: 'ext-2',
      };
      await component.confirmSchool();

      expect(localStorage.getItem('appInstanceId')).toMatch(UUID);
      expect(localStorage.getItem('appInstanceId')).not.toBe(first);
    });
  });

  describe('with a mocked clock', () => {
    beforeEach(() => jasmine.clock().install());
    afterEach(() => jasmine.clock().uninstall());

    it('does not let a hanging lookup hold the loader up', async () => {
      // Never settles, like an IP service that accepts the connection and stalls.
      (context.getIPAddress as jasmine.Spy).and.returnValue(
        new Promise(() => undefined)
      );
      registrationService.register.and.returnValue(of(registered as any));

      const done = component.confirmSchool();
      await flushMicrotasks();
      expect(registrationService.register).not.toHaveBeenCalled();

      jasmine.clock().tick(10000);
      await done;

      expect(registrationService.register).toHaveBeenCalledWith(
        jasmine.objectContaining({ ip_address: null })
      );
      expect(router.navigate).toHaveBeenCalledWith(['/starttest']);
      expect(loading.dismiss).toHaveBeenCalled();
    });

    it('gives up on a registration request that never answers', async () => {
      registrationService.register.and.returnValue(new Subject<any>());

      const done = component.confirmSchool();
      await flushMicrotasks();
      jasmine.clock().tick(30000);
      await done;

      expect(router.navigate).not.toHaveBeenCalledWith(['/starttest']);
      expect(loading.dismiss).toHaveBeenCalled();
      expect(component.isRegistering).toBeFalse();
    });
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

  it('saves the registration location with its access points and no BSSID yet', async () => {
    const location = TestBed.inject(LocationService);
    const httpMock = TestBed.inject(HttpTestingController);
    // A BSSID saved with an earlier location must not stay paired with the
    // location resolved here.
    location.saveConnectedBssid('11:22:33:44:55:66');
    location.saveWifiAccessPoints(['00:00:00:00:00:01']);
    const originalElectronAPI = (window as any).electronAPI;
    (window as any).electronAPI = {
      getWifiList: () =>
        Promise.resolve([
          { ssid: 'a', signal: -40, macAddress: 'AA:BB:CC:DD:EE:02' },
          { ssid: 'b', signal: -50, macAddress: 'AA:BB:CC:DD:EE:01' },
        ]),
    };

    try {
      await component.ngOnInit();
      httpMock
        .expectOne((r) => r.url.endsWith('geolocation/geolocate'))
        .flush({ latitude: 1, longitude: 2 });

      expect(location.getSavedGeolocation()).toEqual(
        jasmine.objectContaining({ latitude: 1, longitude: 2 })
      );
      expect(location.getSavedWifiAccessPoints()).toEqual([
        'aa:bb:cc:dd:ee:01',
        'aa:bb:cc:dd:ee:02',
      ]);
      expect(location.getSavedConnectedBssid()).toBeNull();
    } finally {
      (window as any).electronAPI = originalElectronAPI;
    }
  });

  afterEach(() => {
    localStorage.clear();
    TestBed.resetTestingModule();
  });
});
