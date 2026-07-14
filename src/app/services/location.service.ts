import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from 'src/environments/environment';
import { GeocodeResponse } from './dto/response.dto';
import { NetworkService } from './network.service';
import {
  catchError,
  from,
  map,
  Observable,
  of,
  retry,
  switchMap,
  tap,
} from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class LocationService {

  private readonly STORAGE_KEY_GEO = 'geolocation';
  private readonly STORAGE_KEY_WIFI = 'wifiAccessPoints';

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
  saveGeolocation(geo: { latitude: number; longitude: number } | null) {
    try {
      localStorage.setItem(this.STORAGE_KEY_GEO, JSON.stringify(geo));
    } catch (err) {
      console.warn('[Location] saveGeolocation failed:', err);
    }
  }

  /** Get geolocation from localStorage */
  getSavedGeolocation(): { latitude: number; longitude: number } | null {
    try {
      const data = localStorage.getItem(this.STORAGE_KEY_GEO);
      return data ? JSON.parse(data) : null;
    } catch (err) {
      console.warn('[Location] getSavedGeolocation failed:', err);
      return null;
    }
  }

  /** Save the sorted MAC address list that was used to resolve geolocation. */
  saveWifiAccessPoints(macs: string[]): void {
    try {
      localStorage.setItem(this.STORAGE_KEY_WIFI, JSON.stringify(macs));
    } catch (err) {
      console.warn('[Location] saveWifiAccessPoints failed:', err);
    }
  }

  getCurrentAddress(considerIp: boolean = false): Observable<GeocodeResponse> {
    return from(this.networkService.getNetInfo()).pipe(
      switchMap((netInfo: any) => {
        const ipAddress = netInfo?.ip || '';
        return this.fetchAndSaveGeolocation().pipe(
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

  


  /** Get the sorted MAC address list previously used to resolve geolocation. */
  getSavedWifiAccessPoints(): string[] {
    try {
      const data = localStorage.getItem(this.STORAGE_KEY_WIFI);
      return data ? JSON.parse(data) : [];
    } catch (err) {
      console.warn('[Location] getSavedWifiAccessPoints failed:', err);
      return [];
    }
  }

  /**
   * Fetch geolocation using a WiFi-based cache:
   *  - If no WiFi APs are available → return cached geolocation (or null). No backend call.
   *  - If current WiFi MACs match the cached list AND a cached geolocation exists → return cached. No backend call.
   *  - Otherwise → call backend, cache the result + the new MAC list.
   *
   * Never throws. On any failure it emits the last known cached value (or null).
   */
  fetchAndSaveGeolocation(): Observable<{ latitude: number; longitude: number } | null> {
    const wifiPromise: Promise<{ macAddress: string; signalStrength: number }[]> =
      this.getWifiAccessPoints().catch((err) => {
        console.warn('[Location] getWifiAccessPoints failed:', err);
        return [];
      });

    return from(wifiPromise).pipe(
      switchMap((wifiList) => {
        const currentMacs = this.extractSortedMacs(wifiList);
        const savedGeo = this.getSavedGeolocation();

        // No WiFi APs available → backend can't help, use cache
        if (currentMacs.length === 0) {
          console.log(
            '[Location] No WiFi access points available; using cached geolocation.'
          );
          return of(savedGeo);
        }

        const savedMacs = this.getSavedWifiAccessPoints();

        // WiFi environment unchanged and we already have a geolocation → reuse
        if (savedGeo && this.areWifiListsEqual(currentMacs, savedMacs)) {
          console.log(
            '[Location] WiFi unchanged; reusing cached geolocation.'
          );
          return of(savedGeo);
        }

        // Cache miss → ask backend
        return this.resolveGeolocation(wifiList).pipe(
          tap((geo: any) => {
            this.saveGeolocation(geo);
            this.saveWifiAccessPoints(currentMacs);
            console.log('[Location] Geolocation refreshed from backend:', geo);
          }),
          catchError((err) => {
            console.warn(
              '[Location] Backend resolve failed; falling back to cached geolocation:',
              err
            );
            return of(savedGeo);
          })
        );
      }),
      catchError((err) => {
        console.warn(
          '[Location] fetchAndSaveGeolocation failed entirely; returning cache:',
          err
        );
        return of(this.getSavedGeolocation());
      })
    );
  }

  /** Extract a sorted, de-duplicated list of MAC addresses from a WiFi scan. */
  private extractSortedMacs(
    wifiList: { macAddress: string; signalStrength: number }[]
  ): string[] {
    try {
      if (!Array.isArray(wifiList) || wifiList.length === 0) {
        return [];
      }
      const macs = wifiList
        .map((w) => (w?.macAddress || '').toLowerCase())
        .filter((m) => m.length > 0);
      return Array.from(new Set(macs)).sort();
    } catch (err) {
      console.warn('[Location] extractSortedMacs failed:', err);
      return [];
    }
  }

  /** Compare two sorted MAC lists for equality. */
  private areWifiListsEqual(a: string[], b: string[]): boolean {
    if (!Array.isArray(a) || !Array.isArray(b)) {
      return false;
    }
    if (a.length === 0 || b.length === 0) {
      return false;
    }
    if (a.length !== b.length) {
      return false;
    }
    for (let i = 0; i < a.length; i++) {
      if (a[i] !== b[i]) {
        return false;
      }
    }
    return true;
  }

}
