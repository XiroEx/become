// Run with: npx tsx --test tests/unit/quickSession/favorite-carryover.test.ts
//
// Bug: the Sessions list showed two rows for the same workout name (e.g. two
// "Basketball Shootaround" entries) where only one carried the star — because
// repeating a favorited session opens it under a brand-new sessionId (by
// design, see reopen-and-edit.test.ts) and nothing carried `favorite` onto
// that new draft or its eventual server log. Favoriting a session silently
// stopped applying the moment you did it again.
//
// Fix: thread `favorite` through the same "carried from source" path that
// already exists for title/focus/exercises — store.ts's stashQuickSession
// options, the Sessions tab's openSession, and every quick-session save body
// that can perform the FIRST insert for a sessionId.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import type { DraftExercise } from '../../../lib/quickSession/types'

// ── localStorage shim (the store is client-only) ─────────────────────────────
class MemoryStorage {
  private map = new Map<string, string>()
  getItem(k: string) { return this.map.has(k) ? this.map.get(k)! : null }
  setItem(k: string, v: string) { this.map.set(k, String(v)) }
  removeItem(k: string) { this.map.delete(k) }
}
;(globalThis as { localStorage?: unknown }).localStorage = new MemoryStorage()

import { stashQuickSession, readQuickSession } from '../../../lib/quickSession/store'

const EXERCISES: DraftExercise[] = [
  { exerciseSlug: 'jump-shot', name: 'Jump Shot Reps', trackingType: 'reps_weight', sets: 1, reps: '20' },
]

test('stashQuickSession carries favorite:true onto a repeat when asked', () => {
  const id = stashQuickSession(
    { title: 'Basketball Shootaround', exercises: EXERCISES },
    { needsName: false, sourceSessionId: 'friday-shootaround', favorite: true },
  )
  const reopened = readQuickSession(id)
  assert.ok(reopened)
  assert.equal(reopened.favorite, true)
  assert.equal(reopened.sourceSessionId, 'friday-shootaround')
  assert.notEqual(reopened.sessionId, 'friday-shootaround')
})

test('stashQuickSession omits favorite when the source was not favorited', () => {
  const id = stashQuickSession(
    { title: 'Light Chest Fly', exercises: EXERCISES },
    { needsName: false, sourceSessionId: 'monday-chest-fly' },
  )
  const reopened = readQuickSession(id)
  assert.ok(reopened)
  assert.equal(reopened.favorite, undefined)
})

// ── Source guards: every place that can perform the FIRST save for a new
//    quick-session id must forward a carried favorite, or the star still
//    disappears the moment the repeat actually gets logged. ──

const ROOT = path.join(__dirname, '..', '..', '..')
function readSource(rel: string): string {
  return fs.readFileSync(path.join(ROOT, rel), 'utf8')
}

test('Sessions tab passes the source favorite into the repeat draft', () => {
  const src = readSource('app/dashboard/workout/hub/HubClient.tsx')
  const start = src.indexOf('async function openSession')
  assert.ok(start !== -1, 'could not locate openSession')
  const fn = src.slice(start, start + 900)
  assert.match(fn, /\(log\.favorite\s*\?\s*\{\s*favorite:\s*true\s*\}\s*:\s*\{\}\)/)
})

test('quick-session overview save forwards a carried favorite', () => {
  const src = readSource('app/dashboard/workout/quick-session/page.tsx')
  assert.match(src, /\.\.\.\(session\.favorite\s*&&\s*\{\s*favorite:\s*true\s*\}\)/)
})

test('Live workout quick-session save forwards a carried favorite', () => {
  const src = readSource('app/dashboard/workout/[programId]/workout/live/LiveWorkoutClient.tsx')
  assert.match(src, /favorite\?:\s*boolean\s*\}\s*\|\s*null/, 'quickMeta must type favorite')
  assert.match(src, /favorite:\s*stored\?\.favorite/, 'quickMeta must be populated from the stashed draft')
  assert.match(src, /\.\.\.\(quickMeta\?\.favorite\s*&&\s*\{\s*favorite:\s*true\s*\}\)/)
})

test('Track (form) quick-session saves forward a carried favorite', () => {
  const src = readSource('app/dashboard/workout/[programId]/workout/WorkoutFormClient.tsx')
  const matches = src.match(/\.\.\.\(stored\?\.favorite\s*&&\s*\{\s*favorite:\s*true\s*\}\)/g) ?? []
  assert.equal(matches.length, 2, 'both the completion save and the incomplete autosave must forward favorite')
})

test('handleQuickSessionSave only sets favorite on the FIRST insert for a sessionId, never on update', () => {
  const src = readSource('app/api/workouts/route.ts')
  const start = src.indexOf('async function handleQuickSessionSave')
  assert.ok(start !== -1, 'could not locate handleQuickSessionSave')
  const fn = src.slice(start, start + 4000)

  assert.match(fn, /favorite\s*}\s*=\s*body/, 'must destructure favorite from the request body')

  const setIdx = fn.indexOf('$set: {')
  const pushIdx = fn.indexOf('$push: {')
  assert.ok(setIdx !== -1 && pushIdx !== -1 && setIdx < pushIdx, 'expected update $set before insert $push')
  const updateClause = fn.slice(setIdx, pushIdx)
  const insertClause = fn.slice(pushIdx, pushIdx + 800)

  assert.doesNotMatch(updateClause, /favorite/, 'the update-if-exists branch must never touch favorite')
  assert.match(insertClause, /\.\.\.\(favorite === true && \{ favorite: true \}\)/, 'the insert branch must carry a truthy favorite')
})
