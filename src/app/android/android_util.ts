import { Capacitor } from '@capacitor/core';
import { Device } from '@capacitor/device';

export async function isAndroid(): Promise<boolean> {
  if (!(Capacitor.getPlatform() === 'android')) return false;

  const info = await Device.getInfo();
  return info.platform === 'android';
}
