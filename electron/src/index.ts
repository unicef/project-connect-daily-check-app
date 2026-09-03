import type { CapacitorElectronConfig } from '@capacitor-community/electron';
import {
  getCapacitorElectronConfig,
  setupElectronDeepLinking,
} from '@capacitor-community/electron';
import type { MenuItemConstructorOptions } from 'electron';
import { app, MenuItem, ipcMain, dialog } from 'electron';
import electronIsDev from 'electron-is-dev';
import unhandled from 'electron-unhandled';
import { autoUpdater } from 'electron-updater';
import fs from 'fs-extra';
import path from 'path';
import os from 'os';
import * as si from 'systeminformation';

import {
  ElectronCapacitorApp,
  setupContentSecurityPolicy,
  setupReloadWatcher,
  setIsQuiting,
  getIsQuiting,
} from './setup';
import { captureException } from '@sentry/node';
import {
  AUTO_UPDATE_ENABLED,
  BUILD_COMMIT,
  BUILD_MODE,
  SDK_VERSIONS,
} from './build-mode';
import {
  classifyWifiUnavailable,
  getDeviceNetworkInformation,
  getSsidFromNlm,
} from './device-context';

// Set userData path to use name instead of productName - must be set before app is ready
const userDataPath = path.join(app.getPath('appData'), 'unicef-pdca');
app.setPath('userData', userDataPath);

const gotTheLock = app.requestSingleInstanceLock();
// Graceful handling of unhandled errors.
unhandled({
  logger: (e) => {
    console.error(e);
    captureException(e);
    console.log('there is an error occurs');
  },
  showDialog: false,
  reportButton: (error) => {
    console.log('Report Button Initialized');
    captureException(error);
  },
});

let mainWindow = null;
let isDownloaded = false;

/**
 * Sends a telemetry event to the renderer, which publishes it to PostHog.
 *
 * The renderer SDK (posthog-js) persists its queue in localStorage and survives
 * restarts; `posthog-node` in the main process does not, and these machines
 * spend hours without network. That is why the main process does not talk to
 * PostHog directly: only the auto-update lifecycle, which is the one thing
 * neither the renderer nor the backend sees (a machine that fails to update
 * stops sending measurements and disappears from adoption queries).
 *
 * If the window is not alive the event is lost, and that is acceptable: update
 * failures already go to Sentry separately.
 */
function sendTelemetry(event: string, properties: Record<string, any> = {}) {
  try {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    if (!mainWindow.webContents || mainWindow.webContents.isDestroyed()) return;
    mainWindow.webContents.send('telemetry-event', { event, properties });
  } catch (error) {
    console.warn('[telemetry] send failed:', error);
  }
}

// Define our menu templates (these are optional)
const trayMenuTemplate: (MenuItemConstructorOptions | MenuItem)[] = [
  new MenuItem({
    label: 'Open',
    click: function () {
      myCapacitorApp.getMainWindow().show();
    },
  }),
  new MenuItem({
    label: 'Quit App',
    click: function () {
      setIsQuiting(true);
      myCapacitorApp.cleanup();
      app.quit();
    },
  }),
];
const appMenuBarMenuTemplate: (MenuItemConstructorOptions | MenuItem)[] = [
  { role: process.platform === 'darwin' ? 'appMenu' : 'fileMenu' },
  { role: 'viewMenu' },
];

// Get Config options from capacitor.config
const capacitorFileConfig: CapacitorElectronConfig =
  getCapacitorElectronConfig();

// Initialize our app. You can pass menu templates into the app here.
// const myCapacitorApp = new ElectronCapacitorApp(capacitorFileConfig);
const myCapacitorApp = new ElectronCapacitorApp(
  capacitorFileConfig,
  trayMenuTemplate,
  appMenuBarMenuTemplate
);

// If deeplinking is enabled then we will set it up here.
if (capacitorFileConfig.electron?.deepLinkingEnabled) {
  setupElectronDeepLinking(myCapacitorApp, {
    customProtocol:
      capacitorFileConfig.electron.deepLinkingCustomProtocol ??
      'mycapacitorapp',
  });
}

