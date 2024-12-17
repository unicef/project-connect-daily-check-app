import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { LocalStorageService } from './local-storage.service';

@Injectable({
  providedIn: 'root',
})
export class SyncService {
  private syncFrequency = 2 * 60 * 60 * 1000; // 2 hours in milliseconds

  constructor(
    private localStorageService: LocalStorageService,
    private http: HttpClient
  ) {}

  /**
   * Synchronizes unsynced records with the database.
   */
  async syncData() {
    const records = this.localStorageService
      .getPingResults()
      .filter((record) => !record.synced);

    if (records.length > 0) {
      try {
        await this.http
          .post('/api/connectivity_ping_checks', records)
          .toPromise();
        records.forEach((record) => (record.synced = true));
        this.localStorageService.clearSyncedRecords();
      } catch (error) {
        console.error('Sync failed:', error);
      }
    }
  }

  /**
   * Starts periodic synchronization.
   */
  startPeriodicSync() {
    setInterval(() => this.syncData(), this.syncFrequency);
  }
}
