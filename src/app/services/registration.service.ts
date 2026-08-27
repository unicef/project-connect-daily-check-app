/* eslint-disable @typescript-eslint/naming-convention */
import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable, throwError } from 'rxjs';
import { catchError, tap } from 'rxjs/operators';
import { environment } from 'src/environments/environment';
import { FacilityType } from '../models/facility';
import { IdentityService } from './identity.service';
import { StorageService } from './storage.service';
import { HardwareIdService } from './hardware-id.service';

export interface RegistrationV2Response {
  giga_id: string;
  registration_id: string;
  facility_type: FacilityType;
}

export interface ExistingRegistrationResponse {
  registration_id: string;
  facility_type: FacilityType;
  giga_id: string | null;
  is_active: boolean | null;
  is_blocked: boolean;
}

export interface RegistrationStatusResponse {
  exists: boolean;
  is_active: boolean | null;
  is_blocked: boolean | null;
}

export interface RegistrationPayload {
  giga_id_school?: string;
  giga_id_health?: string;
  country_code: string;
  installation_id: string;
  device_hardware_id?: string | null;
  os?: string;
  app_version?: string;
  mac_address?: string;
  ip_address?: string;
  network_information?: string;
  wifi_connections?: any[];
}

/**
 * Unified v2 device registration. The v2 response is
 * top-level `{ giga_id, registration_id, facility_type }` — no `data.user_id`
 * wrapper — and the client no longer captures or stores any browser/user id.
 */
@Injectable({
  providedIn: 'root',
})
export class RegistrationService {
  constructor(
    private http: HttpClient,
    private identity: IdentityService,
    private storage: StorageService,
    private hardwareIdService: HardwareIdService
  ) {}

  register(payload: RegistrationPayload): Observable<RegistrationV2Response> {
    return this.http
      .post<RegistrationV2Response>(
        environment.restAPIv2 + 'registration',
        payload
      )
      .pipe(
        tap((response) => console.log('v2 registration:', response)),
        catchError((error) => throwError(error))
      );
  }

  existing(keys: {
    installation_id?: string;
    device_hardware_id?: string;
    giga_id?: string;
    browser_id?: string;
  }): Observable<ExistingRegistrationResponse> {
    let params = new HttpParams();
    Object.entries(keys).forEach(([key, value]) => {
      if (value) {
        params = params.set(key, value);
      }
    });
    return this.http.get<ExistingRegistrationResponse>(
      environment.restAPIv2 + 'registration/existing',
      { params }
    );
  }

  status(installationId: string): Observable<RegistrationStatusResponse> {
    return this.http.get<RegistrationStatusResponse>(
      environment.restAPIv2 + 'registration/status',
      { params: new HttpParams().set('installation_id', installationId) }
    );
  }

  deactivate(
    installationId: string | null,
    registrationId: string | null
  ): Observable<any> {
    const body: any = {};
    if (installationId) {
      body.installation_id = installationId;
    }
    if (registrationId) {
      body.registration_id = registrationId;
    }
    return this.http.post(
      environment.restAPIv2 + 'registration/deactivate',
      body
    );
  }

  /**
   * Store the result of a successful v2 registration under the NEW keys only
   * (legacy keys are never written by new registrations).
   */
  async persistRegistration(
    response: RegistrationV2Response,
    facilityInfo: any,
    facilityId: string | number | null
  ): Promise<void> {
    await this.storage.set('registrationId', response.registration_id);
    await this.storage.set('facilityType', response.facility_type);
    await this.storage.set('gigaId', response.giga_id);
    if (facilityId != null) {
      await this.storage.set('facilityId', String(facilityId));
    }
    if (facilityInfo) {
      await this.storage.set('facilityInfo', JSON.stringify(facilityInfo));
    }
  }

  /**
   * Launch reconciliation, step 3: backfill `registrationId` for
   * installs that predate v2, using the key chain installation_id →
   * device_hardware_id → giga_id + legacy browser_id. Idempotent and
   * fail-open: network errors leave the install as-is (the ingest self-heal
   * on the backend covers it meanwhile).
   */
  async reconcileRegistration(): Promise<void> {
    if (this.identity.getRegistrationId() || !this.identity.getGigaId()) {
      return;
    }
    try {
      const result = await this.existing({
        installation_id: this.identity.getInstallationId(),
        device_hardware_id:
          this.hardwareIdService.getHardwareId() || undefined,
        giga_id: this.identity.getGigaId(),
        browser_id: this.identity.getLegacyBrowserId() || undefined,
      }).toPromise();
      if (result?.registration_id) {
        await this.storage.set('registrationId', result.registration_id);
        if (result.facility_type && !this.storage.get('facilityType')) {
          await this.storage.set('facilityType', result.facility_type);
        }
        console.log(
          'Reconciliation: recovered registration',
          result.registration_id
        );
      }
    } catch (error) {
      console.warn('Reconciliation: could not recover registration', error);
    }
  }
}
