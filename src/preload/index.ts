import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('auraline', {
  version: '0.1.0',
  windowControls: {
    minimize: () => ipcRenderer.invoke('window:control', 'minimize'),
    toggleMaximize: () => ipcRenderer.invoke('window:control', 'toggleMaximize'),
    close: () => ipcRenderer.invoke('window:control', 'close')
  }
})
