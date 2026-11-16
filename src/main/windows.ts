import { pathToFileURL } from 'node:url'
import { isAllowedNavigation } from './navigation-policy'
import { resolveLaunchApp } from './launch-selection'
import { app, BrowserWindow, dialog, ipcMain, screen } from 'electron'
import { randomUUID } from 'node:crypto'
import { basename, extname, join } from 'node:path'
import type { StoredDockApp, WindowControlAction } from '../shared/contracts'
import { readSettings, updateSettings, getDefaultDockApps } from './settings'
import { hydrateDockApp, getDockApps, getLauncherApps, installedAppTargets } from './app-catalog'
import { setNativeTaskbarVisible, startTaskbarRestoreWatchdog, getWindowsSystemStatus, openLaunchTarget } from './windows-platform'
const windowControlActions = new Set<WindowControlAction>([
  'minimize',
  'toggleMaximize',
  'close'
])

let mainWindow: BrowserWindow | null = null
let menuWindow: BrowserWindow | null = null
let dockWindow: BrowserWindow | null = null
let launcherWindow: BrowserWindow | null = null
let normalWindowBounds = { x: 120, y: 90, width: 1200, height: 800 }
function isValidId(value: unknown): value is string {
  return typeof value === 'string' && /^[a-zA-Z0-9-]{1,80}$/.test(value)
}

async function setShellMode(enabled: boolean): Promise<boolean> {
  if (!mainWindow || mainWindow.isDestroyed()) return false

  if (enabled) {
    const display = screen.getDisplayMatching(mainWindow.getBounds())
    normalWindowBounds = mainWindow.getBounds()
    mainWindow.hide()
    createShellSurfaces(display)
    startTaskbarRestoreWatchdog()
    setNativeTaskbarVisible(false)
  } else {
    setNativeTaskbarVisible(true)
    menuWindow?.destroy()
    dockWindow?.destroy()
    launcherWindow?.destroy()
    menuWindow = null
    dockWindow = null
    launcherWindow = null
    mainWindow.setBounds(normalWindowBounds)
    mainWindow.show()
    mainWindow.focus()
  }

  await updateSettings((settings) => ({ ...settings, shellMode: enabled }))
  for (const window of BrowserWindow.getAllWindows()) {
    window.webContents.send('shell-mode:changed', enabled)
  }
  return enabled
}

function loadRenderer(window: BrowserWindow, surface?: 'menu' | 'dock' | 'launcher'): void {
  const rendererLocation = process.env.ELECTRON_RENDERER_URL ?? pathToFileURL(join(__dirname, '../renderer/index.html')).href
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  window.webContents.on('will-navigate', (event, destination) => {
    if (!isAllowedNavigation(destination, rendererLocation)) event.preventDefault()
  })
  const query = surface ? `?surface=${surface}` : ''
  if (process.env.ELECTRON_RENDERER_URL) {
    void window.loadURL(`${process.env.ELECTRON_RENDERER_URL}${query}`)
  } else {
    void window.loadFile(join(__dirname, '../renderer/index.html'), {
      query: surface ? { surface } : undefined
    })
  }
}

function createShellWindow(
  bounds: Electron.Rectangle,
  surface: 'menu' | 'dock' | 'launcher'
): BrowserWindow {
  const window = new BrowserWindow({
    ...bounds,
    show: false,
    frame: false,
    transparent: true,
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    hasShadow: false,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  })
  window.setAlwaysOnTop(true, 'floating')
  window.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
  window.once('ready-to-show', () => window.showInactive())
  loadRenderer(window, surface)
  return window
}

function toggleLauncher(owner: BrowserWindow): boolean {
  if (launcherWindow && !launcherWindow.isDestroyed()) {
    launcherWindow.destroy()
    launcherWindow = null
    return false
  }

  const display = screen.getDisplayMatching(owner.getBounds())
  const width = Math.min(760, display.workArea.width - 32)
  const height = Math.min(560, display.workArea.height - 170)
  launcherWindow = createShellWindow(
    {
      x: display.bounds.x + Math.round((display.bounds.width - width) / 2),
      y: display.bounds.y + display.bounds.height - height - 240,
      width,
      height
    },
    'launcher'
  )
  launcherWindow.setAlwaysOnTop(true, 'pop-up-menu')
  launcherWindow.on('closed', () => {
    launcherWindow = null
  })
  return true
}

function createShellSurfaces(display: Electron.Display): void {
  menuWindow?.destroy()
  dockWindow?.destroy()

  menuWindow = createShellWindow(
    {
      x: display.bounds.x,
      y: display.bounds.y,
      width: display.bounds.width,
      height: 48
    },
    'menu'
  )

  const dockWidth = Math.min(920, display.bounds.width - 32)
  const dockHeight = 132
  dockWindow = createShellWindow(
    {
      x: display.bounds.x + Math.round((display.bounds.width - dockWidth) / 2),
      y: display.bounds.y + display.bounds.height - dockHeight,
      width: dockWidth,
      height: dockHeight
    },
    'dock'
  )
}

export function registerWindowControls(): void {
  ipcMain.handle('window:control', (event, action: unknown) => {
    if (typeof action !== 'string' || !windowControlActions.has(action as WindowControlAction)) {
      throw new Error('Invalid window control action')
    }

    const senderWindow = BrowserWindow.fromWebContents(event.sender)
    if (!senderWindow) throw new Error('No window is associated with this request')
    const targetWindow = senderWindow === mainWindow ? senderWindow : mainWindow
    if (!targetWindow) throw new Error('Auraline has no main window')

    if (action === 'minimize') targetWindow.minimize()
    if (action === 'toggleMaximize') {
      if (targetWindow.isMaximized()) targetWindow.unmaximize()
      else targetWindow.maximize()
    }
    if (action === 'close') app.quit()
  })

  ipcMain.handle('shell-mode:get', async () => (await readSettings()).shellMode)
  ipcMain.handle('shell-mode:set', (_event, enabled: unknown) => {
    if (typeof enabled !== 'boolean') throw new Error('Invalid shell mode value')
    return setShellMode(enabled)
  })
}

