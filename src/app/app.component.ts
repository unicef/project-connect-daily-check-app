import { Component } from '@angular/core';
import { IonPopover, MenuController, ModalController } from '@ionic/angular';
import { Router } from '@angular/router';
import { TranslateService } from '@ngx-translate/core';
import { StorageService } from '../app/services/storage.service';
import { SettingsService } from './services/settings.service';
import { SharedService } from './services/shared-service.service';
import { HistoryService } from './services/history.service';
import { ScheduleService } from './services/schedule.service';
import { environment } from '../environments/environment'; // './esrc/environments/environment';
import { PingResult, PingService } from './services/ping.service';
import { IndexedDBService } from './services/indexed-db.service';
import { SyncService } from './services/sync.service';
import { WhatsNewService } from './services/whats-new.service';
import { WhatsNewModalComponent } from './components/whats-new-modal/whats-new-modal.component';
import { LogoutModalComponent } from './components/logout-modal/logout-modal.component';
import { HardwareIdService } from './services/hardware-id.service';
import { SchoolService } from './services/school.service';

// const shell = require('electron').shell;
@Component({
  selector: 'app-root',
  templateUrl: 'app.component.html',
  styleUrls: ['app.component.scss'],
  standalone: false,
})
export class AppComponent {
  languages = environment.languages;
  filteredLanguages = [];
  languageSearch = '';
  selectedLanguage: string;
  selectedLanguageName: string;
  isToastOpen = false;
  toastMessage = '';
  toastColor = 'success';
  showCopySuccess = false;
  school: any;
  historyState: any;
  availableSettings: any;
  scheduleSemaphore: any;
  // eslint-disable-next-line @typescript-eslint/naming-convention
  app_version: any;
  device_id: string;
  device_id_short: string;
  appName = environment.appName;
  showAboutMenu = environment.showAboutMenu;
  testOptions: string[] = ['Ping', 'Download', 'Upload', 'Latency'];
  searchTerm = 'Ping';
  filteredOptions: string[] = [];
  showDropdown: boolean = false;
  networks = [
    { name: 'WIFI 1', ssid: 'SSID', checked: false },
    { name: 'WIFI 2', ssid: 'SSID', checked: false },
    { name: 'LAN', ssid: 'SSID', checked: false },
  ];
  networkSelected = false;
  whatsNewReleases: any[] = [];
  constructor(
    private menu: MenuController,
    private storage: StorageService,
    public translate: TranslateService,
    private sharedService: SharedService,
    private historyService: HistoryService,
    private settingsService: SettingsService,
    private scheduleService: ScheduleService,
    private pingService: PingService,
    private localStorageService: IndexedDBService,
    private syncService: SyncService,
    private whatsNewService: WhatsNewService,
    private modalController: ModalController,
    private hardwareIdService: HardwareIdService,
    private router: Router,
    private schoolService: SchoolService,
  ) {
    this.filteredOptions = [];
    this.selectedLanguage =
      this.settingsService.get('applicationLanguage')?.code ??
      translate.defaultLang;
    this.languageSearch =
      this.languages.find((l) => l?.code === this.selectedLanguage)?.label ??
      '';
    translate.setDefaultLang('en');
    const appLang = this.settingsService.get('applicationLanguage') ?? {
      code: 'en',
    };
    this.translate.use(appLang.code);
    this.app_version = environment.app_version;
    // Use system hardware ID instead of schoolUserId
    this.device_id =
      this.hardwareIdService.getHardwareId() ||
      this.storage.get('system_hardware_id') ||
      'unknown-device';
    // Show the full device ID as requested
    this.device_id_short = this.device_id;
    if (this.storage.get('schoolId')) {
      this.school = JSON.parse(this.storage.get('schoolInfo'));
    }
    this.sharedService.on(
      'settings:changed',
      (nameValue: { name: string; value: { code: string } }) => {
        if (nameValue.name === 'applicationLanguage') {
          translate.use(nameValue.value.code);
        }
      }
    );

    //15 min call to 3 diff hosts
    // 2hours save the data from localstorage
    //if it fails thn delete from local storage

    this.settingsService.setSetting(
      'scheduledTesting',
      this.settingsService.currentSettings.scheduledTesting
    );
    this.settingsService.setSetting(
      'scheduleInterval',
      this.settingsService.currentSettings.scheduleInterval
    );
    this.availableSettings = this.settingsService.availableSettings;
    if (this.settingsService.currentSettings.scheduledTesting) {
      this.refreshSchedule();
    }
    this.sharedService.on('semaphore:refresh', this.refreshSchedule.bind(this));

    this.sharedService.on(
      'history:measurement:change',
      this.refreshHistory.bind(this)
    );

    // Listen for registration completion to update device ID
    this.sharedService.on(
      'registration:completed',
      this.updateDeviceId.bind(this)
    );
    this.refreshHistory();
    this.initiatePingService();
    setInterval(() => {
      this.scheduleService.initiate();
    }, 60000);

    // Check for What's New dialog after app initialization
    this.checkAndShowWhatsNew();

    // Load release notes for help sidebar
    this.loadWhatsNewReleases();

    // Expose service for testing (development only)
    if (!environment.production) {
      (window as any).whatsNewService = this.whatsNewService;
      (window as any).testWhatsNew = {
        simulateFreshInstall: () => this.whatsNewService.simulateFreshInstall(),
        simulateUpdate: (from?: string) =>
          this.whatsNewService.simulateVersionUpdate(from),
        forceShow: () => this.whatsNewService.forceShowForCurrentVersion(),
        showState: () => this.whatsNewService.logDebugState(),
        triggerCheck: () => this.checkAndShowWhatsNew(),
      };
      console.log('🧪 Testing helpers available: window.testWhatsNew');
    }
  }

