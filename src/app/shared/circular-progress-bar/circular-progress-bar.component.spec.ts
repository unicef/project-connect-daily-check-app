import { ComponentFixture, TestBed, waitForAsync } from '@angular/core/testing';
import { IonicModule } from '@ionic/angular';

import { CircularProgressBarComponent } from './circular-progress-bar.component';
import { TranslateModule } from '@ngx-translate/core';

describe('CircularProgressBarComponent', () => {
  let component: CircularProgressBarComponent;
  let fixture: ComponentFixture<CircularProgressBarComponent>;

  beforeEach(waitForAsync(() => {
    TestBed.configureTestingModule({
      declarations: [ CircularProgressBarComponent ],
      imports: [TranslateModule.forRoot(), IonicModule.forRoot()]
    }).compileComponents();

    fixture = TestBed.createComponent(CircularProgressBarComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  }));

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
