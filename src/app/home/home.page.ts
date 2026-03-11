import { Component } from '@angular/core';
import { Router } from '@angular/router';
import { TranslateService } from '@ngx-translate/core';
import { SettingsService } from '../../app/services/settings.service';
import { NotFound } from '../schoolnotfound/types';
import { LoadingService } from '../services/loading.service';
import { SchoolService } from '../services/school.service';
import { StorageService } from '../services/storage.service';
import { checkRightGigaId, removeUnregisterSchool } from './home.utils';
import { environment } from '../../environments/environment';
import { Capacitor, registerPlugin } from '@capacitor/core';
import { Browser } from '@capacitor/browser';
import { GigaAppPlugin } from '../android/giga-app-android-plugin';
import { HistoryService } from '../services/history.service';
import { HardwareIdService } from '../services/hardware-id.service';
import { isAndroid } from '../android/android_util';

@Component({
  selector: 'app-home',
  templateUrl: 'home.page.html',
  styleUrls: ['home.page.scss'],
  standalone: false,
})
export class HomePage {
  appName = environment.appName;
  appNameSuffix = environment.appNameSuffix;
  privacyUrl1 = 'https://opendatacommons.org/licenses/odbl/1-0/';
  privacyUrl2 = 'https://www.measurementlab.net/privacy/';
  targetUrl = '_blank';
  isPrivacyChecked = false;
  isNative: boolean;
  gigaAppPlugin: any;
  constructor(
    public router: Router,
    public translate: TranslateService,
    private settingsService: SettingsService,
    private storage: StorageService,
    private loading: LoadingService,
    private historyService: HistoryService,
    private readonly schoolService: SchoolService,
    private hardwareIdService: HardwareIdService,
  ) {
    translate.setDefaultLang('en');
    const applicationLanguage = this.settingsService.get('applicationLanguage');
    this.isNative = Capacitor.isNativePlatform();
    if (Capacitor.isNativePlatform()) {
      this.gigaAppPlugin = registerPlugin<any>('GigaAppPlugin');
    }
    if (!applicationLanguage) {
      this.settingsService.setSetting('applicationLanguage', {
        code: 'en',
        name: 'English',
      });
    }
    if (applicationLanguage) {
      if (typeof applicationLanguage === 'string') {
        translate.setDefaultLang(applicationLanguage);
      } else {
        translate.setDefaultLang(applicationLanguage.code);
      }
    }
    const loadingMsg =
      // eslint-disable-next-line max-len
      '<div class="loadContent"><ion-img src="assets/loader/new_loader.gif" class="loaderGif"></ion-img><p class="white" [translate]="\'loading\'">Loading...</p></div>';
    this.loading.present(loadingMsg, 6000, 'pdcaLoaderClass', 'null');

    if (this.storage.get('schoolId')) {
      // User has local registration - check if device is still active
      this.checkDeviceStatusAndProceed();
    } else {
      // No local registration - check if machine is already registered via hardware ID
      this.checkHardwareRegistration();
    }
  }

  isNativeApp(): boolean {
    return Capacitor.isNativePlatform();
  }

  /**
   * Check device status and proceed if active, or clear if deactivated
   */
  private async checkDeviceStatusAndProceed() {
    console.log(
      '🔍 [HomePage] Checking device status for existing registration...',
    );
    const gigaId = this.storage.get('gigaId');

    // Need hardware ID to check status
    const hardwareId = await this.hardwareIdService.ensureHardwareId(10000);

    if (!hardwareId || !gigaId) {
      // Can't check status without hardware ID or gigaId, proceed with existing registration
      console.warn(
        '⚠️ [HomePage] Missing hardwareId or gigaId, proceeding with existing registration',
      );
      this.proceedWithExistingRegistration();
      return;
    }

    try {
      const status = await this.schoolService
        .checkDeviceStatus(hardwareId, gigaId)
        .toPromise();

      console.log('📊 [HomePage] Device status:', status);

      // Failsafe: Check if status and status.data exist
      if (!status || !status.data) {
        console.warn(
          '⚠️ [HomePage] Invalid status response, proceeding with existing registration',
        );
        this.proceedWithExistingRegistration();
        return;
      }

      if (status.data.exists && status.data.is_active === false) {
        // Device was deactivated by another user (logged out)
        console.warn('🚫 [HomePage] Device has been deactivated (logged out)');
        console.log('   Clearing localStorage and forcing new registration...');
        await this.storage.clear();
        this.loading.dismiss();
        // Stay on home page - user will see registration options
      } else if (status.data.exists && status.data.is_active === true) {
        // Device is active, proceed normally
        console.log(
          '✅ [HomePage] Device is active, proceeding with existing registration...',
        );
        this.proceedWithExistingRegistration();
      } else if (!status.data.exists) {
        // Device not found in backend - backward compatibility
        // Keep local data for old registrations before hardware ID tracking
        console.warn(
          '⚠️ [HomePage] Device not found in backend (may be old registration)',
        );
        console.log(
          '   Proceeding with existing registration for backward compatibility...',
        );
        this.proceedWithExistingRegistration();
      }
    } catch (error) {
      console.error('❌ [HomePage] Error checking device status:', error);
      // On API error, proceed with existing registration (fail open)
      // This prevents blocking users if backend is temporarily down
      console.log('   Proceeding with existing registration (fail open)...');
      this.proceedWithExistingRegistration();
    }
  }

