import { ComponentFixture, TestBed, waitForAsync } from '@angular/core/testing';
import { IonicModule } from '@ionic/angular';

import { PcdcHeaderComponent } from './pcdc-header.component';
import { provideHttpClient, withInterceptorsFromDi } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { TranslateModule } from '@ngx-translate/core';

describe('PcdcHeaderComponent', () => {
  let component: PcdcHeaderComponent;
  let fixture: ComponentFixture<PcdcHeaderComponent>;

  beforeEach(waitForAsync(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(withInterceptorsFromDi()), provideHttpClientTesting()],
      declarations: [PcdcHeaderComponent],
      imports: [TranslateModule.forRoot(), IonicModule.forRoot()],
    }).compileComponents();

    fixture = TestBed.createComponent(PcdcHeaderComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  }));

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
