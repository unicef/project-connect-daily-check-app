import { ComponentFixture, TestBed, waitForAsync } from '@angular/core/testing';
import { IonicModule } from '@ionic/angular';
import { RouterTestingModule } from '@angular/router/testing';
import { provideHttpClient, withInterceptorsFromDi } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';

import { TestDetailComponent } from './test-detail.component';

describe('TestDetailComponent', () => {
  let component: TestDetailComponent;
  let fixture: ComponentFixture<TestDetailComponent>;

  beforeEach(waitForAsync(() => {
    // The template renders `school.name`, and ngOnInit only fills `school`
    // when a registration is stored. Seed one so the first render has data.
    localStorage.setItem('schoolId', 'ext-1');
    localStorage.setItem(
      'schoolInfo',
      JSON.stringify({ name: 'Spain Test School 01', country: 'ES' })
    );

    TestBed.configureTestingModule({
      declarations: [TestDetailComponent],
      imports: [IonicModule.forRoot(), RouterTestingModule],
      providers: [
        provideHttpClient(withInterceptorsFromDi()),
        provideHttpClientTesting(),
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(TestDetailComponent);
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
