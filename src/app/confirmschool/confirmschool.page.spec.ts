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
import { LocationService } from '../services/location.service';
import {
  PENDING_AUTO_REGISTRATION_KEY,
  RegistrationContextService,
} from '../services/registration-context.service';

describe('ConfirmschoolPage', () => {
  let component: ConfirmschoolPage;
  let fixture: ComponentFixture<ConfirmschoolPage>;
  let schoolService: jasmine.SpyObj<SchoolService>;
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
      'registerSchoolDevice',
      'registerFlaggedSchool',
    ]);
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
    schoolService.registerSchoolDevice.and.returnValue(of('user-1'));

    await component.confirmSchool();

    expect(schoolService.registerSchoolDevice).toHaveBeenCalledTimes(1);
    expect(router.navigate).toHaveBeenCalledWith(['/starttest']);
    expect(loading.dismiss).toHaveBeenCalled();
  });

  it('leaves nothing for the next start to try again once registered by hand', async () => {
    // An automatic registration failed earlier in this install.
    localStorage.setItem(PENDING_AUTO_REGISTRATION_KEY, 'true');
    schoolService.registerSchoolDevice.and.returnValue(of('user-1'));

    await component.confirmSchool();

    expect(localStorage.getItem(PENDING_AUTO_REGISTRATION_KEY)).toBeFalsy();
  });

  it('keeps a pending automatic registration when registering by hand fails', async () => {
    localStorage.setItem(PENDING_AUTO_REGISTRATION_KEY, 'true');
    schoolService.registerSchoolDevice.and.returnValue(
      throwError(() => new Error('500'))
    );

    await component.confirmSchool();

    expect(localStorage.getItem(PENDING_AUTO_REGISTRATION_KEY)).toBe('true');
  });

  it('presents the loader without a duration so it survives a slow registration', async () => {
    schoolService.registerSchoolDevice.and.returnValue(of('user-1'));

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
    schoolService.registerSchoolDevice.and.returnValue(new Subject<any>());

    const first = component.confirmSchool();
    await flushMicrotasks();
    await component.confirmSchool();
    await component.confirmSchool();
    await flushMicrotasks();

    expect(schoolService.registerSchoolDevice).toHaveBeenCalledTimes(1);
    expect(component.isRegistering).toBeTrue();
    expect(loading.dismiss).not.toHaveBeenCalled();
    expect(router.navigate).not.toHaveBeenCalled();
    void first;
  });

  it('dismisses the loader, routes out and re-arms the button when registration fails', async () => {
    schoolService.registerSchoolDevice.and.returnValue(
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
    schoolService.registerSchoolDevice.and.returnValue(of('user-1'));

    await component.confirmSchool();

    expect(schoolService.registerSchoolDevice).toHaveBeenCalledWith(
      jasmine.objectContaining({ wifi_connections: null })
    );
    expect(router.navigate).toHaveBeenCalledWith(['/starttest']);
    expect(component.isRegistering).toBeFalse();
  });

  it('sends the hardware values the backend works out the device ID from', async () => {
    localStorage.setItem(
      'system_hardware_id',
      JSON.stringify({
        hardwareId: 'UUID-1',
        baseboard_serial: 'BOARD-1',
        disk_serial: 'DISK-1',
        machine_guid: 'GUID-1',
      })
    );
    schoolService.registerSchoolDevice.and.returnValue(of('user-1'));

    await component.confirmSchool();

    expect(schoolService.registerSchoolDevice).toHaveBeenCalledWith(
      jasmine.objectContaining({
        device_hardware_id: 'UUID-1',
        baseboard_serial: 'BOARD-1',
        disk_serial: 'DISK-1',
        machine_guid: 'GUID-1',
      })
    );
    localStorage.removeItem('system_hardware_id');
  });

  describe('app instance', () => {
    const UUID =
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
    const sent = (call: number) =>
      schoolService.registerSchoolDevice.calls.argsFor(call)[0];

    it('registers as a new app instance, picked by the user', async () => {
      schoolService.registerSchoolDevice.and.returnValue(of('user-1'));

      await component.confirmSchool();

      expect(sent(0).registration_source).toBe('manual');
      expect(sent(0).app_instance_id).toMatch(UUID);
      expect(localStorage.getItem('appInstanceId')).toBe(
        sent(0).app_instance_id
      );
    });

    it('sends the same app instance ID when registering again at the school', async () => {
      // The first attempt timed out on the way back: the server may have
      // stored it, and must return that registration rather than a second one.
      schoolService.registerSchoolDevice.and.returnValues(
        throwError(() => new Error('timeout')),
        of('user-1')
      );

      await component.confirmSchool();
      await component.confirmSchool();

      expect(sent(1).app_instance_id).toBe(sent(0).app_instance_id);
    });

    it('sends a new app instance ID for another school', async () => {
      schoolService.registerSchoolDevice.and.returnValues(
        throwError(() => new Error('500')),
        of('user-1')
      );

      await component.confirmSchool();
      component.school = {
        giga_id_school: '0a3c6c1e-9b1d-3a8f-8f41-5e2b7d9c4a10',
        school_id: 'ext-2',
      };
      await component.confirmSchool();

      expect(sent(1).app_instance_id).toMatch(UUID);
      expect(sent(1).app_instance_id).not.toBe(sent(0).app_instance_id);
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
      schoolService.registerSchoolDevice.and.returnValue(of('user-1'));

      const done = component.confirmSchool();
      await flushMicrotasks();
      expect(schoolService.registerSchoolDevice).not.toHaveBeenCalled();

      jasmine.clock().tick(10000);
      await done;

      expect(schoolService.registerSchoolDevice).toHaveBeenCalledWith(
        jasmine.objectContaining({ ip_address: null })
      );
      expect(router.navigate).toHaveBeenCalledWith(['/starttest']);
      expect(loading.dismiss).toHaveBeenCalled();
    });

    it('gives up on a registration request that never answers', async () => {
      schoolService.registerSchoolDevice.and.returnValue(new Subject<any>());

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
    schoolService.registerSchoolDevice.and.returnValue(of('user-1'));
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
