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
   * Private function to handle error
   * @param error 
   * @returns Error
   */
  private handleError(error: Response) {
    return throwError(error);
  }
}
