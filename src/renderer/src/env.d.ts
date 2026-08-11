/// <reference types="vite/client" />

type DockApp = {
  id: string
  name: string
  builtIn?: boolean
  iconDataUrl: string | null
}

type StartupState = {
  available: boolean
  enabled: boolean
}

type LauncherApp = DockApp & {
  pinned: boolean
}

interface Window {
  auraline: {
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
  }
}
