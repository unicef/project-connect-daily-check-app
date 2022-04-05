import { ElectronCapacitorConfig } from '@capacitor-community/electron';

const config: ElectronCapacitorConfig  = {
  appId: 'io.ionic.starter',
  appName: 'unicef-pdca',
  webDir: 'www',
  bundledWebRuntime: false,
  electron: {
    trayIconAndMenuEnabled: true,
    electronIsDev: true
  }
};

export default config;
