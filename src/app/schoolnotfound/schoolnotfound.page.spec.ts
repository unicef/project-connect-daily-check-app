import { ComponentFixture, TestBed, waitForAsync } from '@angular/core/testing';
import { IonicModule } from '@ionic/angular';
import { RouterTestingModule } from "@angular/router/testing";
import { TranslateModule } from '@ngx-translate/core';
import { SchoolnotfoundPage } from './schoolnotfound.page';
import { ActivatedRoute } from "@angular/router";
import { provideHttpClient, withInterceptorsFromDi } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
describe('SchoolnotfoundPage', () => {
  let component: SchoolnotfoundPage;
  let fixture: ComponentFixture<SchoolnotfoundPage>;
  let activatedroute: ActivatedRoute;

  beforeEach(waitForAsync(() => {
    localStorage.setItem(
      'savedSettings',
      JSON.stringify({ applicationLanguage: { code: 'en', name: 'English' } })
    );
    TestBed.configureTestingModule({
      declarations: [ SchoolnotfoundPage ],
      imports: [
        IonicModule.forRoot(),
        RouterTestingModule,
        TranslateModule.forRoot()
      ],
      providers: [
        provideHttpClient(withInterceptorsFromDi()),
        provideHttpClientTesting()
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(SchoolnotfoundPage);
    activatedroute = TestBed.inject(ActivatedRoute);
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
