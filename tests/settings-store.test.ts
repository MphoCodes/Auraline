import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createSettingsStore } from '../src/main/settings-store.ts'

test('concurrent settings changes preserve both updates', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'auraline-'))
  try {
    const store = createSettingsStore(join(directory, 'settings.json'), () => [])
    await Promise.all([
      store.update((current) => ({ ...current, shellMode: true })),
      store.update((current) => ({ ...current, dockApps: [{ id: 'app', name: 'App', target: 'app.exe' }] }))
    ])
    assert.deepEqual(await store.read(), { shellMode: true, dockApps: [{ id: 'app', name: 'App', target: 'app.exe' }] })
    await writeFile(join(directory, 'settings.json'), 'null')
    assert.deepEqual(await store.read(), { shellMode: false, dockApps: [] })
  } finally { await rm(directory, { recursive: true, force: true }) }
})
