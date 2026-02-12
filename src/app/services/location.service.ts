import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from 'src/environments/environment';
import { from, map, Observable, retry, switchMap, tap } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class LocationService {
  constructor(private http: HttpClient) { }

  async getWifiAccessPoints(): Promise<{ macAddress: string; signalStrength: number }[]> {
    const wifiList = await (window as any).electronAPI.getWifiList();
    return wifiList.map((wifi: any) => ({
      macAddress: wifi.macAddress,
      signalStrength: wifi.signal
    }));
  }

  resolveGeolocation(wifiAccessPoints: any) {
    return this.http.post(
      `${environment.restAPI}geolocation/geolocate`,
      { considerIp: false, wifiAccessPoints }
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


  fetchAndSaveGeolocation(): Observable<{ latitude: number; longitude: number }> {
  return from(this.getWifiAccessPoints()).pipe(
    switchMap(wifiList => this.resolveGeolocation(wifiList)),

    tap((geo: any) => {
      console.log('Geolocation success:', geo);
      this.saveGeolocation(geo);
    }),

    map((geo: any) => geo)
  );
}

}