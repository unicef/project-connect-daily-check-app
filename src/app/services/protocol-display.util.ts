import { MeasurementProviderId } from './measurement.types';

export type MeasurementProviderMode = MeasurementProviderId | 'both';

/** M-Lab NDT test information (opens in system browser / new tab in Electron). */
export const MLAB_ABOUT_URL = 'https://www.measurementlab.net/tests/ndt/';

/** Cloudflare Internet Speed Test (opens in system browser / new tab in Electron). */
export const CLOUDFLARE_ABOUT_URL = 'https://speed.cloudflare.com/';

/** Display label for a single measurement record provider. */
export function getRecordProtocolLabel(
  provider: MeasurementProviderId | 'ndt7' | string | undefined
): string {
  if (provider === 'cloudflare') {
    return 'Cloudflare';
  }
  return 'Ndt 7';
}

/** Display label for resolved protocol config mode (Home metadata when not per-record). */
export function getConfigProtocolLabel(mode: MeasurementProviderMode): string {
  if (mode === 'cloudflare') {
    return 'Cloudflare';
  }
  if (mode === 'both') {
    return 'Multi-protocol';
  }
  return getRecordProtocolLabel('mlab');
}

export function getProviderDocsKey(
  provider: MeasurementProviderId
): 'startTest.aboutYourMeasurements' {
  void provider;
  return 'startTest.aboutYourMeasurements';
}

export function getProviderDocsUrl(provider: MeasurementProviderId): string {
  return provider === 'cloudflare' ? CLOUDFLARE_ABOUT_URL : MLAB_ABOUT_URL;
}