// If we are in Dev mode, use the file watcher components.
if (electronIsDev) {
  setupReloadWatcher(myCapacitorApp);
}

// Run Application
if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    // Someone tried to run a second instance, we should focus our window.
    if (mainWindow) {
      if (mainWindow.isMinimized()) {
        mainWindow.restore();
      } else {
        mainWindow.show();
      }
      mainWindow.focus();
      if (getIsQuiting()) {
        // mainWindow.close();
        app.quit();
      }
    }
  });
  // Wait for electron app to be ready.
  app.whenReady().then(async () => {
    mainWindow = await myCapacitorApp.init();

    // Get and log system hardware ID
    try {
      console.log('🔍 [Electron] Retrieving system hardware ID...');
      const systemData = await si.system();
      const osData = await si.osInfo();

      console.log('=== SYSTEM HARDWARE ID ===');
      console.log('System UUID:', systemData.uuid);
      console.log('System Serial:', systemData.serial);
      console.log('System SKU:', systemData.sku);
      console.log('Manufacturer:', systemData.manufacturer);
      console.log('Model:', systemData.model);
      console.log('OS Serial:', osData.serial);
      console.log('=========================');

      // Primary Hardware ID (most reliable across Windows users)
      const hardwareId =
        systemData.uuid || systemData.serial || 'NO_UUID_AVAILABLE';
      console.log('\n🔑 PRIMARY HARDWARE ID (use this):', hardwareId);

      // hardwareId travels only as diagnostic metadata, never as an analytics
      // identity: the distinct_id and the school group are set by the renderer,
      // which is the side that talks to PostHog.
      sendTelemetry('app_launched', {
        manufacturer: systemData.manufacturer,
        model: systemData.model,
        os: osData.distro,
        hardware_id: hardwareId,
      });

      // Send hardware ID to renderer process when ready
      if (mainWindow && mainWindow.webContents) {
        const hardwareData = {
          hardwareId,
          uuid: systemData.uuid,
          serial: systemData.serial,
          sku: systemData.sku,
          manufacturer: systemData.manufacturer,
          model: systemData.model,
          osSerial: osData.serial,
          timestamp: new Date().toISOString(),
        };

        // Try to send immediately if already loaded
        if (mainWindow.webContents.isLoading()) {
          mainWindow.webContents.once('did-finish-load', () => {
            mainWindow.webContents.send('system-hardware-id', hardwareData);
            console.log(
              '✅ [Electron] Hardware ID sent to renderer (after load)'
            );
          });
        } else {
          // Already loaded, send immediately
          mainWindow.webContents.send('system-hardware-id', hardwareData);
          console.log('✅ [Electron] Hardware ID sent to renderer (immediate)');
        }
      }
    } catch (error) {
      console.error('❌ [Electron] Error getting system hardware ID:', error);
      captureException(error);

      // Send error event to renderer
      if (mainWindow && mainWindow.webContents) {
        const errorData = {
          error: 'Failed to retrieve hardware ID',
          message: error.message || 'Unknown error',
          timestamp: new Date().toISOString(),
        };

        if (mainWindow.webContents.isLoading()) {
          mainWindow.webContents.once('did-finish-load', () => {
            mainWindow.webContents.send('system-hardware-id-error', errorData);
            console.log(
              '❌ [Electron] Hardware ID error sent to renderer (after load)'
            );
          });
        } else {
          mainWindow.webContents.send('system-hardware-id-error', errorData);
          console.log(
            '❌ [Electron] Hardware ID error sent to renderer (immediate)'
          );
        }
      }
    }
  });
  /*
      app.on('ready', () => {
        updateApp = require('update-electron-app');
      
        updateApp({          
            updateInterval: '5 minute',
            notifyUser: true
        });      
      });
  
      */
  // Auto-update is only wired up for production builds. In `stg`/`dev` builds
  // (see electron/scripts/generate-build-mode.js) we skip the updater entirely
  // so test/staging installs never try to download or install releases.
  if (!AUTO_UPDATE_ENABLED) {
    console.log(
      `[auto-update] disabled for build mode "${BUILD_MODE}" — skipping updater setup`
    );
  } else {
  autoUpdater.autoDownload = true;

  setInterval(() => {
    autoUpdater.checkForUpdates();
  }, 3600000);

  autoUpdater.on('update-downloaded', (_event, releaseNotes, releaseName) => {
    sendTelemetry('desktop_update_downloaded', { release_name: releaseName });
    const dialogOpts = {
      type: 'info' as const,
      buttons: ['Restart / Reinicie. / Перезапуск', 'Later / Después / Позже'],
      title: 'Giga Meter Update',
      message: process.platform === 'win32' ? releaseNotes : releaseName,
      detail: `A new version of UNICEF's Giga Meter has been downloaded. Restart the application to apply the updates.\n\nUna nueva version de la aplicación Giga Meter de UNICEF ha sido descargada. Reinicie la aplicación para aplicar los cambios.\n\nНовая версия приложения Giga Meter  загружена . Перезапустите приложение, чтобы применить обновления.`,
    };
    /*
    if (isDownloaded === false) {
      dialog.showMessageBox(dialogOpts).then((returnValue) => {
        isDownloaded = true;
        if (returnValue.response === 0) autoUpdater.quitAndInstall(true, true)
      })
    }
    */
    if (!isDownloaded) {
      isDownloaded = true;
      try {
        // autoUpdater.quitAndInstall(true, true)

        //for auto update comment the below codes, and uncomment the above line of code

        const dialogOpts = {
          type: 'info' as const,
          buttons: [
            'Restart / Reinicie. / Перезапуск',
            'Later / Después / Позже',
          ],
          title: 'Giga Meter Update',
          message: process.platform === 'win32' ? releaseNotes : releaseName,
          detail: `A new version of UNICEF's Giga Meter  has been downloaded. Restart the application to apply the updates.\n\nUna nueva version de la aplicación Giga Meter de UNICEF ha sido descargada. Reinicie la aplicación para aplicar los cambios.\n\nНовая версия приложения Giga Meter  загружена . Перезапустите приложение, чтобы применить обновления.`,
        };
        dialog.showMessageBox(dialogOpts).then((returnValue) => {
          if (returnValue.response === 0)
            autoUpdater.quitAndInstall(false, true);
        });

        //throw new Error("opps there is unexpected error")
      } catch (error) {
        console.error('Error during update installation:', error);
        captureException(error);
        const dialogOpts = {
          type: 'info' as const,
          buttons: [
            'Restart / Reinicie. / Перезапуск',
            'Later / Después / Позже',
          ],
          title: 'Giga Meter Update',
          message: process.platform === 'win32' ? releaseNotes : releaseName,
          detail: `A new version of UNICEF's Giga Meter  has been downloaded. Restart the application to apply the updates.\n\nUna nueva version de la aplicación Giga Meter de UNICEF  ha sido descargada. Reinicie la aplicación para aplicar los cambios.\n\nНовая версия приложения Giga Meter  загружена . Перезапустите приложение, чтобы применить обновления.`,
        };
        dialog.showMessageBox(dialogOpts).then((returnValue) => {
          if (returnValue.response === 0)
            autoUpdater.quitAndInstall(false, true);
        });
      }
    }
  });
  autoUpdater.on('error', (error) => {
    console.error('Update Error:', error);
    captureException(error);
    sendTelemetry('desktop_update_failed', {
      message: error?.message ?? null,
    });
  });
  }
  /*
    autoUpdater.on('error', (error) => {
      console.error('Update Error:', error);
    
      const dialogOpts = {
        type: 'info',
        buttons: ['Restart / Reinicie / Перезапустить', 'Later / Después / Позже'],
        title: 'PCDC Update',
       
        message:  `A new version of PCDC has been downloaded. Restart the application to apply the updates.\n\nUna nueva version de PCDC ha sido descargada. Reinicie la aplicación para aplicar los cambios.\n\nБыла загружена новая версия PCDC. Перезапустите приложение, чтобы применить обновления.`
      };
      dialog.showMessageBox(dialogOpts).then((returnValue) => {
        if (returnValue.response === 0) autoUpdater.quitAndInstall(false, true)
      })
  
    });
  
  */

  // Security - Set Content-Security-Policy based on whether or not we are in dev mode.
  // setupContentSecurityPolicy(myCapacitorApp.getCustomURLScheme());
  // Initialize our app, build windows, and load content.
  // await myCapacitorApp.init();
  // Check for updates if we are in a packaged app.
  // autoUpdater.checkForUpdatesAndNotify();
}
// Handle when all of our windows are close (platforms have their own expectations).
app.on('window-all-closed', function () {
  // On OS X it is common for applications and their menu bar
  // to stay active until the user quits explicitly with Cmd + Q
  if (process.platform !== 'darwin') {
    setIsQuiting(true);
    myCapacitorApp.cleanup(); // Cleanup resources before quitting
    app.quit();
  }
});

