import { ComponentFixture, TestBed, waitForAsync } from '@angular/core/testing';
import { IonicModule } from '@ionic/angular';
import { SchoolsuccessPage } from './schoolsuccess.page';
import { RouterTestingModule } from "@angular/router/testing";
describe('SchoolsuccessPage', () => {
  let component: SchoolsuccessPage;
  let fixture: ComponentFixture<SchoolsuccessPage>;

  beforeEach(waitForAsync(() => {
    TestBed.configureTestingModule({
      declarations: [ SchoolsuccessPage ],
      imports: [IonicModule.forRoot(), RouterTestingModule]
    }).compileComponents();

    fixture = TestBed.createComponent(SchoolsuccessPage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  }));

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
