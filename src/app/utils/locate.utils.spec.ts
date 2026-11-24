import { readLocateParams } from './locate.utils';

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
