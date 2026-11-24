import { Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { timeout } from 'rxjs/operators';
import { Network } from '@awesome-cordova-plugins/network/ngx';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { environment } from 'src/environments/environment';

/**
 * How long each request of the IP/ISP lookup waits. A request that never gets
 * an answer would otherwise hold up the speed test (and the scheduler's
 * network check) for ever; with this, it fails over to the next try or the
 * fallback service.
 */
export const NET_INFO_REQUEST_TIMEOUT_MS = 10 * 1000;

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

type IpInfoLiteData = {
  ip: string;
  asn: string;
  as_name: string;
  as_domain: string;
  country_code: string;
  country: string;
  continent_code: string;
  continent: string;
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
  asn?: string | any;
};
@Injectable({
  providedIn: 'root',
})
export class NetworkService {
  accessServiceUrl = environment.restAPI + 'ip-metadata';
  ipInfoLiteUrl =
    'https://api.ipinfo.io/lite/me?token=' + environment.ipInfoToken;

  headers: any;
  options: any;
  currentAccessInformation: any;
  connectionType = {
    icon: 'ion-help',
    label: 'Unknown',
  };
  constructor(private http: HttpClient, private network: Network) {
    const headersItem = new HttpHeaders({
      'Content-Type': 'application/json',
    });
    this.headers = headersItem;
  }

  // this function has a retrie logic of 3 times with exponential wait
  async getIpFromIpLite(): Promise<IpInfoLiteData> {
    console.log('getIpFromIpLite');
    const options = { headers: this.headers };
    let response = null;
    let retryCount = 0;
    const maxRetries = 3;

    while (retryCount < maxRetries) {
      try {
        console.log('accessServiceUrl', this.ipInfoLiteUrl);
        response = await firstValueFrom(
          this.http
            .get<IpInfoLiteData>(this.ipInfoLiteUrl, options)
            .pipe(timeout(NET_INFO_REQUEST_TIMEOUT_MS))
        );
        console.log('response', response);
        return response;
      } catch (error) {
        console.error('Error:', error);
        retryCount++;
        if (retryCount < maxRetries) {
          const waitTime = Math.pow(2, retryCount) * 1000; // Exponential backoff
          await new Promise((resolve) => setTimeout(resolve, waitTime));
        }
      }
    }
    throw new Error(
      'Failed to retrieve IP information after multiple attempts.'
    );
  }

  /**
   * Retrieves network information.
   * @returns {Promise<any>} A promise that resolves to the network information.
   */
  async getNetInfo() {
    console.log('getNetInfo');
    const options = { headers: this.headers };
    let response = null;
    try {
      const ipInfoLite = await this.getIpFromIpLite();
      const httpResponse = await firstValueFrom(
        this.http
          .get<IpInfoData>(`${this.accessServiceUrl}/${ipInfoLite.ip}`, options)
          .pipe(timeout(NET_INFO_REQUEST_TIMEOUT_MS))
      );
      response = this.standardData(httpResponse);
    } catch (error) {
      console.error('Error:', error);
      // The signal also covers reading the body below.
      const ipGeoResponse = await fetch('https://ipv4.geojs.io/v1/ip/geo.json', {
        signal: AbortSignal.timeout(NET_INFO_REQUEST_TIMEOUT_MS),
      });
      const ipGeoData = await ipGeoResponse?.json().catch(() => null);

      return this.mapData(ipGeoData);
    }
    return response;
  }

  private mapData(source: Ip4Data): IpInfoData {
    return this.standardData({
      ip: source?.ip ?? '',
      hostname: source?.ip ?? '',
      city: source?.city ?? '',
      region: source?.region ?? '',
      country: source?.country_code ?? '',
      loc: `${source?.latitude},${source?.longitude}`,
      org: source?.organization ?? source?.organization_name ?? '',
      postal: '',
      timezone: source?.timezone ?? '',
    });
  }
  private standardData(source: IpInfoData): IpInfoData {
    return {
      ip: source?.ip ?? '',
      hostname: source?.hostname ?? '',
      city: source?.city ?? '',
      region: source?.region ?? '',
      country: source?.country ?? '',
      loc: source?.loc ?? '',
      org: source?.org ?? '',
      postal: source?.postal ?? '',
      timezone: source?.timezone ?? '',
      asn: source?.asn?.asn ?? source?.org.match(/AS[0-9]+/)?.[0] ?? '',
    };
  }
}
