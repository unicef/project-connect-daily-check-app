import { ComponentFixture, TestBed, waitForAsync } from '@angular/core/testing';
import { IonicModule } from '@ionic/angular';
import { RouterTestingModule } from '@angular/router/testing';
import { TranslateModule } from '@ngx-translate/core';
import { Network } from '@awesome-cordova-plugins/network/ngx';
import { provideHttpClient, withInterceptorsFromDi } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';

import { InvalidLocationPage } from './invalidlocation.page';

describe('InvalidLocationPage', () => {
  let component: InvalidLocationPage;
  let fixture: ComponentFixture<InvalidLocationPage>;

  beforeEach(waitForAsync(() => {
    // The constructor reads the application language out of saved settings.
    localStorage.setItem(
      'savedSettings',
      JSON.stringify({ applicationLanguage: { code: 'en' } })
    );

    TestBed.configureTestingModule({
      declarations: [InvalidLocationPage],
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

    fixture = TestBed.createComponent(InvalidLocationPage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  }));

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  afterEach(() => {
    localStorage.clear();
    TestBed.resetTestingModule();
  });
});
