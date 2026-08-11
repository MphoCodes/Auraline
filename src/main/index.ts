import { app, BrowserWindow, dialog, ipcMain, Menu, net, screen, shell } from 'electron'
import { execFile, spawn } from 'node:child_process'
import { createHash, randomUUID } from 'node:crypto'
import { readdir, readFile, writeFile } from 'node:fs/promises'
import { basename, extname, join } from 'node:path'
import { promisify } from 'node:util'

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

type LauncherApp = DockApp & {
  pinned: boolean
}

type AuralineSettings = {
  dockApps: StoredDockApp[]
  shellMode: boolean
}

type SystemStatus = {
  online: boolean
  wifi: {
    connected: boolean
    name: string | null
    signal: number | null
  }
  battery: {
    available: boolean
    level: number | null
    charging: boolean
  }
}

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
let taskbarWatchdogStarted = false
const installedAppTargets = new Map<string, string>()
const execFileAsync = promisify(execFile)

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
    let iconTarget = dockApp.target
    if (extname(dockApp.target).toLocaleLowerCase() === '.lnk') {
      try {
        const shortcut = shell.readShortcutLink(dockApp.target)
        iconTarget = shortcut.icon || shortcut.target || dockApp.target
      } catch {
        iconTarget = dockApp.target
      }
    }
    const icon = await app.getFileIcon(iconTarget, { size: 'large' })
    return { ...dockApp, iconDataUrl: icon.isEmpty() ? null : icon.toDataURL() }
  } catch {
    return { ...dockApp, iconDataUrl: null }
  }
}

async function getDockApps(): Promise<DockApp[]> {
  const settings = await readSettings()
  return Promise.all(settings.dockApps.map(hydrateDockApp))
}

async function findLaunchTargets(directory: string): Promise<string[]> {
  try {
    const entries = await readdir(directory, { withFileTypes: true })
    const nestedTargets = await Promise.all(
      entries.map(async (entry) => {
        const path = join(directory, entry.name)
        if (entry.isDirectory()) return findLaunchTargets(path)
        const extension = extname(entry.name).toLocaleLowerCase()
        if (!['.lnk', '.exe', '.appref-ms', '.url'].includes(extension)) return []
        if (/uninstall|remove|repair/i.test(entry.name)) return []
        return [path]
      })
    )
    return nestedTargets.flat()
  } catch {
    return []
  }
}

async function getLauncherApps(): Promise<LauncherApp[]> {
  const programData = process.env.ProgramData ?? 'C:\\ProgramData'
  const startMenuDirectories = [
    join(programData, 'Microsoft', 'Windows', 'Start Menu', 'Programs'),
    join(app.getPath('appData'), 'Microsoft', 'Windows', 'Start Menu', 'Programs')
  ]
  const [targetsByDirectory, settings] = await Promise.all([
    Promise.all(startMenuDirectories.map(findLaunchTargets)),
    readSettings()
  ])
  const pinnedTargets = new Set(
    settings.dockApps.map((dockApp) => dockApp.target.toLocaleLowerCase())
  )
  const uniqueTargets = new Map<string, string>()

  for (const target of targetsByDirectory.flat()) {
    const name = basename(target, extname(target)).trim()
    const normalizedName = name.toLocaleLowerCase()
    if (name && !uniqueTargets.has(normalizedName)) uniqueTargets.set(normalizedName, target)
  }

  installedAppTargets.clear()
  const launcherApps = await Promise.all(
    [...uniqueTargets.entries()].map(async ([normalizedName, target]) => {
      const hash = createHash('sha256').update(target.toLocaleLowerCase()).digest('hex').slice(0, 20)
      const id = `installed-${hash}`
      installedAppTargets.set(id, target)
      const hydrated = await hydrateDockApp({
        id,
        name: basename(target, extname(target)),
        target
      })
      return {
        ...hydrated,
        name: hydrated.name.trim(),
        pinned: pinnedTargets.has(target.toLocaleLowerCase()),
        sortName: normalizedName
      }
    })
  )

  return launcherApps
    .sort((left, right) => left.sortName.localeCompare(right.sortName))
    .map(({ sortName: _sortName, ...launcherApp }) => launcherApp)
}

