import {
  getConfigProtocolLabel,
  getRecordProtocolLabel,
  getProviderDocsUrl,
} from './protocol-display.util';

describe('protocol-display.util', () => {
  it('getRecordProtocolLabel returns M-Lab for mlab', () => {
    expect(getRecordProtocolLabel('mlab')).toBe('M-Lab');
    expect(getRecordProtocolLabel('ndt7')).toBe('M-Lab');
  });

  it('getConfigProtocolLabel returns Multi-protocol for both', () => {
    expect(getConfigProtocolLabel('both')).toBe('Multi-protocol');
    expect(getConfigProtocolLabel('cloudflare')).toBe('Cloudflare');
  });

  it('getProviderDocsUrl picks correct URL', () => {
    expect(getProviderDocsUrl('mlab')).toBe(
      'https://www.measurementlab.net/tests/ndt/'
    );
    expect(getProviderDocsUrl('cloudflare')).toBe('https://speed.cloudflare.com/');
  });
});
