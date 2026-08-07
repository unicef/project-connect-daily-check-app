import { ComponentFixture, TestBed, waitForAsync } from '@angular/core/testing';
import { IonicModule } from '@ionic/angular';
import { RouterTestingModule } from '@angular/router/testing';

import { SaveSchoolEmailComponent } from './save-school-email.component';

describe('SaveSchoolEmailComponent', () => {
  let component: SaveSchoolEmailComponent;
  let fixture: ComponentFixture<SaveSchoolEmailComponent>;

  beforeEach(waitForAsync(() => {
    TestBed.configureTestingModule({
      imports: [SaveSchoolEmailComponent, IonicModule.forRoot(), RouterTestingModule]
    }).compileComponents();

    fixture = TestBed.createComponent(SaveSchoolEmailComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  }));

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
