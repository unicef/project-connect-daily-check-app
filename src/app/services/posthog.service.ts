import { Injectable } from '@angular/core';
import { NavigationEnd, Router } from '@angular/router';
import { filter } from 'rxjs/operators';
import posthog from 'posthog-js';
import { environment } from 'src/environments/environment';

/**
 * PostHog product analytics (ítem 2 del plan 0004, release v2.0.4).
 *
 * Mismas reglas que MatomoService: todo va envuelto en try/catch para que un
 * fallo aquí (config ausente, red caída, SDK roto) nunca tumbe el app, y sin
 * configuración el servicio simplemente no hace nada.
 *
 * Notas propias de este app:
 * - Es un Electron de escritorio que vive con conectividad intermitente — es
 *   literalmente lo que mide. El SDK se empaqueta (no se carga por CDN como
 *   Matomo) para que funcione offline y encole los eventos hasta que vuelva la
 *   red, y para no depender de cargar un script remoto bajo la CSP de Electron.
 * - En Electron `window.location` es `file://`, inútil para analítica: se usa
 *   el mismo host virtual que Matomo para que las URLs sean legibles.
 * - Nada de PII: se identifica por giga id de la escuela, que es lo mismo que
 *   ya viaja en cada medición. Nunca nombre de escuela, usuario de Windows,
 *   rutas de instalación ni IP.
 */
@Injectable({
  providedIn: 'root',
})
export class PosthogService {
  private initialized = false;

  // Tipo de grupo de PostHog para agregar por centro. La escuela va como
  // *group*, no como persona: cada instalación sigue siendo un "person"
  // propio, así que se pueden contar dispositivos por escuela en vez de
  // colapsarlos todos en uno.
  private readonly SCHOOL_GROUP = 'school';

  // Mismo host virtual que MatomoService, para que ambas herramientas reporten
  // las mismas URLs y se puedan cruzar.
  private readonly electronVirtualOrigin = 'https://app.gigameter.local';

  constructor(private router: Router) {}

  /**
   * Arranca PostHog. Es seguro llamarlo varias veces.
   * No hace nada si falta la project API key o el host.
   */
  init(): void {
    try {
      if (this.initialized) {
        return;
      }

      const apiKey = environment.posthog?.apiKey;
      const host = environment.posthog?.host;

      if (!apiKey || apiKey.startsWith('POSTHOG_PROJECT_API_KEY') || !host) {
        console.warn('[PostHog] Skipping init: missing API key or host.');
        return;
      }

      posthog.init(apiKey, {
        api_host: host,
        // Las vistas se mandan a mano en trackRouteChanges(): con rutas hash
        // de Angular el autocapture de pageviews no las ve.
        capture_pageview: false,
        capture_pageleave: true,
        autocapture: false, // solo eventos explícitos: menos ruido y menos PII
        disable_session_recording: !environment.posthog?.enableSessionRecording,
        // localStorage guarda la cola offline; la cookie mantiene estable el
        // anon id del dispositivo si se limpia el storage del renderer.
        persistence: 'localStorage+cookie',
        // La instalación puede pasar horas sin red; que el SDK reintente en vez
        // de descartar.
        request_batching: true,
        loaded: (ph) => {
          try {
            ph.register({
              app_version: environment.app_version,
              app_mode: environment.mode,
              is_electron: !!environment.isElectron,
            });
          } catch (error) {
            console.warn('[PostHog] register on load failed:', error);
          }
        },
      });

      this.identifyFromStorage();
      this.applySchoolFromStorage();
      this.trackPageView();
      this.trackRouteChanges();
      this.bridgeMainProcessEvents();

      this.initialized = true;
    } catch (error) {
      console.warn('[PostHog] init failed:', error);
    }
  }

  /**
   * Registra un evento. Seguro aunque PostHog no esté inicializado.
   */
  capture(event: string, properties?: Record<string, any>): void {
    try {
      if (!this.initialized) {
        return;
      }
      posthog.capture(event, properties);
    } catch (error) {
      console.warn('[PostHog] capture failed:', error);
    }
  }

