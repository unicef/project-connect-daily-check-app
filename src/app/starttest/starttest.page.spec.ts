import { ComponentFixture, TestBed, waitForAsync } from '@angular/core/testing';
import { IonicModule } from '@ionic/angular';
import { StarttestPage } from './starttest.page';
import { RouterTestingModule } from '@angular/router/testing';
import { HttpClientTestingModule } from '@angular/common/http/testing';
import { Network } from '@awesome-cordova-plugins/network/ngx';
import { TranslateModule } from '@ngx-translate/core';
describe('StarttestPage', () => {
  let component: StarttestPage;
  let fixture: ComponentFixture<StarttestPage>;

  beforeEach(waitForAsync(() => {
    TestBed.configureTestingModule({
      declarations: [ StarttestPage ],
      imports: [IonicModule.forRoot(), RouterTestingModule, HttpClientTestingModule, TranslateModule.forRoot()],
      providers:[
        Network
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(StarttestPage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  }));

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
