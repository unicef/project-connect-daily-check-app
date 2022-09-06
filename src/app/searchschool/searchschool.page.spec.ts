import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { ComponentFixture, TestBed, waitForAsync } from '@angular/core/testing';
import { HttpClientModule } from '@angular/common/http';
import { IonicModule } from '@ionic/angular';
import { RouterTestingModule } from '@angular/router/testing';
import { SearchschoolPage } from './searchschool.page';

describe('SearchschoolPage', () => {
  let component: SearchschoolPage;
  let fixture: ComponentFixture<SearchschoolPage>;
  let httpMock: HttpTestingController;
  beforeEach(waitForAsync(() => {
    TestBed.configureTestingModule({
      declarations: [ SearchschoolPage ],
      imports: [
        IonicModule.forRoot(),
        RouterTestingModule,
        HttpClientModule,
        HttpClientTestingModule
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(SearchschoolPage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  }));

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
