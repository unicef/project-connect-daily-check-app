import { Injectable } from '@angular/core';
import {
  HttpClient,
  HttpHeaders,
  HttpRequest,
  HttpParams,
} from '@angular/common/http';
import { catchError, map, switchMap, tap, timeout } from 'rxjs/operators';
import { environment } from 'src/environments/environment';
import { Observable, of, throwError } from 'rxjs';
import { SettingsService } from '../services/settings.service';
import { StorageService } from './storage.service';
import { HardwareIdService } from './hardware-id.service';
import { IndexedDBService } from './indexed-db.service';
import { LocationService, normaliseBssid } from './location.service';
import { PosthogService } from './posthog.service';
import { averageLatencyMs } from '../utils/ndt-results.utils';
import { APP_INSTANCE_ID_KEY } from './registration-context.service';
import {
  AnalyticsEvent,
  describeError,
  parseMeasurementRejection,
} from '../analytics/analytics-events';

/**
 * How long the realtime upload waits for the backend. Past this it is treated
 * as failed: the measurement is queued and SyncService sends it later. Without
 * a limit, a request that never gets an answer leaves the test unfinished, and
 * the result isn't saved or queued until it ends.
 */
export const UPLOAD_TIMEOUT_MS = 30 * 1000;

@Injectable({
  providedIn: 'root',
})
export class UploadService {
  ts: any;
  constructor(
    private http: HttpClient,
    private settingService: SettingsService,
    private storage: StorageService,
    private hardwareIdService: HardwareIdService,
    private indexedDB: IndexedDBService,
    private locationService: LocationService,
    private posthog: PosthogService
  ) {}

  /**
   * Return all network related information
   * @param record
   * @returns client information
   */
  makeMeasurement(record) {
    console.log('record we get', record);
    this.ts = new Date(record.timestamp);
    // Null when neither leg got a server measurement before the ndt7 timeout.
    const latencyMs = averageLatencyMs(record.results);
    let measurement = {
      UUID: record.uuid,
      Download:
        record.results['NDTResult.S2C']?.LastClientMeasurement?.MeanClientMbps *
        1000,
      Upload:
        record.results['NDTResult.C2S']?.LastClientMeasurement?.MeanClientMbps *
        1000,
      Latency: latencyMs === null ? null : latencyMs.toFixed(0),
      // TODO: Uncomment when new backend is ready
      // DataUsage: record.dataUsage.total,
      // DataUploaded: record.dataUsage.upload,
      // DataDownloaded: record.dataUsage.download,
      Results: record.results,
      Annotation: '',
      ServerInfo: {
        FQDN: record.mlabInformation.fqdn,
        IPv4: record.mlabInformation.ip[0],
        IPv6: record.mlabInformation.ip[1],
        City: record.mlabInformation.city,
        Country: record.mlabInformation.country,
        Label: record.mlabInformation.label,
        Metro: record.mlabInformation.metro,
        Site: record.mlabInformation.site,
        URL: record.mlabInformation.url,
        // From the Locate-issued target URL. 0 = the server is in the nearest
        // metro; >0 = Locate sent the test to a further one. Null on records
        // saved before this was captured.
        MetroRank: record.mlabInformation.metroRank ?? null,
        LocateVersion: record.mlabInformation.locateVersion ?? null,
        // Which M-Lab lookup found the server: 'priority' (access from our
        // backend, see LocateAccessService) or 'public'. PriorityLocateError
        // says why a priority lookup that was offered was not used. Both null
        // on records saved before this was captured.
        LocateTier: record.locateTier ?? null,
        PriorityLocateError: record.priorityLocateError ?? null,
      },
      ClientInfo: {
        Country: '', //record.accessInformation.country,
        Hostname: '', //record.accessInformation.hostname,
        Latitude: 0.0,
        Longitude: 0.0,
        ISP: '',
        Postal: '', //record.accessInformation.postal,
        Region: '', //record.accessInformation.region,
        Timezone: '', //record.accessInformation.timezone,
        IP: '', //record.accessInformation.ip,
        ASN: '', //record.accessInformation.asn,
        City: '',
      },
      BrowserID: '',
      Timestamp: '',
      timestamplocal: '',
      DeviceType: '',
      Notes: record.Notes,
      school_id: '',
      ip_address: '', //record.accessInformation.ip,
      country_code: '', //record.accessInformation.country,
      giga_id_school: '',
      app_version: environment.app_version,
    };
    if (record.hasOwnProperty('accessInformation')) {
      let clientInfo = record.accessInformation;

      // In unversioned records, the accessInformation field comes
      // from the now-discontinued measure-location service, which
      // used to provide different field names.
      if (!record.hasOwnProperty('version')) {
        measurement.ClientInfo.Country = clientInfo.country_name;
        measurement.ClientInfo.Hostname = '';
        measurement.ClientInfo.Latitude = clientInfo.latitude;
        measurement.ClientInfo.Longitude = clientInfo.longitude;
        measurement.ClientInfo.ISP = clientInfo.isp;
        measurement.ClientInfo.Postal = clientInfo.postal_code;
        measurement.ClientInfo.Region = clientInfo.region_code;
        measurement.ClientInfo.Timezone = clientInfo.time_zone;
      } else if (record.version == 1) {
        measurement.ClientInfo.Country = clientInfo.country;
        measurement.ClientInfo.Hostname = clientInfo.hostname;

        var coords = clientInfo.loc.split(',');
        if (coords.length == 2) {
          measurement.ClientInfo.Latitude = parseFloat(coords[0]);
          measurement.ClientInfo.Longitude = parseFloat(coords[1]);
        }

        measurement.ClientInfo.ISP = clientInfo.org;
        measurement.ClientInfo.Postal = clientInfo.postal;
        measurement.ClientInfo.Region = clientInfo.region;
        measurement.ClientInfo.Timezone = clientInfo.timezone;
      }

      measurement.ClientInfo.IP = clientInfo.ip;
      measurement.ClientInfo.ASN = clientInfo.asn;
      measurement.ClientInfo.City = clientInfo.city;
    }
    return measurement;
  }