function isValidId(value: unknown): value is string {
  return typeof value === 'string' && /^[a-zA-Z0-9-]{1,80}$/.test(value)
}

async function getWindowsSystemStatus(): Promise<SystemStatus> {
  const fallback: SystemStatus = {
    online: net.isOnline(),
    wifi: { connected: false, name: null, signal: null },
    battery: { available: false, level: null, charging: false }
  }

  if (process.platform !== 'win32') return fallback

  const batteryCommand =
    "$battery = Get-CimInstance -ClassName Win32_Battery -ErrorAction SilentlyContinue | Select-Object -First 1 EstimatedChargeRemaining,BatteryStatus; if ($null -eq $battery) { '{}' } else { $battery | ConvertTo-Json -Compress }"

  const [wifiResult, batteryResult] = await Promise.allSettled([
    execFileAsync('netsh.exe', ['wlan', 'show', 'interfaces'], {
      windowsHide: true,
      timeout: 5_000
    }),
    execFileAsync(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-Command', batteryCommand],
      { windowsHide: true, timeout: 5_000 }
    )
  ])

  if (wifiResult.status === 'fulfilled') {
    const output = wifiResult.value.stdout
    const state = output.match(/^\s*State\s*:\s*(.+)$/im)?.[1]?.trim().toLocaleLowerCase()
    const name = output.match(/^\s*SSID\s*:\s*(.+)$/im)?.[1]?.trim() ?? null
    const signalText = output.match(/^\s*Signal\s*:\s*(\d+)%/im)?.[1]
    fallback.wifi = {
      connected: state === 'connected',
      name: state === 'connected' ? name : null,
      signal: signalText ? Number(signalText) : null
    }
  }

  if (batteryResult.status === 'fulfilled') {
    try {
      const battery = JSON.parse(batteryResult.value.stdout.trim() || '{}') as {
        EstimatedChargeRemaining?: unknown
        BatteryStatus?: unknown
      }
      const level = Number(battery.EstimatedChargeRemaining)
      const status = Number(battery.BatteryStatus)
      if (Number.isFinite(level)) {
        fallback.battery = {
          available: true,
          level: Math.max(0, Math.min(100, level)),
          charging: Number.isFinite(status) && ![1, 4, 5].includes(status)
        }
      }
    } catch {
      // Keep the unavailable fallback when Windows does not report a battery.
    }
  }

  return fallback
}

async function openLaunchTarget(target: string): Promise<void> {
  const electronError = await shell.openPath(target)
  if (!electronError) return

  if (process.platform !== 'win32') throw new Error(electronError)

  try {
    await execFileAsync(
      'powershell.exe',
      [
        '-NoProfile',
        '-NonInteractive',
        '-Command',
        "$ErrorActionPreference = 'Stop'; Start-Process -FilePath $env:AURALINE_LAUNCH_TARGET"
      ],
      {
        windowsHide: true,
        timeout: 8_000,
        env: { ...process.env, AURALINE_LAUNCH_TARGET: target }
      }
    )
  } catch {
    throw new Error(electronError)
  }
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
    let target = dockApp?.target ?? installedAppTargets.get(appId)
    let name = dockApp?.name
    if (!target) {
      const launcherApps = await getLauncherApps()
      const launcherApp = launcherApps.find((candidate) => candidate.id === appId)
      target = launcherApp ? installedAppTargets.get(launcherApp.id) : undefined
      name = launcherApp?.name
    }
    if (!target || !name) throw new Error('That application is no longer available')

    await openLaunchTarget(target)
    launcherWindow?.close()
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

function registerSystemStatusHandlers(): void {
  ipcMain.handle('system-status:get', () => getWindowsSystemStatus())
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
