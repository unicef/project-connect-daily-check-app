import {
  LOCATE_TOKEN_LIFETIME_S,
  locateServerTime,
} from './mlab-server-time.utils';

/** An unsigned JWT carrying `claims`, base64url-encoded like locate's. */
const jwt = (claims: any) =>
  [
    'eyJhbGciOiJFZERTQSJ9',
    btoa(JSON.stringify(claims))
      .replace(/=+$/, '')
      .replace(/\+/g, '-')
      .replace(/\//g, '_'),
    'signature',
  ].join('.');

const serverWith = (token: string) => ({
  machine: 'mlab2-bcn01.mlab-oti.measurement-lab.org',
  urls: {
    'wss:///ndt/v7/download': `wss://ndt-mlab2-bcn01.mlab-oti.measurement-lab.org/ndt/v7/download?access_token=${token}`,
  },
});

describe('locateServerTime', () => {
  const issuedAt = 1794309516;

  it('reads the issue time from the exp claim', () => {
    const server = serverWith(jwt({ exp: issuedAt + LOCATE_TOKEN_LIFETIME_S }));

    expect(locateServerTime(server)).toBe(issuedAt * 1000);
  });

  it('prefers an iat claim when there is one', () => {
    const server = serverWith(jwt({ iat: issuedAt, exp: issuedAt + 300 }));

    expect(locateServerTime(server)).toBe(issuedAt * 1000);
  });

  it('decodes base64url payloads', () => {
    // These claims encode to a payload with both '-' and '_' in it.
    const token = jwt({ aud: '???>>>~~~', exp: issuedAt + 60 });
    expect(token.split('.')[1]).toMatch(/[-_]/);

    expect(locateServerTime(serverWith(token))).toBe(issuedAt * 1000);
  });

  it('skips URLs without a readable token and reads the next one', () => {
    const server = {
      urls: {
        'ws:///ndt/v7/download': 'ws://example.org/ndt/v7/download',
        'ws:///ndt/v7/upload': 'not a url',
        'wss:///ndt/v7/download': `wss://example.org/ndt/v7/download?access_token=${jwt({ exp: issuedAt + 60 })}`,
      },
    };

    expect(locateServerTime(server)).toBe(issuedAt * 1000);
  });

  it('is null when the token is not a JWT', () => {
    expect(locateServerTime(serverWith('opaque'))).toBeNull();
    expect(locateServerTime(serverWith('a.%%%.c'))).toBeNull();
  });

  it('is null when the token has no time claim', () => {
    expect(locateServerTime(serverWith(jwt({ sub: 'ndt' })))).toBeNull();
    expect(locateServerTime(serverWith(jwt({ exp: 'soon' })))).toBeNull();
  });

  it('is null without a server or its URLs', () => {
    expect(locateServerTime(undefined)).toBeNull();
    expect(locateServerTime({})).toBeNull();
    expect(locateServerTime({ urls: { x: 42 } })).toBeNull();
  });
});
