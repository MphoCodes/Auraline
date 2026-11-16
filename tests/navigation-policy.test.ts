import { test } from 'node:test'
import assert from 'node:assert/strict'
import { isAllowedNavigation } from '../src/main/navigation-policy.ts'

test('allows renderer surface queries but blocks other origins, files and executable URLs', () => {
  assert.equal(isAllowedNavigation('http://localhost:5173/?surface=dock', 'http://localhost:5173/'), true)
  assert.equal(isAllowedNavigation('file:///app/index.html?surface=menu', 'file:///app/index.html'), true)
  for (const url of ['https://example.com/', 'http://localhost:5174/', 'javascript:alert(1)', 'invalid']) {
    assert.equal(isAllowedNavigation(url, 'http://localhost:5173/'), false)
  }
  assert.equal(isAllowedNavigation('file:///other.html', 'file:///app/index.html'), false)
})
