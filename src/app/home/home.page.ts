import { Component } from '@angular/core';
import { NavigationEnd, Router } from '@angular/router';
import { Subscription, firstValueFrom } from 'rxjs';
import { filter, timeout } from 'rxjs/operators';
import { TranslateService } from '@ngx-translate/core';
import { SettingsService } from '../../app/services/settings.service';
import { NotFound } from '../schoolnotfound/types';
import { LoadingService } from '../services/loading.service';
import { SchoolService } from '../services/school.service';
import { StorageService } from '../services/storage.service';
import { checkRightGigaId, removeUnregisterSchool } from './home.utils';
import { environment } from '../../environments/environment';
import { HardwareIdService } from '../services/hardware-id.service';
import { PosthogService } from '../services/posthog.service';
import {
  APP_INSTANCE_ID_KEY,
  REGISTER_TIMEOUT_MS,
  RegistrationContextService,
} from '../services/registration-context.service';

/**
 * Screens before the country step. While the user is on one of these, an
 * existing registration found for this machine still takes them to the
 * dashboard.
 */
const AUTO_REGISTRATION_ROUTES = ['/home', '/register-school'];

/**
 * Set while this app instance's own registration couldn't be stored, so the
 * next start tries again.
 */
export const PENDING_AUTO_REGISTRATION_KEY = 'pendingAutoRegistration';

/**
 * Set while the app instance ID this install made for the registration it
 * already had isn't attached to that registration yet.
 */
export const PENDING_APP_INSTANCE_CLAIM_KEY = 'pendingAppInstanceClaim';

