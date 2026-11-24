import { Injectable } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { environment } from 'src/environments/environment';
import {
  catchError,
  from,
  map,
  Observable,
  of,
  retry,
  switchMap,
  tap,
  throwError,
  timeout,
  TimeoutError,
  timer,
} from 'rxjs';

/**
 * Upper bound for one geolocate request. The upload waits for geolocation
 * before it posts the measurement, so a request that never settles used to
 * stall the upload for good. The backend gives up on Google after 8 s; this
 * covers the cases where no answer arrives at all.
 */
export const GEOLOCATE_TIMEOUT_MS = 10_000;

/** Upper bound for the Wi-Fi scan the Electron main process runs. */
export const WIFI_SCAN_TIMEOUT_MS = 15_000;

/** Delay before the single retry, when the failure is worth retrying at all. */
export const GEOLOCATE_RETRY_DELAY_MS = 1_000;

/**
 * Whether a second attempt can plausibly do better than the first.
 *
 * Retrying was unconditional, so a deterministic answer was always asked for
 * twice: the backend's 422 (these access points do not resolve to a location)
 * and, now that the proxy is authenticated, every 401. That doubles the wait
 * before the upload gives up on geolocation and doubles the load for nothing.
 *
 * Status 0 is a request that never reached the backend, which is worth another
 * try, unlike anything the backend answered in the 4xx range.
 */
export function isRetryableGeolocateError(error: unknown): boolean {
  if (error instanceof TimeoutError) {
    return true;
  }
  if (error instanceof HttpErrorResponse) {
    return error.status === 0 || error.status >= 500;
  }
  // Unknown failure: one more attempt is cheap and bounded by the timeout.
  return true;
}

/**
 * A BSSID (an access point's hardware address) written one way: lowercase,
 * colon separated ("aa:bb:cc:dd:ee:ff"), so the address of the access point
 * the PC is connected to and the addresses in a Wi-Fi scan compare equal
 * whatever case or separator each source used. Anything that is not 12 hex
 * digits, or is all zeros or all f, is not a usable address: null.
 */
export function normaliseBssid(raw: unknown): string | null {
  if (typeof raw !== 'string') {
    return null;
  }
  const hex = raw.trim().toLowerCase().replace(/[:\-.]/g, '');
  if (!/^[0-9a-f]{12}$/.test(hex) || /^0+$/.test(hex) || /^f+$/.test(hex)) {
    return null;
  }
  return hex.match(/.{2}/g)!.join(':');
}

/**
 * Whether the PC is now connected to an access point of a different place
 * from the one the saved location was worked out at. When either BSSID is
 * unknown the answer is "not changed", which keeps the old behaviour.
 *
 * A different BSSID alone is not a move: schools often run several access
 * points under one name, and dual-band routers use one BSSID per band. An
 * access point that was in the scan the saved location was worked out from
 * is, by definition, at the same place, so roaming to it is not a change.
 */
export function hasNetworkChanged(
  savedBssid: string | null,
  currentBssid: string | null,
  savedAccessPoints: string[]
): boolean {
  const saved = normaliseBssid(savedBssid);
  const current = normaliseBssid(currentBssid);
  if (!saved || !current || saved === current) {
    return false;
  }
  const accessPoints = Array.isArray(savedAccessPoints) ? savedAccessPoints : [];
  return !accessPoints.some((mac) => normaliseBssid(mac) === current);
}

@Injectable({
  providedIn: 'root'
})
export class LocationService {
  private readonly STORAGE_KEY_GEO = 'geolocation';
  private readonly STORAGE_KEY_WIFI = 'wifiAccessPoints';
  private readonly STORAGE_KEY_NETWORK = 'geolocationNetwork';

  constructor(private http: HttpClient) { }

  async getWifiAccessPoints(): Promise<{ macAddress: string; signalStrength: number }[]> {
    let scanTimer: ReturnType<typeof setTimeout>;
    const scanTimeout = new Promise<never>((_, reject) => {
      scanTimer = setTimeout(
        () => reject(new Error(`Wi-Fi scan timed out after ${WIFI_SCAN_TIMEOUT_MS} ms`)),
        WIFI_SCAN_TIMEOUT_MS
      );
    });
    try {
      const wifiList = await Promise.race([
        (window as any).electronAPI.getWifiList(),
        scanTimeout,
      ]);
      return wifiList.map((wifi: any) => ({
        macAddress: wifi.macAddress,
        signalStrength: wifi.signal
      }));
    } finally {
      clearTimeout(scanTimer);
    }
  }

