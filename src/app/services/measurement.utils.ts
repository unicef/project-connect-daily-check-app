import {
  CloudflareMeasurementResults,
  MeasurementProviderId,
  MeasurementRecord,
} from './measurement.types';
import { getRecordProtocolLabel } from './protocol-display.util';

export type NormalizedProvider = MeasurementProviderId;

export interface LatestByProvider {
  mlab?: MeasurementRecord;
  cloudflare?: MeasurementRecord;
}

export interface MeasurementDisplayMetadata {
  protocolLabel: string;
  testServer: string;
  networkOperator: string;
  packetLoss: string | undefined;
}

export interface MeasurementDisplayMetrics {
  download: number | undefined;
  upload: number | undefined;
  latency: number | undefined;
  packetLoss: string | undefined;
  timestamp: Date | undefined;
}

/** Cloudflare SDK returns a 0–1 fraction; values above 1 are treated as percent already. */
export function formatPacketLossPercent(raw: number): string {
  const percent = raw >= 0 && raw <= 1 ? raw * 100 : raw;
  return `${percent.toFixed(2)}%`;
}

function firstFiniteNumber(...values: unknown[]): number | undefined {
  for (const value of values) {
    const n = Number(value);
    if (Number.isFinite(n)) {
      return n;
    }
  }
  return undefined;
}

function extractCloudflarePacketLoss(
  results: CloudflareMeasurementResults
): string | undefined {
  const packetLoss = results.packetLoss;
  const directValue = firstFiniteNumber(
    packetLoss?.value,
    results.summary?.packetLoss
  );
  if (directValue !== undefined) {
    return formatPacketLossPercent(directValue);
  }

  const details = packetLoss?.details;
  if (details && typeof details === 'object' && !('error' in details)) {
    const detailsValue = firstFiniteNumber(
      (details as { packetLoss?: number }).packetLoss,
      (details as { value?: number }).value,
      (details as { percent?: number }).percent,
      (details as { loss?: number }).loss
    );
    if (detailsValue !== undefined) {
      return formatPacketLossPercent(detailsValue);
    }
  }

  if (
    details &&
    typeof details === 'object' &&
    typeof (details as { error?: string }).error === 'string' &&
    (details as { error: string }).error.length > 0
  ) {
    return 'N/A';
  }

  return undefined;
}

function extractNdtPacketLossFromTcpInfo(
  tcpInfo: Record<string, unknown> | undefined
): number | undefined {
  if (!tcpInfo) {
    return undefined;
  }

  const retrans = firstFiniteNumber(tcpInfo.BytesRetrans, tcpInfo.bytes_retrans);
  const denominator = firstFiniteNumber(
    tcpInfo.BytesSent,
    tcpInfo.BytesAcked,
    tcpInfo.bytes_sent
  );
  if (
    retrans === undefined ||
    denominator === undefined ||
    denominator <= 0
  ) {
    return undefined;
  }

  return (retrans / denominator) * 100;
}

export function normalizeProvider(
  provider: string | undefined
): NormalizedProvider | undefined {
  if (!provider || provider === 'mlab' || provider === 'ndt7') {
    return 'mlab';
  }
  if (provider === 'cloudflare') {
    return 'cloudflare';
  }
  return undefined;
}

export function latestByProvider(
  records: MeasurementRecord[]
): LatestByProvider {
  const result: LatestByProvider = {};
  if (!records?.length) {
    return result;
  }

  const sorted = [...records].sort(
    (a, b) =>
      new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
  );

  for (const record of sorted) {
    const provider = normalizeProvider(record.provider);
    if (provider === 'mlab' && !result.mlab) {
      result.mlab = record;
    }
    if (provider === 'cloudflare' && !result.cloudflare) {
      result.cloudflare = record;
    }
    if (result.mlab && result.cloudflare) {
      break;
    }
  }

  return result;
}

export function extractMeasurementMetadata(
  record: MeasurementRecord | undefined
): MeasurementDisplayMetadata {
  if (!record) {
    return {
      protocolLabel: '---',
      testServer: '---',
      networkOperator: '---',
      packetLoss: undefined,
    };
  }

  const provider = normalizeProvider(record.provider) ?? 'mlab';
  const metrics = extractMeasurementMetrics(record);

  return {
    protocolLabel: getRecordProtocolLabel(record.provider ?? provider),
    testServer: getTestServer(record, provider),
    networkOperator: getNetworkOperator(record),
    packetLoss: metrics.packetLoss,
  };
}

export function extractMeasurementMetrics(
  record: MeasurementRecord | undefined
): MeasurementDisplayMetrics {
  if (!record) {
    return {
      download: undefined,
      upload: undefined,
      latency: undefined,
      packetLoss: undefined,
      timestamp: undefined,
    };
  }

  const provider = normalizeProvider(record.provider) ?? 'mlab';
  const timestamp = record.timestamp ? new Date(record.timestamp) : undefined;

  if (provider === 'cloudflare') {
    return extractCloudflareMetrics(record, timestamp);
  }

  return extractMlabMetrics(record, timestamp);
}

function getTestServer(
  record: MeasurementRecord,
  provider: NormalizedProvider
): string {
  if (provider === 'cloudflare') {
    const server = record.serverInformation;
    if (server?.city) {
      return server.metro
        ? `${server.city}, ${server.metro}`
        : server.city;
    }
    if (server?.label) {
      return server.label;
    }
  }

  const mlab = record.mlabInformation as { label?: string; city?: string } | undefined;
  if (mlab?.label) {
    return mlab.label;
  }
  if (mlab?.city) {
    return mlab.city;
  }

  return '---';
}