// When the dock icon is clicked.
app.on('activate', async function () {
  // On OS X it's common to re-create a window in the app when the
  // dock icon is clicked and there are no other windows open.
  const mainWindow = myCapacitorApp.getMainWindow();
  if (mainWindow && mainWindow.isDestroyed()) {
    await myCapacitorApp.init();
  } else if (mainWindow) {
    // Just show the existing window instead of recreating everything
    mainWindow.show();
    mainWindow.focus();
  }
});

// Handle app quitting to cleanup resources
app.on('before-quit', () => {
  setIsQuiting(true);
  // Before cleanup(): sendTelemetry needs the window alive. posthog-js
  // persists its queue in localStorage, so if the process dies before sending
  // it, the event goes out on the next launch.
  sendTelemetry('app_quit');
  myCapacitorApp.cleanup();
});

// Place all ipc or other electron api calls and custom functionality under this line

ipcMain.addListener('closeFromUi', (ev) => {
  myCapacitorApp.getMainWindow().hide();
});

// Receive the renderer's PostHog identity (anonymous distinct_id + school
// GigaID) so main-process analytics share the same person and school group.
// IPC handler to get Windows username from renderer process
ipcMain.handle('get-windows-username', async () => {
  try {
    console.log('📤 [Electron] Windows username requested via IPC');
    const userInfo = os.userInfo();
    const username = userInfo.username;

    console.log('✅ [Electron] Windows username returned via IPC:', username);
    return { username };
  } catch (error) {
    console.error(
      '❌ [Electron] Error getting Windows username via IPC:',
      error
    );
    captureException(error);
    return { error: error.message };
  }
});