  resolveGeolocation(wifiAccessPoints: any) {
    return this.http.post(
      `${environment.restAPI}geolocation/geolocate`,
      { considerIp: false, wifiAccessPoints }
    ).pipe(

      // A pending request errors out here, so the retry and the callers'
      // cached-value fallback get a chance to run.
      timeout(GEOLOCATE_TIMEOUT_MS),

      // Retry once, and only when a second attempt could go differently.
      retry({
        count: 1,
        delay: (error) =>
          isRetryableGeolocateError(error)
            ? timer(GEOLOCATE_RETRY_DELAY_MS)
            : throwError(() => error),
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
   * Save the BSSID of the access point the PC was connected to when the saved
   * location was worked out. Null removes it, which puts the saved location
   * back in the "network not known yet" state.
   */
  saveConnectedBssid(bssid: string | null): void {
    try {
      const normalised = normaliseBssid(bssid);
      if (normalised) {
        localStorage.setItem(this.STORAGE_KEY_NETWORK, normalised);
      } else {
        localStorage.removeItem(this.STORAGE_KEY_NETWORK);
      }
    } catch (err) {
      console.warn('[Location] saveConnectedBssid failed:', err);
    }
  }

  /**
   * The BSSID saved with the location, if known. A value that is not a usable
   * address (including one saved in an older shape) counts as not known.
   */
  getSavedConnectedBssid(): string | null {
    try {
      return normaliseBssid(localStorage.getItem(this.STORAGE_KEY_NETWORK));
    } catch (err) {
      console.warn('[Location] getSavedConnectedBssid failed:', err);
      return null;
    }
  }

  /**
   * Save a freshly resolved location together with what it was worked out
   * from: the access points it was resolved with and the BSSID the PC was
   * connected to. Pass null when that BSSID is not known; the next upload
   * then adopts it once it sees the same access points.
   */
  saveResolvedGeolocation(
    geo: { latitude: number; longitude: number } | null,
    wifiList: { macAddress: string; signalStrength: number }[],
    connectedBssid: string | null
  ): void {
    this.saveGeolocation(geo);
    this.saveWifiAccessPoints(this.extractSortedMacs(wifiList));
    this.saveConnectedBssid(connectedBssid);
  }

  /**
   * The saved location, unless the PC is now connected to an access point of
   * another place. A location from another place is the old place, not this
   * one, so nothing is better than sending it.
   */
  getSavedGeolocationForNetwork(
    connectedBssid: string | null
  ): { latitude: number; longitude: number } | null {
    try {
      const savedGeo = this.getSavedGeolocation();
      if (
        savedGeo &&
        hasNetworkChanged(
          this.getSavedConnectedBssid(),
          connectedBssid,
          this.getSavedWifiAccessPoints()
        )
      ) {
        return null;
      }
      return savedGeo;
    } catch (err) {
      console.warn('[Location] getSavedGeolocationForNetwork failed:', err);
      return null;
    }
  }

  /**
   * Fetch geolocation using a WiFi-based cache:
   *  - If the PC is connected to an access point of another place than the
   *    one the cached location was worked out at → the cache is never used;
   *    only a fresh backend answer is sent, otherwise null. The cache is kept
   *    for when the PC goes back.
   *  - If no WiFi APs are available → return cached geolocation (or null). No backend call.
   *  - If current WiFi MACs match the cached list AND a cached geolocation exists → return cached. No backend call.
   *  - Otherwise → call backend, cache the result + the new MAC list + the connected BSSID.
   *
   * Never throws. On any failure it emits the cached value when it is still
   * valid for this network (or null).
   *
   * @param connectedBssid BSSID of the access point the PC is connected to
   *   now; null when not known (cable, or Windows hides the Wi-Fi details)
   */
  fetchAndSaveGeolocation(
    connectedBssid: string | null = null
  ): Observable<{ latitude: number; longitude: number } | null> {
    const current = normaliseBssid(connectedBssid);
    const wifiPromise: Promise<{ macAddress: string; signalStrength: number }[]> =
      this.getWifiAccessPoints().catch((err) => {
        console.warn('[Location] getWifiAccessPoints failed:', err);
        return [];
      });

    return from(wifiPromise).pipe(
      switchMap((wifiList) => {
        const currentMacs = this.extractSortedMacs(wifiList);
        const savedGeo = this.getSavedGeolocation();
        const savedBssid = this.getSavedConnectedBssid();
        const savedMacs = this.getSavedWifiAccessPoints();

        // A PC that moved (school to home, or to another school) would
        // otherwise send the old place's location whenever the lookup fails,
        // which is common right after boot. On another network the cache is
        // never sent; it stays saved for when the PC comes back.
        const networkChanged =
          !!savedGeo && hasNetworkChanged(savedBssid, current, savedMacs);
        const fallbackGeo = networkChanged ? null : savedGeo;
        if (networkChanged) {
          console.log(
            '[Location] Network changed since the cached geolocation; not reusing it.'
          );
        }

        // No WiFi APs available → backend can't help, use cache
        if (currentMacs.length === 0) {
          console.log(
            '[Location] No WiFi access points available; using cached geolocation if still valid.'
          );
          return of(fallbackGeo);
        }

        // WiFi environment unchanged and we already have a geolocation → reuse
        if (
          !networkChanged &&
          savedGeo &&
          this.areWifiListsEqual(currentMacs, savedMacs)
        ) {
          // A location saved before the BSSID was recorded (2.0.3 and
          // earlier, or at registration) gets the current BSSID only here,
          // where the same access points show the PC has not moved.
          if (!savedBssid && current) {
            this.saveConnectedBssid(current);
          }
          console.log(
            '[Location] WiFi unchanged; reusing cached geolocation.'
          );
          return of(savedGeo);
        }

        // Cache miss → ask backend
        return this.resolveGeolocation(wifiList).pipe(
          tap((geo: any) => {
            this.saveResolvedGeolocation(geo, wifiList, current);
            console.log('[Location] Geolocation refreshed from backend:', geo);
          }),
          catchError((err) => {
            console.warn(
              '[Location] Backend resolve failed; falling back to cached geolocation if still valid:',
              err
            );
            return of(fallbackGeo);
          })
        );
      }),
      catchError((err) => {
        console.warn(
          '[Location] fetchAndSaveGeolocation failed entirely; returning cache if still valid:',
          err
        );
        return of(this.getSavedGeolocationForNetwork(current));
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
