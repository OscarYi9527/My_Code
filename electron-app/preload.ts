import { contextBridge, ipcRenderer } from 'electron';

export interface ElectronAPI {
  invoke: (channel: string, ...args: unknown[]) => Promise<unknown>;
  on: (channel: string, callback: (...args: unknown[]) => void) => void;
  removeAllListeners: (channel: string) => void;
}

const api: ElectronAPI = {
  invoke: (channel: string, ...args: unknown[]) => ipcRenderer.invoke(channel, ...args),
  on: (channel: string, callback: (...args: unknown[]) => void) => {
    ipcRenderer.on(channel, (_event, ...args) => callback(...args));
  },
  removeAllListeners: (channel: string) => ipcRenderer.removeAllListeners(channel),
};

contextBridge.exposeInMainWorld('electronAPI', api);
