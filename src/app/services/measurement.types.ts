export type MeasurementProviderId = 'mlab' | 'cloudflare';

export type MeasurementRunStatus = 'success' | 'failure';

export interface MeasurementRunOutcome {
  provider: MeasurementProviderId;
  status: MeasurementRunStatus;
  error?: string;
}

export interface CloudflareDataUsage {
  download?: number;
  upload?: number;
  total?: number;
}

export interface CloudflareAccessInformation {
  ip?: string;
  hostname?: string;
  city?: string;
  region?: string;
  country?: string;
  loc?: string;
  org?: string;
  postal?: string;
  timezone?: string;
  asn?: string;
}

export interface CloudflareServerInformation {
  city?: string;
  site?: string;
  country?: string;
  label?: string;
  metro?: string;
}

export interface CloudflareMeasurementSummary {
  download?: number;
  upload?: number;
  latency?: number;
  jitter?: number;
  downLoadedLatency?: number;
  downLoadedJitter?: number;
  upLoadedLatency?: number;
  upLoadedJitter?: number;
  packetLoss?: number;
}

export interface CloudflareLatencySeries {
  latency?: number;
  jitter?: number;
  latencyPoints?: number[];
}

export interface CloudflareBandwidth {
  download?: number;
  upload?: number;
}

export interface CloudflarePacketLossDetails {
  error?: string;
  [key: string]: unknown;
}

export interface CloudflarePacketLoss {
  value?: number;
  details?: CloudflarePacketLossDetails;
}

export interface CloudflareScoreEntry {
  points?: number;
  classificationIdx?: number;
  classificationName?: string;
}

export interface CloudflareScores {
  streaming?: CloudflareScoreEntry;
  gaming?: CloudflareScoreEntry;
  rtc?: CloudflareScoreEntry;
}

export interface CloudflareBandwidthPoint {
  bytes?: number;
  bps?: number;
  duration?: number;
  timestamp?: number;
  transferSize?: number;
}

export interface CloudflareMeasurementResults {
  isFinished?: boolean;
  summary?: CloudflareMeasurementSummary;
  unloadedLatency?: CloudflareLatencySeries;
  downloadedLatency?: CloudflareLatencySeries;
  uploadedLatency?: CloudflareLatencySeries;
  bandwidth?: CloudflareBandwidth;
  bandwidthPoints?: {
    download?: CloudflareBandwidthPoint[];
    upload?: CloudflareBandwidthPoint[];
  };
  packetLoss?: CloudflarePacketLoss;
  scores?: CloudflareScores;
}

export interface CloudflareMeasurementUploadPayload {
  uuid: string;
  version?: number | string;
  provider?: string;
  notes?: string;
  timestamp: number;
  appVersion: string;
  dataUsage?: CloudflareDataUsage;
  accessInformation?: CloudflareAccessInformation;
  serverInformation?: CloudflareServerInformation;
  results?: CloudflareMeasurementResults;
  browserID: string;
  deviceType: string;
  schoolID: string;
  gigaIDSchool: string;
  ipAddress: string;
  countryCode: string;
  device_hardware_id?: string | null;
  windows_username?: string | null;
  installed_path?: string | null;
  wifi_connections?: unknown;
}

export interface MeasurementRecord {
  timestamp: number;
  results: CloudflareMeasurementResults | Record<string, unknown>;
  snapLog?: {
    s2cRate: number[];
    c2sRate: number[];
  };
  uploaded: boolean;
  synced?: boolean;
  index?: number;
  mlabInformation?: Record<string, unknown>;
  serverInformation?: CloudflareServerInformation;
  accessInformation: CloudflareAccessInformation | Record<string, unknown>;
  uuid: string;
  version: number | string;
  Notes: string;
  dataUsage: CloudflareDataUsage | Record<string, unknown>;
  provider?: 'cloudflare' | 'mlab' | 'ndt7';
  windowsUsername?: string;
  installedPath?: string;
  wifiConnections?: unknown;
}