// IPC handler to get application installed path from renderer process
ipcMain.handle('get-installed-path', async () => {
  try {
    console.log('📤 [Electron] Installed path requested via IPC');
    const installedPath = app.getAppPath();

    console.log(
      '✅ [Electron] Installed path returned via IPC:',
      installedPath
    );
    return { installedPath };
  } catch (error) {
    console.error('❌ [Electron] Error getting installed path via IPC:', error);
    captureException(error);
    return { error: error.message };
  }
});

// IPC handler to get WiFi connections from renderer process.
//
// On Windows 11 24H2+ `netsh wlan` — which systeminformation wraps — returns
// nothing while the Location services toggle is off, so this comes back EMPTY on a
// machine that is connected over Wi-Fi. When that happens the
// handler says why, and recovers the SSID through the ungated NLM profile so the
// row is not left with no network name at all. Both extra calls only run on the
// empty path, so a healthy machine pays nothing for them.
ipcMain.handle('get-wifi-connections', async () => {
  try {
    console.log('📤 [Electron] WiFi connections requested via IPC');
    const wifiConnections = await si.wifiConnections();

    if (Array.isArray(wifiConnections) && wifiConnections.length > 0) {
      console.log(
        '✅ [Electron] WiFi connections returned via IPC:',
        wifiConnections
      );
      return { wifiConnections, ssidSource: 'wlan' };
    }

    const wifiUnavailableReason = await classifyWifiUnavailable();
    const fallbackSsid = await getSsidFromNlm();
    console.warn(
      `⚠️ [Electron] WiFi connections empty (${wifiUnavailableReason}); ` +
        `NLM SSID fallback: ${fallbackSsid ?? 'none'}`
    );

    return {
      wifiConnections,
      wifiUnavailableReason,
      // Only claim the NLM source when it actually produced a name.
      ssidSource: fallbackSsid ? 'nlm' : undefined,
      fallbackSsid,
    };
  } catch (error) {
    console.error(
      '❌ [Electron] Error getting WiFi connections via IPC:',
      error
    );
    captureException(error);
    return { error: error.message };
  }
});

