import {
  latestByProvider,
  parseMeasurementRows,
  sortMeasurementRows,
  extractMeasurementMetadata,
  extractMeasurementMetrics,
  formatPacketLossPercent,
} from './measurement.utils';
import { MeasurementRecord } from './measurement.types';

describe('measurement.utils', () => {
  const mlabRecord: MeasurementRecord = {
    timestamp: 1000,
    provider: 'mlab',
    results: {
      'NDTResult.S2C': {
        LastClientMeasurement: { MeanClientMbps: 10 },
        LastServerMeasurement: {
          BBRInfo: { MinRTT: 20000 },
          TCPInfo: { BytesRetrans: 1000, BytesSent: 100000 },
        },
      },
      'NDTResult.C2S': {
        LastClientMeasurement: { MeanClientMbps: 5 },
        LastServerMeasurement: {
          BBRInfo: { MinRTT: 22000 },
          TCPInfo: { BytesRetrans: 500, BytesSent: 50000 },
        },
      },
    },
    mlabInformation: { label: 'Madrid, ES' },
    accessInformation: { org: 'British Telecom' },
    uploaded: false,
    uuid: 'a',
    version: 1,
    Notes: 'manual',
    dataUsage: {},
  };

  const cloudflareRecord: MeasurementRecord = {
    timestamp: 2000,
    provider: 'cloudflare',
    results: {
      summary: { download: 10485760, upload: 2097152, latency: 22 },
      packetLoss: { value: 0.005 },
    },
    serverInformation: { city: 'London' },
    accessInformation: { org: 'BT' },
    uploaded: false,
    uuid: 'b',
    version: 1,
    Notes: 'manual',
    dataUsage: {},
  };

  it('latestByProvider returns latest per provider', () => {
    const result = latestByProvider([mlabRecord, cloudflareRecord]);
    expect(result.mlab).toBe(mlabRecord);
    expect(result.cloudflare).toBe(cloudflareRecord);
  });

  it('extractMeasurementMetadata labels ndt7 for mlab', () => {
    const meta = extractMeasurementMetadata(mlabRecord);
    expect(meta.protocolLabel).toBe('M-Lab');
    expect(meta.testServer).toBe('Madrid, ES');
    expect(meta.networkOperator).toBe('British Telecom');
  });

  it('formatPacketLossPercent treats Cloudflare SDK fractions as 0-1', () => {
    expect(formatPacketLossPercent(0.005)).toBe('0.50%');
    expect(formatPacketLossPercent(0.05)).toBe('5.00%');
  });

  it('extractMeasurementMetrics reads NDT packet loss from TCPInfo.BytesRetrans', () => {
    const metrics = extractMeasurementMetrics(mlabRecord);
    expect(metrics.packetLoss).toBe('1.00%');
  });

  it('extractMeasurementMetrics reads Cloudflare packet loss from fraction value', () => {
    const metrics = extractMeasurementMetrics(cloudflareRecord);
    expect(metrics.packetLoss).toBe('0.50%');
  });

  it('extractMeasurementMetrics returns N/A when Cloudflare packet loss errored', () => {
    const metrics = extractMeasurementMetrics({
      ...cloudflareRecord,
      results: {
        packetLoss: {
          details: { error: 'turnServerUser missing' },
        },
      },
    });
    expect(metrics.packetLoss).toBe('N/A');
  });

  it('parseMeasurementRows includes display columns', () => {
    const rows = parseMeasurementRows([cloudflareRecord]);
    expect(rows[0].protocolLabel).toBe('Cloudflare');
    expect(rows[0].download).toBeCloseTo(10, 1);
    expect(rows[0].packetLoss).toBe('0.50%');
  });

  it('sortMeasurementRows sorts by protocol ascending', () => {
    const rows = parseMeasurementRows([mlabRecord, cloudflareRecord]);
    const sorted = sortMeasurementRows(rows, 'protocol', 'asc');
    expect(sorted[0].protocolLabel).toBe('Cloudflare');
    expect(sorted[1].protocolLabel).toBe('M-Lab');
  });
});
