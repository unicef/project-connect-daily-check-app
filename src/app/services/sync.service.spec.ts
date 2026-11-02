import { TestBed, fakeAsync, flushMicrotasks } from '@angular/core/testing';
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
  });
});
