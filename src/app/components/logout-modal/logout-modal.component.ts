import { Component, OnInit } from '@angular/core';
import { ModalController } from '@ionic/angular';
import { TranslateService } from '@ngx-translate/core';
import { StorageService } from '../../services/storage.service';
import { IdentityService } from '../../services/identity.service';

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
  facilityLabelKey = 'facilityType.school';

  constructor(
    private modalController: ModalController,
    public translate: TranslateService,
    private storage: StorageService,
    private identityService: IdentityService
  ) {}

  ngOnInit() {
    // facilityId || legacy schoolId — v2 installs never write 'schoolId'
    this.schoolId = this.identityService.getFacilityId() || '';
    this.facilityLabelKey = `facilityType.${this.identityService.getFacilityType()}`;
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
    // Check if entered facility ID matches (case-insensitive)
    if (
      this.enteredSchoolId.trim().toLowerCase() ===
      this.schoolId.trim().toLowerCase()
    ) {
      this.modalController.dismiss({ action: 'logout' });
    } else {
      // Error message is now handled by translation in template
      this.errorMessage = 'error';
    }
  }

  /**
   * Clear error when user types
   */
  onInputChange() {
    this.errorMessage = '';
  }
}
