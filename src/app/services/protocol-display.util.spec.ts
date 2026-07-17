import {
  getConfigProtocolLabel,
  getRecordProtocolLabel,
  getProviderDocsKey,
  getProviderDocsUrl,
} from './protocol-display.util';

describe('protocol-display.util', () => {
  it('getRecordProtocolLabel returns Ndt 7 for mlab', () => {
    expect(getRecordProtocolLabel('mlab')).toBe('Ndt 7');
    expect(getRecordProtocolLabel('ndt7')).toBe('Ndt 7');
  });

  it('getConfigProtocolLabel returns Multi-protocol for both', () => {
    expect(getConfigProtocolLabel('both')).toBe('Multi-protocol');
    expect(getConfigProtocolLabel('cloudflare')).toBe('Cloudflare');
    expect(getConfigProtocolLabel('mlab')).toBe('Ndt 7');
  });

  it('getProviderDocsKey returns unified translation key', () => {
    expect(getProviderDocsKey('mlab')).toBe('startTest.aboutYourMeasurements');
    expect(getProviderDocsKey('cloudflare')).toBe(
      'startTest.aboutYourMeasurements'
    );
  });

  it('getProviderDocsUrl picks correct URL', () => {
    expect(getProviderDocsUrl('mlab')).toBe(
      'https://www.measurementlab.net/tests/ndt/'
    );
    expect(getProviderDocsUrl('cloudflare')).toBe('https://speed.cloudflare.com/');
  });
});
