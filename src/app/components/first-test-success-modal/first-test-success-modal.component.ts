import { Component, Input, OnInit, OnDestroy } from '@angular/core';
import { ModalController } from '@ionic/angular';
import { TranslateService } from '@ngx-translate/core';
import { IdentityService } from '../../services/identity.service';

@Component({
  selector: 'app-first-test-success-modal',
  templateUrl: './first-test-success-modal.component.html',
  styleUrls: ['./first-test-success-modal.component.scss'],
  standalone: false,
})
export class FirstTestSuccessModalComponent implements OnInit, OnDestroy {
  @Input() schoolInfo: any;
  @Input() selectedCountry: string;
  @Input() schoolId: string;

  countdown: number = 10;
  facilityLabelKey = 'facilityType.school';
  private countdownTimer: any;

  constructor(
    private modalController: ModalController,
    public translate: TranslateService,
    private identityService: IdentityService
  ) {
    this.facilityLabelKey = `facilityType.${this.identityService.getFacilityType()}`;
  }

  ngOnInit() {
    this.startCountdown();
  }

  ngOnDestroy() {
    this.clearTimer();
  }

  /**
   * Start the 5-second countdown timer
   */
  private startCountdown() {
    this.countdownTimer = setInterval(() => {
      this.countdown--;
      if (this.countdown <= 0) {
        this.dismiss();
      }
    }, 1000);
  }

  /**
   * Clear the countdown timer
   */
  private clearTimer() {
    if (this.countdownTimer) {
      clearInterval(this.countdownTimer);
      this.countdownTimer = null;
    }
  }

  /**
   * Close the modal
   */
  dismiss() {
    this.clearTimer();
    this.modalController.dismiss();
  }
}
