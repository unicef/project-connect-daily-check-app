import { CUSTOM_ELEMENTS_SCHEMA } from '@angular/core';
import { TestBed, waitForAsync } from '@angular/core/testing';
import { IonicModule, MenuController } from '@ionic/angular';
import { RouterTestingModule } from '@angular/router/testing';
import { TranslateModule } from '@ngx-translate/core';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { Network } from '@awesome-cordova-plugins/network/ngx';
import {
  HttpErrorResponse,
  provideHttpClient,
  withInterceptorsFromDi,
} from '@angular/common/http';

import { Router } from '@angular/router';
import { of, throwError } from 'rxjs';

import { AppComponent } from './app.component';
import { IndexedDBService } from './services/indexed-db.service';
import { HardwareIdService } from './services/hardware-id.service';
import { StorageService } from './services/storage.service';
import {
  DEACTIVATE_TIMEOUT_MS,
  SchoolService,
} from './services/school.service';
import { PosthogService } from './services/posthog.service';
import { takeLoggedOutAt } from './analytics/analytics-events';

describe('AppComponent', () => {
  beforeEach(waitForAsync(() => {
    TestBed.configureTestingModule({
      declarations: [AppComponent],
      schemas: [CUSTOM_ELEMENTS_SCHEMA],
      // IonicModule supplies the overlay controllers (ModalController) and
      // RouterTestingModule the ActivatedRoute the component tree injects.
      imports: [
        IonicModule.forRoot(),
        RouterTestingModule,
        TranslateModule.forRoot(),
      ],
      providers: [
        Network,
        provideHttpClient(withInterceptorsFromDi()),
        provideHttpClientTesting(),
      ],
    }).compileComponents();
  }));

  it('should create the app', () => {
    const fixture = TestBed.createComponent(AppComponent);
    const app = fixture.debugElement.componentInstance;
    expect(app).toBeTruthy();
  });

  describe('with a schoolId but no readable school saved', () => {
    afterEach(() => localStorage.clear());

    // JSON.parse threw on these, the root component never existed and the
    // window stayed blank.
    for (const schoolInfo of [null, 'undefined', '{not json']) {
      it(`starts (schoolInfo ${schoolInfo})`, () => {
        localStorage.setItem('schoolId', 'ext-1');
        if (schoolInfo !== null) {
          localStorage.setItem('schoolInfo', schoolInfo);
        }

        const menu = TestBed.inject(MenuController);
        spyOn(menu, 'enable').and.resolveTo(undefined);
        spyOn(menu, 'open').and.resolveTo(true);

        const fixture = TestBed.createComponent(AppComponent);

        expect(fixture.componentInstance.school).toBeNull();
        expect(() => fixture.componentInstance.openSecond()).not.toThrow();
        expect(fixture.componentInstance.school).toBeNull();
      });
    }
  });

  describe('logout', () => {
    let app: AppComponent;
    let databases: IndexedDBService;
    let hardwareId: jasmine.Spy;
    let deactivate: jasmine.Spy;
    let clearStorage: jasmine.Spy;
    let capture: jasmine.Spy;
    let captureNow: jasmine.Spy;
    let resetAnalytics: jasmine.Spy;
    let navigate: jasmine.Spy;
    let logout: () => Promise<void>;

    // The backend's two answers to PUT dailycheckapp_schools/deactivate
    // (giga-meter-backend, SchoolService.deactivateDevice).
    const deactivated = {
      success: true,
      data: { deactivated: true, message: 'Successfully deactivated 1 device(s)' },
    };
    const nothingActive = {
      success: true,
      data: {
        deactivated: false,
        message:
          'No active device found with the provided hardware_id and giga_id_school',
      },
    };
    const failedRequest = (status: number, error: unknown) =>
      throwError(
        () =>
          new HttpErrorResponse({
            status,
            error,
            url: 'https://api.example.org/api/v1/dailycheckapp_schools/deactivate',
          })
      );

    // The page reloads once the router is on /home, 500 ms after logout.
    const pageToReloadFrom = async () => {
      await new Promise((resolve) => setTimeout(resolve, 600));
      return navigate.calls.mostRecent()?.args[0];
    };

    beforeEach(() => {
      const menu = TestBed.inject(MenuController);
      spyOn(menu, 'enable').and.resolveTo(undefined);
      spyOn(menu, 'close').and.resolveTo(true);
      app = TestBed.createComponent(AppComponent).componentInstance;
      logout = () => (app as any).handleLogout();

      databases = TestBed.inject(IndexedDBService);
      hardwareId = spyOn(TestBed.inject(HardwareIdService), 'getHardwareId').and.returnValue('hw-1');
      const storage = TestBed.inject(StorageService);
      spyOn(storage, 'get').and.callFake((key: string) =>
        key === 'gigaId' ? 'giga-1' : undefined
      );
      clearStorage = spyOn(storage, 'clear');
      deactivate = spyOn(TestBed.inject(SchoolService), 'deactivateDevice').and.returnValue(of(deactivated));
      const posthog = TestBed.inject(PosthogService);
      capture = spyOn(posthog, 'capture');
      captureNow = spyOn(posthog, 'captureNow');
      resetAnalytics = spyOn(posthog, 'reset');
      // Never settles, so the test runner's own page isn't reloaded.
      navigate = spyOn(TestBed.inject(Router), 'navigate').and.returnValue(new Promise(() => {}));
    });

    afterEach(async () => {
      takeLoggedOutAt(); // markLoggedOut() left it in localStorage
      const names = ['connectivity_ping_db', 'connectivity_measurements_db'];
      await Promise.all(
        names.map(
          (name) =>
            new Promise((resolve) => {
              const request = indexedDB.deleteDatabase(name);
              request.onsuccess = resolve;
              request.onerror = resolve;
              request.onblocked = resolve;
            })
        )
      );
    });

    it('goes through when the databases are deleted', async () => {
      spyOn(databases, 'deleteAllDatabases').and.resolveTo();

      await logout();

      expect(deactivate).toHaveBeenCalledOnceWith('hw-1', 'giga-1');
      expect(clearStorage).toHaveBeenCalled();
      expect(captureNow).toHaveBeenCalledWith(
        'logout_completed',
        jasmine.objectContaining({ backend_deactivated: true, databases_deleted: true })
      );
      expect(await pageToReloadFrom()).toEqual(['/home']);
    });

    it('goes through when a database cannot be deleted', async () => {
      spyOn(databases, 'deleteAllDatabases').and.rejectWith(
        new DOMException('disk', 'UnknownError')
      );

      await logout();

      expect(deactivate).toHaveBeenCalledOnceWith('hw-1', 'giga-1');
      expect(clearStorage).toHaveBeenCalled();
      expect(captureNow).toHaveBeenCalledWith(
        'logout_completed',
        jasmine.objectContaining({ backend_deactivated: true, databases_deleted: false })
      );
      expect(await pageToReloadFrom()).toEqual(['/home']);
    });

    it('goes through, with the offline queue emptied, when a connection keeps the delete waiting', async () => {
      const queue = 'connectivity_measurements_db';
      await databases.saveMeasurement({ UUID: 'old-school' });
      // A connection that ignores the delete, as the leaked ones did.
      const held = await new Promise<IDBDatabase>((resolve) => {
        const request = indexedDB.open(queue);
        request.onsuccess = () => resolve(request.result);
      });
      const deleteAll = databases.deleteAllDatabases.bind(databases);
      spyOn(databases, 'deleteAllDatabases').and.callFake(() => deleteAll(300));

      try {
        const started = Date.now();
        await logout();
        expect(Date.now() - started).toBeLessThan(2000);

        const left = await new Promise<any[]>((resolve) => {
          const request = held
            .transaction('measurements', 'readonly')
            .objectStore('measurements')
            .getAll();
          request.onsuccess = () => resolve(request.result);
        });
        expect(left).toEqual([]);
      } finally {
        held.close();
      }

      expect(deactivate).toHaveBeenCalledOnceWith('hw-1', 'giga-1');
      expect(clearStorage).toHaveBeenCalled();
      expect(captureNow).toHaveBeenCalledWith(
        'logout_completed',
        jasmine.objectContaining({ databases_deleted: false })
      );
      expect(await pageToReloadFrom()).toEqual(['/home']);
    });

    it('deactivates on the backend first, then clears everything and reloads', async () => {
      const deleteAll = spyOn(databases, 'deleteAllDatabases').and.resolveTo();

      await logout();

      expect(deactivate).toHaveBeenCalledOnceWith('hw-1', 'giga-1');
      expect(deactivate).toHaveBeenCalledBefore(deleteAll);
      expect(clearStorage).toHaveBeenCalled();
      expect(captureNow).toHaveBeenCalledOnceWith('logout_completed', {
        backend_deactivated: true,
        databases_deleted: true,
      });
      expect(captureNow).toHaveBeenCalledBefore(resetAnalytics);
      expect(takeLoggedOutAt()).not.toBeNull();
      expect(app.toastMessage).toBe('Logged out successfully');
      expect(await pageToReloadFrom()).toEqual(['/home']);
    });

    it('goes through when the backend has no active registration left to deactivate', async () => {
      // A retry after a request that timed out but got through, or another
      // Windows user's logout already deactivated this PC at the school.
      deactivate.and.returnValue(of(nothingActive));
      spyOn(databases, 'deleteAllDatabases').and.resolveTo();

      await logout();

      expect(clearStorage).toHaveBeenCalled();
      expect(captureNow).toHaveBeenCalledOnceWith('logout_completed', {
        backend_deactivated: false,
        deactivate_error_code: 'nothing_active',
        databases_deleted: true,
      });
      expect(resetAnalytics).toHaveBeenCalled();
      expect(await pageToReloadFrom()).toEqual(['/home']);
    });

    it('goes through without asking the backend when there is no hardware ID', async () => {
      hardwareId.and.returnValue(null);
      spyOn(databases, 'deleteAllDatabases').and.resolveTo();

      await logout();

      expect(deactivate).not.toHaveBeenCalled();
      expect(clearStorage).toHaveBeenCalled();
      expect(captureNow).toHaveBeenCalledOnceWith('logout_completed', {
        backend_deactivated: false,
        deactivate_error_code: 'no_hardware_id',
        databases_deleted: true,
      });
      expect(resetAnalytics).toHaveBeenCalled();
      expect(await pageToReloadFrom()).toEqual(['/home']);
    });

    describe('when the backend does not confirm the deactivation', () => {
      beforeEach(async () => {
        await databases.saveMeasurement({ UUID: 'before' });
        spyOn(databases, 'deleteAllDatabases').and.callThrough();
      });

      afterEach(() => jasmine.clock().uninstall());

      // Still registered, and everything local as it was: the user can try
      // again as soon as the connection is back.
      const expectNothingChanged = async () => {
        expect(clearStorage).not.toHaveBeenCalled();
        expect(resetAnalytics).not.toHaveBeenCalled();
        expect(captureNow).not.toHaveBeenCalled();
        expect(takeLoggedOutAt()).toBeNull();
        expect(app.toastMessage).toBe('logout.notLoggedOut');
        expect(app.toastColor).toBe('danger');
        expect(databases.deleteAllDatabases).not.toHaveBeenCalled();
        // The offline queue kept its measurement and still takes new ones.
        await databases.saveMeasurement({ UUID: 'after' });
        const queued = await databases.getPendingMeasurements();
        expect(queued.map((measurement) => measurement.UUID)).toEqual([
          'before',
          'after',
        ]);
      };

      it('stays registered when the backend answers 500', async () => {
        deactivate.and.returnValue(
          failedRequest(500, { statusCode: 500, message: 'Internal server error' })
        );

        await logout();

        expect(deactivate).toHaveBeenCalledOnceWith('hw-1', 'giga-1');
        expect(capture).toHaveBeenCalledWith(
          'logout_failed',
          jasmine.objectContaining({
            phase: 'deactivate',
            error_code: 'http_5xx',
            http_status: 500,
          })
        );
        expect(await pageToReloadFrom()).toBeUndefined();
        await expectNothingChanged();
      });

      it('stays registered when the backend cannot be reached', async () => {
        deactivate.and.returnValue(failedRequest(0, new ProgressEvent('error')));

        await logout();

        expect(capture).toHaveBeenCalledWith(
          'logout_failed',
          jasmine.objectContaining({
            phase: 'deactivate',
            error_code: 'network',
            http_status: 0,
          })
        );
        expect(await pageToReloadFrom()).toBeUndefined();
        await expectNothingChanged();
      });

      it('gives up on a backend that never answers, and stays registered', async () => {
        deactivate.and.callThrough();
        jasmine.clock().install();

        const done = logout();
        jasmine.clock().tick(DEACTIVATE_TIMEOUT_MS);
        await done;
        jasmine.clock().tick(1000);
        expect(navigate).not.toHaveBeenCalled();
        jasmine.clock().uninstall();

        const request = TestBed.inject(HttpTestingController).expectOne((r) =>
          r.url.endsWith('dailycheckapp_schools/deactivate')
        );
        expect(request.cancelled).toBeTrue();
        expect(capture).toHaveBeenCalledWith(
          'logout_failed',
          jasmine.objectContaining({ phase: 'deactivate', error_code: 'timeout' })
        );
        await expectNothingChanged();
      });

      it('can be tried again at once, and goes through when the backend confirms', async () => {
        deactivate.and.returnValues(
          failedRequest(503, { statusCode: 503, message: 'Service Unavailable' }),
          of(deactivated)
        );

        await logout();
        expect(clearStorage).not.toHaveBeenCalled();
        expect(databases.deleteAllDatabases).not.toHaveBeenCalled();

        await logout();

        expect(deactivate).toHaveBeenCalledTimes(2);
        expect(databases.deleteAllDatabases).toHaveBeenCalledTimes(1);
        expect(clearStorage).toHaveBeenCalled();
        expect(captureNow).toHaveBeenCalledOnceWith(
          'logout_completed',
          jasmine.objectContaining({ backend_deactivated: true })
        );
        expect(resetAnalytics).toHaveBeenCalled();
        expect(await pageToReloadFrom()).toEqual(['/home']);
      });
    });
  });
  // TODO: add more tests!
});
