import { ComponentFixture, TestBed, waitForAsync } from '@angular/core/testing';
import { IonicModule } from '@ionic/angular';
import { RouterTestingModule } from '@angular/router/testing';

import { SelectedDetailComponent } from './selected-detail.component';

describe('SelectedDetailComponent', () => {
  let component: SelectedDetailComponent;
  let fixture: ComponentFixture<SelectedDetailComponent>;

  beforeEach(waitForAsync(() => {
    TestBed.configureTestingModule({
      // Standalone component: it is imported, not declared.
      imports: [
        IonicModule.forRoot(),
        RouterTestingModule,
        SelectedDetailComponent,
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(SelectedDetailComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  }));

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
