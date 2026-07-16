import { Injectable } from '@angular/core';

@Injectable({
  providedIn: 'root',
})
export class IndexedDBService {
  private dbName = 'connectivity_ping_db';
  private storeName = 'pingResults';
  private measurementDbName = 'connectivity_measurements_db';
  private measurementStoreName = 'measurements';

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
      request.onsuccess = () => resolve(request.result);
      request.onerror = (e) => reject(e);
    });
  }

  async savePingResult(result: any): Promise<void> {
    const db = await this.openDatabase();
    const transaction = db.transaction(this.storeName, 'readwrite');
    const store = transaction.objectStore(this.storeName);
    store.put({ ...result, createdAt: Date.now(), isSynced: false });
    return new Promise((resolve, reject) => {
      transaction.oncomplete = () => {
        db.close(); // Close connection after successful transaction
        resolve();
      };
      transaction.onerror = (e) => {
        db.close(); // Close connection even on error
        reject(e);
      };
    });
  }

  async getPingResults(): Promise<any[]> {
    const db = await this.openDatabase();
    const transaction = db.transaction(this.storeName, 'readonly');
    const store = transaction.objectStore(this.storeName);
    return new Promise((resolve, reject) => {
      const request = store.getAll();
      request.onsuccess = () => {
        db.close(); // Close connection after successful read
        resolve(request.result);
      };
      request.onerror = (e) => {
        db.close(); // Close connection even on error
        reject(e);
      };
    });
  }

  async markAsSynced(syncedRecords: any[]): Promise<void> {
    const db = await this.openDatabase();
    const transaction = db.transaction(this.storeName, 'readwrite');
    const store = transaction.objectStore(this.storeName);
    syncedRecords.forEach((synced) => {
      store.put({ ...synced, isSynced: true });
    });
    return new Promise((resolve, reject) => {
      transaction.oncomplete = () => {
        db.close(); // Close connection after successful transaction
        resolve();
      };
      transaction.onerror = (e) => {
        db.close(); // Close connection even on error
        reject(e);
      };
    });
  }


  async cleanupOldRecords(): Promise<void> {
    const db = await this.openDatabase();
    const transaction = db.transaction(this.storeName, 'readwrite');
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

      request.onerror = (e) => {
        db.close(); // Close connection on error
        reject(request.error);
      };

      // Wait for the entire transaction to complete
      transaction.oncomplete = () => {
        db.close(); // Close connection after successful transaction
        resolve();
      };

      transaction.onerror = (e) => {
        db.close(); // Close connection even on transaction error
        reject(e);
      };
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
      request.onsuccess = () => resolve(request.result);
      request.onerror = (e) => reject(e);
    });
  }

  async saveMeasurement(record: any): Promise<void> {
    const db = await this.openMeasurementDatabase();
    const tx = db.transaction(this.measurementStoreName, 'readwrite');
    const store = tx.objectStore(this.measurementStoreName);
    store.add({ ...record, status: 'pending', createdAt: Date.now() });

    return new Promise((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  async getPendingMeasurements(): Promise<any[]> {
    const db = await this.openMeasurementDatabase();
    const tx = db.transaction(this.measurementStoreName, 'readonly');
    const store = tx.objectStore(this.measurementStoreName);
    const index = store.index('status');
    const request = index.getAll('pending');

    return new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async markMeasurementSynced(id: number): Promise<void> {
    const db = await this.openMeasurementDatabase();
    const tx = db.transaction(this.measurementStoreName, 'readwrite');
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
    });
  }

  async cleanupOldMeasurements(): Promise<void> {
    const db = await this.openMeasurementDatabase();
    const tx = db.transaction('measurements', 'readwrite');
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

      request.onerror = () => {
        db.close();
        reject(request.error);
      };

      tx.oncomplete = () => {
        db.close();
        resolve();
      };

      tx.onerror = (e) => {
        db.close();
        reject(e);
      };
    });
  }
  async deleteAllDatabases(): Promise<void> {
    return new Promise((resolve, reject) => {
      let pending = 2; // delete 2 DBs

      const onSuccess = () => {
        pending--;
        if (pending === 0) resolve();
      };

      const onError = (err: any) => reject(err);

      // Delete ping DB
      const pingDelete = indexedDB.deleteDatabase(this.dbName);
      pingDelete.onsuccess = onSuccess;
      pingDelete.onerror = onError;

      // Delete measurements DB
      const measurementDelete = indexedDB.deleteDatabase(this.measurementDbName);
      measurementDelete.onsuccess = onSuccess;
      measurementDelete.onerror = onError;
    });
  }


}