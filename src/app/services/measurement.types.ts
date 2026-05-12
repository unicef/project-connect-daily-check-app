export type MeasurementProviderId = 'mlab' | 'cloudflare';

export type MeasurementRunStatus = 'success' | 'failure';

export interface MeasurementRunOutcome {
  provider: MeasurementProviderId;
  status: MeasurementRunStatus;
  error?: string;
}

export interface MeasurementRecord {
  timestamp: number;
  results: any;
  snapLog?: {
    s2cRate: number[];
    c2sRate: number[];
  };
  uploaded: boolean;
  synced?: boolean;
  index?: number;
  mlabInformation?: any;
  serverInformation?: any;
  accessInformation: any;
  uuid: string;
  version: number | string;
  Notes: string;
  dataUsage: any;
  provider?: 'cloudflare' | 'ndt7';
  windowsUsername?: string;
  installedPath?: string;
  wifiConnections?: any;
}
