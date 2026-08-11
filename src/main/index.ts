import { app, BrowserWindow, dialog, ipcMain, Menu, screen, shell } from 'electron'
import { spawn } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { readFile, writeFile } from 'node:fs/promises'
import { basename, extname, join } from 'node:path'

type WindowControlAction = 'minimize' | 'toggleMaximize' | 'close'

type StoredDockApp = {
  id: string
  name: string
  target: string
  builtIn?: boolean
}

type DockApp = Omit<StoredDockApp, 'target'> & {
  iconDataUrl: string | null
}

type AuralineSettings = {
  dockApps: StoredDockApp[]
  shellMode: boolean
}

const windowControlActions = new Set<WindowControlAction>([
  'minimize',
  'toggleMaximize',
  'close'
])

let mainWindow: BrowserWindow | null = null
let menuWindow: BrowserWindow | null = null
let dockWindow: BrowserWindow | null = null
let normalWindowBounds = { x: 120, y: 90, width: 1200, height: 800 }
let taskbarWatchdogStarted = false

const taskbarInterop = `
using System;
using System.Runtime.InteropServices;
public static class AuralineTaskbar {
  [DllImport("user32.dll", CharSet = CharSet.Auto)]
  public static extern IntPtr FindWindow(string className, string windowName);
  [DllImport("user32.dll", CharSet = CharSet.Auto)]
  public static extern IntPtr FindWindowEx(IntPtr parent, IntPtr childAfter, string className, string windowName);
  [DllImport("user32.dll")]
  public static extern bool ShowWindow(IntPtr window, int command);
}`

function taskbarPowerShellCommand(visible: boolean): string {
  const showCommand = visible ? 5 : 0
  return `Add-Type -TypeDefinition '${taskbarInterop}'; $primary = [AuralineTaskbar]::FindWindow("Shell_TrayWnd", $null); if ($primary -ne [IntPtr]::Zero) { [AuralineTaskbar]::ShowWindow($primary, ${showCommand}) | Out-Null }; $current = [IntPtr]::Zero; do { $current = [AuralineTaskbar]::FindWindowEx([IntPtr]::Zero, $current, "Shell_SecondaryTrayWnd", $null); if ($current -ne [IntPtr]::Zero) { [AuralineTaskbar]::ShowWindow($current, ${showCommand}) | Out-Null } } while ($current -ne [IntPtr]::Zero)`
}

function runPowerShell(command: string, detached = false): void {
  if (process.platform !== 'win32') return
  const child = spawn(
    'powershell.exe',
    ['-NoProfile', '-NonInteractive', '-WindowStyle', 'Hidden', '-Command', command],
    { detached, stdio: 'ignore', windowsHide: true }
  )
  child.unref()
}

function setNativeTaskbarVisible(visible: boolean): void {
  runPowerShell(taskbarPowerShellCommand(visible))
}

function startTaskbarRestoreWatchdog(): void {
  if (taskbarWatchdogStarted || process.platform !== 'win32') return
  taskbarWatchdogStarted = true
  runPowerShell(
    `Wait-Process -Id ${process.pid} -ErrorAction SilentlyContinue; ${taskbarPowerShellCommand(true)}`,
    true
  )
}

function getDefaultDockApps(): StoredDockApp[] {
  const windowsDirectory = process.env.WINDIR ?? 'C:\\Windows'

  return [
    {
      id: 'notepad',
      name: 'Notepad',
      target: join(windowsDirectory, 'System32', 'notepad.exe'),
      builtIn: true
    },
    {
      id: 'calculator',
      name: 'Calculator',
      target: join(windowsDirectory, 'System32', 'calc.exe'),
      builtIn: true
    },
    {
      id: 'explorer',
      name: 'File Explorer',
      target: join(windowsDirectory, 'explorer.exe'),
      builtIn: true
    }
  ]
}

function getSettingsPath(): string {
  return join(app.getPath('userData'), 'settings.json')
}

function isStoredDockApp(value: unknown): value is StoredDockApp {
  if (!value || typeof value !== 'object') return false
  const candidate = value as Partial<StoredDockApp>
  return (
    typeof candidate.id === 'string' &&
    typeof candidate.name === 'string' &&
    typeof candidate.target === 'string'
  )
}

async function readSettings(): Promise<AuralineSettings> {
  try {
    const parsed = JSON.parse(await readFile(getSettingsPath(), 'utf8')) as Partial<AuralineSettings>
    return {
      dockApps: Array.isArray(parsed.dockApps)
        ? parsed.dockApps.filter(isStoredDockApp)
        : getDefaultDockApps(),
      shellMode: parsed.shellMode === true
    }
  } catch {
    return { dockApps: getDefaultDockApps(), shellMode: false }
  }
}

async function writeSettings(settings: AuralineSettings): Promise<void> {
  await writeFile(getSettingsPath(), JSON.stringify(settings, null, 2), 'utf8')
}

async function updateSettings(
  update: (settings: AuralineSettings) => AuralineSettings
): Promise<AuralineSettings> {
  const settings = update(await readSettings())
  await writeSettings(settings)
  return settings
}

async function hydrateDockApp(dockApp: StoredDockApp): Promise<DockApp> {
  try {
    const icon = await app.getFileIcon(dockApp.target, { size: 'large' })
    return { ...dockApp, iconDataUrl: icon.isEmpty() ? null : icon.toDataURL() }
  } catch {
    return { ...dockApp, iconDataUrl: null }
  }
}

async function getDockApps(): Promise<DockApp[]> {
  const settings = await readSettings()
  return Promise.all(settings.dockApps.map(hydrateDockApp))
}

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
    menuWindow = null
    dockWindow = null
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

function loadRenderer(window: BrowserWindow, surface?: 'menu' | 'dock'): void {
  const query = surface ? `?surface=${surface}` : ''
  if (process.env.ELECTRON_RENDERER_URL) {
    void window.loadURL(`${process.env.ELECTRON_RENDERER_URL}${query}`)
  } else {
    void window.loadFile(join(__dirname, '../renderer/index.html'), {
      query: surface ? { surface } : undefined
    })
  }
}

function createShellWindow(bounds: Electron.Rectangle, surface: 'menu' | 'dock'): BrowserWindow {
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

function registerWindowControls(): void {
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

function registerDockHandlers(): void {
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

    await writeSettings({
      ...existingSettings,
      dockApps: [...existingSettings.dockApps, dockApp]
    })

    return hydrateDockApp(dockApp)
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
    const dockApp = settings.dockApps.find((candidate) => candidate.id === appId)
    if (!dockApp) throw new Error('That app is no longer pinned')

    const error = await shell.openPath(dockApp.target)
    if (error) throw new Error(error)
    return { appId: dockApp.id, name: dockApp.name }
  })
}

function registerStartupHandlers(): void {
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

function createWindow(): void {
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

app.whenReady().then(() => {
  app.setAppUserModelId('com.mphocodes.auraline')
  Menu.setApplicationMenu(null)
  registerWindowControls()
  registerDockHandlers()
  registerStartupHandlers()
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