  /**
   * Proceed with existing registration flow
   */
  private async proceedWithExistingRegistration() {
    let schoolId = this.storage.get('schoolId');
    const gigaId = this.storage.get('gigaId');
    const schoolUserId = this.storage.get('schoolUserId');

    const getFlagsAndCheckGigaId = async () => {
      try {
        // get the feature flags
        await this.settingsService.getFeatureFlags();
        // check if the gigaId is correct
        schoolId = this.storage.get('schoolId');
        removeUnregisterSchool(
          schoolId,
          this.schoolService,
          this.storage,
          this.settingsService,
        ).then((response) => {
          if (response) {
            this.loading.dismiss();
            if (this.isNative) {
              this.getHistoricalDataForNativeApp();
            }
            this.router.navigate(['/starttest']);
          } else {
            this.loading.dismiss();
            this.router.navigate([
              'schoolnotfound',
              schoolId,
              0,
              0,
              NotFound.notRegister,
            ]);
          }
        });
      } catch (e) {
        if (this.isNative) {
          await this.getHistoricalDataForNativeApp();
        }
        this.router.navigate(['/starttest']);
        this.loading.dismiss();
      }
    };
    getFlagsAndCheckGigaId();
  }

  /**
   * Wait for hardware ID and check for existing registration
   */
  private async checkHardwareRegistration() {
    try {
      console.log('🔍 [HomePage] Starting hardware registration check...');

      // Wait for hardware ID to be available (with 10 second timeout)
      const hardwareId = await this.hardwareIdService.ensureHardwareId(10000);

      if (hardwareId) {
        console.log(
          '🔍 [HomePage] Checking for existing registration with hardware ID:',
          hardwareId,
        );
        await this.checkMachineRegistration(hardwareId);
      } else {
        // No hardware ID available after timeout - proceed normally
        console.warn(
          '⚠️ [HomePage] No hardware ID available, proceeding with normal flow',
        );
        console.log('   User will need to manually register the device');
        this.loading.dismiss();
      }
    } catch (error) {
      console.error(
        '❌ [HomePage] Error in hardware registration check:',
        error,
      );
      this.loading.dismiss();
    }
  }

  /**
   * Check if this machine is already registered using hardware ID
   */
  private async checkMachineRegistration(hardwareId: string) {
    try {
      console.log(
        '🌐 [HomePage] Querying backend for existing registration...',
      );
      const response = await this.schoolService
        .checkRegistrationByHardwareId(hardwareId)
        .toPromise();

      console.log('📥 [HomePage] Backend response:', response);

      // Backend returns: { success: true, data: { exists: true/false, ... }, timestamp, message }
      if (response?.success && response?.data?.exists === true) {
        // Found existing registration - populate localStorage
        console.log(
          '✅ [HomePage] Found existing registration for this machine!',
        );
        console.log('   User ID:', response.data.user_id);
        console.log('   School ID:', response.data.school_id);
        console.log('   Giga ID:', response.data.giga_id_school);
        await this.applyExistingRegistration(response.data);
        this.loading.dismiss();
        console.log('🚀 [HomePage] Navigating to /starttest...');
        this.router.navigate(['/starttest']);
        this.settingsService.setSetting('scheduledTesting', true);
      } else {
        // No registration found - user needs to register
        console.log(
          'ℹ️ [HomePage] No existing registration found for this hardware ID',
        );
        console.log('   User needs to manually register the device');
        this.loading.dismiss();
      }
    } catch (err) {
      // API error - gracefully fallback to normal registration flow
      console.error('❌ [HomePage] Error checking machine registration:', err);
      console.log('   Falling back to normal registration flow');
      this.loading.dismiss();
    }
  }