  startSyncingPeriodicProcess() {
    // Start periodic checks every 15 minutes (15 * 60 * 1000 ms)
    this.pingService.startPeriodicChecks(
      15 * 60 * 1000,
      (result: PingResult | null) => {
        if (result) {
          console.log('Ping result:', result);
          this.localStorageService.savePingResult(result);
        } else {
          console.log('Ping skipped: Outside active hours.');
        }
      }
    );
    this.syncService.startPeriodicSync();
  }

  async initiatePingService() {
    try {
      // if (
      //   !(await this.settingsService.getFeatureFlags())?.pingService === true
      // ) {
      //   return console.log('Ping service is disabled, skipping Ping service');
      // }
      this.startSyncingPeriodicProcess();
    } catch (error) {
      console.error('Error during Ping initiation:', error);
    }
  }

  openSecond() {
    if (this.storage.get('schoolId')) {
      this.school = JSON.parse(this.storage.get('schoolInfo'));
    }
    this.menu.enable(true, 'second');
    this.menu.open('second');
  }

  openThird() {
    this.menu.enable(true, 'third');
    this.menu.open('third');
  }

  openFourth() {
    this.menu.enable(true, 'fourth');
    this.menu.open('fourth');
  }

  closeMenu() {
    this.menu.enable(true, 'setting');
    this.menu.close();
  }

  backMenu() {
    this.closeMenu();
    this.menu.enable(true, 'setting');
    this.menu.open('setting');
  }
  cleanHistory() {
    this.historyService.set({});
  }

  filterLanguages(event: any) {
    const langSearched = event.target.value.toLowerCase();
    this.languageSearch = event.target.value;
    this.filteredLanguages = this.languages.filter((option) =>
      option.label.toLowerCase().includes(langSearched)
    );
  }

  selectLanguageDropdown(option: any) {
    this.languageSearch = option.label;
    console.log(this.searchTerm);
    this.filteredLanguages = [];
    this.settingsService.setSetting(
      'applicationLanguage',
      this.languages.find((l) => l.code === option.code)
    );
    // this.selectedLanguageName = this.languages.find(
    //   (l) => l.code === option.code
    // ).label;
    window.location.reload();
    // Hide the dropdown
  }
  filterOptions(event: any) {
    const term = event.target.value.toLowerCase();
    // Filter based on user input
    this.searchTerm = event.target.value;
    this.filteredOptions = this.testOptions.filter((option) =>
      option.toLowerCase().includes(term)
    );

    // Show dropdown if there's at least one match and user has typed something
    this.showDropdown =
      this.filteredOptions.length > 0 && this.searchTerm.length > 0;
  }

