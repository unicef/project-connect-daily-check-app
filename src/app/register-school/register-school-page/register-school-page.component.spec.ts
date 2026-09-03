import { ComponentFixture, TestBed, waitForAsync } from '@angular/core/testing';
import { IonicModule } from '@ionic/angular';
import { RouterTestingModule } from '@angular/router/testing';
import { TranslateModule } from '@ngx-translate/core';
import { provideHttpClient, withInterceptorsFromDi } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';

import { RegisterSchoolPageComponent } from './register-school-page.component';

describe('RegisterSchoolPageComponent', () => {
  let component: RegisterSchoolPageComponent;
  let fixture: ComponentFixture<RegisterSchoolPageComponent>;

  beforeEach(waitForAsync(() => {
    // The constructor reads the application language out of saved settings.
    localStorage.setItem(
      'savedSettings',
      JSON.stringify({ applicationLanguage: { code: 'en' } })
    );

    TestBed.configureTestingModule({
      declarations: [RegisterSchoolPageComponent],
      imports: [
        IonicModule.forRoot(),
        RouterTestingModule,
        TranslateModule.forRoot(),
      ],
      providers: [
        provideHttpClient(withInterceptorsFromDi()),
        provideHttpClientTesting(),
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(RegisterSchoolPageComponent);
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
