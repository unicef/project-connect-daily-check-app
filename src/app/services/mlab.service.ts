import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders, HttpRequest, HttpParams } from '@angular/common/http';
import { StorageService } from '../services/storage.service';
import { catchError, map, tap } from 'rxjs/operators';
import { throwError, Observable } from 'rxjs';

@Injectable({
  providedIn: 'root',
})
export class MlabService {
  mlabNsUrl = 'https://mlab-ns.appspot.com/ndt?format=json&policy=all';
  mlabNsUrlNoPolicy = 'https://mlab-ns.appspot.com/ndt?format=json';
  mlabNsUrlMetro =
    'https://mlab-ns.appspot.com/ndt?format=json&policy=metro&metro=';
  options: any;
  headers: any;
  responseObject: any;

  constructor(
    private http: HttpClient,
    private storageSerivce: StorageService
  ) {
    const headersItem = new HttpHeaders({
      'Content-Type': 'application/json',
    });
    this.headers = headersItem;
  }

  /**
   * Return data from saved settings
   *
   * @param key
   * @returns any
   */
  get(key) {
    let settings = this.storageSerivce.get('savedSettings');
    let settingsret;
    if (settings) {
      settings = JSON.parse(settings);
      settingsret = key ? settings[key] : settings;
    }
    return settingsret;
  }

  /**
   * Return server information based on metro selection
   *
   * @param metroSelection
   * @returns server details
   */
  findServer(metroSelection, tries = 0) {
    let mlabNsUrlApi = this.mlabNsUrlNoPolicy;
    if (metroSelection && metroSelection !== 'automatic') {
      mlabNsUrlApi = this.mlabNsUrlMetro + metroSelection;
    }
    return this.http.get(mlabNsUrlApi).pipe(
      map((response: any) => {
        if (response) {
          if (response.city) {
            response.label = response.city.replace('_', ' ');
          } else {
            response.label = '';
          }
          response.metro = response.site.slice(0, 3);
          return response;
        } else {
          if (tries < 3) {
            console.log('Retrying to get server information');
            return new Observable((observer) => {
              setTimeout(() => {
                observer.next(this.findServer(metroSelection, tries + 1));
                observer.complete();
              }, 1000);
            });
          } else {
            throw new Error('This request has failed');
          }
        }
      }),
      catchError(this.handleError)
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
