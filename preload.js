// preload.js
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('xeoAPI', {
  loadMappings: () => ipcRenderer.invoke('load-mappings'),
  saveMappings: (mappings) => ipcRenderer.send('save-mappings', mappings),
  pauseMapper: () => ipcRenderer.send('pause-mapper'),
  resumeMapper: () => ipcRenderer.send('resume-mapper'),
  startRecordSystem: () => ipcRenderer.invoke('start-record-system'),
  getSettings: () => ipcRenderer.invoke('get-settings'),
  setSettings: (partial) => ipcRenderer.send('set-settings', partial),
  onPausedChanged: (cb) => ipcRenderer.on('paused-changed', (e, v) => cb(v))
});