export function registerDockHandlers(): void {
  ipcMain.handle('dock:list', () => getDockApps())

  ipcMain.handle('dock:add', async (event) => {
    const owner = BrowserWindow.fromWebContents(event.sender)
    const options: Electron.OpenDialogOptions = {
      title: 'Add an application to Auraline',
      buttonLabel: 'Add to Dock',
      properties: ['openFile'],
      filters: [
        { name: 'Windows applications', extensions: ['exe', 'lnk'] },
        { name: 'All files', extensions: ['*'] }
      ]
    }
    const selection = owner
      ? await dialog.showOpenDialog(owner, options)
      : await dialog.showOpenDialog(options)

    if (selection.canceled || selection.filePaths.length === 0) return null

    const target = selection.filePaths[0]
    const existingSettings = await readSettings()
    const duplicate = existingSettings.dockApps.find(
      (dockApp) => dockApp.target.toLocaleLowerCase() === target.toLocaleLowerCase()
    )
    if (duplicate) return hydrateDockApp(duplicate)

    const dockApp: StoredDockApp = {
      id: randomUUID(),
      name: basename(target, extname(target)),
      target
    }

    const updated = await updateSettings((current) => ({
      ...current,
      dockApps: current.dockApps.some((entry) => entry.target.toLowerCase() === target.toLowerCase())
        ? current.dockApps : [...current.dockApps, dockApp]
    }))

    return hydrateDockApp(updated.dockApps.find((entry) => entry.target.toLowerCase() === target.toLowerCase())!)
  })

  ipcMain.handle('dock:remove', async (_event, appId: unknown) => {
    if (!isValidId(appId)) throw new Error('Invalid dock app ID')
    const settings = await updateSettings((current) => ({
      ...current,
      dockApps: current.dockApps.filter((dockApp) => dockApp.id !== appId)
    }))
    return Promise.all(settings.dockApps.map(hydrateDockApp))
  })

  ipcMain.handle('dock:reset', async () => {
    const settings = await updateSettings((current) => ({
      ...current,
      dockApps: getDefaultDockApps()
    }))
    return Promise.all(settings.dockApps.map(hydrateDockApp))
  })

  ipcMain.handle('app:launch', async (_event, appId: unknown) => {
    if (!isValidId(appId)) throw new Error('Invalid dock app ID')
    const settings = await readSettings()
    const { target, name } = await resolveLaunchApp(appId, settings.dockApps, installedAppTargets, getLauncherApps)

    await openLaunchTarget(target)
    const completedLauncher = launcherWindow
    setTimeout(() => {
      if (launcherWindow === completedLauncher) launcherWindow?.close()
    }, 250)
    return { appId, name }
  })

  ipcMain.handle('launcher:list', () => getLauncherApps())
  ipcMain.handle('launcher:toggle', (event) => {
    const owner = BrowserWindow.fromWebContents(event.sender)
    if (!owner) throw new Error('No window is associated with this request')
    return toggleLauncher(owner)
  })
  ipcMain.handle('launcher:close', () => {
    launcherWindow?.close()
  })
}

export function registerStartupHandlers(): void {
  ipcMain.handle('startup:get', () => ({
    available: app.isPackaged,
    enabled: app.isPackaged && app.getLoginItemSettings().openAtLogin
  }))

  ipcMain.handle('startup:set', (_event, enabled: unknown) => {
    if (typeof enabled !== 'boolean') throw new Error('Invalid startup value')
    if (!app.isPackaged) return { available: false, enabled: false }
    app.setLoginItemSettings({ openAtLogin: enabled })
    return { available: true, enabled: app.getLoginItemSettings().openAtLogin }
  })
}

export function registerSystemStatusHandlers(): void {
  ipcMain.handle('system-status:get', () => getWindowsSystemStatus())
}

export function createWindow(): void {
  const primaryWorkArea = screen.getPrimaryDisplay().workArea
  const width = Math.min(1200, primaryWorkArea.width)
  const height = Math.min(800, primaryWorkArea.height)
  normalWindowBounds = {
    x: primaryWorkArea.x + Math.round((primaryWorkArea.width - width) / 2),
    y: primaryWorkArea.y + Math.round((primaryWorkArea.height - height) / 2),
    width,
    height
  }

  mainWindow = new BrowserWindow({
    ...normalWindowBounds,
    minWidth: 900,
    minHeight: 600,
    show: false,
    title: 'Auraline',
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  })

  if (!app.isPackaged) {
    mainWindow.webContents.on('console-message', (details) => {
      console.log(`[renderer:${details.level}] ${details.message}`)
    })
    mainWindow.webContents.on(
      'did-fail-load',
      (_event, errorCode, errorDescription, validatedURL) => {
        console.error(`[renderer:load] ${errorCode} ${errorDescription} ${validatedURL}`)
      }
    )
  }

  mainWindow.once('ready-to-show', () => {
    mainWindow?.show()
    void readSettings().then((settings) => {
      if (settings.shellMode) void setShellMode(true)
    })
  })

  loadRenderer(mainWindow)
}

