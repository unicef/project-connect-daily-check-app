import { Injectable } from '@angular/core';
import { Observable, Subject } from 'rxjs';

@Injectable({
  providedIn: 'root',
})
export class PingWebSocketService {
  private socket: WebSocket;
  private messageSubject: Subject<any> = new Subject<any>();
  private websocketUrl =
    'http://msak-mlab1-lga0t.mlab-sandbox.measurement-lab.org/ping/v1/ws?access_token=eyJhbGciOiJFZERTQSIsImtpZCI6ImxvY2F0ZV8yMDIwMDQwOSJ9.eyJhdWQiOlsibWxhYjEtbGdhMHQubWxhYi1zYW5kYm94Lm1lYXN1cmVtZW50LWxhYi5vcmciXSwiZXhwIjoxNzI1OTcxODI3LCJpc3MiOiJsb2NhdGUiLCJqdGkiOiI2YWQxNmYzNi1kMTQ3LTQ1NjQtOGZhYy02NTk5OWUwZDc3Y2MiLCJzdWIiOiJtc2FrIn0.V4t95ddqhqM_vfgLmY19UkzW7BNlbHLeD4zMmuvPa-9TURrcrrHz7nLHpnmHHkxNuD3ylDWrGdrpoU6UmXZ9BQ\u0026index=0\u0026locate_version=v2\u0026metro_rank=0';
  // it will return rtt array like [100, 200, 300, 400, 500]

  constructor() {}

  private calculateMedian(numbers: number[]): number {
    const sorted = numbers.slice().sort((a, b) => a - b);
    const middle = Math.floor(sorted.length / 2);
    return sorted.length % 2 === 0
      ? (sorted[middle - 1] + sorted[middle]) / 2
      : sorted[middle];
  }

  public connect(): void {
    // Call REST API to get the server URL
    fetch(
      'https://locate.mlab-sandbox.measurementlab.net/v2/nearest/msak/ping1'
    )
      .then((response) => response.json())
      .then((data) => {
        const randomResult =
          data.results[Math.floor(Math.random() * data.results.length)];
        const urls = randomResult.urls;
        const protocols = Object.keys(urls);
        const randomProtocol =
          protocols[Math.floor(Math.random() * protocols.length)];
        const url = urls[randomProtocol];
        this.websocketUrl = url;
        console.log('websocket url', this.websocketUrl);
        this.socket = new WebSocket(
          this.websocketUrl,
          'net.measurementlab.ping.v1'
        );
        this.socket.onmessage = (event) => {
          console.log('message recieved', event.data);
          // const message = JSON.parse(event.data);
          // console.log('message', message);
          // const RTTS = message.RTTs;
          // const medianRTT = this.calculateMedian(RTTS);
          // console.log('median RTT', medianRTT);
        };
      })
      .catch((error) => {
        console.error('Error fetching server URL:', error);
      });
  }

  public sendMessage(message: any): void {
    if (this.socket && this.socket.readyState === WebSocket.OPEN) {
      this.socket.send(JSON.stringify(message));
    } else {
      console.error('WebSocket is not open. Message not sent.');
    }
  }

  public onMessage(): Observable<any> {
    return this.messageSubject.asObservable();
  }

  public disconnect(): void {
    if (this.socket) {
      this.socket.close();
    }
  }
}
