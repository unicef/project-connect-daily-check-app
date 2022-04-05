require('./rt/electron-rt');
//////////////////////////////
// User Defined Preload scripts below
console.log('User Preload!');
import { contextBridge, ipcRenderer } from "electron";   
contextBridge.exposeInMainWorld("ipcRenderer", {ipcRenderer});
