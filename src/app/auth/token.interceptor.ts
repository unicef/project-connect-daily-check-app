import { Injectable } from '@angular/core';
import {
  HttpRequest,
  HttpHandler,
  HttpEvent,
  HttpInterceptor,
  HttpErrorResponse,
  HttpClient
} from '@angular/common/http';
import { environment } from '../../environments/environment';
import { Observable, from, throwError, of } from 'rxjs';
import { switchMap, catchError } from 'rxjs/operators';

declare global {
  interface Window {
    deviceAPI: {
      getHashId: () => Promise<string>;
      saveToken: (token: string) => Promise<void>;
      getToken: () => Promise<string | null>;
    };
    hmac: {
      sign: (args: {
        secretkey: string;
        token: string;
        nonce: string;
      }) => Promise<{ signature: string }>;
    };
  }
}

@Injectable()
export class TokenInterceptor implements HttpInterceptor {
  constructor(private http: HttpClient) {}

  intercept(
    request: HttpRequest<any>,
    next: HttpHandler
  ): Observable<HttpEvent<any>> {

    if (!this.isHeaderNeeded(request.url)) {
      return next.handle(request);
    }

    return from(window.deviceAPI.getToken()).pipe(
      switchMap((token) => {
        if (!token) {
          return next.handle(request);
        }

        const nonceBytes = crypto.getRandomValues(new Uint8Array(32));
        const nonce = btoa(String.fromCharCode(...nonceBytes));

        return from(
          window.hmac.sign({
            secretkey: environment.HMAC_SECRET,
            token,
            nonce
          })
        ).pipe(
          switchMap(({ signature }) => {
            const authReq = request.clone({
              setHeaders: {
                Authorization: `Device ${token}`,
                'x-device-nonce': nonce,
                'X-HMAC-Signature': signature
              }
            });

            return next.handle(authReq).pipe(
              catchError((error: HttpErrorResponse) => {
                if (
                  error.status === 401 &&
                  error.error?.message ===
                    'Invalid device token or not authorized to access'
                ) {
                  return this.fetchNewToken().pipe(
                    switchMap((newToken) => {
                      const newNonceBytes = crypto.getRandomValues(new Uint8Array(32));
                      const newNonce = btoa(
                        String.fromCharCode(...newNonceBytes)
                      );

                      return from(
                        window.hmac.sign({
                          secretkey: environment.HMAC_SECRET,
                          token: newToken,
                          nonce: newNonce
                        })
                      ).pipe(
                        switchMap(({ signature: newSignature }) => {
                          const retryReq = request.clone({
                            setHeaders: {
                              Authorization: `Device ${newToken}`,
                              'x-device-nonce': newNonce,
                              'X-HMAC-Signature': newSignature
                            }
                          });

                          return next.handle(retryReq);
                        })
                      );
                    })
                  );
                }

                return throwError(() => error);
              })
            );
          })
        );
      })
    );
  }

  private isHeaderNeeded(url: string): boolean {
    return url.includes(environment.restAPI);
  }

  private fetchNewToken(): Observable<string> {
    return from(window.deviceAPI.getHashId()).pipe(
      switchMap((hash_id) =>
        this.http
          .post<{ token: string }>(
            `${environment.restAPI}auth/initialize`,
            { hash_id }
          )
          .pipe(
            switchMap((response) =>
              from(window.deviceAPI.saveToken(response.token)).pipe(
                switchMap(() => of(response.token))
              )
            )
          )
      )
    );
  }
}
