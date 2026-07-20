import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { IndexedDBService } from './indexed-db.service';
import { StorageService } from './storage.service';
import { IdentityService } from './identity.service';
import { environment } from 'src/environments/environment';

@Injectable({
  providedIn: 'root',
})
export class SyncService {
  private syncInterval = 2 * 60 * 60 * 1000; // 2 hours

  constructor(
    private http: HttpClient,
    private indexedDBService: IndexedDBService,
    private storage: StorageService,
    private identityService: IdentityService
  ) { }

  async syncPendingMeasurements(): Promise<void> {
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

          console.log(`Successfully synced measurements batch ${index / batchSize + 1}`);
        } catch (error) {
          console.error(
            `Failed to sync measurement batch ${index / batchSize + 1} after retry:`,
            error
          );
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
    const payload = batch.map(({ isSynced, id, ...rest }) => rest);

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
    setInterval(() => {
      this.syncPingResults();
      this.syncPendingMeasurements();
    }, this.syncInterval);
  }
}