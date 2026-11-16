export type WindowControlAction = 'minimize' | 'toggleMaximize' | 'close'

export type StoredDockApp = {
  id: string
  name: string
  target: string
  builtIn?: boolean
}

export type DockApp = Omit<StoredDockApp, 'target'> & {
  iconDataUrl: string | null
}

export type LauncherApp = DockApp & {
  pinned: boolean
}

export type AuralineSettings = {
  dockApps: StoredDockApp[]
  shellMode: boolean
}

export type SystemStatus = {
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

export type StartupState = { available: boolean; enabled: boolean }

export type AuralineApi = {
  version: string
  windowControls: {
    minimize: () => Promise<void>
    toggleMaximize: () => Promise<void>
    close: () => Promise<void>
  }
  shellMode: {
    get: () => Promise<boolean>
    set: (enabled: boolean) => Promise<boolean>
    onChanged: (callback: (enabled: boolean) => void) => () => void
  }
  dock: {
    list: () => Promise<DockApp[]>
    add: () => Promise<DockApp | null>
    remove: (appId: string) => Promise<DockApp[]>
    reset: () => Promise<DockApp[]>
  }
  apps: {
    launch: (appId: string) => Promise<{ appId: string; name: string }>
  }
  launcher: {
    list: () => Promise<LauncherApp[]>
    toggle: () => Promise<boolean>
    close: () => Promise<void>
  }
  startup: {
    get: () => Promise<StartupState>
    set: (enabled: boolean) => Promise<StartupState>
  }
  systemStatus: {
    get: () => Promise<SystemStatus>
  }
}
