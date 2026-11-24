import {
  PRIORITY_LOCATE_URL,
  lookupPriorityServer,
  readLocateParams,
} from './locate.utils';

const target = (path: string, query: string) =>
  `wss://ndt-mlab1-mad06.mlab-oti.measurement-lab.org${path}?${query}`;

describe('readLocateParams', () => {
  it('reads metro_rank and locate_version from a Locate v2 target URL', () => {
    const urls = {
      'ws:///ndt/v7/download': target(
        '/ndt/v7/download',
        'access_token=abc&locate_version=v2&metro_rank=0'
      ),
      'wss:///ndt/v7/upload': target(
        '/ndt/v7/upload',
        'access_token=abc&locate_version=v2&metro_rank=0'
      ),
    };

    expect(readLocateParams(urls)).toEqual({
      metroRank: 0,
      locateVersion: 'v2',
    });
  });

  it('keeps a rank above zero, which marks a server outside the nearest metro', () => {
    const urls = {
      'wss:///ndt/v7/download': target(
        '/ndt/v7/download',
        'locate_version=v2&metro_rank=2'
      ),
    };

    expect(readLocateParams(urls).metroRank).toBe(2);
  });

  it('returns nulls when the URLs carry no Locate parameters', () => {
    const urls = {
      'wss:///ndt/v7/download': target('/ndt/v7/download', 'access_token=abc'),
    };

    expect(readLocateParams(urls)).toEqual({
      metroRank: null,
      locateVersion: null,
    });
  });

  it('ignores a malformed rank and unparseable URLs', () => {
    const urls = {
      bad: 'not a url',
      'wss:///ndt/v7/download': target(
        '/ndt/v7/download',
        'locate_version=v2&metro_rank=near'
      ),
    };

    expect(readLocateParams(urls)).toEqual({
      metroRank: null,
      locateVersion: 'v2',
    });
  });

  it('returns nulls when there are no URLs at all', () => {
    expect(readLocateParams(undefined)).toEqual({
      metroRank: null,
      locateVersion: null,
    });
    expect(readLocateParams(null)).toEqual({
      metroRank: null,
      locateVersion: null,
    });
  });
});

describe('lookupPriorityServer', () => {
  const metadata = { client_name: 'giga-meter', client_version: '2.0.4' };
  const server = {
    machine: 'mlab1-mad06.mlab-oti.measurement-lab.org',
    urls: {
      'wss:///ndt/v7/download': target('/ndt/v7/download', 'access_token=abc'),
      'wss:///ndt/v7/upload': target('/ndt/v7/upload', 'access_token=abc'),
      'ws:///ndt/v7/download': 'ws://plain/download',
    },
  };
  const reply = (body: any, status = 200) =>
    new Response(JSON.stringify(body), { status });
  let fetchSpy: jasmine.Spy;

  beforeEach(() => {
    fetchSpy = spyOn(window, 'fetch').and.callFake(async () =>
      reply({ results: [server, { machine: 'second' }] })
    );
  });

  it('asks the priority lookup with the token and our metadata', async () => {
    const discovered: URL[] = [];

    const found = await lookupPriorityServer(
      { token: 'jwt', locateUrl: null },
      metadata,
      1000,
      (url) => discovered.push(url)
    );

    const [url, init] = fetchSpy.calls.mostRecent().args;
    expect(url).toBe(
      `${PRIORITY_LOCATE_URL}?client_name=giga-meter&client_version=2.0.4`
    );
    expect(init.headers).toEqual({ Authorization: 'Bearer jwt' });
    expect(discovered.map(String)).toEqual([PRIORITY_LOCATE_URL]);
    expect(found.server).toEqual(server);
    expect(found.urls).toEqual({
      '///ndt/v7/download': server.urls['wss:///ndt/v7/download'],
      '///ndt/v7/upload': server.urls['wss:///ndt/v7/upload'],
    });
  });

  it('keeps a key in the given URL out of the discovery callback', async () => {
    const discovered: URL[] = [];

    await lookupPriorityServer(
      { token: null, locateUrl: 'https://locate.example.org/v2/p?key=secret' },
      metadata,
      1000,
      (url) => discovered.push(url)
    );

    expect(fetchSpy.calls.mostRecent().args[0]).toContain('key=secret');
    expect(discovered.map(String)).toEqual(['https://locate.example.org/v2/p']);
  });

  it('rejects with the HTTP status when M-Lab refuses', async () => {
    fetchSpy.and.callFake(async () => reply({ error: { status: 429 } }, 429));

    await expectAsync(
      lookupPriorityServer({ token: 'jwt', locateUrl: null }, metadata, 1000)
    ).toBeRejectedWithError('HTTP 429');
  });

  it('rejects when the reply has no usable server', async () => {
    for (const body of [{}, { results: [] }, { results: [{ urls: {} }] }]) {
      fetchSpy.and.callFake(async () => reply(body));
      await expectAsync(
        lookupPriorityServer({ token: 'jwt', locateUrl: null }, metadata, 1000)
      ).toBeRejectedWithError('no server in reply');
    }
    fetchSpy.and.callFake(async () => new Response('<html>', { status: 200 }));
    await expectAsync(
      lookupPriorityServer({ token: 'jwt', locateUrl: null }, metadata, 1000)
    ).toBeRejectedWithError('no server in reply');
  });

  it('rejects when the lookup cannot be read, and on a timeout', async () => {
    fetchSpy.and.rejectWith(new TypeError('Failed to fetch'));
    await expectAsync(
      lookupPriorityServer({ token: 'jwt', locateUrl: null }, metadata, 1000)
    ).toBeRejectedWithError('refused or unreachable');

    fetchSpy.and.callFake(
      (_url: string, init: RequestInit) =>
        new Promise((_resolve, reject) =>
          init.signal.addEventListener('abort', () => reject(init.signal.reason))
        )
    );
    await expectAsync(
      lookupPriorityServer({ token: 'jwt', locateUrl: null }, metadata, 10)
    ).toBeRejectedWithError('timeout');
  });
});
