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
import { spawn, ChildProcessWithoutNullStreams } from 'child_process';

import {
  ElectronCapacitorApp,
  setupContentSecurityPolicy,
  setupReloadWatcher,
  setIsQuiting,
  getIsQuiting,
} from './setup';
import { captureException } from '@sentry/node';

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
  autoUpdater.autoDownload = true;

  setInterval(() => {
    autoUpdater.checkForUpdates();
  }, 3600000);

  autoUpdater.on('update-downloaded', (_event, releaseNotes, releaseName) => {
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
  });
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
  myCapacitorApp.cleanup();
});

// Place all ipc or other electron api calls and custom functionality under this line

ipcMain.addListener('closeFromUi', (ev) => {
  myCapacitorApp.getMainWindow().hide();
});

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

// IPC handler to get WiFi connections from renderer process
ipcMain.handle('get-wifi-connections', async () => {
  try {
    console.log('📤 [Electron] WiFi connections requested via IPC');
    const wifiConnections = await si.wifiConnections();

    console.log(
      '✅ [Electron] WiFi connections returned via IPC:',
      wifiConnections
    );
    return { wifiConnections };
  } catch (error) {
    console.error(
      '❌ [Electron] Error getting WiFi connections via IPC:',
      error
    );
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

// === Traceroute (experimental) ===
// Only one trace runs at a time. Streams parsed hops to renderer.
let activeTraceProcess: ChildProcessWithoutNullStreams | null = null;

const HOSTNAME_OR_IP = /^[A-Za-z0-9.:\-]{1,253}$/;

interface ParsedHop {
  hop: number;
  host: string | null;
  ip: string | null;
  rtts: (number | null)[];
  raw: string;
}

function parseTracertLineWin(line: string): ParsedHop | null {
  // tracert line e.g. "  1     1 ms     1 ms     1 ms  192.168.1.1"
  // or                "  3     *        *        *     Request timed out."
  // or                "  4    20 ms    18 ms    19 ms  router.isp.net [1.2.3.4]"
  const m = line.match(/^\s*(\d+)\s+(.*)$/);
  if (!m) return null;
  const hop = parseInt(m[1], 10);
  const rest = m[2];
  const rtts: (number | null)[] = [];
  let remainder = rest;
  for (let i = 0; i < 3; i++) {
    const tm = remainder.match(/^\s*(<?\d+)\s*ms\s+/);
    const star = remainder.match(/^\s*\*\s+/);
    if (tm) {
      const val = tm[1].startsWith('<') ? parseFloat(tm[1].slice(1)) : parseFloat(tm[1]);
      rtts.push(val);
      remainder = remainder.slice(tm[0].length);
    } else if (star) {
      rtts.push(null);
      remainder = remainder.slice(star[0].length);
    } else {
      return null;
    }
  }
  remainder = remainder.trim();
  let host: string | null = null;
  let ip: string | null = null;
  if (/^Request timed out\.?$/i.test(remainder) || remainder === '') {
    // all stars
  } else {
    const bracketed = remainder.match(/^(.*?)\s*\[([0-9a-fA-F:.]+)\]\s*$/);
    if (bracketed) {
      host = bracketed[1].trim() || null;
      ip = bracketed[2];
    } else {
      // Bare IP (tracert -d) or bare hostname
      if (/^[0-9a-fA-F:.]+$/.test(remainder)) {
        ip = remainder;
      } else {
        host = remainder;
      }
    }
  }
  return { hop, host, ip, rtts, raw: line };
}

function parseTracerouteLineUnix(line: string): ParsedHop | null {
  // traceroute line e.g. " 1  192.168.1.1 (192.168.1.1)  1.234 ms  1.123 ms  1.045 ms"
  // or                   " 3  * * *"
  // or with mixed:       " 5  host.example (1.2.3.4)  10.1 ms * 11.2 ms"
  const m = line.match(/^\s*(\d+)\s+(.*)$/);
  if (!m) return null;
  const hop = parseInt(m[1], 10);
  const rest = m[2].trim();
  if (/^\*(\s+\*)*\s*$/.test(rest)) {
    return { hop, host: null, ip: null, rtts: [null, null, null], raw: line };
  }
  // First token is host or IP, optionally followed by (ip)
  const headMatch = rest.match(/^(\S+)\s*(?:\(([^)]+)\))?\s*(.*)$/);
  if (!headMatch) return null;
  const firstTok = headMatch[1];
  const parenIp = headMatch[2] || null;
  const tail = headMatch[3] || '';
  let host: string | null = null;
  let ip: string | null = null;
  if (parenIp) {
    ip = parenIp;
    host = firstTok === parenIp ? null : firstTok;
  } else if (/^[0-9a-fA-F:.]+$/.test(firstTok)) {
    ip = firstTok;
  } else {
    host = firstTok;
  }
  const rtts: (number | null)[] = [];
  const rttRegex = /(\*|(\d+\.?\d*)\s*ms)/g;
  let rm: RegExpExecArray | null;
  while ((rm = rttRegex.exec(tail)) && rtts.length < 3) {
    if (rm[1] === '*') rtts.push(null);
    else rtts.push(parseFloat(rm[2]));
  }
  while (rtts.length < 3) rtts.push(null);
  return { hop, host, ip, rtts, raw: line };
}

function killActiveTrace() {
  if (activeTraceProcess && !activeTraceProcess.killed) {
    try {
      activeTraceProcess.kill('SIGTERM');
    } catch (e) {
      console.warn('Failed to kill trace process:', e);
    }
  }
  activeTraceProcess = null;
}

ipcMain.handle('run-traceroute', async (event, payload: { target?: string }) => {
  const target = (payload?.target || '').trim();
  if (!HOSTNAME_OR_IP.test(target)) {
    return { ok: false, error: 'Invalid target. Use a hostname or IP address.' };
  }
  killActiveTrace();
  const isWin = process.platform === 'win32';
  const cmd = isWin ? 'tracert' : 'traceroute';
  const args = isWin ? ['-d', target] : ['-n', target];
  // -d (Win) / -n (Unix): skip rDNS in the OS tool — we'll show IPs straight from the tool.
  // Hostnames still appear when the tool can't suppress them on some configs.
  let child: ChildProcessWithoutNullStreams;
  try {
    child = spawn(cmd, args, { shell: false });
  } catch (err: any) {
    return { ok: false, error: `Failed to start ${cmd}: ${err?.message || err}` };
  }
  activeTraceProcess = child;
  const sender = event.sender;
  sender.send('traceroute-started', { target, cmd, args });

  let stdoutBuf = '';
  const parseLine = isWin ? parseTracertLineWin : parseTracerouteLineUnix;

  const handleChunk = (chunk: Buffer) => {
    stdoutBuf += chunk.toString();
    const lines = stdoutBuf.split(/\r?\n/);
    stdoutBuf = lines.pop() || '';
    for (const line of lines) {
      if (!line.trim()) continue;
      const hop = parseLine(line);
      if (hop) {
        sender.send('traceroute-hop', hop);
      } else {
        sender.send('traceroute-info', { line });
      }
    }
  };

  child.stdout.on('data', handleChunk);
  child.stderr.on('data', (chunk) => {
    sender.send('traceroute-info', { line: chunk.toString().trim(), stderr: true });
  });
  child.on('error', (err) => {
    sender.send('traceroute-error', { message: err.message });
    if (activeTraceProcess === child) activeTraceProcess = null;
  });
  child.on('close', (code, signal) => {
    if (stdoutBuf.trim()) {
      const hop = parseLine(stdoutBuf);
      if (hop) sender.send('traceroute-hop', hop);
      stdoutBuf = '';
    }
    sender.send('traceroute-done', { code, signal });
    if (activeTraceProcess === child) activeTraceProcess = null;
  });
  return { ok: true };
});

ipcMain.handle('cancel-traceroute', async () => {
  killActiveTrace();
  return { ok: true };
});
