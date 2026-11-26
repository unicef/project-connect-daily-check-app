/* eslint-disable @typescript-eslint/naming-convention */
import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { environment } from 'src/environments/environment';
import { catchError, map, tap, timeout } from 'rxjs/operators';
import { Observable, throwError } from 'rxjs';
import { School } from '../models/models';
import { WrongGigaIdSchool } from './dto/school.dto';
import { ResponseDto } from './dto/response.dto';
import { rememberDeviceId } from '../analytics/analytics-events';

/**
 * How long logout waits for the backend to deactivate this PC. Past this it
 * fails like any other error, and logout doesn't happen: without a limit, a
 * request that never got an answer left logout waiting with nothing shown.
 */
export const DEACTIVATE_TIMEOUT_MS = 30 * 1000;

@Injectable({
  providedIn: 'root',
})
export class SchoolService {
  options: any;
  constructor(private http: HttpClient) {
    this.options = {
      Observe: 'response',
      headers: new HttpHeaders({
        'Content-type': 'application/json',
      }),
    };
  }

  /**
   * Returns all schools present in the database.
   *
   * @returns School
   */
  getAll(): Observable<School[]> {
    return this.http.get(environment.restAPI + 'schools', this.options).pipe(
      map((response: any) => response.data),
      tap((data) => console.log(JSON.stringify(data))),
      catchError(this.handleError)
    );
  }

  /**
   * Returns a School array that can be passed to the component.
   * Id is school id which is a mandatory parameter.
   *
   * @param id School Id
   * @returns School
   */
  getById(id: number): Observable<School[]> {
    return this.http
      .get(environment.restAPI + 'schools/' + id, this.options)
      .pipe(
        map((response: any) => response.data),
        tap((data) => console.log(JSON.stringify(data))),
        catchError(this.handleError)
      );
  }

  /**
   * Returns a School array that can be passed to the component.
   * Id is school id which is a mandatory parameter.
   * Country Code is a code which is a mandatory parameter.
   *
   * @param id School Id
   * @param code Country Code
   * @returns School
   */
  getBySchoolIdAndCountryCode(id: number, code: string): Observable<School[]> {
    return this.http
      .get(
        environment.restAPI +
          'schools/country_code_school_id/' +
          code +
          '/' +
          id,
        this.options
      )
      .pipe(
        map((response: any) => response.data),
        tap((data) => console.log(JSON.stringify(data))),
        catchError(this.handleError)
      );
  }

  /**
   * Returns a School registered array
   *
   * @param id School Id
   */
  getRegisteredSchoolByGigaId(gigaId: string): Observable<any> {
    return this.http
      .get(
        environment.restAPI + 'dailycheckapp_schools/' + gigaId,
        this.options
      )
      .pipe(
        map((response: any) => response.data),
        catchError(this.handleError)
      );
  }

  /**
   * Check if a device with this hardware ID is already registered
   * @param hardwareId - The unique hardware identifier
   * @returns Observable with registration data or null
   */
  checkRegistrationByHardwareId(hardwareId: string): Observable<any> {
    return this.http
      .get(
        `${environment.restAPI}dailycheckapp_schools/checkExistingInstallation/${hardwareId}`,
        this.options
      )
      .pipe(
        tap((data) => console.log('Hardware ID check response:', data)),
        catchError(this.handleError)
      );
  }

  /**
   * Check if a device is still active (not deactivated/logged out)
   * @param hardwareId - Device hardware ID
   * @param gigaId - School giga ID
   * @param appInstanceId - This install's app instance ID, when it has one:
   *   the answer's device ID is then its own registration's
   * @returns Observable with device status
   */
  checkDeviceStatus(
    hardwareId: string,
    gigaId: string,
    appInstanceId: string | null = null
  ): Observable<any> {
    const query = appInstanceId
      ? `?app_instance_id=${encodeURIComponent(appInstanceId)}`
      : '';
    return this.http
      .get(
        `${environment.restAPI}dailycheckapp_schools/checkDeviceStatus/${hardwareId}/${gigaId}${query}`,
        this.options
      )
      .pipe(
        tap((response) =>
          console.log('Device status check response:', response)
        ),
        // Checked at every start: how an existing installation learns its
        // device ID (TECH-8828, the analytics person) without registering
        // again, and a new one when the backend gave its registration one.
        tap((response: any) => {
          if (response?.data?.is_active !== false) {
            rememberDeviceId(response?.data?.device_id);
          }
        }),
        catchError(this.handleError)
      );
  }

