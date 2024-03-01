/* eslint-disable @typescript-eslint/naming-convention */
import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { environment } from 'src/environments/environment';
import { catchError, map, tap } from 'rxjs/operators';
import { Observable, throwError } from 'rxjs';
import { School } from '../models/models';
import { WrongGigaIdSchool } from './dto/school.dto';
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
        tap((data) => console.log(JSON.stringify(data))),
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
      "created": ""
    }
   * @returns
   */
  registerSchoolDevice(data): Observable<{}> {
    return this.http
      .post(
        environment.dcaRestAPI + 'dailycheckapp_schools',
        data,
        this.options
      )
      .pipe(
        map((response: any) => response.data.user_id),
        tap((data) => console.log(JSON.stringify(data))),
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
        environment.dcaRestAPI + 'flagged_dailycheckapp_schools',
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