  uploadMeasurement(record) {
    if (!this.settingService.currentSettings.uploadEnabled) {
      return;
    }
    let uploadURL = environment.restAPI + 'measurements';
    const apiKey = this.settingService.get('uploadAPIKey');
    // const browserID = this.settingService.get("browserID");
    // const deviceType = this.settingService.get("deviceType");

    const notes = record.Notes;
    let measurement = this.makeMeasurement(record);

    this.storage.get('country_code') === '' ||
      this.storage.get('country_code') === null
      ? (measurement.country_code = measurement.ClientInfo.Country)
      : (measurement.country_code = this.storage.get('country_code'));

    this.storage.get('ip_address') === '' ||
      this.storage.get('ip_address') === null
      ? (measurement.ip_address = measurement.ClientInfo.IP)
      : (measurement.ip_address = this.storage.get('ip_address'));
    measurement.country_code = measurement.ClientInfo.Country;

    // Add measure-saver-specific metadata.
    measurement.BrowserID = this.storage.get('schoolUserId');
    // This install (app instance): the link from the result to its
    // registration, in place of BrowserID.
    measurement['app_instance_id'] =
      this.storage.get(APP_INSTANCE_ID_KEY) || null;
    measurement.Timestamp = this.ts.toISOString();
    measurement.timestamplocal = this.ts.toLocaleString();
    measurement.DeviceType = this.storage.get('deviceType');
    measurement.Notes = notes;
    measurement.school_id = this.storage.get('schoolId');
    measurement.giga_id_school = this.storage.get('gigaId');
    measurement.app_version = environment.app_version;
    measurement.ip_address = measurement.ClientInfo.IP;

    // Add hardware ID for machine-level tracking
    const hardwareId = this.hardwareIdService.getHardwareId();
    measurement['device_hardware_id'] = hardwareId || null;

    // Add Windows username, installed path, and WiFi connections
    measurement['windows_username'] = record.windowsUsername || null;
    measurement['installed_path'] = record.installedPath || null;
    measurement['wifi_connections'] = record.wifiConnections || null;

    // Device identity. These columns have existed backend-side since
    // giga-meter-backend#353 but nothing filled them, so every row landed NULL.
    const identity = record.deviceIdentity || {};
    measurement['device_name'] = identity.device_name || null;
    measurement['device_model'] = identity.device_model || null;
    measurement['device_manufacturer'] = identity.device_manufacturer || null;
    measurement['app_build_number'] = identity.app_build_number || null;
    measurement['os_version'] = identity.os_version || null;

    // Network/device context and the Wi-Fi diagnosis.
    // On Windows 11 24H2+ an empty wifi_connections does not mean "no Wi-Fi":
    // the WLAN stack is gated behind the Location permission, and these two
    // fields are what let a query tell the two cases apart.
    const wifiDiagnostics = record.wifiDiagnostics || {};
    measurement['wifi_unavailable_reason'] =
      wifiDiagnostics.wifi_unavailable_reason || null;
    measurement['ssid_source'] = wifiDiagnostics.ssid_source || null;
    measurement['device_context'] =
      record.deviceContext || null;

    // Schedule context: which slot/time this measurement was planned for
    // (null for manual runs). offline_synced flips to true only on the copy
    // queued for later sync, so the row records how it reached the backend:
    // the realtime upload, or the offline queue.
    measurement['scheduled_slot'] = record.scheduledSlot || null;
    measurement['scheduled_at'] = record.scheduledAt
      ? new Date(record.scheduledAt).toISOString()
      : null;
    measurement['offline_synced'] = false;

    // M-Lab's own clock at server discovery. Independent of the device clock,
    // which on these machines is often wrong; null when ndt7 could not read it.
    measurement['server_timestamp'] = record.serverTimestamp
      ? new Date(record.serverTimestamp).toISOString()
      : null;

    // Add API key if configured.

    if (apiKey != '') {
      uploadURL = uploadURL + '?key=' + apiKey;
    }

    // The access point this test ran on, so a location saved at another
    // place is not sent as this one.
    const connectedBssid = this.getConnectedBssid(record);

    return this.locationService.fetchAndSaveGeolocation(connectedBssid).pipe(
      /* Geolocation is best effort: whatever happens, the measurement is still
         posted. fetchAndSaveGeolocation already falls back to the cached value
         and persists a fresh one, so nothing is written back here — the old
         code overwrote the cache with null on the way past, which would have
         destroyed the very fallback this relies on. */
      catchError(err => {
        console.error('Geolocation fetch failed, continuing with POST', err);
        return of(
          this.locationService.getSavedGeolocationForNetwork(connectedBssid)
        );
      }),
      map(geo => {
        measurement['geolocation'] = geo ?? null;
        return measurement;
      }),
      switchMap(measurementWithGeo =>
        this.http.post(uploadURL, measurementWithGeo).pipe(
          timeout(UPLOAD_TIMEOUT_MS),
          map((res: any) => res),
          tap((data) => {
            // Measurement delivered in realtime. No speed figures: that is what
            // the measurements table itself is for; what matters here is the
            // funnel.
            this.posthog.capture(AnalyticsEvent.MeasurementUploaded, {
              notes: measurementWithGeo.Notes,
              scheduled_slot: measurementWithGeo['scheduled_slot'],
              protocol: measurementWithGeo['protocol'] ?? 'mlab',
              offline_synced: false,
              ...this.geolocationProperties(),
            });
            return data;
          }),
          catchError(async (error) => {
            // The backend refused it (school no longer exists, wrong country):
            // it already sits in measurements_failed, and sending it again
            // would only add another row there. Not queued.
            const rejection = parseMeasurementRejection(error);
            if (rejection) {
              console.error('Upload refused by the backend, not queued:', error);
              this.posthog.captureFailure(
                AnalyticsEvent.MeasurementRejected,
                error,
                {
                  source: 'realtime',
                  reason: rejection.reason,
                  count: 1,
                  notes: measurementWithGeo.Notes,
                  scheduled_slot: measurementWithGeo['scheduled_slot'],
                  ...this.geolocationProperties(),
                }
              );
              throw error;
            }
            console.error('Upload failed, saving to IndexedDB...', error);
            await this.indexedDB.saveMeasurement({
              ...measurementWithGeo,
              offline_synced: true,
            });
            // The realtime upload failed and the measurement stays in the local
            // queue: this is the signal the offline_synced flag is after.
            this.posthog.capture(AnalyticsEvent.MeasurementQueuedOffline, {
              notes: measurementWithGeo.Notes,
              scheduled_slot: measurementWithGeo['scheduled_slot'],
              status: error?.status ?? null,
              ...describeError(error),
              ...this.geolocationProperties(),
            });
            // Still a failure for the caller: returning a value here made every
            // failed upload look delivered, so the history showed "Synced" for
            // tests the backend never received. SyncService flips the history
            // row once the queued copy goes through.
            throw error;
          })
        )
      )
    );
  }

  /**
   * The BSSID of the access point the PC was connected to, from the
   * connection read at the start of the test: the first entry with a usable
   * address. Null on a cable, or when Windows hides the Wi-Fi details (the
   * name the main process recovers then has no BSSID).
   */
  private getConnectedBssid(record: any): string | null {
    try {
      const connections = Array.isArray(record?.wifiConnections)
        ? record.wifiConnections
        : [];
      for (const connection of connections) {
        const bssid = normaliseBssid(connection?.bssid);
        if (bssid) {
          return bssid;
        }
      }
      return null;
    } catch (err) {
      console.warn('[Upload] Could not read the connected BSSID:', err);
      return null;
    }
  }

  /** How geolocation went for this upload (LocationService.getLastOutcome). */
  private geolocationProperties(): Record<string, any> {
    try {
      return { ...(this.locationService.getLastOutcome?.() ?? {}) };
    } catch {
      return {};
    }
  }

  private handleError(error: Response) {
    return throwError(error);
  }
}
