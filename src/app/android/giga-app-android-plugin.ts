import { registerPlugin } from '@capacitor/core';

export interface GigaAppPluginType {
  getHistoricalSpeedTestData(): Promise<{ historicalData: any }>;
  getAndroidId(): Promise<{ androidId: string }>;
}

export const GigaAppPlugin = registerPlugin<GigaAppPluginType>('GigaAppPlugin');
