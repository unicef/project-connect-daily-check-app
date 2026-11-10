/**
 * M-Lab's clock, read from the server its locate service picked for a test.
 *
 * Measurements are stamped with Date.now(), which is only as good as the clock
 * of the machine running the test. ndt7 carries no wall clock of its own, and
 * the browser cannot read the Date header of M-Lab's locate response (it is not
 * exposed to cross-origin callers). What the locate response does carry is an
 * access token in every test URL: a JWT whose `exp` claim locate sets to its
 * own clock plus one minute (m-lab/locate, handler/handler.go). ndt7-js passes
 * that response to the `serverChosen` callback, so the time is there without
 * touching the library.
 *
 * The reading is taken at server discovery, a few seconds before the test
 * starts, at 1-second resolution: enough to spot a machine clock that is hours
 * or days off, not for sub-second correlation.
 */

/** Seconds between issuing a locate access token and its `exp` claim. */
export const LOCATE_TOKEN_LIFETIME_S = 60;

const isFiniteNumber = (value: any): value is number =>
  typeof value === 'number' && isFinite(value);

/** The payload of a JWT, or null when it is not one. */
function jwtClaims(token: string): any {
  const payload = token.split('.')[1];
  if (!payload) {
    return null;
  }
  try {
    const base64 = payload.replace(/-/g, '+').replace(/_/g, '/');
    const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
    return JSON.parse(atob(padded));
  } catch {
    return null;
  }
}

/** The access_token query parameter of a test URL, or null. */
function accessToken(url: any): string | null {
  if (typeof url !== 'string') {
    return null;
  }
  try {
    return new URL(url).searchParams.get('access_token');
  } catch {
    return null;
  }
}

/**
 * When M-Lab's locate service issued the tokens of `server`, in ms since the
 * epoch. Prefers an `iat` claim should locate ever add one, and otherwise
 * derives it from `exp`. Null when no URL carries a readable token.
 */
export function locateServerTime(server: any): number | null {
  const urls = server?.urls ? Object.values(server.urls) : [];
  for (const url of urls) {
    const token = accessToken(url);
    const claims = token && jwtClaims(token);
    if (isFiniteNumber(claims?.iat)) {
      return claims.iat * 1000;
    }
    if (isFiniteNumber(claims?.exp)) {
      return (claims.exp - LOCATE_TOKEN_LIFETIME_S) * 1000;
    }
  }
  return null;
}
