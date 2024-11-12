import { Injectable } from '@angular/core';
import { map, catchError } from 'rxjs/operators';
import { throwError } from 'rxjs';
import { Network } from '@awesome-cordova-plugins/network/ngx';
import { HttpClient, HttpHeaders } from '@angular/common/http';


type Ip4Data = {
  organization: string;
  country: string;
  asn: number;
  area_code: string;
  organization_name: string;
  country_code: string;
  country_code3: string;
  continent_code: string;
  latitude: string;
  region: string;
  city: string;
  longitude: string;
  accuracy: number;
  ip: string;
  timezone: string;
};

type IpInfoData = {
  ip: string;
  hostname: string;
  city: string;
  region: string;
  country: string;
  loc: string;
  org: string;
  postal: string;
  timezone: string;
};
@Injectable({
  providedIn: 'root'
})
export class NetworkService {
  accessServiceUrl = 'https://ipinfo.io?token=9906baf67eda8b';
  // accessServiceUrl = 'https://ipinfo.io?token=060bdd9da6a22f'; //ONLY FOR LOCAL DEV TESTING
  headers: any;
  options: any;
  currentAccessInformation: any;
  connectionType = {
    icon: 'ion-help',
    label: 'Unknown',
  }
  constructor(private http: HttpClient, private network: Network) {
    const headersItem = new HttpHeaders({
      'Content-Type': 'application/json'
    });
    this.headers = headersItem;
  }

  /**
   * Retrieves network information.
   * @returns {Promise<any>} A promise that resolves to the network information.
   */
  async getNetInfo() {
    console.log('getNetInfo');
    const ipGeoResponse = await fetch('https://ipv4.geojs.io/v1/ip/geo.json');
    const ipGeoData = await ipGeoResponse.json();
    return this.mapData(ipGeoData);
  }

  private mapData(source: Ip4Data): IpInfoData {
    return {
      ip: source.ip,
      hostname: source.ip,
      city: source.city || "",
      region: source.region || "",
      country: source.country_code,
      loc: `${source.latitude},${source.longitude}`,
      org: source.organization || source.organization_name,
      postal: "",
      timezone: source.timezone,
    };
  }
}
