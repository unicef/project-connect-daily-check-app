import { registerPlugin } from '@capacitor/core';

export interface GigaAppPluginType {
  getHistoricalSpeedTestData(): Promise<{ historicalData: any }>;
  getAndroidId(): Promise<{ androidId: string }>;
  getBatteryOptimizationStatus(): Promise<{ status: string }>;
  openBatterySettings(): Promise<void>;
  requestOnboardingBatteryPrompt(): Promise<void>;
}

export const GigaAppPlugin = registerPlugin<GigaAppPluginType>('GigaAppPlugin');
