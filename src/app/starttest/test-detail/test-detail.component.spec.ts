import { ComponentFixture, TestBed, waitForAsync } from '@angular/core/testing';
import { IonicModule } from '@ionic/angular';
import { RouterTestingModule } from '@angular/router/testing';
import { provideHttpClient, withInterceptorsFromDi } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';

import { TestDetailComponent } from './test-detail.component';
import { SharedService } from 'src/app/services/shared-service.service';

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

  it('reloads the table when the history changes while it is open', () => {
    const loadData = spyOn(component, 'loadData');
    TestBed.inject(SharedService).broadcast('history:measurement:change');
    expect(loadData).toHaveBeenCalled();
  });

  it('stops listening once destroyed', () => {
    const loadData = spyOn(component, 'loadData');
    fixture.destroy();
    TestBed.inject(SharedService).broadcast('history:measurement:change');
    expect(loadData).not.toHaveBeenCalled();
  });

  afterEach(() => {
    localStorage.clear();
    TestBed.resetTestingModule();
  });
});
