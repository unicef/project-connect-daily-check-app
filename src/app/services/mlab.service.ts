import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders, HttpRequest, HttpParams } from '@angular/common/http';
import { StorageService } from '../services/storage.service';
import { catchError, map, tap } from 'rxjs/operators';
import { throwError, Observable } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class MlabService {
  CACHE = {
    'type': undefined,
    'answer': undefined,
    'all': undefined,
  };
  mlabNsUrl = 'https://mlab-ns.appspot.com/ndt?format=json&policy=all';
  mlabNsUrlNoPolicy = 'https://mlab-ns.appspot.com/ndt?format=json';
  mlabNsUrlMetro = 'https://mlab-ns.appspot.com/ndt?format=json&policy=metro&metro=';
  options: any;
  headers: any;
  responseObject: any;

  constructor(
    private http: HttpClient, 
    private storageSerivce: StorageService) { 
    const headersItem = new HttpHeaders({
      'Content-Type': 'application/json'
    });
    this.headers = headersItem;
  }

  /**
   * Return data from saved settings
   * @param key 
   * @returns any
   */
  get(key) {
    let settings = this.storageSerivce.get("savedSettings");
    let settingsret;
    if(settings){
      settings = JSON.parse(settings);
      settingsret = key ? settings[key] : settings;
    }    
    return settingsret;
  }

  /**
   * Return server information based on metro selection
   * @param metroSelection 
   * @returns server details
   */
  findServer(metroSelection) {
    let mlabNsUrlApi = this.mlabNsUrlNoPolicy;
    if (metroSelection && metroSelection !== "automatic") {
      mlabNsUrlApi = this.mlabNsUrlMetro + metroSelection;
    }
    this.CACHE.type = metroSelection;
    return this.http.get(mlabNsUrlApi)
      .pipe(
        map((response: any) => {
          if(response) {
            return response;
          } else {            
            throw new Error('This request has failed');
          }          
        }),
        tap(responseObject => {
          if(responseObject){
            if(responseObject.city){
              responseObject.label = responseObject.city.replace('_', ' ');
            } else {
              responseObject.label = '';
            }            
            responseObject.metro = responseObject.site.slice(0, 3);
            this.CACHE.answer = responseObject;
            // console.log(responseObject);
          }          
        }),
        catchError(this.handleError)
      );
  }

  /**
   * Retrurns all Mlab Servers list and information
   * @returns All servers information
   */
  findAll() {
    return new Promise((resolve, reject) => {
      if (this.CACHE.all === undefined) {
        this.http.get(this.mlabNsUrl)
          .pipe(
            map((responseObject: any) => {
              responseObject.label = responseObject.city.replace('_', ' ');
              responseObject.metro = responseObject.site.slice(0, 3);
              this.CACHE.answer = responseObject;
              resolve(responseObject);
            }),
            tap(data => console.log(JSON.stringify(data))),
            catchError( async (error) => reject(error))
          );
      } else {
        resolve(this.CACHE.all);
      }
    });
  }

  /**
   * 
   * @returns metro and location information
   */
  findAllServer(): Observable<any[]> {
    this.options = {headers: this.headers};
    return this.http.get(this.mlabNsUrl)
      .pipe(
        map((response: any) => response ),
        tap(data => {
          this.CACHE.all = [];
          data.forEach(responseObject => {
            responseObject.label = responseObject.city.replace('_', ' ');
            responseObject.metro = responseObject.site.slice(0, 3);
            this.CACHE.all.push(responseObject);
          });
        })
      );
  }

  /**
   * Private function to handle error
   * @param error 
   * @returns Error
   */
  handleError(error: Response) {
    return throwError(error);
  }
}
