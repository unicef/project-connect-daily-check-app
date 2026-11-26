import { CUSTOM_ELEMENTS_SCHEMA } from '@angular/core';
import { TestBed, waitForAsync } from '@angular/core/testing';
import { IonicModule, MenuController } from '@ionic/angular';
import { RouterTestingModule } from '@angular/router/testing';
import { TranslateModule } from '@ngx-translate/core';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { Network } from '@awesome-cordova-plugins/network/ngx';
import { provideHttpClient, withInterceptorsFromDi } from '@angular/common/http';

import { Router } from '@angular/router';
import { of } from 'rxjs';

import { AppComponent } from './app.component';
import { IndexedDBService } from './services/indexed-db.service';
import { HardwareIdService } from './services/hardware-id.service';
import { StorageService } from './services/storage.service';
import { SchoolService } from './services/school.service';
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

  describe('logout', () => {
    let databases: IndexedDBService;
    let deactivate: jasmine.Spy;
    let clearStorage: jasmine.Spy;
    let captureNow: jasmine.Spy;
    let navigate: jasmine.Spy;
    let logout: () => Promise<void>;

    // The page reloads once the router is on /home, 500 ms after logout.
    const pageToReloadFrom = async () => {
      await new Promise((resolve) => setTimeout(resolve, 600));
      return navigate.calls.mostRecent()?.args[0];
    };

    beforeEach(() => {
      const menu = TestBed.inject(MenuController);
      spyOn(menu, 'enable').and.resolveTo(undefined);
      spyOn(menu, 'close').and.resolveTo(true);
      const app = TestBed.createComponent(AppComponent).componentInstance;
      logout = () => (app as any).handleLogout();

      databases = TestBed.inject(IndexedDBService);
      spyOn(TestBed.inject(HardwareIdService), 'getHardwareId').and.returnValue('hw-1');
      const storage = TestBed.inject(StorageService);
      spyOn(storage, 'get').and.callFake((key: string) =>
        key === 'gigaId' ? 'giga-1' : undefined
      );
      clearStorage = spyOn(storage, 'clear');
      deactivate = spyOn(TestBed.inject(SchoolService), 'deactivateDevice').and.returnValue(of({}));
      captureNow = spyOn(TestBed.inject(PosthogService), 'captureNow');
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
  });
  // TODO: add more tests!
});
