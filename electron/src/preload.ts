require('./rt/electron-rt');
//////////////////////////////
// User Defined Preload scripts below
console.log('User Preload!');
import { contextBridge, ipcRenderer, shell } from 'electron';

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

contextBridge.exposeInMainWorld('shell', { shell });

// Expose hardware ID, Windows username, installed path, and WiFi connections API
contextBridge.exposeInMainWorld('electronAPI', {
  getWifiList: () => ipcRenderer.invoke('get-wifi-list'),
  getHardwareId: () => ipcRenderer.invoke('get-hardware-id'),
  getWindowsUsername: () => ipcRenderer.invoke('get-windows-username'),
  getInstalledPath: () => ipcRenderer.invoke('get-installed-path'),
  getWifiConnections: () => ipcRenderer.invoke('get-wifi-connections'),
  onHardwareId: (callback: (data: any) => void) => {
    ipcRenderer.on('system-hardware-id', (event, data) => callback(data));
  },
  onHardwareIdError: (callback: (error: any) => void) => {
    ipcRenderer.on('system-hardware-id-error', (event, error) =>
      callback(error)
    );
  },
  removeHardwareIdListener: () => {
    ipcRenderer.removeAllListeners('system-hardware-id');
    ipcRenderer.removeAllListeners('system-hardware-id-error');
  },
  runTraceroute: (target: string) =>
    ipcRenderer.invoke('run-traceroute', { target }),
  cancelTraceroute: () => ipcRenderer.invoke('cancel-traceroute'),
  onTracerouteStarted: (cb: (data: any) => void) => {
    ipcRenderer.on('traceroute-started', (_e, data) => cb(data));
  },
  onTracerouteHop: (cb: (hop: any) => void) => {
    ipcRenderer.on('traceroute-hop', (_e, hop) => cb(hop));
  },
  onTracerouteInfo: (cb: (info: any) => void) => {
    ipcRenderer.on('traceroute-info', (_e, info) => cb(info));
  },
  onTracerouteDone: (cb: (data: any) => void) => {
    ipcRenderer.on('traceroute-done', (_e, data) => cb(data));
  },
  onTracerouteError: (cb: (data: any) => void) => {
    ipcRenderer.on('traceroute-error', (_e, data) => cb(data));
  },
  removeTracerouteListeners: () => {
    ipcRenderer.removeAllListeners('traceroute-started');
    ipcRenderer.removeAllListeners('traceroute-hop');
    ipcRenderer.removeAllListeners('traceroute-info');
    ipcRenderer.removeAllListeners('traceroute-done');
    ipcRenderer.removeAllListeners('traceroute-error');
  },
});
