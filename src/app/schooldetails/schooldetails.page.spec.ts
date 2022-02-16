import { ComponentFixture, TestBed, waitForAsync } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { IonicModule } from '@ionic/angular';
import { RouterTestingModule } from "@angular/router/testing";
import { TranslateModule } from '@ngx-translate/core';
import { SchooldetailsPage } from './schooldetails.page';

describe('SchooldetailsPage', () => {
  let component: SchooldetailsPage;
  let fixture: ComponentFixture<SchooldetailsPage>;

  beforeEach(waitForAsync(() => {
    TestBed.configureTestingModule({
      declarations: [ SchooldetailsPage ],
      imports: [
        IonicModule.forRoot(),
        RouterTestingModule, 
        HttpClientTestingModule,
        TranslateModule.forRoot()
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(SchooldetailsPage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  }));

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
