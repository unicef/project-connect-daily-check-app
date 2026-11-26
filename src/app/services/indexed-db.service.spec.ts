import { TestBed } from '@angular/core/testing';

import { IndexedDBService } from './indexed-db.service';

const PING_DB = 'connectivity_ping_db';
const MEASUREMENT_DB = 'connectivity_measurements_db';
const DAY_MS = 24 * 60 * 60 * 1000;
// Kept before any test can replace it, for the cleanup.
const realDeleteDatabase = IDBFactory.prototype.deleteDatabase;

/** Deletes a database without the service. Never hangs the test run. */
function removeDatabase(name: string): Promise<void> {
  return new Promise((resolve) => {
    const request = realDeleteDatabase.call(indexedDB, name);
    request.onsuccess = () => resolve();
    request.onerror = () => resolve();
    // Something still holds it: the delete happens once that closes.
    request.onblocked = () => resolve();
  });
}

async function databaseExists(name: string): Promise<boolean> {
  const databases = await indexedDB.databases();
  return databases.some((database) => database.name === name);
}

/** A connection the service doesn't control: it ignores a delete. */
function openForeign(name: string): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(name);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function readAll(db: IDBDatabase, storeName: string): Promise<any[]> {
  return new Promise((resolve, reject) => {
    const request = db
      .transaction(storeName, 'readonly')
      .objectStore(storeName)
      .getAll();
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/** Runs `work` with Date.now() returning `time`, for records of a given age. */
async function at<T>(time: number, work: () => Promise<T>): Promise<T> {
  const now = jasmine.isSpy(Date.now)
    ? (Date.now as jasmine.Spy)
    : spyOn(Date, 'now');
  now.and.returnValue(time);
  try {
    return await work();
  } finally {
    now.and.callThrough();
  }
}

describe('IndexedDBService', () => {
  let service: IndexedDBService;

  beforeEach(async () => {
    await Promise.all([removeDatabase(PING_DB), removeDatabase(MEASUREMENT_DB)]);
    TestBed.configureTestingModule({});
    service = TestBed.inject(IndexedDBService);
  });

  afterEach(async () => {
    await Promise.all([removeDatabase(PING_DB), removeDatabase(MEASUREMENT_DB)]);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  describe('pings', () => {
    it('saves them, reads them back and marks them synced', async () => {
      await service.savePingResult({ timestamp: new Date(1000), isConnected: true });
      await service.savePingResult({ timestamp: new Date(2000), isConnected: false });

      const unsynced = await service.getUnsyncedRecords();
      expect(unsynced.length).toBe(2);

      await service.markAsSynced([unsynced[0]]);

      expect((await service.getPingResults()).length).toBe(2);
      const left = await service.getUnsyncedRecords();
      expect(left.map((ping) => ping.isConnected)).toEqual([false]);
    });

    it('cleans up the old ones and keeps the rest', async () => {
      const now = Date.now();
      await at(now - 31 * DAY_MS, () =>
        service.savePingResult({ timestamp: new Date(1000), note: 'old' })
      );
      await at(now - 4 * DAY_MS, () =>
        service.savePingResult({ timestamp: new Date(2000), note: 'synced' })
      );
      await at(now - 4 * DAY_MS, () =>
        service.savePingResult({ timestamp: new Date(3000), note: 'unsynced' })
      );
      const synced = (await service.getPingResults()).find(
        (ping) => ping.note === 'synced'
      );
      await service.markAsSynced([synced]);

      await service.cleanupOldRecords();

      const notes = (await service.getPingResults()).map((ping) => ping.note);
      expect(notes).toEqual(['unsynced']);
    });
  });

  describe('measurement queue', () => {
    it('queues them, reads the pending ones and marks them synced', async () => {
      await service.saveMeasurement({ UUID: 'a' });
      await service.saveMeasurement({ UUID: 'b' });

      const pending = await service.getPendingMeasurements();
      expect(pending.map((record) => record.UUID)).toEqual(['a', 'b']);
      expect(pending.every((record) => record.status === 'pending')).toBeTrue();

      await service.markMeasurementSynced(pending[0].id);

      const left = await service.getPendingMeasurements();
      expect(left.map((record) => record.UUID)).toEqual(['b']);
    });

    it('cleans up the old ones and keeps the rest', async () => {
      const now = Date.now();
      await at(now - 31 * DAY_MS, () => service.saveMeasurement({ UUID: 'old' }));
      await at(now - 4 * DAY_MS, () => service.saveMeasurement({ UUID: 'synced' }));
      await at(now - 4 * DAY_MS, () => service.saveMeasurement({ UUID: 'pending' }));
      const synced = (await service.getPendingMeasurements()).find(
        (record) => record.UUID === 'synced'
      );
      await service.markMeasurementSynced(synced.id);

      await service.cleanupOldMeasurements();

      const left = await service.getPendingMeasurements();
      expect(left.map((record) => record.UUID)).toEqual(['pending']);
    });
  });

  describe('deleteAllDatabases', () => {
    // Each call leaves nothing open behind it, or the delete would wait.
    const calls: [string, (service: IndexedDBService) => Promise<unknown>][] = [
      ['savePingResult', (s) => s.savePingResult({ timestamp: new Date(1000) })],
      ['getPingResults', (s) => s.getPingResults()],
      ['getUnsyncedRecords', (s) => s.getUnsyncedRecords()],
      ['markAsSynced', (s) => s.markAsSynced([{ timestamp: new Date(1000) }])],
      ['cleanupOldRecords', (s) => s.cleanupOldRecords()],
      ['saveMeasurement', (s) => s.saveMeasurement({ UUID: 'a' })],
      ['getPendingMeasurements', (s) => s.getPendingMeasurements()],
      ['markMeasurementSynced', (s) => s.markMeasurementSynced(1)],
      ['cleanupOldMeasurements', (s) => s.cleanupOldMeasurements()],
    ];

    calls.forEach(([name, call]) => {
      it(`deletes both databases promptly after ${name}`, async () => {
        await call(service);

        const started = Date.now();
        await service.deleteAllDatabases(2000);

        expect(Date.now() - started).toBeLessThan(1000);
        expect(await databaseExists(PING_DB)).toBeFalse();
        expect(await databaseExists(MEASUREMENT_DB)).toBeFalse();
      });
    });

    it('lets a transaction already running finish, then deletes', async () => {
      const save = service.saveMeasurement({ UUID: 'in-flight' });
      const read = service.getPendingMeasurements();
      const ping = service.savePingResult({ timestamp: new Date(1000) });

      await service.deleteAllDatabases(2000);

      await expectAsync(save).toBeResolved();
      await expectAsync(read).toBeResolved();
      await expectAsync(ping).toBeResolved();
      expect(await databaseExists(PING_DB)).toBeFalse();
      expect(await databaseExists(MEASUREMENT_DB)).toBeFalse();
    });

    it('gives up at its time limit when another connection stays open, with the data gone', async () => {
      await service.saveMeasurement({ UUID: 'old-school' });
      await service.savePingResult({ timestamp: new Date(1000) });
      const foreign = await openForeign(MEASUREMENT_DB);
      try {
        const started = Date.now();
        await expectAsync(service.deleteAllDatabases(300)).toBeRejectedWithError(
          /not deleted within 300 ms/
        );
        expect(Date.now() - started).toBeLessThan(1000);

        // Read through the connection that kept the database alive.
        expect(await readAll(foreign, 'measurements')).toEqual([]);
        expect(await databaseExists(PING_DB)).toBeFalse();
      } finally {
        foreign.close();
      }
    });

    it('empties a database whose delete fails, and still reports it', async () => {
      await service.saveMeasurement({ UUID: 'old-school' });
      spyOn(indexedDB, 'deleteDatabase').and.callFake(() => {
        const request: any = { error: new DOMException('disk', 'UnknownError') };
        setTimeout(() => request.onerror?.());
        return request;
      });

      await expectAsync(service.deleteAllDatabases(2000)).toBeRejected();

      const db = await openForeign(MEASUREMENT_DB);
      try {
        expect(await readAll(db, 'measurements')).toEqual([]);
      } finally {
        db.close();
      }
    });

    it('fails every later call instead of creating the databases again', async () => {
      await service.deleteAllDatabases(2000);

      await expectAsync(service.savePingResult({ timestamp: new Date(1000) })).toBeRejected();
      await expectAsync(service.saveMeasurement({ UUID: 'late' })).toBeRejected();
      await expectAsync(service.getPendingMeasurements()).toBeRejected();
      await expectAsync(service.markMeasurementSynced(1)).toBeRejected();

      expect(await databaseExists(PING_DB)).toBeFalse();
      expect(await databaseExists(MEASUREMENT_DB)).toBeFalse();
    });
  });
});
