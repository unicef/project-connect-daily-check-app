import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideHttpClient, withInterceptorsFromDi } from '@angular/common/http';
import { HistoryService } from './history.service';

describe('HistoryService', () => {
  let service: HistoryService;

  beforeEach(() => {
    TestBed.configureTestingModule({
    imports: [],
    providers: [provideHttpClient(withInterceptorsFromDi()), provideHttpClientTesting()]
});
    service = TestBed.inject(HistoryService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  describe('markSynced', () => {
    const rows = () => ({
      measurements: [
        { index: 0, uuid: 'ndt-a', synced: false, uploaded: false },
        { index: 1, uuid: 'ndt-b', synced: false, uploaded: false },
        { index: 2, uuid: '', synced: false, uploaded: false },
      ],
    });
    let broadcast: jasmine.Spy;

    beforeEach(() => {
      service.set(rows());
      service.setAll(rows());
      broadcast = spyOn(service['sharedService'], 'broadcast').and.stub();
    });

    afterEach(() => {
      localStorage.removeItem('historicalData');
      localStorage.removeItem('historicalDataAll');
    });

    it('flips only the delivered tests, in both history lists', () => {
      service.markSynced(['ndt-a', '']);

      const synced = (data) => data.measurements.map((m) => m.synced);
      expect(synced(service.get())).toEqual([true, false, false]);
      expect(synced(service.getAll())).toEqual([true, false, false]);
      expect(service.get().measurements[0].uploaded).toBeTrue();
      expect(broadcast).toHaveBeenCalledOnceWith(
        'history:measurement:change',
        'history:measurement:change'
      );
    });

    it('changes nothing when no test matches', () => {
      service.markSynced(['ndt-z']);

      expect(service.get()).toEqual(rows());
      expect(broadcast).not.toHaveBeenCalled();
    });
  });
});
