/* eslint-disable @typescript-eslint/naming-convention */
import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { environment } from 'src/environments/environment';
import { catchError, map, tap } from 'rxjs/operators';
import { Observable, throwError } from 'rxjs';
import { School } from '../models/models';
import { SchoolRegistration, WrongGigaIdSchool } from './dto/school.dto';
import { ResponseDto } from './dto/response.dto';

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
   * @returns Observable with device status
   */
  checkDeviceStatus(hardwareId: string, gigaId: string): Observable<any> {
    return this.http
      .get(
        `${environment.restAPI}dailycheckapp_schools/checkDeviceStatus/${hardwareId}/${gigaId}`,
        this.options
      )
      .pipe(
        tap((response) =>
          console.log('Device status check response:', response)
        ),
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
        map((response: any) => response.data.user_id),
        tap((data) => console.log(JSON.stringify(data))),
        catchError(this.handleError)
      );
  }

  /**
   * Deactivate device by setting is_active to false
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
        tap((response) => console.log('Device deactivated:', response)),
        catchError(this.handleError)
      );
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


  
  registerNewSchool(data: SchoolRegistration): Observable<any> {
    return this.http
      .post(environment.restAPI + 'school-registrations', data, this.options)
      .pipe(
        tap((response) => console.log('New school registered:', response)),
        catchError(this.handleError)
      );
  }

  async getWindowsUsername(): Promise<string> {
    try {
      // Check if running in Electron
      if (window && (window as any).electronAPI) {
        console.log('📡 [Windows Username] Requesting Windows username...');
        const usernameInfo = await (
          window as any
        ).electronAPI.getWindowsUsername();

        if (usernameInfo && usernameInfo.username) {
          console.log(
            '✅ [Windows Username] Retrieved username:',
            usernameInfo.username,
          );
          return usernameInfo.username;
        } else if (usernameInfo && usernameInfo.error) {
          console.error(
            '❌ [Windows Username] Error retrieving username:',
            usernameInfo.error,
          );
          return null;
        }
      } else {
        console.log(
          '⚠️ [Windows Username] Not running in Electron, username not available',
        );
        return null;
      }
    } catch (error) {
      console.error(
        '❌ [Windows Username] Exception while retrieving username:',
        error,
      );
      return null;
    }

    return null;
  }

  async getInstalledPath(): Promise<string> {
    try {
      // Check if running in Electron
      if (window && (window as any).electronAPI) {
        console.log('📡 [Installed Path] Requesting installed path...');
        const pathInfo = await (window as any).electronAPI.getInstalledPath();

        if (pathInfo && pathInfo.installedPath) {
          console.log(
            '✅ [Installed Path] Retrieved path:',
            pathInfo.installedPath,
          );
          return pathInfo.installedPath;
        } else if (pathInfo && pathInfo.error) {
          console.error(
            '❌ [Installed Path] Error retrieving path:',
            pathInfo.error,
          );
          return null;
        }
      } else {
        console.log(
          '⚠️ [Installed Path] Not running in Electron, path not available',
        );
        return null;
      }
    } catch (error) {
      console.error(
        '❌ [Installed Path] Exception while retrieving path:',
        error,
      );
      return null;
    }

    return null;
  }

  async getWifiConnections(): Promise<any> {
    try {
      // Check if running in Electron
      if (window && (window as any).electronAPI) {
        console.log('📡 [WiFi Connections] Requesting WiFi connections...');
        const wifiInfo = await (window as any).electronAPI.getWifiConnections();

        if (wifiInfo && wifiInfo.wifiConnections) {
          console.log(
            '✅ [WiFi Connections] Retrieved connections:',
            wifiInfo.wifiConnections,
          );
          return wifiInfo.wifiConnections;
        } else if (wifiInfo && wifiInfo.error) {
          console.error(
            '❌ [WiFi Connections] Error retrieving connections:',
            wifiInfo.error,
          );
          return null;
        }
      } else {
        console.log(
          '⚠️ [WiFi Connections] Not running in Electron, connections not available',
        );
        return null;
      }
    } catch (error) {
      console.error(
        '❌ [WiFi Connections] Exception while retrieving connections:',
        error,
      );
      return null;
    }

    return null;
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
