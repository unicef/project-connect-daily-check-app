import { ComponentFixture, TestBed, waitForAsync } from '@angular/core/testing';
import { IonicModule } from '@ionic/angular';
import { RouterTestingModule } from '@angular/router/testing';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideHttpClient, withInterceptorsFromDi } from '@angular/common/http';
import { TranslateModule } from '@ngx-translate/core';
import { Network } from '@awesome-cordova-plugins/network/ngx';
import { ConfirmschoolPage } from './confirmschool.page';
import { DatePipe } from '@angular/common';

describe('ConfirmschoolPage', () => {
  let component: ConfirmschoolPage;
  let fixture: ComponentFixture<ConfirmschoolPage>;

  beforeEach(waitForAsync(() => {
    // ConfirmschoolPage's constructor reads applicationLanguage synchronously;
    // seed it so component creation doesn't throw in a fresh test environment.
    localStorage.setItem(
      'savedSettings',
      JSON.stringify({ applicationLanguage: { code: 'en', label: 'English' } })
    );

    TestBed.configureTestingModule({
    declarations: [ConfirmschoolPage],
    imports: [IonicModule.forRoot(),
        RouterTestingModule,
        TranslateModule.forRoot()],
    providers: [
        DatePipe,
        Network,
        provideHttpClient(withInterceptorsFromDi()),
        provideHttpClientTesting()
    ]
}).compileComponents();

    fixture = TestBed.createComponent(ConfirmschoolPage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  }));

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  afterEach(() => {
    localStorage.removeItem('savedSettings');
    TestBed.resetTestingModule();
  });
});
