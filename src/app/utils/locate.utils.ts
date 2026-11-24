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
