import type { StoredDockApp } from '../shared/contracts'

export async function resolveLaunchApp(
  appId: string,
  pinned: StoredDockApp[],
  installed: Map<string, StoredDockApp>,
  refresh: () => Promise<unknown>
): Promise<StoredDockApp> {
  const dockApp = pinned.find((candidate) => candidate.id === appId)
  let target = dockApp?.target ?? installed.get(appId)?.target
  let name = dockApp?.name ?? installed.get(appId)?.name
  if (!target) {
    await refresh()
    target = installed.get(appId)?.target
    name = installed.get(appId)?.name
  }
  if (!target || !name) throw new Error('That application is no longer available')
  return { id: appId, target, name }
}
