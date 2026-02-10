
import type { CapacitorElectronConfig } from '@capacitor-community/electron';
import {
  getCapacitorElectronConfig,
  setupElectronDeepLinking,
} from '@capacitor-community/electron';
import type { MenuItemConstructorOptions } from 'electron';
import { app, MenuItem, ipcMain, dialog, safeStorage  } from 'electron';
import electronIsDev from 'electron-is-dev';
import unhandled from 'electron-unhandled';
import { autoUpdater } from 'electron-updater';
import fs from 'fs-extra';
import path from 'path';
import * as si from 'systeminformation';
import { createHmac, randomBytes, randomUUID  } from "crypto";

import {
  ElectronCapacitorApp,
  setupContentSecurityPolicy,
  setupReloadWatcher,
  setIsQuiting,
  getIsQuiting,
} from './setup';
import { captureException } from '@sentry/node';
let encryptedToken: Buffer | null = null;
let installUUID: string | null = null;

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

ipcMain.handle("hmac-sign", async (_event, { secretkey, token, nonce }) => {
  // Construct message WITHOUT timestamp
  const msg = [token, nonce].join("|");

  const signature = createHmac("sha256", secretkey)
    .update(msg, "utf8")
    .digest("base64");

  return { signature };
});



// Optional helper if you want Electron to generate nonce centrally
ipcMain.handle("generate-nonce", async () => {
  return randomBytes(32).toString("base64");
});

ipcMain.handle("save-token", async (_event, token: string) => {
  try {
    if (safeStorage.isEncryptionAvailable()) {
      encryptedToken = safeStorage.encryptString(token);
      console.log('Encrypted & saved token:', encryptedToken.toString("base64"));
      return true; 
    } else {
      console.warn("Encryption not available on this platform.");
      return false;
    }
  } catch (e) {
    console.error('Error while saving token:', e);
    return false;
  }
});


ipcMain.handle("get-token", async () => {
  try {
    if (encryptedToken && safeStorage.isEncryptionAvailable()) {
      return safeStorage.decryptString(encryptedToken);
    }
  }

  catch (error) {
    console.log('envruptoon failed', error)

  }
  return null;
});

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
    installUUID = getOrCreateInstallUUID(); 

    // Get and log system hardware ID
    try {
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
        mainWindow.webContents.once('did-finish-load', () => {
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
          mainWindow.webContents.send('system-hardware-id', hardwareData);
          console.log('✅ Hardware ID sent to renderer process');
        });
      }
    } catch (error) {
      console.error('Error getting system hardware ID:', error);
      captureException(error);
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

  
  autoUpdater.on('update-downloaded', (_event: any, releaseNotes: any, releaseName: any) => {
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


function getOrCreateInstallUUID(): string {
  const filePath = path.join(app.getPath('userData'), 'install-uuid');

  if (fs.existsSync(filePath)) {
    return fs.readFileSync(filePath, 'utf8');
  }

  const uuid = randomUUID();
  fs.writeFileSync(filePath, uuid);
  return uuid;
}
// Place all ipc or other electron api calls and custom functionality under this line

ipcMain.addListener('closeFromUi', (ev) => {
  myCapacitorApp.getMainWindow().hide();
});

ipcMain.handle('get-install-uuid', async () => {
  if (!installUUID) {
    installUUID = getOrCreateInstallUUID();
  }
  return installUUID;
});

// IPC handler to get hardware ID from renderer process
ipcMain.handle('get-hardware-id', async () => {
  try {
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

    console.log('📤 Hardware ID requested via IPC');
    return hardwareData;
  } catch (error) {
    console.error('Error getting hardware ID via IPC:', error);
    captureException(error);
    return { error: 'Failed to get hardware ID' };
  }
});
