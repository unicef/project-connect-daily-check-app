import { ComponentFixture, TestBed, waitForAsync } from '@angular/core/testing';
import { IonicModule } from '@ionic/angular';
import { RouterTestingModule } from '@angular/router/testing';
import { HttpClientTestingModule } from '@angular/common/http/testing';
import { HttpClientModule } from '@angular/common/http';
import { TranslateModule } from '@ngx-translate/core';
import { ConfirmschoolPage } from './confirmschool.page';
import { DatePipe } from '@angular/common';

describe('ConfirmschoolPage', () => {
  let component: ConfirmschoolPage;
  let fixture: ComponentFixture<ConfirmschoolPage>;

  beforeEach(waitForAsync(() => {
    TestBed.configureTestingModule({
      declarations: [ ConfirmschoolPage ],
      imports: [
        IonicModule.forRoot(),
        RouterTestingModule, 
        HttpClientTestingModule, 
        HttpClientModule, 
        TranslateModule.forRoot()
      ],
      providers: [
        DatePipe
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(ConfirmschoolPage);
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