  async storeRegistrationDataAndScheduleSpeedTest(
    registrationData: any,
    apiKey: String,
    baseUrl: String,
    ipInfoToken: String,
  ) {
    const result = await this.gigaAppPlugin.storeAndScheduleSpeedTest({
      browser_id: registrationData?.user_id || '',
      school_id: registrationData?.school_id || '',
      giga_school_id: registrationData?.giga_id_school || '',
      country_code: registrationData?.country_code || '',
      ip_address: registrationData?.ip_address || '',
      mlab_uploadKey: apiKey || '',
      base_url: baseUrl || '',
      ip_info_token: ipInfoToken || '',
    });
    console.log('GIGA Plugin Call Result : ', result);
  }

  /**
   * Populate localStorage with existing registration data
   */
  private async applyExistingRegistration(registrationData: any) {
    console.log(
      '💾 [HomePage] Applying existing registration to localStorage...',
    );
    console.log('   Registration data:', registrationData);

    // Only set values that are non-null and not undefined
    if (registrationData.user_id != null) {
      await this.storage.set('schoolUserId', registrationData.user_id);
      console.log('   ✓ Set schoolUserId:', registrationData.user_id);
    }
    if (registrationData.school_id != null) {
      await this.storage.set('schoolId', registrationData.school_id);
      await this.storage.set('school_id', registrationData.school_id);
      console.log('   ✓ Set schoolId:', registrationData.school_id);
    }
    if (registrationData.giga_id_school != null) {
      await this.storage.set('gigaId', registrationData.giga_id_school);
      console.log('   ✓ Set gigaId:', registrationData.giga_id_school);
    }
    if (registrationData.mac_address != null) {
      await this.storage.set('macAddress', registrationData.mac_address);
      console.log('   ✓ Set macAddress:', registrationData.mac_address);
    }
    if (registrationData.os != null) {
      await this.storage.set('deviceType', registrationData.os);
      console.log('   ✓ Set deviceType:', registrationData.os);
    }
    if (registrationData.ip_address != null) {
      await this.storage.set('ip_address', registrationData.ip_address);
      console.log('   ✓ Set ip_address:', registrationData.ip_address);
    }
    if (registrationData.app_version != null) {
      await this.storage.set('version', registrationData.app_version);
      console.log('   ✓ Set version:', registrationData.app_version);
    }
    if (registrationData.country_code != null) {
      await this.storage.set('country_code', registrationData.country_code);
      console.log('   ✓ Set country_code:', registrationData.country_code);
    }

    // Handle school_info which might be an object or string
    if (registrationData.schoolInfo != null) {
      const schoolInfo =
        typeof registrationData.schoolInfo === 'string'
          ? registrationData.schoolInfo
          : JSON.stringify(registrationData.schoolInfo);
      await this.storage.set('schoolInfo', schoolInfo);
      console.log('   ✓ Set schoolInfo');
    }

    if (Capacitor.isNativePlatform()) {
      //This we need to pass to native background servie to execute the
      // api calls to publish speed test data
      console.log('GIGA Registration data:', JSON.stringify(registrationData));

      const apiKey = environment.token;
      const baseUrl = environment.restAPI;
      const clientInfoToken = environment.ipInfoToken;
      this.storeRegistrationDataAndScheduleSpeedTest(
        registrationData,
        apiKey,
        baseUrl,
        clientInfoToken,
      );
    }

    console.log(
      '✅ [HomePage] Registration data successfully loaded from hardware ID',
    );
  }

  async getHistoricalDataForNativeApp() {
    try {
      const result = await GigaAppPlugin.getHistoricalSpeedTestData();
      console.log(
        'Queue from native: home',
        JSON.parse(JSON.stringify(result.historicalData)),
      );
      console.log('Queue from native: home', result.historicalData);
      let historicalData = result.historicalData;
      if (
        historicalData !== null &&
        historicalData !== undefined &&
        historicalData.measurements.length
      ) {
        this.historyService.set(historicalData);
        const allHistoryData = this.historyService.getAll();
        console.log(
          'Queue from native: home all',
          allHistoryData.measurements.length,
        );
        if (historicalData.measurements.length > 0) {
          const merged = [
            ...allHistoryData.measurements,
            ...historicalData.measurements,
          ].reduce((acc, item) => {
            if (!acc.some((element) => element.uuid === item.uuid)) {
              acc.push(item);
            }
            return acc;
          }, []);
          console.log('Queue from native: home merged', merged.length);
          this.historyService.setAll(merged);
        } else {
          this.historyService.setAll(historicalData);
        }
        this.historyService.setAll(historicalData);
      }
    } catch (err) {
      console.error('Error fetching queue:', err);
    }
  }

  openExternalUrl(href) {
    if (Capacitor.isNativePlatform()) {
      this.openNativeAppBrowser(href);
    } else {
      this.settingsService.getShell().shell.openExternal(href);
    }
  }

  async openNativeAppBrowser(href) {
    await Browser.open({
      url: href,
      windowName: '_system', // ensures it uses external browser where possible
    });
  }
}
