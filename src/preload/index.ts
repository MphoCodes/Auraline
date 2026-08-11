import { contextBridge, ipcRenderer } from 'electron'

type DockAppId = string

contextBridge.exposeInMainWorld('auraline', {
  version: '0.1.0',
  windowControls: {
    minimize: () => ipcRenderer.invoke('window:control', 'minimize'),
    toggleMaximize: () => ipcRenderer.invoke('window:control', 'toggleMaximize'),
    close: () => ipcRenderer.invoke('window:control', 'close')
  },
  shellMode: {
    get: () => ipcRenderer.invoke('shell-mode:get') as Promise<boolean>,
    set: (enabled: boolean) => ipcRenderer.invoke('shell-mode:set', enabled) as Promise<boolean>,
    onChanged: (callback: (enabled: boolean) => void) => {
      const listener = (_event: Electron.IpcRendererEvent, enabled: boolean) => callback(enabled)
      ipcRenderer.on('shell-mode:changed', listener)
      return () => ipcRenderer.removeListener('shell-mode:changed', listener)
    }
  },
  dock: {
    list: () => ipcRenderer.invoke('dock:list'),
    add: () => ipcRenderer.invoke('dock:add'),
    remove: (appId: DockAppId) => ipcRenderer.invoke('dock:remove', appId),
    reset: () => ipcRenderer.invoke('dock:reset')
  },
  apps: {
    launch: (appId: DockAppId) => ipcRenderer.invoke('app:launch', appId)
  },
  launcher: {
    list: () => ipcRenderer.invoke('launcher:list'),
    toggle: () => ipcRenderer.invoke('launcher:toggle') as Promise<boolean>,
    close: () => ipcRenderer.invoke('launcher:close') as Promise<void>
  },
  startup: {
    get: () => ipcRenderer.invoke('startup:get'),
    set: (enabled: boolean) => ipcRenderer.invoke('startup:set', enabled)
  },
  systemStatus: {
    get: () => ipcRenderer.invoke('system-status:get')
  }
})
