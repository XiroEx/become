// Run with: npm run test:file tests/unit/quickSession/recentSessions.test.ts
//
// Locks the "Workout Now" sheet's My Sessions cap: it must show only kind:'quick'
// logs, and only the 3 most recent of them.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { RECENT_QUICK_SESSIONS_LIMIT, pickRecentQuickSessions } from '../../../lib/quickSession/recentSessions'

test('RECENT_QUICK_SESSIONS_LIMIT is 3', () => {
  assert.equal(RECENT_QUICK_SESSIONS_LIMIT, 3)
})

test('caps to the 3 most recent quick logs, preserving order', () => {
  const logs = [
    { kind: 'quick', title: 'Quick Session' },
    { kind: 'quick', title: 'Chest & Back' },
    { kind: 'quick', title: 'Quick Session' },
    { kind: 'quick', title: 'Push Session' },
    { kind: 'quick', title: 'Leg Day' },
  ]
  const result = pickRecentQuickSessions(logs)
  assert.equal(result.length, 3)
  assert.deepEqual(result.map((l) => l.title), ['Quick Session', 'Chest & Back', 'Quick Session'])
})

test('filters out non-quick (program) logs before capping', () => {
  const logs = [
    { kind: 'program', title: 'Push Day (program)' },
    { kind: 'quick', title: 'Quick A' },
    { kind: 'program', title: 'Pull Day (program)' },
    { kind: 'quick', title: 'Quick B' },
  ]
  const result = pickRecentQuickSessions(logs)
  assert.deepEqual(result.map((l) => l.title), ['Quick A', 'Quick B'])
})

test('returns fewer than 3 untouched when there are fewer than 3 quick logs', () => {
  const logs = [{ kind: 'quick', title: 'Only One' }]
  assert.deepEqual(pickRecentQuickSessions(logs).map((l) => l.title), ['Only One'])
})

test('returns an empty array for no logs', () => {
  assert.deepEqual(pickRecentQuickSessions([]), [])
})
