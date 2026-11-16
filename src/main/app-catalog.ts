import { app, shell } from 'electron'
import { createHash } from 'node:crypto'
import { readdir } from 'node:fs/promises'
import { basename, extname, join } from 'node:path'
import type { StoredDockApp, DockApp, LauncherApp } from '../shared/contracts'
import { readSettings } from './settings'
export const installedAppTargets = new Map<string, StoredDockApp>()

export async function hydrateDockApp(dockApp: StoredDockApp): Promise<DockApp> {
  const { target: _target, ...publicApp } = dockApp
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
    return { ...publicApp, iconDataUrl: icon.isEmpty() ? null : icon.toDataURL() }
  } catch {
    return { ...publicApp, iconDataUrl: null }
  }
}

export async function getDockApps(): Promise<DockApp[]> {
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

export async function getLauncherApps(): Promise<LauncherApp[]> {
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
      installedAppTargets.set(id, { id, target, name: basename(target, extname(target)).trim() })
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

