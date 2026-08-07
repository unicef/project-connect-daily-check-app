import { ComponentFixture, TestBed, waitForAsync } from '@angular/core/testing';
import { IonicModule } from '@ionic/angular';
import { SchoolsuccessPage } from './schoolsuccess.page';
import { RouterTestingModule } from "@angular/router/testing";
import { TranslateModule } from '@ngx-translate/core';
import { provideHttpClient, withInterceptorsFromDi } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { Network } from '@awesome-cordova-plugins/network/ngx';
describe('SchoolsuccessPage', () => {
  let component: SchoolsuccessPage;
  let fixture: ComponentFixture<SchoolsuccessPage>;

  beforeEach(waitForAsync(() => {
    localStorage.setItem(
      'savedSettings',
      JSON.stringify({ applicationLanguage: { code: 'en', name: 'English' } })
    );
    TestBed.configureTestingModule({
      declarations: [ SchoolsuccessPage ],
      imports: [IonicModule.forRoot(), RouterTestingModule, TranslateModule.forRoot()],
      providers: [
        Network,
        provideHttpClient(withInterceptorsFromDi()),
        provideHttpClientTesting()
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(SchoolsuccessPage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  }));

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  afterEach(() => {
    localStorage.removeItem('savedSettings');
  });
});
