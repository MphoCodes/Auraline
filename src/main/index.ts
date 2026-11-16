import { app, BrowserWindow, Menu } from 'electron'
import { createWindow, registerWindowControls, registerDockHandlers, registerStartupHandlers, registerSystemStatusHandlers } from './windows'
import { setNativeTaskbarVisible } from './windows-platform'

app.whenReady().then(() => {
  app.setAppUserModelId('com.mphocodes.auraline')
  Menu.setApplicationMenu(null)
  registerWindowControls()
  registerDockHandlers()
  registerStartupHandlers()
  registerSystemStatusHandlers()
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('before-quit', () => {
  setNativeTaskbarVisible(true)
})