function getNetworkOperator(record: MeasurementRecord): string {
  const access = record.accessInformation as { org?: string; isp?: string };
  return access?.org || access?.isp || '---';
}

function extractCloudflareMetrics(
  record: MeasurementRecord,
  timestamp: Date | undefined
): MeasurementDisplayMetrics {
  const results = record.results as CloudflareMeasurementResults;
  const summary = results?.summary ?? {};
  const downloadMbps = summary.download
    ? summary.download / 1048576
    : undefined;
  const uploadMbps = summary.upload ? summary.upload / 1048576 : undefined;
  const latencyMs =
    summary.latency ??
    (summary.downLoadedLatency != null && summary.upLoadedLatency != null
      ? (summary.downLoadedLatency + summary.upLoadedLatency) / 2
      : undefined);

  const packetLoss = extractCloudflarePacketLoss(results);

  return {
    download: downloadMbps,
    upload: uploadMbps,
    latency: latencyMs,
    packetLoss,
    timestamp,
  };
}

function extractMlabMetrics(
  record: MeasurementRecord,
  timestamp: Date | undefined
): MeasurementDisplayMetrics {
  const results = record.results as Record<string, unknown>;
  const s2c = results?.['NDTResult.S2C'] as Record<string, unknown> | undefined;
  const c2s = results?.['NDTResult.C2S'] as Record<string, unknown> | undefined;

  const downloadMbps = (
    s2c?.LastClientMeasurement as { MeanClientMbps?: number } | undefined
  )?.MeanClientMbps;
  const uploadMbps = (
    c2s?.LastClientMeasurement as { MeanClientMbps?: number } | undefined
  )?.MeanClientMbps;

  const s2cRtt = (
    s2c?.LastServerMeasurement as { BBRInfo?: { MinRTT?: number } } | undefined
  )?.BBRInfo?.MinRTT;
  const c2sRtt = (
    c2s?.LastServerMeasurement as { BBRInfo?: { MinRTT?: number } } | undefined
  )?.BBRInfo?.MinRTT;

  let latency: number | undefined;
  if (s2cRtt != null && c2sRtt != null) {
    latency = (s2cRtt + c2sRtt) / 2000;
  }

  const packetLoss = extractNdtPacketLoss(results);

  return {
    download: downloadMbps,
    upload: uploadMbps,
    latency,
    packetLoss,
    timestamp,
  };
}

function extractNdtPacketLoss(results: Record<string, unknown>): string | undefined {
  const tcpRates: number[] = [];

  for (const key of Object.keys(results)) {
    if (!key.startsWith('NDTResult')) {
      continue;
    }
    const block = results[key] as Record<string, unknown> | undefined;
    const appInfo = block?.AppInfo as
      | { ConnectionInfo?: { LossRate?: number } }
      | undefined;
    const lossRate = appInfo?.ConnectionInfo?.LossRate;
    if (lossRate != null && Number.isFinite(lossRate)) {
      return formatPacketLossPercent(lossRate);
    }

    const lastServer = block?.LastServerMeasurement as
      | Record<string, unknown>
      | undefined;
    const tcpInfo = lastServer?.TCPInfo as Record<string, unknown> | undefined;
    const rate = extractNdtPacketLossFromTcpInfo(tcpInfo);
    if (rate !== undefined) {
      tcpRates.push(rate);
    }
  }

  if (!tcpRates.length) {
    return undefined;
  }

  const average =
    tcpRates.reduce((sum, rate) => sum + rate, 0) / tcpRates.length;
  return `${average.toFixed(2)}%`;
}

/** Parsed row for Data tab table (extends raw record with display fields). */
export interface ParsedMeasurementRow extends MeasurementRecord {
  download: number;
  upload: number;
  latency: number;
  protocolLabel: string;
  testServer: string;
  networkOperator: string;
  packetLoss?: string;
}

export function parseMeasurementRows(
  measurements: MeasurementRecord[]
): ParsedMeasurementRow[] {
  const rows: ParsedMeasurementRow[] = [];

  for (const measurement of measurements) {
    const provider = normalizeProvider(measurement.provider);
    if (!provider && !measurement.results) {
      continue;
    }

    const metrics = extractMeasurementMetrics(measurement);
    const meta = extractMeasurementMetadata(measurement);

    rows.push({
      ...measurement,
      download: metrics.download ?? 0,
      upload: metrics.upload ?? 0,
      latency: metrics.latency ?? 0,
      protocolLabel: meta.protocolLabel,
      testServer: meta.testServer,
      networkOperator: meta.networkOperator,
      packetLoss: meta.packetLoss,
    });
  }

  return rows;
}

export type MeasurementSortKey =
  | 'timestamp'
  | 'protocol'
  | 'download'
  | 'upload';

export type SortDirection = 'asc' | 'desc';

export function sortMeasurementRows(
  rows: ParsedMeasurementRow[],
  key: MeasurementSortKey,
  direction: SortDirection
): ParsedMeasurementRow[] {
  const sorted = [...rows];
  const factor = direction === 'asc' ? 1 : -1;

  sorted.sort((a, b) => {
    switch (key) {
      case 'protocol':
        return (
          factor * a.protocolLabel.localeCompare(b.protocolLabel, undefined, {
            sensitivity: 'base',
          })
        );
      case 'download':
        return factor * (a.download - b.download);
      case 'upload':
        return factor * (a.upload - b.upload);
      case 'timestamp':
      default:
        return (
          factor *
          (new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())
        );
    }
  });

  return sorted;
}
