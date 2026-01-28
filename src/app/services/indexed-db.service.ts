import { Injectable } from '@angular/core';

@Injectable({
  providedIn: 'root',
})
export class IndexedDBService {
  private dbName = 'connectivity_ping_db';
  private storeName = 'pingResults';

  constructor() {}

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
}
