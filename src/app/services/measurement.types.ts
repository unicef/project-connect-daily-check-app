export interface MeasurementRecord {
  timestamp: number;
  results: any;
  snapLog?: {
    s2cRate: number[];
    c2sRate: number[];
  };
  uploaded: boolean;
  mlabInformation: any;
  accessInformation: any;
  uuid: string;
  version: number | string;
  Notes: string;
  dataUsage: any;
  provider?: 'cloudflare' | 'ndt7';
}
