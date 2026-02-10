require('./rt/electron-rt');
//////////////////////////////
// User Defined Preload scripts below
console.log('User Preload!');

import { contextBridge, ipcRenderer, shell } from "electron";
import si from "systeminformation";
import crypto from "crypto";
const { v4: uuidv4 } = require('uuid');

async function getDeviceFingerprint() {
  const system = await si.system();
  const baseboard = await si.baseboard();

  // Pick first available identifier → fallback to random UUID
  return system.serial || baseboard.serial || uuidv4();
}

function generateHashId(value: string): string {
  return crypto.createHash('sha256').update(value).digest('hex');
}

// Safe wrapper for ipcRenderer instead of exposing the entire object
contextBridge.exposeInMainWorld('ipcRenderer', {
  send: (channel: string, ...args: any[]) => ipcRenderer.send(channel, ...args),
  invoke: (channel: string, ...args: any[]) =>
    ipcRenderer.invoke(channel, ...args),
  on: (channel: string, func: (...args: any[]) => void) => {
    ipcRenderer.on(channel, (event, ...args) => func(...args));
  },
  removeListener: (channel: string, func: (...args: any[]) => void) => {
    ipcRenderer.removeListener(channel, func);
  },
});

contextBridge.exposeInMainWorld("deviceAPI", {
  getDeviceFingerprint: async () => {
    return await getDeviceFingerprint();
  },

  getHashId: async () => {
    const fingerprint = await getDeviceFingerprint();
    const installUUID = await ipcRenderer.invoke('get-install-uuid');
    return generateHashId(`${fingerprint}-${installUUID}`);
  },

  saveToken: async (token: string) => {
    console.log("[preload] forwarding save-token:", token);
    return await ipcRenderer.invoke('save-token', token);
  },

  getToken: () => ipcRenderer.invoke('get-token')
});

contextBridge.exposeInMainWorld("hmac", {
  sign: (args: {
    secretkey: string;
    token: string;
    nonce: string;
  }) => ipcRenderer.invoke("hmac-sign", args),
});

contextBridge.exposeInMainWorld('shell', { shell });

// Expose hardware ID API
contextBridge.exposeInMainWorld('electronAPI', {
  getHardwareId: () => ipcRenderer.invoke('get-hardware-id'),
  onHardwareId: (callback: (data: any) => void) => {
    ipcRenderer.on('system-hardware-id', (_event, data) => callback(data));
  },
});
