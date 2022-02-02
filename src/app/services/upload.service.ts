import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders, HttpRequest, HttpParams } from '@angular/common/http';
import { catchError, map, tap } from 'rxjs/operators';
import { Observable, throwError } from 'rxjs';
import { SettingsService } from "../services/settings.service"

@Injectable({
  providedIn: 'root'
})
export class UploadService {
  ts: any;
  constructor( private http: HttpClient, private settingService: SettingsService ) { }

  /**
   * Return all network related information
   * @param record 
   * @returns client information
   */
  makeMeasurement(record){
    this.ts = new Date(record.timestamp);
    let measurement = {
        "UUID": record.uuid,
        "Download": record.results.s2cRate,
        "Upload": record.results.c2sRate,
        "Latency": parseInt(record.results.MinRTT),
        "Results": record.results,
        "Annotation": record.note,
        "ServerInfo": {
          "FQDN": "",
          "IPv4": "",
          "IPv6" : "",
          "City" : "",
          "Country" : "",
          "Label" : "",
          "Metro" : "",
          "Site" : "",
          "URL" : "",
        },
        "ClientInfo": {
          Country: "",
          Hostname: "",
          Latitude: 0.0,
          Longitude: 0.0,
          ISP: "",
          Postal: "",
          Region: "",
          Timezone: "",
          IP: "",
          ASN: "",
          City: ""
        },
        "BrowserID" : "",
        "Timestamp": "",
        "DeviceType": "",
        "Notes": ""
    };
    if (record.hasOwnProperty("mlabInformation")) {
      // If we've got server data from mlab-ns, add it to the Measurement
      // object.
      let serverInfo = record.mlabInformation;
      measurement.ServerInfo.FQDN = serverInfo.fqdn;
      measurement.ServerInfo.IPv4 = serverInfo.ip[0];
      measurement.ServerInfo.IPv6 = serverInfo.ip[1];
      measurement.ServerInfo.City = serverInfo.city;
      measurement.ServerInfo.Country = serverInfo.country;
      measurement.ServerInfo.Label = serverInfo.label;
      measurement.ServerInfo.Metro = serverInfo.metro;
      measurement.ServerInfo.Site = serverInfo.site;
      measurement.ServerInfo.URL = serverInfo.url;
    }

    if (record.hasOwnProperty("accessInformation")) {
      let clientInfo = record.accessInformation;

      // In unversioned records, the accessInformation field comes
      // from the now-discontinued measure-location service, which
      // used to provide different field names.
      if (!record.hasOwnProperty("version")) {
          measurement.ClientInfo.Country = clientInfo.country_name;
          measurement.ClientInfo.Hostname = "";
          measurement.ClientInfo.Latitude = clientInfo.latitude;
          measurement.ClientInfo.Longitude = clientInfo.longitude;
          measurement.ClientInfo.ISP = clientInfo.isp;
          measurement.ClientInfo.Postal = clientInfo.postal_code;
          measurement.ClientInfo.Region = clientInfo.region_code;
          measurement.ClientInfo.Timezone = clientInfo.time_zone;
      } else if (record.version == 1) {
          measurement.ClientInfo.Country = clientInfo.country;
          measurement.ClientInfo.Hostname = clientInfo.hostname;

          var coords = clientInfo.loc.split(",");
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

  uploadMeasurement(record){
    if (!this.settingService.currentSettings.uploadEnabled) {
      return;
    }
    let uploadURL = this.settingService.get("uploadURL");
    // uploadURL += "/v0/measurements";
    const apiKey = this.settingService.get("uploadAPIKey");
    const browserID = this.settingService.get("browserID");
    const deviceType = this.settingService.get("deviceType");
    const notes = this.settingService.get("notes");
    let measurement = this.makeMeasurement(record);
    // Add measure-saver-specific metadata.
    measurement.BrowserID = browserID;
    measurement.Timestamp = this.ts.toISOString();
    measurement.DeviceType = deviceType;
    measurement.Notes = notes;

    // Add API key if configured.
    if (apiKey != "") {
        uploadURL = uploadURL + "?key=" + apiKey;
    }

    return this.http.post(uploadURL, measurement).pipe(
      map((res: any) => res), // ...and calling .json() on the response to return data
      tap(data => data),
      catchError(this.handleError)); // ...errors if any
  }

  private handleError(error: Response) {
    return throwError(error);
  }
}
