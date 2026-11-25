import { Component, OnInit } from '@angular/core';
import { ModalController } from '@ionic/angular';
import { TranslateService } from '@ngx-translate/core';
import { StorageService } from '../../services/storage.service';
import { PosthogService } from '../../services/posthog.service';
import { AnalyticsEvent } from '../../analytics/analytics-events';

@Component({
  selector: 'app-logout-modal',
  templateUrl: './logout-modal.component.html',
  styleUrls: ['./logout-modal.component.scss'],
  standalone: false,
})
export class LogoutModalComponent implements OnInit {
  schoolId: string = '';
  enteredSchoolId: string = '';
  errorMessage: string = '';

  constructor(
    private modalController: ModalController,
    public translate: TranslateService,
    private storage: StorageService,
    private posthog: PosthogService
  ) {}

  ngOnInit() {
    // Get school ID from localStorage
    this.schoolId = this.storage.get('schoolId') || '';
  }

  /**
   * Close the modal without logging out
   */
  dismiss() {
    this.modalController.dismiss({ action: 'cancel' });
  }

  /**
   * Validate and confirm logout
   */
  confirmLogout() {
    // Check if entered school ID matches
    if (this.enteredSchoolId.trim() === this.schoolId.trim()) {
      this.modalController.dismiss({ action: 'logout' });
    } else {
      // Error message is now handled by translation in template
      this.errorMessage = 'error';
      // The troubleshooting guide sends people here to fix a wrong school ID;
      // a typed ID that doesn't match is where they get stuck.
      this.posthog.capture(AnalyticsEvent.LogoutFailed, {
        error_code: 'wrong_school_id',
        http_status: null,
        endpoint: null,
        error_message: null,
      });
    }
  }

  /**
   * Clear error when user types
   */
  onInputChange() {
    this.errorMessage = '';
  }
}
