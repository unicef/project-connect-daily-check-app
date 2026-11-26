import {
  TestBed,
  discardPeriodicTasks,
  fakeAsync,
  flushMicrotasks,
  tick,
} from '@angular/core/testing';
import { provideHttpClient, withInterceptorsFromDi } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';

import { SyncService } from './sync.service';

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
    const batch = () => httpMock.expectOne((r) => r.url.endsWith('measurements/batch'));

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
