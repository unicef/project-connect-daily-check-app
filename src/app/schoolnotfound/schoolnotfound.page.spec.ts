import { ComponentFixture, TestBed, waitForAsync } from '@angular/core/testing';
import { IonicModule } from '@ionic/angular';
import { RouterTestingModule } from "@angular/router/testing";
import { TranslateModule } from '@ngx-translate/core';
import { SchoolnotfoundPage } from './schoolnotfound.page';
import { ActivatedRoute } from "@angular/router";
describe('SchoolnotfoundPage', () => {
  let component: SchoolnotfoundPage;
  let fixture: ComponentFixture<SchoolnotfoundPage>;
  let activatedroute: ActivatedRoute; 

  beforeEach(waitForAsync(() => {
    TestBed.configureTestingModule({
      declarations: [ SchoolnotfoundPage ],
      imports: [
        IonicModule.forRoot(), 
        RouterTestingModule, 
        TranslateModule.forRoot()
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
    TestBed.resetTestingModule();
  });
});
