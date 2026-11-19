/**
 * Readers for the results of a finished ndt7 run.
 *
 * Each leg ('NDTResult.S2C' for download, 'NDTResult.C2S' for upload) carries
 * the last client-side and the last server-side measurement. The server-side
 * one is missing when the server sends nothing before the worker times out,
 * which happens on slow or filtered connections, so readers must not assume
 * it is there.
 */
export const DOWNLOAD_LEG = 'NDTResult.S2C';
export const UPLOAD_LEG = 'NDTResult.C2S';

const isFiniteNumber = (value: any): value is number =>
  typeof value === 'number' && isFinite(value);

/**
 * Whether a leg measured a speed on the client side. Download and upload speed
 * both come from the client measurement, so a leg without one has no result.
 */
export function hasClientResult(leg: any): boolean {
  return isFiniteNumber(leg?.LastClientMeasurement?.MeanClientMbps);
}

/**
 * Mean server-side MinRTT of the legs that report one, in milliseconds.
 * Null when neither leg has a server measurement.
 */
export function averageLatencyMs(results: any): number | null {
  const minRtts = [DOWNLOAD_LEG, UPLOAD_LEG]
    .map((leg) => results?.[leg]?.LastServerMeasurement?.BBRInfo?.MinRTT)
    .filter(isFiniteNumber);
  if (!minRtts.length) {
    return null;
  }
  const sum = minRtts.reduce((total, rtt) => total + rtt, 0);
  return sum / minRtts.length / 1000;
}
