import { Injectable } from '@angular/core';
import {
  HttpClient,
  HttpHeaders,
  HttpRequest,
  HttpParams,
} from '@angular/common/http';
import { catchError, map, switchMap, tap } from 'rxjs/operators';
import { environment } from 'src/environments/environment';
import { Observable, of, throwError } from 'rxjs';
import { SettingsService } from '../services/settings.service';
import { StorageService } from './storage.service';
import { HardwareIdService } from './hardware-id.service';
import { IndexedDBService } from './indexed-db.service';
import { LocationService } from './location.service';
import { PosthogService } from './posthog.service';

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
    let measurement = {
      UUID: record.uuid,
      Download:
        record.results['NDTResult.S2C'].LastClientMeasurement.MeanClientMbps *
        1000,
      Upload:
        record.results['NDTResult.C2S'].LastClientMeasurement.MeanClientMbps *
        1000,
      Latency: (
        (record.results['NDTResult.S2C'].LastServerMeasurement.BBRInfo.MinRTT +
          record.results['NDTResult.C2S'].LastServerMeasurement.BBRInfo
            .MinRTT) /
        2 /
        1000
      ).toFixed(0),
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
    measurement['sdk_version'] = record.sdkVersion || null;

    // Network/device context and the Wi-Fi diagnosis (research plan 0008).
    // On Windows 11 24H2+ an empty wifi_connections does not mean "no Wi-Fi":
    // the WLAN stack is gated behind the Location permission, and these two
    // fields are what let a query tell the two cases apart.
    const wifiDiagnostics = record.wifiDiagnostics || {};
    measurement['wifi_unavailable_reason'] =
      wifiDiagnostics.wifi_unavailable_reason || null;
    measurement['ssid_source'] = wifiDiagnostics.ssid_source || null;
    measurement['device_network_information'] =
      record.deviceNetworkInformation || null;

    // Schedule context: which slot/time this measurement was planned for
    // (null for manual runs). upload_failed flips to true only when the
    // realtime upload fails and the record is queued for later sync.
    measurement['scheduled_slot'] = record.scheduledSlot || null;
    measurement['scheduled_at'] = record.scheduledAt
      ? new Date(record.scheduledAt).toISOString()
      : null;
    measurement['upload_failed'] = false;

    // Add API key if configured.

    if (apiKey != '') {
      uploadURL = uploadURL + '?key=' + apiKey;
    }

    return this.locationService.fetchAndSaveGeolocation().pipe(
      catchError(err => {
        console.error('Geolocation fetch failed, continuing with POST', err);
        this.locationService.saveGeolocation(null);
        return of(this.locationService.getSavedGeolocation() || null);
      }),
      map(geo => {
        measurement['geolocation'] = geo;
        this.locationService.saveGeolocation(geo);
        return measurement;
      }),
      switchMap(measurementWithGeo =>
        this.http.post(uploadURL, measurementWithGeo).pipe(
          map((res: any) => res),
          tap((data) => {
            // Medición entregada en tiempo real. Sin cifras de velocidad: para
            // eso está la propia tabla de mediciones; aquí interesa el embudo.
            this.posthog.capture('measurement_uploaded', {
              notes: measurementWithGeo.Notes,
              scheduled_slot: measurementWithGeo['scheduled_slot'],
              protocol: measurementWithGeo['protocol'] ?? 'mlab',
              upload_failed: false,
            });
            return data;
          }),
          catchError(async (error) => {
            console.error('Upload failed, saving to IndexedDB...', error);
            await this.indexedDB.saveMeasurement({
              ...measurementWithGeo,
              upload_failed: true,
            });
            // El upload en tiempo real falló y la medición queda en la cola
            // local: es la señal que el flag del plan 0006 persigue.
            this.posthog.capture('measurement_queued_offline', {
              notes: measurementWithGeo.Notes,
              scheduled_slot: measurementWithGeo['scheduled_slot'],
              status: error?.status ?? null,
            });
            return of({ savedLocally: true, error });
          })
        )
      )
    );
  }

  private handleError(error: Response) {
    return throwError(error);
  }
}
