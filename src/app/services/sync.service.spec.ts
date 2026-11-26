import {
  TestBed,
  discardPeriodicTasks,
  fakeAsync,
  flushMicrotasks,
  tick,
} from '@angular/core/testing';
import { provideHttpClient, withInterceptorsFromDi } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';

import { SyncService, SYNC_TIMEOUT_MS } from './sync.service';

describe('SyncService', () => {
  let service: SyncService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptorsFromDi()),
        provideHttpClientTesting(),
      ],
    });
    service = TestBed.inject(SyncService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  describe('syncPendingMeasurements', () => {
    let httpMock: HttpTestingController;
    let markSynced: jasmine.Spy;
    const batch = () => httpMock.expectOne((r) => r.url.endsWith('measurements/multiple'));

    beforeEach(() => {
      httpMock = TestBed.inject(HttpTestingController);
      const indexedDB = service['indexedDBService'];
      spyOn(indexedDB, 'getPendingMeasurements').and.resolveTo([
        { id: 1, status: 'pending', createdAt: 1, UUID: 'ndt-a' },
        { id: 2, status: 'pending', createdAt: 2, UUID: 'ndt-b' },
      ]);
      spyOn(indexedDB, 'markMeasurementSynced').and.resolveTo();
      spyOn(indexedDB, 'cleanupOldMeasurements').and.resolveTo();
      spyOn(service['posthog'], 'capture').and.stub();
      markSynced = spyOn(service['historyService'], 'markSynced').and.stub();
    });

    afterEach(() => httpMock.verify());

    it('marks the delivered tests as synced in the history', fakeAsync(() => {
      service.syncPendingMeasurements();
      flushMicrotasks();
      batch().flush({});
      flushMicrotasks();

      expect(markSynced).toHaveBeenCalledOnceWith(['ndt-a', 'ndt-b']);
    }));

    it('leaves the history alone when the batch is not delivered', fakeAsync(() => {
      service.syncPendingMeasurements();
      flushMicrotasks();
      batch().error(new ProgressEvent('error'));
      flushMicrotasks();
      batch().error(new ProgressEvent('error'));
      flushMicrotasks();

      expect(markSynced).not.toHaveBeenCalled();
    }));

    it('takes a batch the backend refused out of the queue without posting it again', fakeAsync(() => {
      service.syncPendingMeasurements();
      flushMicrotasks();
      batch().flush(
        {
          statusCode: 400,
          message:
            'Failed to add measurements with error for each records : PCDC school does not exist,Wrong country code',
        },
        { status: 400, statusText: 'Bad Request' }
      );
      flushMicrotasks();

      // No second post: httpMock.verify() in afterEach fails on one.
      const indexedDB = service['indexedDBService'];
      expect(indexedDB.markMeasurementSynced).toHaveBeenCalledWith(1);
      expect(indexedDB.markMeasurementSynced).toHaveBeenCalledWith(2);
      // Not delivered: the history keeps saying so.
      expect(markSynced).not.toHaveBeenCalled();
      expect(service['posthog'].capture).toHaveBeenCalledWith(
        'measurement_rejected',
        jasmine.objectContaining({
          source: 'sync',
          count: 2,
          reason: 'school_doesnt_exist,wrong_country_code',
        })
      );
    }));

    it('joins a sync that is already running instead of posting the tests twice', fakeAsync(() => {
      let first = false;
      let second = false;
      service.syncPendingMeasurements().then(() => (first = true));
      service.syncPendingMeasurements().then(() => (second = true));
      flushMicrotasks();

      batch().flush({}); // expectOne: a second POST of the same tests fails here
      flushMicrotasks();

      expect(service['indexedDBService'].getPendingMeasurements).toHaveBeenCalledTimes(1);
      expect(markSynced).toHaveBeenCalledTimes(1);
      expect(first).toBeTrue();
      expect(second).toBeTrue();
    }));

    it('starts a new sync once the previous one is over', fakeAsync(() => {
      service.syncPendingMeasurements();
      flushMicrotasks();
      batch().error(new ProgressEvent('error'));
      flushMicrotasks();
      batch().error(new ProgressEvent('error'));
      flushMicrotasks();

      service.syncPendingMeasurements();
      flushMicrotasks();
      batch().flush({});
      flushMicrotasks();

      expect(service['indexedDBService'].getPendingMeasurements).toHaveBeenCalledTimes(2);
      expect(markSynced).toHaveBeenCalledOnceWith(['ndt-a', 'ndt-b']);
    }));

    it('retries a failed batch once and marks it synced when the retry gets through', fakeAsync(() => {
      service.syncPendingMeasurements();
      flushMicrotasks();
      batch().flush('', { status: 503, statusText: 'Service Unavailable' });
      flushMicrotasks();
      batch().flush({});
      flushMicrotasks();

      expect(markSynced).toHaveBeenCalledOnceWith(['ndt-a', 'ndt-b']);
      expect(service['posthog'].capture).toHaveBeenCalledWith(
        'measurements_synced',
        jasmine.objectContaining({ batch_size: 2 })
      );
    }));

    it('ends the sync when a request gets no answer, without posting the batch again', fakeAsync(() => {
      let done = false;
      service.syncPendingMeasurements().then(() => (done = true));
      flushMicrotasks();
      const request = batch(); // never answered

      tick(SYNC_TIMEOUT_MS - 1);
      expect(done).toBeFalse();
      tick(1);

      expect(done).toBeTrue();
      expect(request.cancelled).toBeTrue();
      // No retry: httpMock.verify() in afterEach fails on a second post.
      expect(service['indexedDBService'].markMeasurementSynced).not.toHaveBeenCalled();
      expect(markSynced).not.toHaveBeenCalled();
      expect(service['posthog'].capture).toHaveBeenCalledWith(
        'measurements_sync_failed',
        jasmine.objectContaining({ error_code: 'timeout', batch_size: 2, status: null })
      );
    }));

    it('ends the sync when the retry after a failure gets no answer', fakeAsync(() => {
      let done = false;
      service.syncPendingMeasurements().then(() => (done = true));
      flushMicrotasks();
      batch().error(new ProgressEvent('error'));
      flushMicrotasks();
      const retry = batch(); // never answered

      tick(SYNC_TIMEOUT_MS);

      expect(done).toBeTrue();
      expect(retry.cancelled).toBeTrue();
      expect(markSynced).not.toHaveBeenCalled();
      expect(service['posthog'].capture).toHaveBeenCalledWith(
        'measurements_sync_failed',
        jasmine.objectContaining({ error_code: 'timeout' })
      );
    }));

    it('releases the callers that joined a sync whose request got no answer', fakeAsync(() => {
      let first = false;
      let second = false;
      service.syncPendingMeasurements().then(() => (first = true));
      flushMicrotasks();
      batch(); // never answered
      // Joins while the request is pending, as a successful upload does.
      service.syncPendingMeasurements().then(() => (second = true));

      tick(SYNC_TIMEOUT_MS);

      expect(first).toBeTrue();
      expect(second).toBeTrue();
      expect(service['indexedDBService'].getPendingMeasurements).toHaveBeenCalledTimes(1);
    }));

    it('starts a new sync after one whose request got no answer, and delivers the queue', fakeAsync(() => {
      service.syncPendingMeasurements();
      flushMicrotasks();
      batch(); // never answered
      tick(SYNC_TIMEOUT_MS);

      service.syncPendingMeasurements();
      flushMicrotasks();
      batch().flush({});
      flushMicrotasks();

      expect(service['indexedDBService'].getPendingMeasurements).toHaveBeenCalledTimes(2);
      expect(markSynced).toHaveBeenCalledOnceWith(['ndt-a', 'ndt-b']);
    }));
  });

  describe('syncPingResults', () => {
    let httpMock: HttpTestingController;
    let markAsSynced: jasmine.Spy;
    const pings = () => httpMock.expectOne((r) => r.url.includes('connectivity/'));

    beforeEach(() => {
      httpMock = TestBed.inject(HttpTestingController);
      const indexedDB = service['indexedDBService'];
      spyOn(indexedDB, 'getUnsyncedRecords').and.resolveTo([
        { timestamp: 1, app_local_uuid: 'ping-a', isSynced: false, createdAt: 1 },
      ]);
      markAsSynced = spyOn(indexedDB, 'markAsSynced').and.resolveTo();
      spyOn(indexedDB, 'cleanupOldRecords').and.resolveTo();
    });

    afterEach(() => httpMock.verify());

    it('posts the pings again once when the first post gets no answer', fakeAsync(() => {
      service.syncPingResults();
      flushMicrotasks();
      const first = pings(); // never answered
      tick(SYNC_TIMEOUT_MS);

      expect(first.cancelled).toBeTrue();
      pings().flush({});
      flushMicrotasks();

      expect(markAsSynced).toHaveBeenCalledTimes(1);
    }));

    it('gives up when the retry gets no answer either', fakeAsync(() => {
      let error: any = null;
      service.syncPingResults().catch((e) => (error = e));
      flushMicrotasks();
      pings(); // never answered
      tick(SYNC_TIMEOUT_MS);
      const retry = pings(); // never answered
      tick(SYNC_TIMEOUT_MS);

      expect(retry.cancelled).toBeTrue();
      expect(error?.name).toBe('TimeoutError');
      expect(markAsSynced).not.toHaveBeenCalled();
    }));
  });

  describe('startPeriodicSync', () => {
    let syncMeasurements: jasmine.Spy;
    let syncPings: jasmine.Spy;
    const TWO_HOURS = 2 * 60 * 60 * 1000;

    beforeEach(() => {
      syncMeasurements = spyOn(service, 'syncPendingMeasurements').and.resolveTo();
      syncPings = spyOn(service, 'syncPingResults').and.resolveTo();
    });

    it('sends the failed tests a minute after the app starts', fakeAsync(() => {
      service.startPeriodicSync();

      tick(59_999);
      expect(syncMeasurements).not.toHaveBeenCalled();
      tick(1);
      expect(syncMeasurements).toHaveBeenCalledTimes(1);
      expect(syncPings).not.toHaveBeenCalled();

      discardPeriodicTasks();
    }));

    it('keeps sending everything every 2 hours', fakeAsync(() => {
      service.startPeriodicSync();

      tick(TWO_HOURS);
      expect(syncMeasurements).toHaveBeenCalledTimes(2); // startup + interval
      expect(syncPings).toHaveBeenCalledTimes(1);
      tick(TWO_HOURS);
      expect(syncMeasurements).toHaveBeenCalledTimes(3);
      expect(syncPings).toHaveBeenCalledTimes(2);

      discardPeriodicTasks();
    }));

    it('skips the startup sync when the PC is offline', fakeAsync(() => {
      spyOnProperty(navigator, 'onLine').and.returnValue(false);
      service.startPeriodicSync();

      tick(60_000);
      expect(syncMeasurements).not.toHaveBeenCalled();

      discardPeriodicTasks();
    }));
  });
});
