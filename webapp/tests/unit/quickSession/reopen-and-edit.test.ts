// Run with: npx tsx --test tests/unit/quickSession/reopen-and-edit.test.ts
//
// Covers the "saved session opens a random unrelated session" bug and the edit
// path that fixes it:
//   · the hub / modal must reopen a log's OWN exercises, not regenerate,
//   · the reopened copy must get a NEW sessionId so finishing the repeat can't
//     overwrite the historical log (a save matches by sessionId in place),
//   · updateQuickSession must rewrite title/exercises while keeping the id.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import type { DraftExercise } from '../../../lib/quickSession/types'

// ── localStorage shim (the store is client-only) ─────────────────────────────
class MemoryStorage {
  private map = new Map<string, string>()
  getItem(k: string) { return this.map.has(k) ? this.map.get(k)! : null }
  setItem(k: string, v: string) { this.map.set(k, String(v)) }
  removeItem(k: string) { this.map.delete(k) }
}
;(globalThis as { localStorage?: unknown }).localStorage = new MemoryStorage()

// Static import is safe: the store only touches localStorage inside its
// functions, which run after the shim above is installed.
import {
  stashQuickSession,
  readQuickSession,
  updateQuickSession,
  quickSessionOverviewHref,
} from '../../../lib/quickSession/store'

const EXERCISES: DraftExercise[] = [
  { exerciseSlug: 'barbell-row', name: 'Barbell Row', trackingType: 'reps_weight', sets: 4, reps: '8-10' },
  { exerciseSlug: 'lat-pulldown', name: 'Lat Pulldown', trackingType: 'reps_weight', sets: 3, reps: '10-12' },
]

test('reopening a saved log keeps its title and exercises', () => {
  const log = { title: 'Sunday Back & Shoulders', focus: 'back' as const, exercises: EXERCISES }

  const id = stashQuickSession({ title: log.title, focus: log.focus, exercises: log.exercises })
  const reopened = readQuickSession(id)

  assert.ok(reopened)
  assert.equal(reopened.title, 'Sunday Back & Shoulders')
  assert.deepEqual(
    reopened.exercises.map((e) => e.exerciseSlug),
    ['barbell-row', 'lat-pulldown'],
  )
})

test('reopening twice yields distinct ids, so a repeat cannot overwrite history', () => {
  const session = { title: 'Lower Body Session', exercises: EXERCISES }
  const a = stashQuickSession(session)
  const b = stashQuickSession(session)
  assert.notEqual(a, b)
})

test('updateQuickSession rewrites title and exercises in place, keeping the id', () => {
  const id = stashQuickSession({ title: 'Quick Session', exercises: EXERCISES })

  const trimmed = updateQuickSession(id, {
    title: 'Back Day',
    exercises: [{ ...EXERCISES[0], sets: 5 }],
  })

  assert.ok(trimmed)
  assert.equal(trimmed.sessionId, id)
  assert.equal(trimmed.title, 'Back Day')
  assert.equal(trimmed.exercises.length, 1)
  assert.equal(trimmed.exercises[0].sets, 5)

  // Persisted, not just returned.
  const reread = readQuickSession(id)
  assert.equal(reread?.title, 'Back Day')
  assert.equal(reread?.exercises.length, 1)
})

test('updateQuickSession leaves untouched fields alone and no-ops on a missing id', () => {
  const id = stashQuickSession({ title: 'Push Day', focus: 'push', exercises: EXERCISES })

  const renamed = updateQuickSession(id, { title: 'Push Day A' })
  assert.equal(renamed?.focus, 'push')
  assert.equal(renamed?.exercises.length, 2)

  assert.equal(updateQuickSession('qs_does_not_exist', { title: 'x' }), null)
})

test('overview href only carries saved=1 when the session exists server-side', () => {
  assert.equal(quickSessionOverviewHref('abc'), '/dashboard/workout/quick-session?session=abc')
  assert.equal(
    quickSessionOverviewHref('abc', { saved: true }),
    '/dashboard/workout/quick-session?session=abc&saved=1',
  )
})
