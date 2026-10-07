// Run with: npx tsx --test webapp/tests/unit/auth/handoffNP328.test.ts
// NP-328: workout hub and library paths added to hand-off allow-list

import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  HANDOFF_ALLOWED_PATHS,
  isHandoffPathAllowed,
  normalizeHandoffPath,
} from '../../../lib/authHandoff'

test('NP-328: /dashboard/workout/hub is allow-listed for signed-in hand-off', () => {
  assert.equal(isHandoffPathAllowed('/dashboard/workout/hub'), true)
  assert.equal(normalizeHandoffPath('/dashboard/workout/hub'), '/dashboard/workout/hub')
  // Trailing slash normalizes to bare path
  assert.equal(normalizeHandoffPath('/dashboard/workout/hub/'), '/dashboard/workout/hub')
})

test('NP-328: /dashboard/workout/library is allow-listed for signed-in hand-off', () => {
  assert.equal(isHandoffPathAllowed('/dashboard/workout/library'), true)
  assert.equal(normalizeHandoffPath('/dashboard/workout/library'), '/dashboard/workout/library')
  assert.equal(normalizeHandoffPath('/dashboard/workout/library/'), '/dashboard/workout/library')
})

test('NP-328: query strings are rejected by normalizeHandoffPath (hand-off takes bare path)', () => {
  assert.equal(normalizeHandoffPath('/dashboard/workout/hub?tab=exercises'), null)
})
