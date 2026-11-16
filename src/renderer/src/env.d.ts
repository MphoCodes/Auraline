/// <reference types="vite/client" />
import type * as Contracts from "../../shared/contracts"

declare global {
  type DockApp = Contracts.DockApp
  type LauncherApp = Contracts.LauncherApp
  type StartupState = Contracts.StartupState
  type SystemStatus = Contracts.SystemStatus
  interface Window { auraline: Contracts.AuralineApi }
}