  selectOption(option: string) {
    // Set the input to the selected option
    this.searchTerm = option;
    this.filteredOptions = [];
    // Hide the dropdown
    this.showDropdown = false;
  }
  refreshHistory() {
    const data = this.historyService.get();
    const dataConsumed = data.measurements.reduce(
      (p: any, c: { results: { [x: string]: any } }) =>
        p + c.results.receivedBytes,
      0
    );
    this.historyState = { dataConsumed };
  }

  onCheckboxChange() {
    // Check if at least one network is selected
    this.networkSelected = this.networks.some((network) => network.checked);
  }

  confirmSelection() {
    // Handle the confirm logic
    // e.g., call an API, or navigate to another page
    console.log(
      'Selection confirmed:',
      this.networks.filter((n) => n.checked)
    );
  }

  refreshSchedule() {
    this.scheduleSemaphore = this.scheduleService.getSemaphore();
  }

  openExternalUrl(href) {
    this.settingsService.getShell().shell.openExternal(href);
  }

  closeHelpenu() {
    this.menu.enable(true, 'help');
    this.menu.close();
  }
  backHelpMenu() {
    this.closeMenu();
    this.menu.enable(true, 'help');
    this.menu.open('help');
  }
  openHelpMenu(menuid: string) {
    this.menu.enable(true, menuid);
    this.menu.open(menuid);
  }
  async copy(text: string): Promise<boolean> {
    try {
      // Try modern clipboard API first
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(text);
      } else {
        // Fallback for older browsers or non-secure contexts
        this.fallbackCopyTextToClipboard(text);
      }

      // Show temporary success state with checkmark
      this.showCopySuccess = true;
      console.log('Text copied to clipboard:', text);

      // Hide success state after 3 seconds
      setTimeout(() => {
        this.showCopySuccess = false;
      }, 3000);

      return true;
    } catch (error) {
      const errorMessage = this.translate.instant('app.device-id-copy-failed');
      this.showToast(errorMessage, 'danger');
      console.error('Failed to copy to clipboard:', error);
      return false;
    }
  }

  private fallbackCopyTextToClipboard(text: string): void {
    const textArea = document.createElement('textarea');
    textArea.value = text;

    // Avoid scrolling to bottom
    textArea.style.top = '0';
    textArea.style.left = '0';
    textArea.style.position = 'fixed';
    textArea.style.opacity = '0';

    document.body.appendChild(textArea);
    textArea.focus();
    textArea.select();

    try {
      document.execCommand('copy');
    } catch (err) {
      throw new Error('Fallback copy method failed');
    }

    document.body.removeChild(textArea);
  }

  private showToast(message: string, color: string = 'success') {
    this.toastMessage = message;
    this.toastColor = color;
    this.isToastOpen = true;
    // Auto-close toast after 3 seconds
    setTimeout(() => {
      this.isToastOpen = false;
    }, 3000);
  }

  setOpen(isOpen: boolean) {
    this.isToastOpen = isOpen;
  }

  /**
   * Check if What's New dialog should be shown and display it
   */
  private async checkAndShowWhatsNew(): Promise<void> {
    try {
      // Add a small delay to ensure app is fully initialized
      setTimeout(async () => {
        if (this.whatsNewService.shouldShowWhatsNewDialog()) {
          await this.showWhatsNewDialog();
        }
      }, 1000);
    } catch (error) {
      console.warn("Error checking What's New dialog:", error);
    }
  }

  /**
   * Display the What's New modal dialog
   */
  private async showWhatsNewDialog(): Promise<void> {
    try {
      this.whatsNewService
        .getReleaseDataForCurrentVersion()
        .subscribe(async (releaseData) => {
          if (releaseData) {
            const modal = await this.modalController.create({
              component: WhatsNewModalComponent,
              cssClass: 'whats-new-modal',
              backdropDismiss: true,
              componentProps: {
                releaseData: releaseData,
              },
            });

            modal.onDidDismiss().then(() => {
              // Mark dialog as shown after user dismisses it
              this.whatsNewService.markDialogAsShown();
            });

            await modal.present();
          }
        });
    } catch (error) {
      console.error("Error showing What's New dialog:", error);
      // Mark as shown even if there's an error to prevent infinite retries
      this.whatsNewService.markDialogAsShown();
    }
  }

  /**
   * Load release notes for the help sidebar
   */
  private loadWhatsNewReleases(): void {
    this.whatsNewService.getReleaseNotes().subscribe({
      next: (releaseNotes) => {
        // Convert release notes object to array and sort by version (newest first)
        this.whatsNewReleases = Object.entries(releaseNotes)
          .map(([version, data]: [string, any]) => ({
            version,
            ...data,
          }))
          .sort((a, b) => this.compareVersions(b.version, a.version))
          .slice(0, 5); // Show only the latest 5 releases
      },
      error: (error) => {
        console.warn('Failed to load release notes for sidebar:', error);
        this.whatsNewReleases = [];
      },
    });
  }

  /**
   * Update device ID from storage after registration completion
   */
  private updateDeviceId(): void {
    const newDeviceId = this.storage.get('schoolUserId');
    if (newDeviceId) {
      this.device_id = newDeviceId;
      this.device_id_short = newDeviceId;
      console.log('Device ID updated after registration:', newDeviceId);
    }
  }

  /**
   * Compare version strings (simple semantic version comparison)
   */
  private compareVersions(a: string, b: string): number {
    const aParts = a.split('.').map(Number);
    const bParts = b.split('.').map(Number);

    for (let i = 0; i < Math.max(aParts.length, bParts.length); i++) {
      const aPart = aParts[i] || 0;
      const bPart = bParts[i] || 0;

      if (aPart > bPart) return 1;
      if (aPart < bPart) return -1;
    }

    return 0;
  }

  /**
   * Open external release notes page
   */
  openReleaseNotes(): void {
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
  }

  /**
   * Open logout confirmation modal
   */
  async openLogoutModal(): Promise<void> {
    const modal = await this.modalController.create({
      component: LogoutModalComponent,
      cssClass: 'logout-modal',
      backdropDismiss: true,
    });

    modal.onDidDismiss().then((result) => {
      if (result.data && result.data.action === 'logout') {
        this.handleLogout();
      }
    });

    await modal.present();
  }

  /**
   * Handle logout action - deactivate device, clear localStorage and redirect to home
   */
  private async handleLogout(): Promise<void> {
    try {
      // Close the settings menu
      this.closeMenu();

      // Get hardware ID and giga ID before clearing storage
      const hardwareId = this.hardwareIdService.getHardwareId();
      const gigaId = this.storage.get('gigaId');
      await this.localStorageService.deleteAllDatabases();

      // Deactivate device on backend if we have the required IDs
      if (hardwareId && gigaId) {
        console.log('Deactivating device:', { hardwareId, gigaId });
        try {
          await this.schoolService
            .deactivateDevice(hardwareId, gigaId)
            .toPromise();
          console.log('✅ Device marked as inactive on backend');
        } catch (deactivateError) {
          console.error(
            '⚠️ Error deactivating device on backend:',
            deactivateError
          );
          // Continue with logout even if deactivation fails
        }
      } else {
        console.warn(
          '⚠️ Missing hardware ID or giga ID, skipping backend deactivation'
        );
      }

      // Clear all localStorage data
      await this.storage.clear();

      // Show success toast
      this.showToast('Logged out successfully', 'success');

      // Navigate to home page after a brief delay
      setTimeout(() => {
        this.router.navigate(['/home']).then(() => {
          // Reload the page to reset the app state
          window.location.reload();
        });
      }, 500);
    } catch (error) {
      console.error('Error during logout:', error);
      this.showToast('Error during logout. Please try again.', 'danger');
    }
  }
}
