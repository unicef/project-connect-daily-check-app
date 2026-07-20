import { Injectable } from '@angular/core';
import { NavigationEnd, Router } from '@angular/router';
import { filter } from 'rxjs/operators';
import { environment } from 'src/environments/environment';
import { IdentityService } from './identity.service';

declare global {
  interface Window {
    _paq?: any[];
  }
}

/**
 * Lightweight Matomo integration.
 *
 * All operations are wrapped in try/catch so any failure here
 * (script load failure, misconfiguration, etc.) will never break the app.
 */
@Injectable({
  providedIn: 'root',
})
export class MatomoService {
  private initialized = false;

  // Virtual host used in Electron so Matomo receives clean URLs
  // (e.g. https://app.gigameter.local/home) instead of file:// paths.
  private readonly electronVirtualOrigin = 'https://app.gigameter.local';

  constructor(private router: Router, private identityService: IdentityService) {}

  /**
   * Initialize Matomo tracking. Safe to call multiple times.
   * Silently no-ops if configuration is missing or if running in Electron.
   */
  init(): void {
    try {
      if (this.initialized) {
        return;
      }

      const trackerUrl = environment.matomo?.trackerUrl;
      const siteId = environment.matomo?.siteId;

      if (!trackerUrl || !siteId) {
        console.warn('[Matomo] Skipping init: missing tracker URL or site ID.');
        return;
      }

      const normalizedUrl = trackerUrl.endsWith('/')
        ? trackerUrl
        : `${trackerUrl}/`;

      window._paq = window._paq || [];

      // Ensure the initial page view reports a clean URL (important in
      // Electron where document.URL is file://...).
      window._paq.push([
        'setCustomUrl',
        this.getTrackingOrigin() + (window.location.pathname || '/'),
      ]);
      window._paq.push(['setDocumentTitle', document.title]);
      // Custom dimension 1 = facility_type (register it in Matomo admin)
      window._paq.push([
        'setCustomDimension',
        1,
        this.identityService.getFacilityType(),
      ]);

      window._paq.push(['trackPageView']);
      window._paq.push(['enableLinkTracking']);
      window._paq.push(['setTrackerUrl', `${normalizedUrl}matomo.php`]);
      window._paq.push(['setSiteId', siteId]);

      this.loadScript(`${normalizedUrl}matomo.js`);
      this.trackRouteChanges();

      this.initialized = true;
    } catch (error) {
      console.warn('[Matomo] init failed:', error);
    }
  }

  /**
   * Track a custom event. Safe to call even if Matomo is not initialized.
   */
  trackEvent(
    category: string,
    action: string,
    name?: string,
    value?: number
  ): void {
    try {
      if (!window._paq) {
        return;
      }
      window._paq.push([
        'setCustomDimension',
        1,
        this.identityService.getFacilityType(),
      ]);
      const payload: any[] = ['trackEvent', category, action];
      if (name !== undefined) {
        payload.push(name);
      }
      if (value !== undefined) {
        payload.push(value);
      }
      window._paq.push(payload);
    } catch (error) {
      console.warn('[Matomo] trackEvent failed:', error);
    }
  }

  /**
   * Manually track a virtual page view.
   */
  trackPageView(url?: string, title?: string): void {
    try {
      if (!window._paq) {
        return;
      }
      if (url) {
        window._paq.push(['setCustomUrl', url]);
      }
      if (title) {
        window._paq.push(['setDocumentTitle', title]);
      }
      window._paq.push(['trackPageView']);
    } catch (error) {
      console.warn('[Matomo] trackPageView failed:', error);
    }
  }

  private loadScript(src: string): void {
    try {
      const existing = document.querySelector(`script[src="${src}"]`);
      if (existing) {
        return;
      }

      const script = document.createElement('script');
      script.async = true;
      script.src = src;
      script.onerror = () => {
        console.warn('[Matomo] failed to load tracker script:', src);
      };

      const firstScript = document.getElementsByTagName('script')[0];
      if (firstScript && firstScript.parentNode) {
        firstScript.parentNode.insertBefore(script, firstScript);
      } else {
        document.head.appendChild(script);
      }
    } catch (error) {
      console.warn('[Matomo] loadScript failed:', error);
    }
  }

  private trackRouteChanges(): void {
    try {
      this.router.events
        .pipe(filter((event) => event instanceof NavigationEnd))
        .subscribe((event: NavigationEnd) => {
          try {
            if (!window._paq) {
              return;
            }
            const url = event.urlAfterRedirects || event.url;
            window._paq.push(['setCustomUrl', this.getTrackingOrigin() + url]);
            window._paq.push(['setDocumentTitle', document.title]);
            window._paq.push(['trackPageView']);
          } catch (error) {
            console.warn('[Matomo] route tracking failed:', error);
          }
        });
    } catch (error) {
      console.warn('[Matomo] trackRouteChanges setup failed:', error);
    }
  }

  /**
   * Returns a clean origin for tracking. In Electron the real origin is
   * file://, which is useless for analytics, so we substitute a fixed
   * virtual host.
   */
  private getTrackingOrigin(): string {
    try {
      if (environment.isElectron) {
        return this.electronVirtualOrigin;
      }
      return window.location.origin;
    } catch {
      return this.electronVirtualOrigin;
    }
  }
}
