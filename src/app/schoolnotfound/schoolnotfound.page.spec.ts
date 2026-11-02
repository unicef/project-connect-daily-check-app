import { ComponentFixture, TestBed, waitForAsync } from '@angular/core/testing';
import { IonicModule, NavController } from '@ionic/angular';
import { Router } from '@angular/router';
import { RouterTestingModule } from '@angular/router/testing';
import { NotFound } from './types';
import { TranslateModule } from '@ngx-translate/core';
import { Network } from '@awesome-cordova-plugins/network/ngx';
import { provideHttpClient, withInterceptorsFromDi } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';

import { SchoolnotfoundPage } from './schoolnotfound.page';

describe('SchoolnotfoundPage', () => {
  let component: SchoolnotfoundPage;
  let fixture: ComponentFixture<SchoolnotfoundPage>;

  beforeEach(waitForAsync(() => {
    // The constructor reads the application language out of saved settings.
    localStorage.setItem(
      'savedSettings',
      JSON.stringify({ applicationLanguage: { code: 'en' } })
    );

    TestBed.configureTestingModule({
      declarations: [SchoolnotfoundPage],
      imports: [
        IonicModule.forRoot(),
        RouterTestingModule,
        TranslateModule.forRoot(),
      ],
      providers: [
        // NetworkService injects the Ionic Native Network plugin.
        Network,
        provideHttpClient(withInterceptorsFromDi()),
        provideHttpClientTesting(),
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(SchoolnotfoundPage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  }));

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  describe('tryAgain', () => {
    let router: Router;
    let navCtrl: NavController;

    beforeEach(() => {
      router = TestBed.inject(Router);
      navCtrl = TestBed.inject(NavController);
      spyOn(router, 'navigate').and.resolveTo(true);
      spyOn(navCtrl, 'back');
      component.selectedCountry = 'ES';
      component.detectedCountry = 'ES';
      component.selectedCountryName = 'Spain';
    });

    it('goes back to the search when the school was not found', () => {
      component.reason = NotFound.notFound;
      component.tryAgain();
      expect(router.navigate).toHaveBeenCalledWith([
        'searchschool',
        'ES',
        'ES',
        'Spain',
      ]);
      expect(navCtrl.back).not.toHaveBeenCalled();
    });

    it('returns to the failed step for request errors', () => {
      for (const reason of [
        NotFound.network,
        NotFound.timeout,
        NotFound.server,
        NotFound.registrationFailed,
        NotFound.unknown,
      ]) {
        component.reason = reason;
        component.tryAgain();
      }
      expect(navCtrl.back).toHaveBeenCalledTimes(5);
      expect(router.navigate).not.toHaveBeenCalled();
    });

    it('restarts registration when the saved school is no longer registered', () => {
      component.reason = NotFound.notRegister;
      component.tryAgain();
      expect(router.navigate).toHaveBeenCalledWith(['/home']);
    });
  });

  afterEach(() => {
    localStorage.clear();
    TestBed.resetTestingModule();
  });
});
