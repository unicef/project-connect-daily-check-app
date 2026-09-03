/**
 * electron-probe-main.js — Electron runner for probe-system-info.js.
 *
 * Runs probe-system-info.js inside an Electron MAIN PROCESS, so the calls run
 * on Electron's embedded Node (not the system Node) — the same runtime the
 * app's ipcMain handlers use. From the repo root:
 *
 *     npx electron scripts/research/electron-probe-main.js
 *
 * Optionally set PROBE_OUT_DIR to choose where the output files go.
 *
 * Caveat: this is the unpackaged runtime. The finalist attributes still have
 * to be verified in the *packaged* app (temporary
 * `ipcMain.handle('research-probe', …)` in electron/src/index.ts).
 */

'use strict';

const { app } = require('electron');
const { main } = require('./probe-system-info.js');

app.whenReady().then(async () => {
  let exitCode = 0;
  try {
    await main();
  } catch (err) {
    console.error('The probe failed inside Electron:', err);
    exitCode = 1;
  }
  app.exit(exitCode);
});
