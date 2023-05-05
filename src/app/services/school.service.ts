import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { environment } from 'src/environments/environment';
import { catchError, map, tap } from 'rxjs/operators';
import { Observable, throwError  } from 'rxjs';
import { School } from '../models/models';

@Injectable({
  providedIn: 'root'
})
export class SchoolService {
  options: any;
  constructor(private http: HttpClient) { 
    this.options = {
      Observe: 'response',
      headers: new HttpHeaders({
        'Content-type': 'application/json'
      })
    };
  }

  /**
  * Returns all schools present in the database. 
  * @returns School
  */
   getAll(): Observable<School[]> {
    return this.http.get(environment.restAPI + 'schools', this.options).pipe(
      map((response:any) => response.data),
      tap(data => console.log(JSON.stringify(data))),
      catchError(this.handleError)
    );
  }

  /** 
  * Returns a School array that can be passed to the component.
  * Id is school id which is a mandatory parameter.
  * @param id School Id
  * @returns School
  */
   getById(id:number): Observable<School[]> {
    return this.http.get(environment.restAPI + 'schools/'+id, this.options).pipe(
      map((response:any) => response.data),
      tap(data => console.log(JSON.stringify(data))),
      catchError(this.handleError)
    );
  }

  /**
   * Return unique user id for perticular device
   * @param data Object with these parameters {
      "giga_id_school": "",
      "mac_address": "",
      "os": "",
      "app_version": "",
      "created": ""
    }
   * @returns 
   */
  registerSchoolDevice(data): Observable<{}>{
    return this.http.post(environment.restAPI + 'dailycheckapp_schools', data ,this.options).pipe(
      map((response:any) => response.data.user_id),
      tap(data => console.log(JSON.stringify(data))),
      catchError(this.handleError)
    );
  }
  
   /** 
  * Returns a timezone of school.
  * Id is school id which is a mandatory parameter.
  * @param id School Id
  * @returns timezone
  */
    getTimezoneBysSchoolId(id:number): Observable<{}> {
      return this.http.get(environment.restAPI + 'schools/timezone/'+id, this.options).pipe(
        map((response:any) => response),
        tap(response => console.log(JSON.stringify(response))),
        catchError(this.handleError)
      );
    }

 /** 
  * Returns a timeslot of school.
  * Id is school id which is a mandatory parameter.
  * @param id School Id
  * @returns timeslot
  */
      getTimeslot(id:number): Observable<School> {
        return this.http.get(environment.restAPI + 'dailycheckapp_schools/'+id, this.options).pipe(
          map((response:any) => response),
          // tap(data => console.log(JSON.stringify(data))),
          catchError(this.handleError)
        );
      }
  
 /** 
  * Returns a timezone of school.
  * Id is school id which is a mandatory parameter.
  * @param id School Id
  * @returns timezone
  */
   saveTimeslot(id:number): Observable<School[]> {
     return this.http.patch(environment.restAPI + 'schools/timeslot/'+id, this.options).pipe(
          map((response:any) => response.timezone),
          // tap(data => console.log(JSON.stringify(data))),
          catchError(this.handleError)
        );
    }

  /**
   * Private function to handle error
   * @param error 
   * @returns Error
   */
  private handleError(error: Response) {
    return throwError(error);
  }
}
