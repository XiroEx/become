import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import path from 'node:path'
import {
  HANDOFF_ALLOWED_PATHS,
  isHandoffPathAllowed,
  normalizeHandoffPath,
} from '../../../lib/authHandoff'

test('NP-328: workout hub and library are in HANDOFF_ALLOWED_PATHS', () => {
  assert.equal(isHandoffPathAllowed('/dashboard/workout/hub'), true)
  assert.equal(isHandoffPathAllowed('/dashboard/workout/library'), true)
  assert.equal(normalizeHandoffPath('/dashboard/workout/hub'), '/dashboard/workout/hub')
  assert.equal(normalizeHandoffPath('/dashboard/workout/library'), '/dashboard/workout/library')
  assert.equal(normalizeHandoffPath('/dashboard/workout/hub/'), '/dashboard/workout/hub')
})

test('NP-328: workout hub and library pages exist under app/', () => {
  const root = process.cwd()
  const hubPage = path.join(root, 'webapp', 'app', 'dashboard', 'workout', 'hub', 'page.tsx')
  const libPage = path.join(root, 'webapp', 'app', 'dashboard', 'workout', 'library', 'page.tsx')
  assert.ok(existsSync(hubPage), 'hub page.tsx must exist')
  assert.ok(existsSync(libPage), 'library page.tsx must exist')
})
