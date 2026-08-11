import { contextBridge } from 'electron'

contextBridge.exposeInMainWorld('auraline', {
  version: '0.1.0'
})
