import { Injectable } from '@angular/core';
import { StorageService } from './storage.service';
import { DEFAULT_FACILITY_TYPE, FacilityType } from '../models/facility';

/**
 * Single place that resolves device/install identity with `legacy || new`
 * key fallbacks (plan 0003, F0).
 *
 * Contract: existing localStorage keys are never renamed or migrated. New
 * registrations write only new keys; legacy installs keep their old keys.
 * Every identity read in the app must go through this service — a read site
 * that misses the fallback would treat a working legacy install as
 * unregistered and silently stop background testing/ping.
 *
 * Key map (legacy → new): schoolId/school_id → facilityId, schoolInfo →
 * facilityInfo, (none) → facilityType/registrationId/installationId,
 * schoolUserId → read-only recovery key (never stamped on v2 traffic).
 */
@Injectable({
  providedIn: 'root',
})
export class IdentityService {
  constructor(private storage: StorageService) {}

  /** Facility id: 'facilityId' || legacy 'schoolId'. */
  getFacilityId(): string | null {
    return this.storage.get('facilityId') || this.storage.get('schoolId') || null;
  }

  /** Giga id ('gigaId' — same key on both vintages). */
  getGigaId(): string | null {
    return this.storage.get('gigaId') || null;
  }

  /** Facility type; legacy installs predate the concept → default school. */
  getFacilityType(): FacilityType {
    return (
      (this.storage.get('facilityType') as FacilityType) ||
      DEFAULT_FACILITY_TYPE
    );
  }

  /**
   * v2 registration id. Legacy installs have none until the launch
   * reconciliation backfills it from the backend (plan 0003, F1/B2).
   */
  getRegistrationId(): string | null {
    return this.storage.get('registrationId') || null;
  }

  /** Per-install UUID; generated and persisted on first access. */
  getInstallationId(): string {
    let id = this.storage.get('installationId');
    if (!id) {
      id = this.generateUuidV4();
      this.storage.set('installationId', id);
    }
    return id;
  }

  /**
   * Legacy per-user grouping tag ('schoolUserId'). Read ONLY as a fallback
   * linking key for the existing-registration recovery chain — never stamped
   * on v2 measurements/connectivity.
   */
  getLegacyBrowserId(): string | null {
    return this.storage.get('schoolUserId') || null;
  }

  /** Facility info blob: 'facilityInfo' || legacy 'schoolInfo' (JSON). */
  getFacilityInfo(): any | null {
    const raw =
      this.storage.get('facilityInfo') || this.storage.get('schoolInfo');
    if (!raw) {
      return null;
    }
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }

  /**
   * Facility-agnostic registration gate for background work (ping/schedule).
   * Replaces the old `storage.get('schoolId')` checks, which would silently
   * disable background testing for any non-school install.
   */
  isRegistered(): boolean {
    return !!(this.getGigaId() || this.getFacilityId());
  }

  /**
   * One-step launch reconciliation: backfill whatever v2 needs that this
   * install's vintage never stored (plan 0003, F0.4 / guide §6).
   * Idempotent — safe to run on every launch.
   */
  async reconcileOnLaunch(): Promise<void> {
    // 1. installation_id for everyone, including legacy installs.
    this.getInstallationId();

    // 2. A registered install without a facilityType predates facility
    //    types — it can only be a school.
    if (!this.storage.get('facilityType') && this.isRegistered()) {
      await this.storage.set('facilityType', DEFAULT_FACILITY_TYPE);
    }

    // 3. Backfill registrationId via GET /api/v2/registration/existing with
    //    the key chain installation_id → device_hardware_id →
    //    giga_id + browser_id. Blocked on backend dependency B2 (plan 0003);
    //    wired up in F1 through RegistrationService.
  }

  private generateUuidV4(): string {
    const cryptoObj: any =
      typeof crypto !== 'undefined' ? crypto : (window as any)?.crypto;
    if (cryptoObj?.randomUUID) {
      return cryptoObj.randomUUID();
    }
    if (cryptoObj?.getRandomValues) {
      const bytes = cryptoObj.getRandomValues(new Uint8Array(16));
      /* eslint-disable no-bitwise */
      bytes[6] = (bytes[6] & 0x0f) | 0x40;
      bytes[8] = (bytes[8] & 0x3f) | 0x80;
      /* eslint-enable no-bitwise */
      const hex = Array.from(bytes as Uint8Array, (b: number) =>
        b.toString(16).padStart(2, '0')
      ).join('');
      return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
    }
    // Last-resort fallback (no crypto API available).
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      // eslint-disable-next-line no-bitwise
      const r = (Math.random() * 16) | 0;
      // eslint-disable-next-line no-bitwise
      return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
    });
  }
}
