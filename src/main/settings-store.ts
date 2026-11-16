import { readFile, writeFile, rename } from 'node:fs/promises'
import type { AuralineSettings, StoredDockApp } from '../shared/contracts'

export function createSettingsStore(path: string, defaults: () => StoredDockApp[]) {
  let pending: Promise<unknown> = Promise.resolve()
  async function read(): Promise<AuralineSettings> {
    try {
      const parsed = JSON.parse(await readFile(path, 'utf8'))
      return {
        dockApps: Array.isArray(parsed?.dockApps) ? parsed.dockApps.filter((value: unknown) => {
          const item = value as Partial<StoredDockApp> | null
          return item && typeof item.id === 'string' && typeof item.name === 'string' && typeof item.target === 'string'
        }) : defaults(),
        shellMode: parsed?.shellMode === true
      }
    } catch { return { dockApps: defaults(), shellMode: false } }
  }
  function update(transform: (settings: AuralineSettings) => AuralineSettings): Promise<AuralineSettings> {
    const operation = pending.then(async () => {
      const settings = transform(await read())
      await writeFile(`${path}.tmp`, JSON.stringify(settings, null, 2), 'utf8')
      await rename(`${path}.tmp`, path)
      return settings
    })
    pending = operation.catch(() => {})
    return operation
  }
  return { read, update }
}
