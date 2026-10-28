import { APP_BOOTSTRAP_LISTENER, NgModule } from '@angular/core';
import { BrowserModule } from '@angular/platform-browser';
import { RouteReuseStrategy } from '@angular/router';
import {
  HTTP_INTERCEPTORS,
  HttpClientModule,
  provideHttpClient,
  withInterceptorsFromDi,
} from '@angular/common/http';
import { IonicModule, IonicRouteStrategy } from '@ionic/angular';
import { ErrorHandler } from '@angular/core';

import { AppComponent } from './app.component';
import { AppRoutingModule } from './app-routing.module';
import { SharedModule } from './shared/shared.module';
import { SentryService } from './services/sentry.service';
import { SentryErrorHandler } from './core/sentry-error-handler';
import { WhatsNewModalComponent } from './components/whats-new-modal/whats-new-modal.component';
import { LogoutModalComponent } from './components/logout-modal/logout-modal.component';
import { AndroidTelemetryService } from './android/android-telemetry.service';

/* Import token interceptor */
import { TokenInterceptor } from './auth/token.interceptor';
import { environment } from 'src/environments/environment';
import { FormsModule } from '@angular/forms';

export function tokenGetter() {
  return environment.token;
}

// After the root component is built: AppComponent starts PostHog in its
// constructor, and the Android listener needs it running.
export function startAndroidTelemetry(telemetry: AndroidTelemetryService) {
  return () => telemetry.start();
}

@NgModule({
  declarations: [AppComponent, WhatsNewModalComponent, LogoutModalComponent],
  imports: [
    FormsModule,
    BrowserModule,
    IonicModule.forRoot(),
    SharedModule,
    AppRoutingModule,
    HttpClientModule,
  ],
  providers: [
    {
      provide: HTTP_INTERCEPTORS,
      useClass: TokenInterceptor,
      multi: true,
    },
    { provide: RouteReuseStrategy, useClass: IonicRouteStrategy },
    provideHttpClient(withInterceptorsFromDi()),
    SentryService,
    { provide: ErrorHandler, useClass: SentryErrorHandler },
    {
      provide: APP_BOOTSTRAP_LISTENER,
      useFactory: startAndroidTelemetry,
      deps: [AndroidTelemetryService],
      multi: true,
    },
  ],
  bootstrap: [AppComponent],
})
export class AppModule {}
