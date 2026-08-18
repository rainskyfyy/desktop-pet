const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('epodeck', {
    loadData: () => ipcRenderer.invoke('data:load'),
    saveData: (data) => ipcRenderer.invoke('data:save', data),
    hideWindow: () => ipcRenderer.invoke('window:hide'),
    quitApp: () => ipcRenderer.invoke('app:quit'),
    toggleAlwaysOnTop: () => ipcRenderer.invoke('window:toggle-always-on-top'),
    platform: process.platform,
});
