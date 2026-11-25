/**
 * Readers for the server M-Lab's Locate service picked for an ndt7 run.
 *
 * Locate v2 returns, for each candidate server, a map of target URLs such as
 * `wss://ndt-mlab1-mad06.mlab-oti.measurement-lab.org/ndt/v7/download?access_token=…&locate_version=v2&metro_rank=0`.
 * The query string carries two values we want to keep with the measurement:
 *
 * - `metro_rank`: 0 when the server is in the client's nearest metro, and
 *   1, 2, … when Locate sent the client to a further one (it does that for a
 *   small share of requests to spread load). Analytics keep `metro_rank = 0`
 *   to drop tests that went to a far-away server.
 * - `locate_version`: the Locate API version that issued the URL.
 *
 * The access token in the same query string is short-lived and is not kept.
 */
export interface LocateParams {
  metroRank: number | null;
  locateVersion: string | null;
}

/**
 * Reads `metro_rank` and `locate_version` from the target URLs of the chosen
 * server. Every URL of one server carries the same values, so the first one
 * that has them wins. Missing or malformed values come back as null: a run
 * against a fixed server, or an older Locate response, simply has none.
 */
export function readLocateParams(urls: unknown): LocateParams {
  const result: LocateParams = { metroRank: null, locateVersion: null };
  if (!urls || typeof urls !== 'object') {
    return result;
  }

  for (const value of Object.values(urls as Record<string, unknown>)) {
    if (typeof value !== 'string') continue;

    let params: URLSearchParams;
    try {
      params = new URL(value).searchParams;
    } catch {
      continue;
    }

    const rank = params.get('metro_rank');
    if (result.metroRank === null && rank !== null && /^\d+$/.test(rank)) {
      result.metroRank = Number(rank);
    }
    const version = params.get('locate_version');
    if (result.locateVersion === null && version) {
      result.locateVersion = version;
    }
    if (result.metroRank !== null && result.locateVersion !== null) {
      break;
    }
  }

  return result;
}

/**
 * M-Lab's server lookup for registered integrations. It has higher rate limits
 * than the public one (`/v2/nearest/...`) that ndt7-js calls by default, and
 * answers the same way.
 */
export const PRIORITY_LOCATE_URL =
  'https://locate.measurementlab.net/v2/priority/nearest/ndt/ndt7';

/**
 * What our backend hands out for the priority lookup (see
 * LocateAccessService). Either value on its own is enough to use it.
 */
export interface LocateAccess {
  /** Sent to M-Lab as `Authorization: Bearer <token>`. */
  token: string | null;
  /** Called instead of PRIORITY_LOCATE_URL. Its own query string is kept. */
  locateUrl: string | null;
}

/** The two target URLs ndt7-js's downloadTest and uploadTest expect. */
export interface NdtUrls {
  '///ndt/v7/download': string;
  '///ndt/v7/upload': string;
}

/**
 * Asks the priority lookup for a server, the way ndt7-js asks the public one:
 * the first result wins, and its wss URLs (which carry the server's own
 * access token) are what the test connects to.
 *
 * Rejects with a short reason ('HTTP 401', 'timeout', …) on any failure, so
 * the caller can fall back to the public lookup and keep the reason with the
 * test. `onDiscovery` gets the URL without its query string, which may carry
 * a key.
 */
export async function lookupPriorityServer(
  access: LocateAccess,
  metadata: Record<string, string>,
  timeoutMs: number,
  onDiscovery: (loadbalancer: URL) => void = () => undefined
): Promise<{ server: any; urls: NdtUrls }> {
  const url = new URL(access.locateUrl || PRIORITY_LOCATE_URL);
  for (const [name, value] of Object.entries(metadata)) {
    url.searchParams.set(name, value);
  }
  onDiscovery(new URL(url.origin + url.pathname));

  let response: Response;
  try {
    response = await fetch(url.toString(), {
      headers: access.token ? { Authorization: `Bearer ${access.token}` } : {},
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (error) {
    // Not only network errors: M-Lab sends its 401 for a refused token without
    // CORS headers, so the app cannot read it and fetch fails the same way.
    throw new Error(
      (error as Error)?.name === 'TimeoutError'
        ? 'timeout'
        : 'refused or unreachable'
    );
  }
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  const body = await response.json().catch(() => null);
  const server = body?.results?.[0];
  const download = server?.urls?.['wss:///ndt/v7/download'];
  const upload = server?.urls?.['wss:///ndt/v7/upload'];
  if (typeof download !== 'string' || typeof upload !== 'string') {
    throw new Error('no server in reply');
  }
  return {
    server,
    urls: { '///ndt/v7/download': download, '///ndt/v7/upload': upload },
  };
}
