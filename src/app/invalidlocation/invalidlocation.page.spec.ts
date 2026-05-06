import { ComponentFixture, TestBed, waitForAsync } from '@angular/core/testing';
import { IonicModule } from '@ionic/angular';
import { RouterTestingModule } from "@angular/router/testing";
import { TranslateModule } from '@ngx-translate/core';
import { InvalidLocationPage } from './invalidlocation.page';
import { ActivatedRoute } from "@angular/router";
describe('InvalidLocationPage', () => {
  let component: InvalidLocationPage;
  let fixture: ComponentFixture<InvalidLocationPage>;
  let activatedroute: ActivatedRoute; 

  beforeEach(waitForAsync(() => {
    TestBed.configureTestingModule({
      declarations: [ InvalidLocationPage ],
      imports: [
        IonicModule.forRoot(), 
        RouterTestingModule, 
        TranslateModule.forRoot()
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(InvalidLocationPage);
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
