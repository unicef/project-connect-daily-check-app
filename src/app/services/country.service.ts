import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { environment } from 'src/environments/environment';
import { catchError, map, tap } from 'rxjs/operators';
import { Observable, throwError } from 'rxjs';
import { PcdcCountry, Country } from '../models/models';
@Injectable({
  providedIn: 'root',
})
export class CountryService {
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
   * Returns all countries present in the database.
   * @returns Country
   */
  getAll(): Observable<Country[]> {
    return this.http.get(environment.dcaRestAPI + 'countries', this.options).pipe(
      map((response:any) => response.data),
      tap(data => console.log(JSON.stringify(data))),
      catchError(this.handleError)
    );
  }

  /** 
  * Returns a Country array that can be passed to the component.
  * Id is country id which is a mandatory parameter.
  * @param id Country Id
  * @returns Country
  */
  getById(id:number): Observable<Country[]> {
    return this.http.get(environment.dcaRestAPI + 'countries/'+id, this.options).pipe(
      map((response:any) => response.data),
      tap(data => console.log(JSON.stringify(data))),
      catchError(this.handleError)
    );
  }

  /** 
  * Returns a Country array that can be passed to the component.
  * Id is country id which is a mandatory parameter.
  * @param code Country Code
  * @returns PcdcCountry
  */
  getPcdcCountryByCode(code:string): Observable<PcdcCountry[]> {
    return this.http.get(environment.dcaRestAPI + 'dailycheckapp_countries/'+code, this.options).pipe(
      map((response:any) => response.data),
      tap(data => console.log(JSON.stringify(data))),
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
