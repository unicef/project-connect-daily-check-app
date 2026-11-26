import { Injectable } from '@angular/core';

/**
 * How long logout waits for deleteAllDatabases(). A delete waits until every
 * connection to the database is closed; past this, logout goes on without it.
 */
export const DELETE_DATABASES_TIMEOUT_MS = 5000;

@Injectable({
  providedIn: 'root',
})
export class IndexedDBService {
  private dbName = 'connectivity_ping_db';
  private storeName = 'pingResults';
  private measurementDbName = 'connectivity_measurements_db';
  private measurementStoreName = 'measurements';
  // Set when logout starts deleting the databases; the page reloads right
  // after. Opening one now would create it again, and a result saved in it
  // would be uploaded under the next registration.
  private deletedForLogout = false;

  constructor() { }

  private openDatabase(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, 1);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(this.storeName)) {
          db.createObjectStore(this.storeName, { keyPath: 'timestamp' });
        }
      };
      request.onsuccess = () => {
        const db = request.result;
        // A delete waits for every open connection: this one gives way.
        db.onversionchange = () => db.close();
        resolve(db);
      };
      request.onerror = (e) => reject(e);
    });
  }

  /**
   * Opens a connection for one transaction and closes it at once. close()
   * lets the transaction run to its end, however it ends (complete, error or
   * abort), and then the connection is gone: one left open would keep
   * deleteAllDatabases() waiting.
   */
  private async startTransaction(
    open: () => Promise<IDBDatabase>,
    storeName: string,
    mode: IDBTransactionMode,
    forLogout = false
  ): Promise<IDBTransaction> {
    if (this.deletedForLogout && !forLogout) {
      throw new Error('IndexedDB: the databases were deleted for logout');
    }
    const db = await open();
    try {
      return db.transaction(storeName, mode);
    } finally {
      db.close();
    }
  }

  async savePingResult(result: any): Promise<void> {
    const transaction = await this.startTransaction(
      () => this.openDatabase(),
      this.storeName,
      'readwrite'
    );
    const store = transaction.objectStore(this.storeName);
    store.put({ ...result, createdAt: Date.now(), isSynced: false });
    return new Promise((resolve, reject) => {
      transaction.oncomplete = () => resolve();
      transaction.onerror = (e) => reject(e);
      transaction.onabort = () => reject(transaction.error);
    });
  }

  async getPingResults(): Promise<any[]> {
    const transaction = await this.startTransaction(
      () => this.openDatabase(),
      this.storeName,
      'readonly'
    );
    const store = transaction.objectStore(this.storeName);
    return new Promise((resolve, reject) => {
      const request = store.getAll();
      request.onsuccess = () => resolve(request.result);
      request.onerror = (e) => reject(e);
    });
  }

  async markAsSynced(syncedRecords: any[]): Promise<void> {
    const transaction = await this.startTransaction(
      () => this.openDatabase(),
      this.storeName,
      'readwrite'
    );
    const store = transaction.objectStore(this.storeName);
    syncedRecords.forEach((synced) => {
      store.put({ ...synced, isSynced: true });
    });
    return new Promise((resolve, reject) => {
      transaction.oncomplete = () => resolve();
      transaction.onerror = (e) => reject(e);
      transaction.onabort = () => reject(transaction.error);
    });
  }


  async cleanupOldRecords(): Promise<void> {
    const transaction = await this.startTransaction(
      () => this.openDatabase(),
      this.storeName,
      'readwrite'
    );
    const store = transaction.objectStore(this.storeName);
    const now = Date.now();
    const retentionPeriod = 30 * 24 * 60 * 60 * 1000; // 30 days in milliseconds
    const syncedRetentionPeriod = 3 * 24 * 60 * 60 * 1000; // Keep synced records for 7 days

    return new Promise((resolve, reject) => {
      const request = store.getAll(); // Get all records from IndexedDB

      request.onsuccess = () => {
        const records = request.result;

        // Delete records that are:
        // 1. Synced AND older than 7 days, OR
        // 2. Older than 30 days (regardless of sync status)
        records.forEach((record) => {
          const recordAge = now - record.createdAt;
          if (
            (record.isSynced && recordAge >= syncedRetentionPeriod) ||
            recordAge >= retentionPeriod
          ) {
            store.delete(record.timestamp); // Delete based on primary key
          }
        });

        // Let the transaction handle completion
        // No need for nested promises - transaction.oncomplete will fire after all deletes
      };

      request.onerror = () => reject(request.error);

      // Wait for the entire transaction to complete
      transaction.oncomplete = () => resolve();
      transaction.onerror = (e) => reject(e);
      transaction.onabort = () => reject(transaction.error);
    });
  }

  async getUnsyncedRecords(): Promise<any[]> {
    const records = await this.getPingResults();
    return records.filter((record) => !record.isSynced);
  }

  private openMeasurementDatabase(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.measurementDbName, 1);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(this.measurementStoreName)) {
          const store = db.createObjectStore(this.measurementStoreName, {
            keyPath: 'id',
            autoIncrement: true,
          });
          store.createIndex('status', 'status', { unique: false });
        }
      };
      request.onsuccess = () => {
        const db = request.result;
        // A delete waits for every open connection: this one gives way.
        db.onversionchange = () => db.close();
        resolve(db);
      };
      request.onerror = (e) => reject(e);
    });
  }

  async saveMeasurement(record: any): Promise<void> {
    const tx = await this.startTransaction(
      () => this.openMeasurementDatabase(),
      this.measurementStoreName,
      'readwrite'
    );
    const store = tx.objectStore(this.measurementStoreName);
    store.add({ ...record, status: 'pending', createdAt: Date.now() });

    return new Promise((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  }

  async getPendingMeasurements(): Promise<any[]> {
    const tx = await this.startTransaction(
      () => this.openMeasurementDatabase(),
      this.measurementStoreName,
      'readonly'
    );
    const store = tx.objectStore(this.measurementStoreName);
    const index = store.index('status');
    const request = index.getAll('pending');

    return new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async markMeasurementSynced(id: number): Promise<void> {
    const tx = await this.startTransaction(
      () => this.openMeasurementDatabase(),
      this.measurementStoreName,
      'readwrite'
    );
    const store = tx.objectStore(this.measurementStoreName);
    const getRequest = store.get(id);

    return new Promise((resolve, reject) => {
      getRequest.onsuccess = () => {
        const record = getRequest.result;
        if (record) {
          record.status = 'synced';
          store.put(record);
        }
      };
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  }

  async cleanupOldMeasurements(): Promise<void> {
    const tx = await this.startTransaction(
      () => this.openMeasurementDatabase(),
      'measurements',
      'readwrite'
    );
    const store = tx.objectStore('measurements');

    const now = Date.now();
    const retentionPeriod = 30 * 24 * 60 * 60 * 1000; // 30 days
    const syncedRetentionPeriod = 3 * 24 * 60 * 60 * 1000; // 3 days

    return new Promise((resolve, reject) => {
      const request = store.getAll(); // Fetch all records

      request.onsuccess = () => {
        const records = request.result;

        records.forEach((record) => {
          const age = now - record.createdAt;

          // Delete if:
          // 1. Synced and older than 3 days, OR
          // 2. Older than 30 days
          if (
            (record.status === 'synced' && age >= syncedRetentionPeriod) ||
            age >= retentionPeriod
          ) {
            store.delete(record.id); // delete by primary key
          }
        });
        // Wait for transaction completion
      };

      request.onerror = () => reject(request.error);

      tx.oncomplete = () => resolve();
      tx.onerror = (e) => reject(e);
      tx.onabort = () => reject(tx.error);
    });
  }

  /**
   * Deletes both databases, for logout. Rejects when a delete fails or hasn't
   * finished within `timeoutMs`: a delete waits until every connection is
   * closed, and one this service doesn't control may never be. Each database
   * is emptied first, which doesn't wait for that, so even then the unsent
   * results of the school being logged out of are gone and can't be uploaded
   * under the next registration. For the same reason, every call to this
   * service made from now on fails.
   */
  async deleteAllDatabases(
    timeoutMs = DELETE_DATABASES_TIMEOUT_MS
  ): Promise<void> {
    this.deletedForLogout = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeLimit = new Promise<never>((_, reject) => {
      timer = setTimeout(
        () =>
          reject(
            new Error(`IndexedDB: databases not deleted within ${timeoutMs} ms`)
          ),
        timeoutMs
      );
    });
    // Both run to their end: one failing doesn't cut the other short.
    const outcomes = Promise.all(
      [
        this.emptyAndDelete(
          () => this.openDatabase(),
          this.dbName,
          this.storeName
        ),
        this.emptyAndDelete(
          () => this.openMeasurementDatabase(),
          this.measurementDbName,
          this.measurementStoreName
        ),
      ].map((deletion) =>
        deletion.then(
          () => null,
          (error) => error ?? new Error('IndexedDB: delete failed')
        )
      )
    );
    try {
      const failure = (await Promise.race([outcomes, timeLimit])).find(
        (error) => error
      );
      if (failure) {
        throw failure;
      }
    } finally {
      clearTimeout(timer);
    }
  }

  private async emptyAndDelete(
    open: () => Promise<IDBDatabase>,
    name: string,
    storeName: string
  ): Promise<void> {
    try {
      const tx = await this.startTransaction(open, storeName, 'readwrite', true);
      tx.objectStore(storeName).clear();
      await new Promise<void>((resolve, reject) => {
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error);
      });
    } catch (error) {
      // The delete below still removes the data if it goes through.
      console.warn(`[IndexedDB] Could not empty ${name}:`, error);
    }
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.deleteDatabase(name);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
      // When it is blocked, it goes ahead once the other connections close;
      // deleteAllDatabases() stops waiting at its time limit.
    });
  }


}