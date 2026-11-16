import { createSettingsStore } from './settings-store'
import { app } from 'electron'
import { join } from 'node:path'
import type { StoredDockApp } from '../shared/contracts'

export function getDefaultDockApps(): StoredDockApp[] {
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

let store: ReturnType<typeof createSettingsStore> | undefined
function getStore() {
  return store ??= createSettingsStore(join(app.getPath('userData'), 'settings.json'), getDefaultDockApps)
}
export const readSettings = () => getStore().read()
export const updateSettings: ReturnType<typeof createSettingsStore>['update'] = (update) => getStore().update(update)
