import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { TimeoutError } from 'rxjs';
import { timeout } from 'rxjs/operators';
import { IndexedDBService } from './indexed-db.service';
import { StorageService } from './storage.service';
import { PosthogService } from './posthog.service';
import { HistoryService } from './history.service';
import { environment } from 'src/environments/environment';
import {
  AnalyticsEvent,
  parseMeasurementRejection,
} from '../analytics/analytics-events';

/**
 * How long each sync request waits for the backend. Without a limit, a request
 * that never gets an answer keeps its sync running for the rest of the session,
 * and every later sync joins it (syncPendingMeasurements), so the queue is
 * never sent again. A batch is up to five measurements the backend stores one
 * after the other, so it gets twice the realtime upload's limit: a request cut
 * off while the backend is still storing it gets stored anyway, and the next
 * sync sends it again.
 */
export const SYNC_TIMEOUT_MS = 60 * 1000;

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
    private posthog: PosthogService,
    private historyService: HistoryService
  ) { }

  /**
   * Sends the measurements whose realtime upload failed. It is called from
   * several places (the 2-hour interval, app start, a successful upload), so a
   * call made while a sync is already running joins that sync instead of
   * starting another: two syncs would read the same pending records and post
   * them twice. Each request has a time limit (SYNC_TIMEOUT_MS), so the sync
   * always ends and the next call starts a new one.
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
          this.posthog.capture(AnalyticsEvent.MeasurementsSynced, {
            batch_size: batch.length,
          });
        } catch (error) {
          // /measurements/multiple answers 400 only when the backend refused
          // every record of the batch (stored in measurements_failed). They
          // would be refused again on every cycle and block the queue behind
          // them, so they leave the queue and the sync goes on.
          const rejection = parseMeasurementRejection(error);
          if (rejection) {
            console.error(
              `Backend refused measurement batch ${index / batchSize + 1}; removing it from the queue:`,
              error
            );
            for (const record of batch) {
              await this.indexedDBService.markMeasurementSynced(record.id);
            }
            this.posthog.captureFailure(AnalyticsEvent.MeasurementRejected, error, {
              source: 'sync',
              reason: rejection.reason,
              count: batch.length,
            });
            index += batchSize;
            continue;
          }
          console.error(
            `Failed to sync measurement batch ${index / batchSize + 1} after retry:`,
            error
          );
          this.posthog.captureFailure(
            AnalyticsEvent.MeasurementsSyncFailed,
            error,
            {
              batch_size: batch.length,
              status: (error as any)?.status ?? null,
            }
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
    // Strip IndexedDB-local bookkeeping fields before posting
    const payload = batch.map(({ id, status, createdAt, ...rest }) => rest);

    try {
      await this.http
        .post(`${environment.restAPI}measurements/multiple`, payload)
        .pipe(timeout(SYNC_TIMEOUT_MS)) // also aborts the request
        .toPromise();
    } catch (error) {
      // A refusal is the backend's answer, not a glitch: posting again would
      // only store each record in measurements_failed a second time.
      if (parseMeasurementRejection(error)) {
        throw error;
      }
      // No answer in time: the backend may be storing the batch still, and it
      // keeps every copy it gets, so posting it again now would most likely
      // store it twice. It stays queued for the next sync.
      if (error instanceof TimeoutError) {
        console.warn(
          `Measurement sync got no answer within ${SYNC_TIMEOUT_MS} ms; not retrying until the next sync.`
        );
        throw error;
      }
      console.warn('Initial measurement sync failed. Retrying once...');
      try {
        await this.http
          .post(`${environment.restAPI}measurements/multiple`, payload)
          .pipe(timeout(SYNC_TIMEOUT_MS))
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
    const payload = updatedUsers.map(({ createdAt, ...rest }) => rest);

    // A timeout is retried like any other failure here: the backend skips a
    // ping it already has (app_local_uuid), so a second copy is harmless.
    try {
      await this.http
        .post(
          `${environment.restAPI}connectivity/${this.storage.get('gigaId')}`,
          { records: payload }
        )
        .pipe(timeout(SYNC_TIMEOUT_MS))
        .toPromise();
    } catch (error) {
      console.warn('Initial sync attempt failed. Retrying...');
      try {
        await this.http
          .post(
            `${environment.restAPI}connectivity/${this.storage.get('gigaId')}`,
            { records: payload }
          )
          .pipe(timeout(SYNC_TIMEOUT_MS))
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