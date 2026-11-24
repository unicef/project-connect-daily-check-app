import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { IndexedDBService } from './indexed-db.service';
import { StorageService } from './storage.service';
import { IdentityService } from './identity.service';
import { PosthogService } from './posthog.service';
import { HistoryService } from './history.service';
import { environment } from 'src/environments/environment';

@Injectable({
  providedIn: 'root',
})
export class SyncService {
  private syncInterval = 2 * 60 * 60 * 1000; // 2 hours
  // Long enough to stay out of the way of what the app does when it opens.
  private startupSyncDelay = 60 * 1000;
  private pendingMeasurementsSync: Promise<void> | null = null;

  constructor(
    private http: HttpClient,
    private indexedDBService: IndexedDBService,
    private storage: StorageService,
    private identityService: IdentityService,
    private posthog: PosthogService,
    private historyService: HistoryService
  ) { }

  /**
   * Sends the measurements whose realtime upload failed. It is called from
   * several places (the 2-hour interval, app start, a successful upload), so a
   * call made while a sync is already running joins that sync instead of
   * starting another: two syncs would read the same pending records and post
   * them twice.
   */
  syncPendingMeasurements(): Promise<void> {
    if (!this.pendingMeasurementsSync) {
      this.pendingMeasurementsSync = this.sendPendingMeasurements().finally(
        () => (this.pendingMeasurementsSync = null)
      );
    }
    return this.pendingMeasurementsSync;
  }

  private async sendPendingMeasurements(): Promise<void> {
    try {
      let unsyncedMeasurements = await this.indexedDBService.getPendingMeasurements();

      if (unsyncedMeasurements.length === 0) {
        console.log('No pending measurements to sync.');
        return;
      }

      const batchSize = 5;
      let index = 0;

      while (index < unsyncedMeasurements.length) {
        const batch = unsyncedMeasurements.slice(index, index + batchSize);

        try {
          await this.postMeasurementsWithRetry(batch);

          // mark synced
          for (const record of batch) {
            await this.indexedDBService.markMeasurementSynced(record.id);
          }
          // The history row was left "Not Synced" when the realtime upload
          // failed; it is delivered now.
          this.historyService.markSynced(batch.map((record) => record.UUID));

          console.log(`Successfully synced measurements batch ${index / batchSize + 1}`);
          // Measurements that failed in realtime and are recovered now: the
          // other end of measurement_queued_offline.
          this.posthog.capture('measurements_synced', {
            batch_size: batch.length,
          });
        } catch (error) {
          console.error(
            `Failed to sync measurement batch ${index / batchSize + 1} after retry:`,
            error
          );
          this.posthog.capture('measurements_sync_failed', {
            batch_size: batch.length,
            status: (error as any)?.status ?? null,
          });
          break; // Stop further sync until next cycle
        }

        index += batchSize;
      }

      // Cleanup old measurement records
      await this.indexedDBService.cleanupOldMeasurements?.();
    } catch (err) {
      console.error('Error during measurement sync:', err);
    }
  }

  private async postMeasurementsWithRetry(batch: any[]): Promise<void> {
    // v2 batch — records already carry facility_type/registration_id from
    // capture time; tolerant per-record handling happens server-side.
    // Strip IndexedDB-local bookkeeping fields before posting.
    const payload = batch.map(
      ({ id, status, createdAt, isSynced, ...rest }) => rest
    );

    try {
      await this.http
        .post(`${environment.restAPIv2}measurements/batch`, payload)
        .toPromise();
    } catch (error) {
      console.warn('Initial measurement sync failed. Retrying once...');
      try {
        await this.http
          .post(`${environment.restAPIv2}measurements/batch`, payload)
          .toPromise();
      } catch (retryError) {
        console.error('Retry for measurements failed:', retryError);
        throw retryError; // Stop processing after retry
      }
    }
  }


  async syncPingResults(): Promise<void> {
    let unsyncedRecords = await this.indexedDBService.getUnsyncedRecords();

    if (unsyncedRecords.length === 0) {
      console.log('No unsynced records to sync.');
      return;
    }

    const batchSize = 5; // Number of records per batch
    let index = 0;

    while (index < unsyncedRecords.length) {
      const batch = unsyncedRecords.slice(index, index + batchSize);

      try {
        await this.postWithRetry(batch);
        await this.indexedDBService.markAsSynced(batch);
        console.log(`Successfully synced batch ${index / batchSize + 1}`);
      } catch (error) {
        console.error(
          `Failed to sync batch ${index / batchSize + 1} after retry:`,
          error
        );
        throw error; // Stop processing further if one batch fails after retry
      }

      index += batchSize;
    }

    // Cleanup old records
    await this.indexedDBService.cleanupOldRecords();
  }

  private async postWithRetry(batch: any[]): Promise<void> {
    const updatedUsers = batch.map(({ isSynced, ...rest }) => rest);
    // v2 connectivity: identifier in the body, no client browserId.
    const payload = updatedUsers.map(
      ({ createdAt, browserId, id, ...rest }) => rest
    );
    const facilityType = this.identityService.getFacilityType();
    const gigaId = this.identityService.getGigaId();
    const body: any = {
      facility_type: facilityType,
      registration_id: this.identityService.getRegistrationId() || undefined,
      installation_id: this.identityService.getInstallationId(),
      records: payload,
    };
    if (facilityType === 'health') {
      body.giga_id_health = gigaId;
    } else {
      body.giga_id_school = gigaId;
    }

    try {
      await this.http
        .post(`${environment.restAPIv2}connectivity`, body)
        .toPromise();
    } catch (error) {
      console.warn('Initial sync attempt failed. Retrying...');
      try {
        await this.http
          .post(`${environment.restAPIv2}connectivity`, body)
          .toPromise();
      } catch (retryError) {
        console.error('Retry failed:', retryError);
        throw retryError; // Throw error after one retry
      }
    }
  }

  startPeriodicSync(): void {
    // The interval alone only fires once the app has been open for 2 hours, so
    // a PC that is on for less than that would never send its failed tests.
    // Pings are sent after every test instead (MeasurementClientService).
    setTimeout(() => {
      // Offline at startup: the next successful upload or interval sends them.
      if (navigator.onLine === false) {
        return;
      }
      this.syncPendingMeasurements();
    }, this.startupSyncDelay);

    setInterval(() => {
      this.syncPingResults();
      this.syncPendingMeasurements();
    }, this.syncInterval);
  }
}