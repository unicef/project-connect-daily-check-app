import { ComponentFixture, TestBed, waitForAsync } from '@angular/core/testing';
import { IonicModule } from '@ionic/angular';
import { TranslateModule, TranslateService } from '@ngx-translate/core';

import { CircularProgressBarComponent } from './circular-progress-bar.component';

describe('CircularProgressBarComponent', () => {
  let component: CircularProgressBarComponent;
  let fixture: ComponentFixture<CircularProgressBarComponent>;
  let translate: TranslateService;

  beforeEach(waitForAsync(() => {
    TestBed.configureTestingModule({
      // Standalone component: it is imported, not declared.
      imports: [
        IonicModule.forRoot(),
        TranslateModule.forRoot(),
        CircularProgressBarComponent,
      ],
    }).compileComponents();

    translate = TestBed.inject(TranslateService);
    fixture = TestBed.createComponent(CircularProgressBarComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  }));

  function useTryAgain(label: string) {
    translate.setTranslation('xx', { startTest: { tryAgain: label } });
    translate.use('xx');
  }

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('keeps a short "try again" label on one line at the original size', () => {
    useTryAgain('TRY AGAIN');
    expect(component.getTryAgainLines()).toEqual(['TRY AGAIN']);
    expect(component.getTryAgainFontSize()).toBe(12);
  });

  it('wraps a long "try again" label onto two smaller lines', () => {
    useTryAgain('БОРИ ДИГАР КӮШИШ КУНЕД');
    expect(component.getTryAgainLines()).toEqual(['БОРИ ДИГАР', 'КӮШИШ КУНЕД']);
    expect(component.getTryAgainFontSize()).toBe(10);
  });

  it('keeps the line break a translation already has', () => {
    useTryAgain('INTENTAR\nDE NUEVO');
    expect(component.getTryAgainLines()).toEqual(['INTENTAR', 'DE NUEVO']);
  });
});
