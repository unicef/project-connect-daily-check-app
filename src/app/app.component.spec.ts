import { CUSTOM_ELEMENTS_SCHEMA } from '@angular/core';
import { TestBed, waitForAsync } from '@angular/core/testing';
import { IonicModule } from '@ionic/angular';
import { RouterTestingModule } from '@angular/router/testing';
import { TranslateModule } from '@ngx-translate/core';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { Network } from '@awesome-cordova-plugins/network/ngx';
import { provideHttpClient, withInterceptorsFromDi } from '@angular/common/http';

import { of } from 'rxjs';

import { AppComponent } from './app.component';
import { SchoolService } from './services/school.service';
import { IndexedDBService } from './services/indexed-db.service';

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

  describe('logout (TECH-8828)', () => {
    let deactivate: jasmine.Spy;

    beforeEach(() => {
      // The logout navigates and reloads the page after 500 ms; a mocked
      // clock keeps that from happening inside the test runner.
      jasmine.clock().install();
      localStorage.setItem('gigaId', 'giga-9');
      localStorage.setItem('schoolUserId', 'MY-REGISTRATION');
      deactivate = spyOn(TestBed.inject(SchoolService), 'deactivateDevice')
        .and.returnValue(of({ success: true }));
      spyOn(TestBed.inject(IndexedDBService), 'deleteAllDatabases')
        .and.resolveTo();
    });

    afterEach(() => {
      jasmine.clock().uninstall();
      localStorage.clear();
    });

    const logOut = () =>
      (TestBed.createComponent(AppComponent).componentInstance as any)
        .handleLogout();

    it('logs out every registration on the PC when it has a firmware UUID', async () => {
      localStorage.setItem(
        'system_hardware_id',
        JSON.stringify({ hardwareId: 'UUID-1' })
      );

      await logOut();

      expect(deactivate).toHaveBeenCalledWith('UUID-1', 'giga-9', null);
      expect(localStorage.getItem('schoolUserId')).toBeNull();
    });

    it('logs out its own registration on a PC without a firmware UUID', async () => {
      await logOut();

      expect(deactivate).toHaveBeenCalledWith(null, 'giga-9', 'MY-REGISTRATION');
    });

    it("doesn't send the main process's placeholder as a hardware ID", async () => {
      localStorage.setItem(
        'system_hardware_id',
        JSON.stringify({ hardwareId: 'NO_UUID_AVAILABLE' })
      );

      await logOut();

      expect(deactivate).toHaveBeenCalledWith(null, 'giga-9', 'MY-REGISTRATION');
    });
  });
});
