import { Injectable } from '@angular/core';
import {
  HttpRequest,
  HttpHandler,
  HttpEvent,
  HttpInterceptor
} from '@angular/common/http';
import { environment } from '../../environments/environment';
import { Observable } from 'rxjs';

@Injectable()
export class TokenInterceptor implements HttpInterceptor {
    constructor() {}
    intercept(request: HttpRequest<any>, next: HttpHandler): Observable<HttpEvent<any>> {
        if (environment.token && this.isHeaderNeeded(request.url)){
            request = request.clone({
                setHeaders: {
                    Authorization: `Bearer ${environment.token}`
                }
            });
        }
        return next.handle(request);
    }
//   request.url.indexOf('some APIs path') === 0

    isHeaderNeeded(url: string) {
        console.log(url.indexOf(environment.restAPI));
        if (url.indexOf(environment.restAPI) === -1) { // this condition is up to you, it could be an exact match or how ever you like
            return false;
        } else {
            return true;
        }
    }
}
