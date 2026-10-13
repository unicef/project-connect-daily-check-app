import { registerPlugin } from '@capacitor/core';

export interface NativePingResult {
  timestamp: string;
  isConnected: boolean;
  latency?: number;
  errorMessage?: string;
}

export interface GigaAppPluginType {
  getLatestPingResult(): Promise<{ result?: NativePingResult }>;
  runPingCheck(): Promise<{ result?: NativePingResult }>;
  getHistoricalSpeedTestData(): Promise<{ historicalData: any }>;
  getAndroidId(): Promise<{ androidId: string }>;
  getBatteryOptimizationStatus(): Promise<{ status: string }>;
  openBatterySettings(): Promise<void>;
  requestOnboardingBatteryPrompt(): Promise<void>;
}

export const GigaAppPlugin = registerPlugin<GigaAppPluginType>('GigaAppPlugin');
