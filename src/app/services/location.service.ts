import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from 'src/environments/environment';
import { catchError, from, map, Observable, retry, switchMap, tap } from 'rxjs';
import { GeocodeResponse } from './dto/response.dto';
import { NetworkService } from './network.service';

@Injectable({
  providedIn: 'root'
})
export class LocationService {
  constructor(private http: HttpClient, private networkService: NetworkService) { }

  async getWifiAccessPoints(): Promise<{ macAddress: string; signalStrength: number }[]> {
    const wifiList = await (window as any).electronAPI.getWifiList();
    return wifiList.map((wifi: any) => ({
      macAddress: wifi.macAddress,
      signalStrength: wifi.signal
    }));
  }

  resolveGeolocation(wifiAccessPoints: any, considerIp: boolean = false) {
    return this.http.post(
      `${environment.restAPI}geolocation/geolocate`,
      { considerIp, wifiAccessPoints }
    ).pipe(

      //  Retry once with 1 second delay
      retry({
        count: 1,
        delay: 1000
      }),

      map((response: any) => ({
        ...response,
        timestamp: Date.now()
      }))
    );
  }

  /** Save geolocation in localStorage */
  saveGeolocation(geo: { latitude: number; longitude: number }) {
    localStorage.setItem('geolocation', JSON.stringify(geo));
  }

  /** Get geolocation from localStorage */
  getSavedGeolocation(): { latitude: number; longitude: number } | null {
    const data = localStorage.getItem('geolocation');
    return data ? JSON.parse(data) : null;
  }


  fetchAndSaveGeolocation(considerIp: boolean = false): Observable<{ latitude: number; longitude: number }> {
    return from(this.getWifiAccessPoints()).pipe(
      switchMap(wifiList => this.resolveGeolocation(wifiList, considerIp)),

      tap((geo: any) => {
        console.log('Geolocation success:', geo);
        this.saveGeolocation(geo);
      }),

      map((geo: any) => geo)
    );
  }

  getCurrentAddress(considerIp: boolean = false): Observable<GeocodeResponse> {
    return from(this.networkService.getNetInfo()).pipe(
      switchMap((netInfo: any) => {
        const ipAddress = netInfo?.ip || '';
        return this.fetchAndSaveGeolocation(considerIp).pipe(
          switchMap((geo: any) => {
            if (geo?.location?.lat && geo?.location?.lng) {
              return this.getAddress(
                geo.location.lat,
                geo.location.lng,
                ipAddress,
              );
            }
            throw new Error('API did not return lat/lng');
          }),
          catchError((error) => {
            console.warn(
              'Geolocation failed, falling back to network info:',
              error,
            );
            if (netInfo?.loc) {
              const [lat, lng] = netInfo.loc.split(',');
              const parsedLat = parseFloat(lat);
              const parsedLng = parseFloat(lng);
              if (!isNaN(parsedLat) && !isNaN(parsedLng)) {
                return this.getAddress(parsedLat, parsedLng, ipAddress);
              }
            }
            throw new Error('Could not get network info location');
          }),
        );
      }),
    );
  }

  getAddress(
    latitude: number,
    longitude: number,
    ipAddress: string = '',
  ): Observable<GeocodeResponse> {
    return this.http
      .get<GeocodeResponse>(
        `${environment.restAPI}geolocation/geocode/flexible?latitude=${latitude}&longitude=${longitude}`,
      )
      .pipe(
        map((response) => ({
          ...response,
          latitude,
          longitude,
          ipAddress,
        })),
        retry({
          count: 1,
          delay: 1000,
        }),
      );
  }

  

}