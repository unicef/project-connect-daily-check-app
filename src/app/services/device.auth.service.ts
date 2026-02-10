import { Injectable, OnDestroy } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom, Subscription, timer } from 'rxjs';
import { environment } from 'src/environments/_environment.prod';

declare global {
  interface Window {
    deviceAPI: {
      getHashId: () => Promise<string>;   // ✅ comes from preload
      saveToken: (token: string) => Promise<void>;
      getToken: () => Promise<string | null>;
    };
  }
}

interface AuthResponse {
  token: string;
  expiresAt: number;
  expiresIn: number;
  issuedAt: number;
  hash_id: string;
  success: boolean;
  message: string;
}

@Injectable({
  providedIn: 'root'
})
export class DeviceAuthService implements OnDestroy {
  private apiUrl = `${environment.restAPI}auth/initialize`;
  private refreshSub?: Subscription;

  constructor(private http: HttpClient) {}

  async authenticateDevice(): Promise<string> {
    try {
      const existingToken = await window.deviceAPI.getToken();
      if (existingToken) {
        return existingToken;
      }

      // ✅ hash_id already calculated in preload.ts
      const hash_id = await window.deviceAPI.getHashId();
      console.log(hash_id, 'hash_id devide')
      const response = await firstValueFrom(
        this.http.post<AuthResponse>(this.apiUrl, { hash_id })
      );

      await window.deviceAPI.saveToken(response.token);
      this.scheduleTokenRefresh(response);

      return response.token;
    } catch (error) {
      throw error;
    }
  }

  private scheduleTokenRefresh(response: AuthResponse): void {
    this.refreshSub?.unsubscribe();

    const refreshBeforeMs = 30 * 1000; // refresh 30s before expiry (configurable)
    const now = Date.now();
    const expiresAt = response.expiresAt || now + response.expiresIn;
    const delay = Math.max(expiresAt - now - refreshBeforeMs, 10000); // ensure min delay 10s
    console.log(`Scheduling token refresh in ${delay / 1000}s`);

    this.refreshSub = timer(delay).subscribe(async () => {
      console.log('Token refresh triggered before expiry');
      await this.refreshToken(response.hash_id);
    });
  }

  private async refreshToken(hash_id: string): Promise<void> {
    const response = await firstValueFrom(
      this.http.post<AuthResponse>(this.apiUrl, { hash_id })
    );

    await window.deviceAPI.saveToken(response.token);
    this.scheduleTokenRefresh(response);
  }

  ngOnDestroy(): void {
    this.refreshSub?.unsubscribe();
  }
}
