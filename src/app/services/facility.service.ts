/* eslint-disable @typescript-eslint/naming-convention */
import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable, of } from 'rxjs';
import { catchError, map } from 'rxjs/operators';
import { environment } from 'src/environments/environment';
import { FacilityType } from '../models/facility';
import { Facility, HealthFacility, School } from '../models/models';
import { SchoolService } from './school.service';

export interface CountryFacilityTypes {
  country_code: string;
  name: string;
  supported_facility_types: string[];
}

/**
 * Facility-agnostic lookup layer (plan 0003, F1). One code path for the
 * "type an ID + country" flow of every facility type:
 *   - school → existing v1 school lookup (unchanged contract)
 *   - health → GET /api/v2/health?country_code&govt_id
 */
@Injectable({
  providedIn: 'root',
})
export class FacilityService {
  constructor(
    private http: HttpClient,
    private schoolService: SchoolService
  ) {}

  lookup(
    type: FacilityType,
    countryCode: string,
    id: string
  ): Observable<Facility[]> {
    if (type === 'health') {
      const params = new HttpParams()
        .set('country_code', countryCode)
        .set('govt_id', id);
      return this.http
        .get<any>(environment.restAPIv2 + 'health', { params })
        .pipe(
          map((response) =>
            (response?.data ?? []).map((h: HealthFacility) =>
              this.normalizeHealth(h)
            )
          )
        );
    }
    return this.schoolService
      .getBySchoolIdAndCountryCode(id as any, countryCode)
      .pipe(
        map((schools: School[]) =>
          (schools ?? []).map((s) => this.normalizeSchool(s))
        )
      );
  }

  getByGigaId(type: FacilityType, gigaId: string): Observable<Facility | null> {
    if (type === 'health') {
      return this.http
        .get<any>(environment.restAPIv2 + 'health/giga-id/' + gigaId)
        .pipe(
          map((response) =>
            response?.data ? this.normalizeHealth(response.data) : null
          )
        );
    }
    return this.schoolService
      .getRegisteredSchoolByGigaId(gigaId)
      .pipe(
        map((data: any) => {
          const school = Array.isArray(data) ? data[0] : data;
          return school ? this.normalizeSchool(school) : null;
        })
      );
  }

  /**
   * Supported facility types per country (backend-driven — B7). Fetched
   * FRESH on every call — this backs the Confirm-time gate, so it must
   * reflect whitelist changes immediately, not a session-old snapshot.
   * Fails open to `null`: "no narrowing information, do not block".
   */
  getSupportedFacilityTypes(): Observable<CountryFacilityTypes[] | null> {
    return this.http
      .get<CountryFacilityTypes[]>(environment.restAPIv2 + 'countries')
      .pipe(
        catchError((error) => {
          console.warn('Could not load supported facility types', error);
          return of(null);
        })
      );
  }

  isTypeSupported(
    countryCode: string,
    type: FacilityType
  ): Observable<boolean> {
    return this.getSupportedFacilityTypes().pipe(
      map((countries) => {
        if (!countries) {
          // Fail open: without narrowing info the registration 403 is the
          // backstop (backend whitelist).
          return true;
        }
        const entry = countries.find((c) => c.country_code === countryCode);
        return !!entry?.supported_facility_types?.includes(type);
      })
    );
  }

  /**
   * Adapter for the legacy school-shaped templates (details/confirm screens
   * bind `name`, `school_id`, `education_level`, `admin_1_name`,
   * `giga_id_school`). Schools pass through untouched; health facilities are
   * mapped onto the same property names plus `facilityType`/`giga_id_health`
   * so the whole downstream flow works unchanged.
   */
  toDisplayRecord(facility: Facility): any {
    if (facility.facilityType === 'school') {
      return { facilityType: 'school', ...(facility.raw as any) };
    }
    return {
      facilityType: 'health',
      name: facility.name,
      school_id: facility.facilityId,
      education_level: facility.level,
      admin_1_name: facility.admin1,
      giga_id_health: facility.gigaId,
      country_code: facility.countryCode,
      raw: facility.raw,
    };
  }

  normalizeSchool(school: School | any): Facility {
    return {
      facilityType: 'school',
      gigaId: school.giga_id_school ?? school.giga_id ?? '',
      facilityId: school.school_id ?? school.id,
      name: school.name,
      level: school.education_level,
      admin1: school.admin_1_name,
      admin2: school.admin_2_name,
      countryCode: school.country_code ?? school.code,
      latitude: school.latitude,
      longitude: school.longitude,
      raw: school,
    };
  }

  normalizeHealth(health: HealthFacility | any): Facility {
    return {
      facilityType: 'health',
      gigaId: health.health_id_giga,
      // Surface the government facility id (DHIS2) as the user-facing id
      // instead of the internal numeric health.id; fall back to id if absent.
      facilityId: health.dhis2_id ?? health.id,
      name: health.facility_name,
      level: health.facility_level,
      admin1: health.admin1,
      admin2: health.admin2,
      countryCode: health.country_code,
      latitude: health.latitude,
      longitude: health.longitude,
      raw: health,
    };
  }
}
