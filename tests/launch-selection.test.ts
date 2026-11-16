import { test } from 'node:test'
import assert from 'node:assert/strict'
import { resolveLaunchApp } from '../src/main/launch-selection.ts'

const installedApp = { id: 'installed-abc', name: 'Editor', target: 'C:\\Apps\\Editor.lnk' }
test('launches an already listed installed app without rescanning', async () => {
  const result = await resolveLaunchApp(installedApp.id, [], new Map([[installedApp.id, installedApp]]), async () => { throw new Error('Unexpected rescan') })
  assert.deepEqual(result, installedApp)
})
test('refreshes an unknown installed app', async () => {
  const cache = new Map()
  const result = await resolveLaunchApp(installedApp.id, [], cache, async () => { cache.set(installedApp.id, installedApp) })
  assert.deepEqual(result, installedApp)
})
test('prefers pinned apps and rejects unavailable IDs', async () => {
  assert.deepEqual(await resolveLaunchApp(installedApp.id, [installedApp], new Map(), async () => {}), installedApp)
  await assert.rejects(resolveLaunchApp('missing', [], new Map(), async () => {}), /no longer available/)
})