// IPC handler for the volatile network/system context stored alongside the
// measurement. Never throws: a machine where PowerShell or
// the registry is locked down returns whatever fields it could read.
ipcMain.handle('get-device-network-information', async () => {
  try {
    console.log('📤 [Electron] Device network information requested via IPC');
    const deviceNetworkInformation = await getDeviceNetworkInformation();

    console.log(
      '✅ [Electron] Device network information returned via IPC:',
      deviceNetworkInformation
    );
    return { deviceNetworkInformation };
  } catch (error) {
    console.error(
      '❌ [Electron] Error getting device network information via IPC:',
      error
    );
    captureException(error);
    return { error: error.message };
  }
});

// IPC handler for the device identity columns the backend already accepts
// (device_name / device_model / device_manufacturer) plus the build number.
// These barely move, so systeminformation is only asked once per app run.
let cachedDeviceIdentity: {
  deviceName: string;
  deviceModel: string;
  deviceManufacturer: string;
  appBuildNumber: string;
  sdkVersions: { mlab: string | null; cloudflare: string | null };
} | null = null;

ipcMain.handle('get-device-identity', async () => {
  try {
    if (cachedDeviceIdentity) {
      return cachedDeviceIdentity;
    }
    console.log('📤 [Electron] Device identity requested via IPC');
    const systemData = await si.system();

    cachedDeviceIdentity = {
      deviceName: os.hostname(),
      deviceModel: systemData.model,
      deviceManufacturer: systemData.manufacturer,
      // The commit the build came from; falls back to the app version when the
      // build ran outside a git checkout (see generate-build-mode.js).
      appBuildNumber: BUILD_COMMIT ?? app.getVersion(),
      // Both are shipped; the renderer picks the one matching the protocol that
      // actually ran, which it only knows after the test.
      sdkVersions: SDK_VERSIONS,
    };

    console.log(
      '✅ [Electron] Device identity returned via IPC:',
      cachedDeviceIdentity
    );
    return cachedDeviceIdentity;
  } catch (error) {
    console.error('❌ [Electron] Error getting device identity via IPC:', error);
    captureException(error);
    return { error: error.message };
  }
});

// IPC handler to get hardware ID from renderer process
ipcMain.handle('get-hardware-id', async () => {
  try {
    console.log('📤 [Electron] Hardware ID requested via IPC');
    const systemData = await si.system();
    const osData = await si.osInfo();
    const hardwareId =
      systemData.uuid || systemData.serial || 'NO_UUID_AVAILABLE';

    const hardwareData = {
      hardwareId,
      uuid: systemData.uuid,
      serial: systemData.serial,
      sku: systemData.sku,
      manufacturer: systemData.manufacturer,
      model: systemData.model,
      osSerial: osData.serial,
      timestamp: new Date().toISOString(),
    };

    console.log('✅ [Electron] Hardware ID returned via IPC:', hardwareId);
    return hardwareData;
  } catch (error) {
    console.error('❌ [Electron] Error getting hardware ID via IPC:', error);
    captureException(error);
    return {
      error: 'Failed to get hardware ID',
      message: error.message || 'Unknown error',
      timestamp: new Date().toISOString(),
    };
  }
});
