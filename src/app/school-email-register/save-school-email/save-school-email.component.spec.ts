import { ComponentFixture, TestBed, waitForAsync } from '@angular/core/testing';
import { IonicModule } from '@ionic/angular';

import { SaveSchoolEmailComponent } from './save-school-email.component';

describe('SaveSchoolEmailComponent', () => {
  let component: SaveSchoolEmailComponent;
  let fixture: ComponentFixture<SaveSchoolEmailComponent>;

  beforeEach(waitForAsync(() => {
    TestBed.configureTestingModule({
      // Standalone component: it is imported, not declared.
      imports: [IonicModule.forRoot(), SaveSchoolEmailComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(SaveSchoolEmailComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  }));

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