  /**
   * Asocia los eventos a una escuela. Se llama al arrancar (si ya hay registro)
   * y justo después de completar el registro.
   *
   * El identificador es el giga id: identifica al centro, no a la persona.
   */
  identify(gigaId: string, properties?: Record<string, any>): void {
    try {
      if (!this.initialized || !gigaId) {
        return;
      }
      posthog.identify(gigaId, properties);
    } catch (error) {
      console.warn('[PostHog] identify failed:', error);
    }
  }

  /**
   * Vista de página manual. Con rutas hash hay que mandarlas a mano.
   */
  trackPageView(url?: string): void {
    try {
      if (!this.initialized) {
        return;
      }
      const path = url ?? window.location.hash?.replace(/^#/, '') ?? '/';
      posthog.capture('$pageview', {
        $current_url: this.getTrackingOrigin() + (path || '/'),
      });
    } catch (error) {
      console.warn('[PostHog] trackPageView failed:', error);
    }
  }

  /** Corta la sesión al cerrar sesión en el app, para no mezclar escuelas. */
  reset(): void {
    try {
      if (!this.initialized) {
        return;
      }
      posthog.reset();
    } catch (error) {
      console.warn('[PostHog] reset failed:', error);
    }
  }

  /**
   * Reenvía a PostHog los eventos que emite el main process de Electron.
   *
   * El main no habla con PostHog directamente: `posthog-node` no persiste su
   * cola entre sesiones y este equipo pasa horas sin red, así que sus eventos
   * serían los menos fiables justo donde más cuesta recuperarlos. El SDK del
   * renderer sí encola en localStorage y sobrevive a reinicios.
   *
   * Hoy solo llega el ciclo de vida del auto-update, que es lo único que ni el
   * renderer ni el backend ven: un equipo que falla al actualizar deja de
   * mandar mediciones y desaparece de las queries de adopción de versiones.
   */
  private bridgeMainProcessEvents(): void {
    try {
      const electronAPI = (window as any).electronAPI;
      if (!electronAPI?.onTelemetryEvent) {
        return; // navegador, o build sin el preload nuevo
      }
      electronAPI.onTelemetryEvent(
        (payload: { event: string; properties?: Record<string, any> }) => {
          if (!payload?.event) {
            return;
          }
          this.capture(payload.event, {
            ...(payload.properties ?? {}),
            source: 'electron-main',
          });
        }
      );
    } catch (error) {
      console.warn('[PostHog] bridgeMainProcessEvents failed:', error);
    }
  }

  /**
   * Asocia el dispositivo al grupo de su escuela. Se llama al arrancar (si ya
   * hay registro) y justo después de completar el registro.
   */
  setSchool(gigaId: string | number | null | undefined): void {
    try {
      if (!this.initialized || gigaId == null || gigaId === '') {
        return;
      }
      const key = String(gigaId);
      posthog.group(this.SCHOOL_GROUP, key, { giga_id_school: key });
    } catch (error) {
      console.warn('[PostHog] setSchool failed:', error);
    }
  }

  private applySchoolFromStorage(): void {
    try {
      const gigaId = localStorage.getItem('gigaId');
      if (gigaId) {
        this.setSchool(gigaId);
      }
    } catch (error) {
      console.warn('[PostHog] applySchoolFromStorage failed:', error);
    }
  }

  private identifyFromStorage(): void {
    try {
      const gigaId = localStorage.getItem('gigaId');
      if (gigaId) {
        this.identify(gigaId);
      }
    } catch (error) {
      console.warn('[PostHog] identifyFromStorage failed:', error);
    }
  }

  private trackRouteChanges(): void {
    try {
      this.router.events
        .pipe(filter((event) => event instanceof NavigationEnd))
        .subscribe((event: NavigationEnd) => {
          this.trackPageView(event.urlAfterRedirects || event.url);
        });
    } catch (error) {
      console.warn('[PostHog] trackRouteChanges setup failed:', error);
    }
  }

  /**
   * Origen limpio para reportar. En Electron el real es `file://`, que no sirve
   * para analítica, así que se sustituye por un host virtual fijo.
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