  /**
   * Return unique user id for perticular device
   *
   * @param data Object with these parameters {
      "giga_id_school": "",
      "mac_address": "",
      "os": "",
      "app_version": "",
      "created": "",
      "device_hardware_id": "" (optional),
      "windows_username": "" (optional),
      "installed_path": "" (optional),
      "wifi_connections": [] (optional)
    }
   * @returns
   */
  registerSchoolDevice(data): Observable<{}> {
    return this.http
      .post(environment.restAPI + 'dailycheckapp_schools', data, this.options)
      .pipe(
        // Before the map below keeps only the user_id.
        tap((response: any) => rememberDeviceId(response?.data?.device_id)),
        map((response: any) => response.data.user_id),
        tap((data) => console.log(JSON.stringify(data))),
        catchError(this.handleError)
      );
  }

  /**
   * Deactivate device by setting is_active to false. The backend answers
   * `data.deactivated` false when it had no active registration for this PC
   * at this school. Fails after DEACTIVATE_TIMEOUT_MS.
   *
   * @param hardwareId - Device hardware ID
   * @param gigaId - School giga ID
   * @returns Observable
   */
  deactivateDevice(hardwareId: string, gigaId: string): Observable<any> {
    const data = {
      device_hardware_id: hardwareId,
      giga_id_school: gigaId,
    };
    return this.http
      .put(
        environment.restAPI + 'dailycheckapp_schools/deactivate',
        data,
        this.options
      )
      .pipe(
        timeout(DEACTIVATE_TIMEOUT_MS),
        tap((response) => console.log('Device deactivated:', response)),
        catchError(this.handleError)
      );
  }

  /**
   * Gives the registration this install already has (its user_id) this
   * install's app instance ID. The server answers 409 when the registration
   * belongs to another app instance, and 404 when there's none.
   *
   * @param userId - The registration's user_id (schoolUserId)
   * @param appInstanceId - This install's app instance ID
   */
  claimAppInstance(userId: string, appInstanceId: string): Observable<any> {
    return this.http
      .put(
        environment.restAPI + 'dailycheckapp_schools/app-instance',
        { user_id: userId, app_instance_id: appInstanceId },
        this.options
      )
      .pipe(catchError(this.handleError));
  }

  /**
   * Return all wrong giga id school and the right giga id school
   *
   * @returns
   */
  getAllWrongGigaId(): Observable<ResponseDto<WrongGigaIdSchool>> {
    return this.http
      .get(environment.restAPI + `dailycheckapp_data_fix`, this.options)
      .pipe(
        map((response: any) => response),
        tap((data) => console.log(JSON.stringify(data))),
        catchError(this.handleError)
      );
  }

  /**
   * Return the wrong giga id school and the right giga id school
   *
   * @param id Wrong giga id school id
   * @returns
   */
  checkRightGigaId(id): Observable<ResponseDto<WrongGigaIdSchool>> {
    return this.http
      .get(environment.restAPI + `dailycheckapp_data_fix/${id}`, this.options)
      .pipe(
        map((response: any) => response),
        tap((data) => console.log(JSON.stringify(data))),
        catchError(this.handleError)
      );
  }

  /**
   * Return the wrong giga id school and the right giga id school
   *
   *@summary Use this until checkRightGigaId malfunction
   ! This endpoint first ensure the wrongId exist and after get the right id
   *
   * @param id Wrong giga id school id
   * @returns
   */
  async checkRightGigaIdSlow(
    id
  ): Promise<Observable<ResponseDto<WrongGigaIdSchool>>> {
    const wrongsIds = await this.getAllWrongGigaId().toPromise();
    const rightId = ((wrongsIds as any)?.data as Array<any>).filter(
      (w) => w.giga_id_school_wrong === id
    );
    if (rightId.length > 0) {
      return this.checkRightGigaId(id);
    }
    console.log('The GigaId Is ok');
    return null;
  }

  /**
   * Return unique user id for perticular device
   *
   * @param data Object with these parameters {
      "detected_country": "",
      "selected_country": "",
      "school_id": "",
      "created": ""
    }
   * @returns
   */
  registerFlaggedSchool(data): Observable<{}> {
    console.log('flagged pass: ', data);
    return this.http
      .post(
        environment.restAPI + 'flagged_dailycheckapp_schools',
        data,
        this.options
      )
      .pipe(
        map((response: any) => response.data.id),
        tap((data) => console.log(JSON.stringify(data))),
        catchError(this.handleError)
      );
  }
  /**
   * Private function to handle error
   *
   * @param error
   * @returns Error
   */
  private handleError(error: Response) {
    return throwError(error);
  }
}
