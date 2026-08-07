import { ComponentFixture, TestBed, waitForAsync } from '@angular/core/testing';
import { IonicModule } from '@ionic/angular';
import { RouterTestingModule } from '@angular/router/testing';
import { TranslateModule } from '@ngx-translate/core';
import { provideHttpClient, withInterceptorsFromDi } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';

import { TestDetailComponent } from './test-detail.component';

describe('TestDetailComponent', () => {
  let component: TestDetailComponent;
  let fixture: ComponentFixture<TestDetailComponent>;

  beforeEach(waitForAsync(() => {
    localStorage.setItem('schoolId', '12345');
    localStorage.setItem(
      'schoolInfo',
      JSON.stringify({ name: 'Test School', country: 'US' })
    );
    TestBed.configureTestingModule({
      declarations: [ TestDetailComponent ],
      imports: [IonicModule.forRoot(), RouterTestingModule, TranslateModule.forRoot()],
      providers: [
        provideHttpClient(withInterceptorsFromDi()),
        provideHttpClientTesting()
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(TestDetailComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  }));

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  afterEach(() => {
    localStorage.removeItem('schoolId');
    localStorage.removeItem('schoolInfo');
  });
});
