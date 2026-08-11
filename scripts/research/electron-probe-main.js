/**
 * electron-probe-main.js — Artefacto 2 del plan 0008.
 *
 * Runs probe-system-info.js inside an Electron MAIN PROCESS, so the calls run
 * on Electron's embedded Node (not the system Node) — the same runtime the
 * app's ipcMain handlers use. From the repo root:
 *
 *     npx electron scripts/research/electron-probe-main.js
 *
 * Optionally set PROBE_OUT_DIR to choose where the output files go.
 *
 * Caveat: this is the unpackaged runtime. The last step of the plan is still
 * to verify the finalist attributes in the *packaged* app (temporary
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
    console.error('El probe falló dentro de Electron:', err);
    exitCode = 1;
  }
  app.exit(exitCode);
});
