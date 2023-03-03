import { Injectable } from '@angular/core';
import { map, catchError } from 'rxjs/operators';
import { throwError  } from 'rxjs';
import { Network } from '@awesome-cordova-plugins/network/ngx';
import { HttpClient, HttpHeaders } from '@angular/common/http';
@Injectable({
  providedIn: 'root'
})
export class NetworkService {
  accessServiceUrl = 'https://ipinfo.io?token=9906baf67eda8b';
  headers: any;
  options: any;
  currentAccessInformation: any;
  connectionType = {
    'icon': 'ion-help',
    'label': 'Unknown',
  }
  constructor( private http: HttpClient, private network: Network ) {
    const headersItem = new HttpHeaders({
      'Content-Type': 'application/json'
    });
    this.headers = headersItem;
  }

  /**
   * Return client network information from ipinfo
   * @returns current access information
   */
  getAccessInformation(){
    this.options = {headers: this.headers};
    return this.http.get(this.accessServiceUrl, this.options)
    .pipe(
        map(
          (response: any) => {
            this.currentAccessInformation = response;
            let asnRegex = new RegExp('^(AS[0-9]+)\\w+(.+)');
            this.currentAccessInformation.asn = this.currentAccessInformation.org.replace(asnRegex, "$1");
            this.currentAccessInformation.org = this.currentAccessInformation.org.replace(asnRegex, "$2");
            return this.currentAccessInformation;
          }
        ),catchError(this.handleError)
    );
  }

  /**
   * 
   * @param connectionClass 
   * @returns Connection information of client
   */
  getConnectionInformation(connectionClass){
    let connectSubscription = this.network.onConnect().subscribe(() => {
      console.log('network connected!');
      // `unknown`, `ethernet`, `wifi`, `2g`, `3g`, `4g`, `cellular`, `none`
      setTimeout(() => {
        switch(connectionClass){
          case 'wifi':
            this.connectionType.icon = 'ion-wifi';
					  this.connectionType.label = 'Wi-Fi';
            break;
          case '2g':
            this.connectionType.icon = 'ion-connection-bars';
					  this.connectionType.label = 'Mobile Data (2G)';
            break;
          case '3g':
            this.connectionType.icon = 'ion-connection-bars';
            this.connectionType.label = 'Mobile Data (3G)';
            break;
          case '4g':
            this.connectionType.icon = 'ion-connection-bars';
            this.connectionType.label = 'Mobile Data (4G)';
            break;
          case 'cellular':
            this.connectionType.icon = 'ion-connection-bars';
            this.connectionType.label = 'Mobile Data';
            break;
          case 'ethernet':
            this.connectionType.icon = 'ion-connection-bars';
            this.connectionType.label = 'Mobile Data';
            break;
          default:
            break;
        }
      }, 3000);
    });
    
    // stop connect watch
    connectSubscription.unsubscribe();
    return this.connectionType;
  }

  /**
   * 
   * @returns current network information
   */
  currentConnectionInformation(){
    let connectionClass = undefined;
    connectionClass = this.network.type;
		return this.getConnectionInformation(connectionClass);
  }

  /**
   * Private function to handle error
   * @param error 
   * @returns Error
   */
   private handleError(error: Response) {
    return throwError(error);
  }
}
