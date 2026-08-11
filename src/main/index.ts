import { app, BrowserWindow, ipcMain, Menu } from 'electron'
import { join } from 'node:path'

type WindowControlAction = 'minimize' | 'toggleMaximize' | 'close'

const windowControlActions = new Set<WindowControlAction>([
  'minimize',
  'toggleMaximize',
  'close'
])

function registerWindowControls(): void {
  ipcMain.handle('window:control', (event, action: unknown) => {
    if (typeof action !== 'string' || !windowControlActions.has(action as WindowControlAction)) {
      throw new Error('Invalid window control action')
    }

    const window = BrowserWindow.fromWebContents(event.sender)
    if (!window) throw new Error('No window is associated with this request')

    if (action === 'minimize') window.minimize()
    if (action === 'toggleMaximize') {
      if (window.isMaximized()) window.unmaximize()
      else window.maximize()
    }
    if (action === 'close') window.close()
  })
}

function createWindow(): void {
  const window = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    show: false,
    title: 'Auraline',
    frame: false,
    backgroundColor: '#101320',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  })

  if (!app.isPackaged) {
    window.webContents.on('console-message', (details) => {
      console.log(`[renderer:${details.level}] ${details.message}`)
    })

    window.webContents.on(
      'did-fail-load',
      (_event, errorCode, errorDescription, validatedURL) => {
        console.error(
          `[renderer:load] ${errorCode} ${errorDescription} ${validatedURL}`
        )
      }
    )
  }

  window.once('ready-to-show', () => window.show())

  if (process.env.ELECTRON_RENDERER_URL) {
    void window.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    void window.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(() => {
  app.setAppUserModelId('com.mphocodes.auraline')
  Menu.setApplicationMenu(null)
  registerWindowControls()
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
