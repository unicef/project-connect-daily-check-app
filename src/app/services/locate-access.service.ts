import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { timeout } from 'rxjs/operators';
import { environment } from '../../environments/environment';
import { LocateAccess } from '../utils/locate.utils';
import { StorageService } from './storage.service';

/** Our backend's answer is waited for this long before a test goes without it. */
export const LOCATE_ACCESS_TIMEOUT_MS = 5 * 1000;

/**
 * Asks our backend, right before each test's server lookup, whether to use
 * M-Lab's priority lookup. It is how the app switches to the priority lookup
 * without a new release: once M-Lab gives Giga Meter an integration API key,
 * the backend exchanges it for a token on each request, and every installed
 * app picks it up on its next test.
 *
 *   GET {restAPI}mlab/locate-token?giga_id_school=<id>
 *   200 { "data": { "token": "<jwt>", "locate_url": "<https URL>" } }
 *
 * Both fields are optional, and the fields may also come without the `data`
 * wrapper. M-Lab's tokens expire 20 seconds after they are issued, so the
 * answer is used at once and never kept. The backend can stop the app from
 * using the priority lookup by answering with neither field, or with any
 * error; until the endpoint exists the app gets a 404 and uses the public
 * lookup, as it always has. The `giga_id_school` lets the backend turn it on
 * for some schools first.
 */
@Injectable({
  providedIn: 'root',
})
export class LocateAccessService {
  constructor(private http: HttpClient, private storage: StorageService) {}

  /** The access to use, or null for the public lookup. Never rejects. */
  async get(): Promise<LocateAccess | null> {
    const gigaId = this.storage.get('gigaId');
    try {
      const body = await firstValueFrom(
        this.http
          .get<any>(environment.restAPI + 'mlab/locate-token', {
            params: gigaId ? { giga_id_school: gigaId } : {},
          })
          .pipe(timeout(LOCATE_ACCESS_TIMEOUT_MS))
      );
      const access = parseLocateAccess(body?.data ?? body);
      if (!access) {
        console.log('No priority server lookup offered; using the public one');
      }
      return access;
    } catch (error) {
      const reason =
        error instanceof HttpErrorResponse
          ? `HTTP ${error.status}`
          : (error as Error)?.name || 'error';
      console.log(`No priority server lookup (${reason}); using the public one`);
      return null;
    }
  }
}

/**
 * Keeps only what can be used: a non-empty token, and an https locate URL.
 * Null when neither is there.
 */
export function parseLocateAccess(value: unknown): LocateAccess | null {
  if (!value || typeof value !== 'object') {
    return null;
  }
  const { token, locate_url } = value as Record<string, unknown>;
  const access: LocateAccess = {
    token: typeof token === 'string' && token.trim() ? token.trim() : null,
    locateUrl: isHttpsUrl(locate_url) ? locate_url : null,
  };
  return access.token || access.locateUrl ? access : null;
}

function isHttpsUrl(value: unknown): value is string {
  if (typeof value !== 'string') {
    return false;
  }
  try {
    return new URL(value).protocol === 'https:';
  } catch {
    return false;
  }
}
