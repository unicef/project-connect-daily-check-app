import { Component, Input, OnInit } from '@angular/core';
import { ModalController } from '@ionic/angular';
import { TranslateService } from '@ngx-translate/core';
import { environment } from 'src/environments/environment';

export interface ReleaseData {
  version: string;
  title: string;
  date: string;
  items: string[];
}

@Component({
  selector: 'app-whats-new-modal',
  templateUrl: './whats-new-modal.component.html',
  styleUrls: ['./whats-new-modal.component.scss'],
  standalone: false,
})
export class WhatsNewModalComponent implements OnInit {
  @Input() releaseData: ReleaseData;

  appName = environment.appName;
  private isDismissed = false;

  constructor(
    private modalController: ModalController,
    public translate: TranslateService
  ) {}

  ngOnInit() {
    // Component initialization if needed
  }

  /**
   * Close the modal
   */
  dismiss() {
    if (this.isDismissed) return;
    this.isDismissed = true;
    this.modalController.dismiss();
  }

  /**
   * Open release notes - can be customized to open external link or internal page
   */
  openReleaseNotes() {
    // For now, just dismiss the modal
    // In the future, this could open a browser window or navigate to release notes page
    if (environment.isElectron && window.require) {
      const { shell } = window.require('electron');
      shell.openExternal(
        'https://github.com/unicef/project-connect-daily-check-app/releases'
      );
    } else {
      window.open(
        'https://github.com/unicef/project-connect-daily-check-app/releases',
        '_blank'
      );
    }
    this.dismiss();
  }

  /**
   * Navigate to dashboard/main app
   */
  goToDashboard() {
    this.dismiss();
    // Additional navigation logic can be added here if needed
  }
}
