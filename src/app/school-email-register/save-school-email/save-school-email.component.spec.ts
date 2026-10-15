import { ComponentFixture, TestBed, waitForAsync } from '@angular/core/testing';
import { IonicModule } from '@ionic/angular';
import { TranslateModule } from '@ngx-translate/core';

import { SaveSchoolEmailComponent } from './save-school-email.component';

describe('SaveSchoolEmailComponent', () => {
  let component: SaveSchoolEmailComponent;
  let fixture: ComponentFixture<SaveSchoolEmailComponent>;

  beforeEach(waitForAsync(() => {
    TestBed.configureTestingModule({
      // Declared in SchoolEmailRegisterModule; its template uses the translate
      // pipe for the facility label.
      declarations: [SaveSchoolEmailComponent],
      imports: [IonicModule.forRoot(), TranslateModule.forRoot()],
    }).compileComponents();

    fixture = TestBed.createComponent(SaveSchoolEmailComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  }));

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
