import { provideHttpClient, withInterceptorsFromDi } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { TestBed, fakeAsync, flushMicrotasks, tick } from '@angular/core/testing';
import {
  LOCATE_ACCESS_TIMEOUT_MS,
  LocateAccessService,
  parseLocateAccess,
} from './locate-access.service';
import { StorageService } from './storage.service';

describe('LocateAccessService', () => {
  let service: LocateAccessService;
  let httpMock: HttpTestingController;
  let gigaId: string | null;
  const endpoint = (url: string) => url.endsWith('mlab/locate-token');

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptorsFromDi()),
        provideHttpClientTesting(),
      ],
    });
    service = TestBed.inject(LocateAccessService);
    httpMock = TestBed.inject(HttpTestingController);
    gigaId = 'school-giga-id';
    spyOn(TestBed.inject(StorageService), 'get').and.callFake((key: string) =>
      key === 'gigaId' ? gigaId : null
    );
    spyOn(console, 'log');
  });

  afterEach(() => httpMock.verify());

  it('returns the token our backend hands out', async () => {
    const access = service.get();
    const request = httpMock.expectOne((r) => endpoint(r.url));
    expect(request.request.method).toBe('GET');
    expect(request.request.params.get('giga_id_school')).toBe('school-giga-id');
    request.flush({ data: { token: 'jwt' } });

    expect(await access).toEqual({ token: 'jwt', locateUrl: null });
  });

  it('accepts the fields without the data wrapper', async () => {
    const access = service.get();
    httpMock
      .expectOne((r) => endpoint(r.url))
      .flush({ token: 'jwt', locate_url: 'https://locate.example.org/v3' });

    expect(await access).toEqual({
      token: 'jwt',
      locateUrl: 'https://locate.example.org/v3',
    });
  });

  it('asks without a school when the app is not registered', async () => {
    gigaId = null;
    const access = service.get();
    const request = httpMock.expectOne((r) => endpoint(r.url));
    expect(request.request.params.has('giga_id_school')).toBeFalse();
    request.flush({ data: { token: null } });

    expect(await access).toBeNull();
  });

  it('means the public lookup while the endpoint does not exist', async () => {
    const access = service.get();
    httpMock
      .expectOne((r) => endpoint(r.url))
      .flush({ message: 'Not Found' }, { status: 404, statusText: 'Not Found' });

    expect(await access).toBeNull();
  });

  it('means the public lookup when the backend cannot be reached', async () => {
    const access = service.get();
    httpMock.expectOne((r) => endpoint(r.url)).error(new ProgressEvent('error'));

    expect(await access).toBeNull();
  });

  it('means the public lookup when the backend does not answer in time', fakeAsync(() => {
    let result: any = 'pending';
    service.get().then((access) => (result = access));
    httpMock.expectOne((r) => endpoint(r.url));

    tick(LOCATE_ACCESS_TIMEOUT_MS - 1);
    flushMicrotasks();
    expect(result).toBe('pending');

    tick(1);
    flushMicrotasks();
    expect(result).toBeNull();
  }));
});

describe('parseLocateAccess', () => {
  it('keeps a token and an https locate URL', () => {
    expect(
      parseLocateAccess({ token: ' jwt ', locate_url: 'https://l.example.org/x?k=1' })
    ).toEqual({ token: 'jwt', locateUrl: 'https://l.example.org/x?k=1' });
  });

  it('drops a locate URL that is not https', () => {
    expect(
      parseLocateAccess({ token: 'jwt', locate_url: 'http://l.example.org/x' })
    ).toEqual({ token: 'jwt', locateUrl: null });
    expect(parseLocateAccess({ locate_url: 'not a url' })).toBeNull();
  });

  it('is null when there is nothing to use', () => {
    for (const value of [null, undefined, '', 'jwt', [], {}, { token: '' }, { token: 42 }]) {
      expect(parseLocateAccess(value)).withContext(JSON.stringify(value)).toBeNull();
    }
  });
});