/** This app instance registered at the school of the PC's registration. */
interface InstanceRegistration {
  /** What was sent: this app instance's own context. */
  payload: { [key: string]: any };
  /** The new registration's user ID, or null when it couldn't be stored. */
  userId: string | null;
}

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
  /**
   * True while the app is still working out whether this machine already has a
   * registration, so the welcome screen can say so instead of looking idle.
   */
  isCheckingRegistration = false;
  /** Set once the user reaches the country step; auto-registration stops. */
  private reachedCountryStep = false;
  private routerSub: Subscription;
  constructor(
    public router: Router,
    public translate: TranslateService,
    private settingsService: SettingsService,
    private storage: StorageService,
    private loading: LoadingService,
    private readonly schoolService: SchoolService,
    private hardwareIdService: HardwareIdService,
    private posthogService: PosthogService,
    private registrationContext: RegistrationContextService
  ) {
    translate.setDefaultLang('en');
    const applicationLanguage = this.settingsService.get('applicationLanguage');
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

    this.routerSub = this.router.events
      .pipe(filter((event) => event instanceof NavigationEnd))
      .subscribe((event: NavigationEnd) => {
        if (
          !this.reachedCountryStep &&
          !AUTO_REGISTRATION_ROUTES.some((route) =>
            event.urlAfterRedirects.startsWith(route)
          )
        ) {
          console.log(
            'ℹ️ [HomePage] User reached the country step, stopping registration check'
          );
          this.reachedCountryStep = true;
        }
      });

    if (this.storage.get('schoolId')) {
      // User has local registration - check if device is still active
      this.checkDeviceStatusAndProceed();
    } else {
      // No local registration - check if machine is already registered via hardware ID
      this.checkHardwareRegistration();
    }
  }

  /**
   * Check device status and proceed if active, or clear if deactivated
   */
  private async checkDeviceStatusAndProceed() {
    console.log(
      '🔍 [HomePage] Checking device status for existing registration...'
    );

    const gigaId = this.storage.get('gigaId');

    // Need hardware ID to check status
    const hardwareId = await this.hardwareIdService.ensureHardwareId(10000);

    if (!hardwareId || !gigaId) {
      // Can't check status without hardware ID or gigaId, proceed with existing registration
      console.warn(
        '⚠️ [HomePage] Missing hardwareId or gigaId, proceeding with existing registration'
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
          '⚠️ [HomePage] Invalid status response, proceeding with existing registration'
        );
        this.proceedWithExistingRegistration();
        return;
      }

      if (status.data.exists && status.data.is_active === false) {
        // Device was deactivated by another user (logged out)
        console.warn('🚫 [HomePage] Device has been deactivated (logged out)');
        console.log('   Clearing localStorage...');
        this.posthogService.reset();
        await this.storage.clear();
        console.log(
          '   Checking if registration still exists for this hardware ID...'
        );
        // Check if device registration still exists in backend
        // This handles the case where User A logs out, but User B can claim the registration
        await this.checkMachineRegistration(hardwareId);
      } else if (status.data.exists && status.data.is_active === true) {
        // Device is active, proceed normally
        console.log(
          '✅ [HomePage] Device is active, proceeding with existing registration...'
        );
        this.proceedWithExistingRegistration();
      } else if (!status.data.exists) {
        // Device not found in backend - backward compatibility
        // Keep local data for old registrations before hardware ID tracking
        console.warn(
          '⚠️ [HomePage] Device not found in backend (may be old registration)'
        );
        console.log(
          '   Proceeding with existing registration for backward compatibility...'
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

    // In the background: it must not hold up the start.
    void this.completeAppInstance();

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
          this.settingsService
        ).then((response) => {
          if (response) {
            this.loading.dismiss();
            this.router.navigate(['/starttest']);
          } else {
            // The registration is gone and the local data was cleared.
            this.posthogService.reset();
            this.loading.dismiss();
            this.router.navigate(['schoolnotfound', schoolId, 0, 0, 0], {
              queryParams: { reason: NotFound.notRegister },
            });
          }
        });
      } catch (e) {
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
      this.isCheckingRegistration = true;

      // Wait for hardware ID to be available (with 10 second timeout)
      const hardwareId = await this.hardwareIdService.ensureHardwareId(10000);

      // The main process stores a placeholder when the probe had no UUID; it
      // matches no registration, so treat it like no ID and keep retrying.
      if (this.hardwareIdService.isUsableHardwareId(hardwareId)) {
        console.log(
          '🔍 [HomePage] Checking for existing registration with hardware ID:',
          hardwareId
        );
        await this.checkMachineRegistration(hardwareId);
        this.isCheckingRegistration = false;
      } else {
        // No hardware ID available after timeout - proceed normally
        console.warn(
          '⚠️ [HomePage] No hardware ID available, proceeding with normal flow'
        );
        console.log('   User will need to manually register the device');
        this.loading.dismiss();
        this.retryHardwareRegistrationInBackground();
      }
    } catch (error) {
      console.error(
        '❌ [HomePage] Error in hardware registration check:',
        error
      );
      this.isCheckingRegistration = false;
      this.loading.dismiss();
    }
  }

  /**
   * Keep looking for the hardware ID after the initial wait gave up.
   *
   * When Windows starts the app from the logon Run key, WMI is often not
   * answering yet, so the early probes return nothing and an existing
   * registration for this machine is never claimed until someone restarts the
   * app by hand. Retry with backoff for up to an hour, and if an ID turns up
   * run the lookup that was skipped - but only while the user is still before
   * the country step, so a late answer never interrupts a registration they
   * are actually filling in.
   */
  private async retryHardwareRegistrationInBackground() {
    try {
      const hardwareId = await this.hardwareIdService.waitForUsableHardwareId(
        () => this.canAutoRegister()
      );

      if (!hardwareId || !this.canAutoRegister()) {
        return;
      }

      console.log(
        '🔁 [HomePage] Hardware ID arrived late, retrying registration lookup:',
        hardwareId
      );
      await this.checkMachineRegistration(hardwareId, () =>
        this.canAutoRegister()
      );
    } catch (error) {
      console.error(
        '❌ [HomePage] Background hardware ID retry failed:',
        error
      );
    } finally {
      this.isCheckingRegistration = false;
    }
  }

  /**
   * Whether a late hardware-ID match may still take the user to the dashboard:
   * nothing registered yet, and the user has not reached the country step
   * ("Detecting your country"). Reaching it ends the check for this session.
   */
  private canAutoRegister(): boolean {
    if (this.storage.get('schoolId')) {
      return false;
    }
    if (this.reachedCountryStep) {
      return false;
    }
    const url = this.router.url;
    return AUTO_REGISTRATION_ROUTES.some((route) => url.startsWith(route));
  }

  /**
   * Check if this machine is already registered using hardware ID
   */
  private async checkMachineRegistration(
    hardwareId: string,
    stillWanted: () => boolean = () => true
  ) {
    try {
      console.log(
        '🌐 [HomePage] Querying backend for existing registration...'
      );
      const response = await this.schoolService
        .checkRegistrationByHardwareId(hardwareId)
        .toPromise();

      console.log('📥 [HomePage] Backend response:', response);

      // Backend returns: { success: true, data: { exists: true/false, ... }, timestamp, message }
      // Note: Backend only returns active registrations, so if exists=true, it's active
      if (!stillWanted()) {
        console.log(
          'ℹ️ [HomePage] User moved on during the lookup, ignoring the answer'
        );
        return;
      }
      if (response?.success && response?.data?.exists === true) {
        // Found existing registration - populate localStorage
        console.log(
          '✅ [HomePage] Found existing registration for this machine!'
        );
        console.log('   User ID:', response.data.user_id);
        console.log('   School ID:', response.data.school_id);
        console.log('   Giga ID:', response.data.giga_id_school);
        // This app instance gets a registration of its own at that school.
        const registration = await this.registerThisInstance(response.data);
        if (!stillWanted()) {
          // A registration stored meanwhile isn't lost: registering at the
          // same school from the registration screen sends the same app
          // instance ID, and gets it back.
          console.log(
            'ℹ️ [HomePage] User moved on during the registration, ignoring it'
          );
          return;
        }
        await this.applyExistingRegistration(response.data, registration);
        this.loading.dismiss();
        console.log('🚀 [HomePage] Navigating to /starttest...');
        this.router.navigate(['/starttest']);
        this.settingsService.setSetting('scheduledTesting', true);
      } else {
        // No registration found - user needs to register
        console.log(
          'ℹ️ [HomePage] No existing registration found for this hardware ID'
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

  /**
   * Registers this app instance at the school of the PC's registration, as a
   * registration of its own with this instance's context (its Windows user,
   * install path, networks, location), not the context of the registration it
   * was found by. Null when there's no school to register at, or the context
   * couldn't be read; the found registration is used as before then.
   *
   * When it can't be stored (offline, a server error), the found registration
   * is used for now and the next start tries again.
   */
  private async registerThisInstance(
    registrationData: any
  ): Promise<InstanceRegistration | null> {
    if (!registrationData.giga_id_school) {
      return null;
    }
    let payload: InstanceRegistration['payload'];
    try {
      payload = await this.registrationContext.build({
        giga_id_school: registrationData.giga_id_school,
        country_code:
          registrationData.country_code ??
          registrationData.schoolInfo?.country ??
          null,
        registration_source: 'auto',
        lookUpLocation: true,
      });
    } catch (error) {
      console.error(
        '❌ [HomePage] Could not read this PC for its registration:',
        error
      );
      return null;
    }

    try {
      const userId = (await firstValueFrom(
        this.schoolService
          .registerSchoolDevice(payload)
          .pipe(timeout(REGISTER_TIMEOUT_MS))
      )) as string;
      await this.storage.set(PENDING_AUTO_REGISTRATION_KEY, '');
      console.log('✅ [HomePage] Registered this app instance:', userId);
      return { payload, userId };
    } catch (error) {
      console.error(
        '❌ [HomePage] Registering this app instance failed; trying again on the next start:',
        error
      );
      await this.storage.set(PENDING_AUTO_REGISTRATION_KEY, 'true');
      return { payload, userId: null };
    }
  }

  /**
   * Tries again to store this app instance's registration, when it couldn't
   * be stored before. It sends the same app instance ID, so if the earlier
   * attempt did get through, the server returns that registration. Tests run
   * until it's stored count under the PC's earlier registration.
   */
  private async retryPendingAutoRegistration() {
    const gigaId = this.storage.get('gigaId');
    if (this.storage.get(PENDING_AUTO_REGISTRATION_KEY) !== 'true' || !gigaId) {
      return;
    }
    try {
      const payload = await this.registrationContext.build({
        giga_id_school: gigaId,
        country_code: this.storage.get('country_code') ?? null,
        registration_source: 'auto',
        lookUpLocation: true,
      });
      const userId = (await firstValueFrom(
        this.schoolService
          .registerSchoolDevice(payload)
          .pipe(timeout(REGISTER_TIMEOUT_MS))
      )) as string;
      if (userId) {
        await this.storage.set('schoolUserId', userId);
        await this.storage.set(PENDING_AUTO_REGISTRATION_KEY, '');
        this.posthogService.capture('registration_completed', {
          country_code: payload.country_code,
          registration_source: 'auto',
        });
        console.log('✅ [HomePage] Registered this app instance:', userId);
      }
    } catch (error) {
      console.warn(
        '⚠️ [HomePage] Registering this app instance failed again:',
        error
      );
    }
  }

  /**
   * Makes sure the registration this install uses is its own: stores one
   * that couldn't be stored before, or attaches an app instance ID to a
   * registration made before app instances.
   */
  private async completeAppInstance() {
    await this.retryPendingAutoRegistration();
    await this.claimAppInstance();
  }

  /**
   * An install registered before app instances has a registration but no app
   * instance ID, and an update doesn't register again. It makes an ID and
   * attaches it to that registration, so its results link to the registration
   * without the browser ID.
   *
   * The ID is kept from the first try, so a claim that did get through is
   * only repeated. When the registration belongs to another install (older
   * apps copied one registration to every Windows user of a PC) or is gone,
   * this install registers on its own instead, with the same ID. Anything
   * else (offline, a server error) is tried again on the next start.
   */
  private async claimAppInstance() {
    const userId = this.storage.get('schoolUserId');
    const gigaId = this.storage.get('gigaId');
    if (
      !userId ||
      !gigaId ||
      this.storage.get(PENDING_AUTO_REGISTRATION_KEY) === 'true'
    ) {
      return;
    }
    if (!this.storage.get(APP_INSTANCE_ID_KEY)) {
      this.registrationContext.appInstanceIdFor(gigaId);
      await this.storage.set(PENDING_APP_INSTANCE_CLAIM_KEY, 'true');
    }
    if (this.storage.get(PENDING_APP_INSTANCE_CLAIM_KEY) !== 'true') {
      return;
    }

    const appInstanceId = this.storage.get(APP_INSTANCE_ID_KEY);
    try {
      await firstValueFrom(
        this.schoolService
          .claimAppInstance(userId, appInstanceId)
          .pipe(timeout(REGISTER_TIMEOUT_MS))
      );
      await this.storage.set(PENDING_APP_INSTANCE_CLAIM_KEY, '');
      console.log(
        '✅ [HomePage] Attached this app instance to its registration:',
        appInstanceId
      );
    } catch (error) {
      const status = (error as { status?: number })?.status;
      if (status !== 409 && status !== 404) {
        console.warn(
          '⚠️ [HomePage] Attaching this app instance failed; trying again on the next start:',
          error
        );
        return;
      }
      // Not this install's registration: it registers on its own.
      await this.storage.set(PENDING_APP_INSTANCE_CLAIM_KEY, '');
      await this.storage.set(PENDING_AUTO_REGISTRATION_KEY, 'true');
      await this.retryPendingAutoRegistration();
    }
  }

  /**
   * Populate localStorage with the school of the registration found for this
   * PC, and with this app instance's own registration and context when it
   * was registered (see registerThisInstance).
   */
  private async applyExistingRegistration(
    registrationData: any,
    registration: InstanceRegistration | null = null
  ) {
    console.log(
      '💾 [HomePage] Applying existing registration to localStorage...'
    );
    console.log('   Registration data:', registrationData);

    // This app instance's own registration; the found one until it's stored.
    const userId = registration?.userId ?? registrationData.user_id;
    // This app instance's own context; the found registration's only when it
    // couldn't be read.
    const context = registration?.payload ?? registrationData;

    // Only set values that are non-null and not undefined
    if (userId != null) {
      await this.storage.set('schoolUserId', userId);
      console.log('   ✓ Set schoolUserId:', userId);
    }
    if (registrationData.school_id != null) {
      await this.storage.set('schoolId', registrationData.school_id);
      await this.storage.set('school_id', registrationData.school_id);
      console.log('   ✓ Set schoolId:', registrationData.school_id);
    }
    if (registrationData.giga_id_school != null) {
      await this.storage.set('gigaId', registrationData.giga_id_school);
      console.log('   ✓ Set gigaId:', registrationData.giga_id_school);
      this.posthogService.identifyDevice();
      this.posthogService.setSchool(registrationData.giga_id_school);
    }
    if (context.mac_address != null) {
      await this.storage.set('macAddress', context.mac_address);
      console.log('   ✓ Set macAddress:', context.mac_address);
    }
    if (context.os != null) {
      await this.storage.set('deviceType', context.os);
      console.log('   ✓ Set deviceType:', context.os);
    }
    if (context.ip_address != null) {
      await this.storage.set('ip_address', context.ip_address);
      console.log('   ✓ Set ip_address:', context.ip_address);
    }
    if (context.app_version != null) {
      await this.storage.set('version', context.app_version);
      console.log('   ✓ Set version:', context.app_version);
    }
    if (registration?.userId) {
      this.posthogService.capture('registration_completed', {
        country_code: registration.payload.country_code,
        registration_source: 'auto',
      });
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

    console.log(
      '✅ [HomePage] Registration data successfully loaded from hardware ID'
    );
  }

  ngOnDestroy() {
    this.routerSub?.unsubscribe();
  }

  openExternalUrl(href) {
    this.settingsService.getShell().shell.openExternal(href);
  }
}
