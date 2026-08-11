/// <reference types="vite/client" />

interface Window {
  auraline: {
    version: string
    windowControls: {
      minimize: () => Promise<void>
      toggleMaximize: () => Promise<void>
      close: () => Promise<void>
    }
  }
}
