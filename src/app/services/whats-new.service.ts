import { Injectable } from '@angular/core';
import { StorageService } from './storage.service';
import { environment } from 'src/environments/environment';
import { Observable, of } from 'rxjs';
import { map } from 'rxjs/operators';
import { TranslateService } from '@ngx-translate/core';

export interface ReleaseNote {
  title: string;
  date: string;
  items: string[];
}

export interface ReleaseNotes {
  [version: string]: ReleaseNote;
}

export interface ReleaseData {
  version: string;
  title: string;
  date: string;
  items: string[];
}

@Injectable({
  providedIn: 'root',
})
export class WhatsNewService {
  private readonly STORAGE_KEY_LAST_VERSION = 'lastKnownAppVersion';
  private readonly STORAGE_KEY_SHOWN_FOR = 'whatsNewShownFor';
  private readonly STORAGE_KEY_ENABLED = 'whatsNewDialogEnabled';

  constructor(
    private storageService: StorageService,
    private translate: TranslateService
  ) {}

  /**
   * Check if the What's New dialog should be shown
   * Returns true only if:
   * 1. App version has changed (not a fresh install)
   * 2. Dialog hasn't been shown for current version yet
   * 3. Feature is enabled
   * 
   * Special case for v2.0.2: Always show on fresh installs
   * Future versions will revert to normal behavior (no dialog on fresh install)
   */
  shouldShowWhatsNewDialog(): boolean {
    const currentVersion = environment.app_version;
    const lastKnownVersion = this.storageService.get(
      this.STORAGE_KEY_LAST_VERSION
    );
    const whatsNewShownFor = this.storageService.get(
      this.STORAGE_KEY_SHOWN_FOR
    );
    const isEnabled = this.storageService.get(this.STORAGE_KEY_ENABLED, true); // Default enabled

    // If feature is disabled, don't show
    if (!isEnabled) {
      return false;
    }

    // If no last known version, this is a fresh install
    if (!lastKnownVersion) {
      // Special case for v2.0.2: Always show dialog on fresh install
      if (currentVersion === '2.0.2') {
        // Don't set lastKnownVersion yet - let markDialogAsShown handle it
        if (whatsNewShownFor !== currentVersion) {
          return true;
        }
      }
      // For future versions: Set current version as last known and don't show dialog
      this.storageService.set(this.STORAGE_KEY_LAST_VERSION, currentVersion);
      return false;
    }

    // If version changed and dialog not shown for current version
    if (
      lastKnownVersion !== currentVersion &&
      whatsNewShownFor !== currentVersion
    ) {
      return true;
    }

    return false;
  }

  /**
   * Mark the What's New dialog as shown for the current version
   */
  markDialogAsShown(): void {
    const currentVersion = environment.app_version;
    this.storageService.set(this.STORAGE_KEY_SHOWN_FOR, currentVersion);
    this.storageService.set(this.STORAGE_KEY_LAST_VERSION, currentVersion);
  }

  /**
   * Get release data for the current version
   */
  getReleaseDataForCurrentVersion(): Observable<ReleaseData | null> {
    const currentVersion = environment.app_version;
    return this.getReleaseNotes().pipe(
      map((releaseNotes) => {
        if (releaseNotes && releaseNotes[currentVersion]) {
          return {
            version: currentVersion,
            ...releaseNotes[currentVersion],
          };
        }
        return null;
      })
    );
  }

  /**
   * Load release notes from translation service
   */
  public getReleaseNotes(): Observable<ReleaseNotes> {
    return this.translate.get('releaseNotes').pipe(
      map((releaseNotes) => {
        // If translation key doesn't exist or is empty, return empty object
        if (!releaseNotes || releaseNotes === 'releaseNotes') {
          console.warn('Release notes not found in translations');
          return {};
        }
        return releaseNotes as ReleaseNotes;
      })
    );
  }

  /**
   * Enable or disable the What's New dialog feature
   */
  setWhatsNewEnabled(enabled: boolean): void {
    this.storageService.set(this.STORAGE_KEY_ENABLED, enabled);
  }

  /**
   * Check if What's New dialog feature is enabled
   */
  isWhatsNewEnabled(): boolean {
    return this.storageService.get(this.STORAGE_KEY_ENABLED, true);
  }

  /**
   * Reset What's New state (useful for testing or troubleshooting)
   */
  resetWhatsNewState(): void {
    localStorage.removeItem(this.STORAGE_KEY_LAST_VERSION);
    localStorage.removeItem(this.STORAGE_KEY_SHOWN_FOR);
  }

  /**
   * Get the last known app version
   */
  getLastKnownVersion(): string | null {
    return this.storageService.get(this.STORAGE_KEY_LAST_VERSION);
  }

  /**
   * Force show What's New dialog for current version (useful for testing)
   */
  forceShowForCurrentVersion(): void {
    const currentVersion = environment.app_version;
    localStorage.removeItem(this.STORAGE_KEY_SHOWN_FOR);
    // Don't update last known version so it thinks there's an update
  }

  // ============= TESTING HELPERS =============

  /**
   * Simulate fresh install (for testing)
   */
  simulateFreshInstall(): void {
    localStorage.removeItem(this.STORAGE_KEY_LAST_VERSION);
    localStorage.removeItem(this.STORAGE_KEY_SHOWN_FOR);
    console.log('✅ Simulated fresh install - dialog should NOT show');
  }

  /**
   * Simulate version update (for testing)
   */
  simulateVersionUpdate(fromVersion: string = '2.0.1'): void {
    localStorage.setItem(this.STORAGE_KEY_LAST_VERSION, fromVersion);
    localStorage.removeItem(this.STORAGE_KEY_SHOWN_FOR);
    this.setWhatsNewEnabled(true);
    console.log(
      `✅ Simulated update from ${fromVersion} to ${environment.app_version} - dialog SHOULD show`
    );
  }

  /**
   * Get current state for debugging
   */
  getDebugState(): any {
    return {
      currentVersion: environment.app_version,
      lastKnownVersion: this.getLastKnownVersion(),
      shownFor: this.storageService.get(this.STORAGE_KEY_SHOWN_FOR),
      enabled: this.isWhatsNewEnabled(),
      shouldShow: this.shouldShowWhatsNewDialog(),
    };
  }

  /**
   * Log current state to console
   */
  logDebugState(): void {
    console.table(this.getDebugState());
  }
}
