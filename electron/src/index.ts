import type { CapacitorElectronConfig } from '@capacitor-community/electron';
import { getCapacitorElectronConfig, setupElectronDeepLinking } from '@capacitor-community/electron';
import type { MenuItemConstructorOptions } from 'electron';
import { app, MenuItem, ipcMain, dialog } from 'electron';
import electronIsDev from 'electron-is-dev';
import unhandled from 'electron-unhandled';
import { autoUpdater } from 'electron-updater';
import fs from 'fs-extra';
import * as Sentry from "@sentry/electron";

import { ElectronCapacitorApp, setupContentSecurityPolicy, setupReloadWatcher } from './setup';
const gotTheLock = app.requestSingleInstanceLock();
// Graceful handling of unhandled errors.
unhandled({
  logger: () => {
    console.error();
    console.log("there is an error occurs")
  },
  showDialog: false,
  reportButton: (error) => {
    console.log('Report Button Initialized');
  }
});

Sentry.init({ dsn: "https://9a70105db9fb49e3ab0a9bdbd585ce8a@o4504957350445056.ingest.sentry.io/4504957357981696" });


//New ICTD Sentry
//Sentry.init({dsn: 'https://e52e97fc558344bc80a218fc22a9a6a9@excubo.unicef.io/47'});

let isQuiting = false;
let mainWindow = null;
let isDownloaded = false;

// Define our menu templates (these are optional)
const trayMenuTemplate: (MenuItemConstructorOptions | MenuItem)[] = [
  new MenuItem({
    label: 'Open', click: function () {
      myCapacitorApp.getMainWindow().show();
    }
  }),
  new MenuItem({
    label: 'Quit App', click: function () {
      isQuiting = true;
      // myCapacitorApp.getMainWindow().close();
      app.quit();
    }
  })
];
const appMenuBarMenuTemplate: (MenuItemConstructorOptions | MenuItem)[] = [
  { role: process.platform === 'darwin' ? 'appMenu' : 'fileMenu' },
  { role: 'viewMenu' },
];

// Get Config options from capacitor.config
const capacitorFileConfig: CapacitorElectronConfig = getCapacitorElectronConfig();

// Initialize our app. You can pass menu templates into the app here.
// const myCapacitorApp = new ElectronCapacitorApp(capacitorFileConfig);
const myCapacitorApp = new ElectronCapacitorApp(capacitorFileConfig, trayMenuTemplate, appMenuBarMenuTemplate);

// If deeplinking is enabled then we will set it up here.
if (capacitorFileConfig.electron?.deepLinkingEnabled) {
  setupElectronDeepLinking(myCapacitorApp, {
    customProtocol: capacitorFileConfig.electron.deepLinkingCustomProtocol ?? 'mycapacitorapp',
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
      if (isQuiting) {
        // mainWindow.close();
        app.quit();
      }
    }
  });
  // Wait for electron app to be ready.
  app.whenReady().then(async () => {
    const mainWindow2 = await myCapacitorApp.init();
    mainWindow = undefined;
    if (electronIsDev) {
      mainWindow2.webContents.openDevTools()
      mainWindow2.maximize();
    }
  })
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
    autoUpdater.checkForUpdates()
  }, 3600000)


  autoUpdater.on("update-downloaded", (_event, releaseNotes, releaseName) => {
    const dialogOpts = {
      type: 'info',
      buttons: ['Restart / Reinicie. / Перезапуск', 'Later / Después / Позже'],
      title: 'PCDC Update',
      message: process.platform === 'win32' ? releaseNotes : releaseName,
      detail: `A new version of UNICEF's Project Connect Daily Check App (PDCA) has been downloaded. Restart the application to apply the updates.\n\nUna nueva version de la aplicación Project Connect Daily Check App de UNICEF (PCDC) ha sido descargada. Reinicie la aplicación para aplicar los cambios.\n\nНовая версия приложения Project Connect Daily Check App (PDCA) загружена . Перезапустите приложение, чтобы применить обновления.`
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
          type: 'info',
          buttons: ['Restart / Reinicie. / Перезапуск', 'Later / Después / Позже'],
          title: 'PCDC Update',
          message: process.platform === 'win32' ? releaseNotes : releaseName,
          detail: `A new version of UNICEF's Project Connect Daily Check App (PDCA) has been downloaded. Restart the application to apply the updates.\n\nUna nueva version de la aplicación Project Connect Daily Check App de UNICEF (PCDC) ha sido descargada. Reinicie la aplicación para aplicar los cambios.\n\nНовая версия приложения Project Connect Daily Check App (PDCA) загружена . Перезапустите приложение, чтобы применить обновления.`
        };
        dialog.showMessageBox(dialogOpts).then((returnValue) => {
          if (returnValue.response === 0) autoUpdater.quitAndInstall(false, true)
        })


        //throw new Error("opps there is unexpected error")
      } catch (error) {
        console.error('Error during update installation:', error);
        const dialogOpts = {
          type: 'info',
          buttons: ['Restart / Reinicie. / Перезапуск', 'Later / Después / Позже'],
          title: 'PCDC Update',
          message: process.platform === 'win32' ? releaseNotes : releaseName,
          detail: `A new version of UNICEF's Project Connect Daily Check App (PDCA) has been downloaded. Restart the application to apply the updates.\n\nUna nueva version de la aplicación Project Connect Daily Check App de UNICEF (PCDC) ha sido descargada. Reinicie la aplicación para aplicar los cambios.\n\nНовая версия приложения Project Connect Daily Check App (PDCA) загружена . Перезапустите приложение, чтобы применить обновления.`
        };
        dialog.showMessageBox(dialogOpts).then((returnValue) => {
          if (returnValue.response === 0) autoUpdater.quitAndInstall(false, true)
        })
      }

    }



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
if (mainWindow) {
  mainWindow.on('close', (event) => {
    if (!isQuiting) {
      event.preventDefault();
      mainWindow.hide();
      return false;
    } else {
      app.quit();
    }
  });
}
// Handle when all of our windows are close (platforms have their own expectations).
app.on('window-all-closed', function () {
  // On OS X it is common for applications and their menu bar
  // to stay active until the user quits explicitly with Cmd + Q
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
// When the dock icon is clicked.
app.on('activate', async function () {
  // On OS X it's common to re-create a window in the app when the
  // dock icon is clicked and there are no other windows open.
  if (myCapacitorApp.getMainWindow().isDestroyed()) {
    await myCapacitorApp.init();
  }
});



// Place all ipc or other electron api calls and custom functionality under this line

ipcMain.addListener('closeFromUi', (ev) => {
  myCapacitorApp.getMainWindow().hide();
});