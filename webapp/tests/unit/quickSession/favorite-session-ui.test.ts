// Run with: npx tsx --test tests/unit/quickSession/favorite-session-ui.test.ts
//
// "Add favorites for sessions" — source guards for the parts that don't touch
// a live DB and aren't covered by favorite-route.test.ts: the schema field,
// GET /api/workouts/logs surfacing it to the Sessions list, and the Sessions
// tab's toggle button wiring in HubClient.tsx. No jsdom/testing-library in
// this repo (see weightLogSheet.test.tsx), so this follows the same
// source-scan convention rather than mounting the component.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const ROOT = path.join(__dirname, '..', '..', '..')

function readSource(rel: string): string {
  return fs.readFileSync(path.join(ROOT, rel), 'utf8')
}

test('IWorkoutLog / WorkoutLogSchema carry a favorite flag alongside skipped', () => {
  const src = readSource('models/UserProgress.ts')
  assert.match(src, /favorite\?:\s*boolean/, 'IWorkoutLog must declare favorite?: boolean')
  assert.match(src, /favorite:\s*\{\s*type:\s*Boolean\s*\}/, 'WorkoutLogSchema must declare a favorite Boolean field')
})

test('GET /api/workouts/logs history mode returns favorite on each session', () => {
  const src = readSource('app/api/workouts/logs/route.ts')
  assert.match(src, /favorite\?:\s*boolean/, 'RawLog must type the stored favorite field')
  assert.match(
    src,
    /favorite:\s*!!log\.favorite,/,
    'the mapped session object must coerce favorite the same way it does skipped',
  )
})

test('Sessions tab imports a Bookmark toggle and types favorite on SessionLog', () => {
  const src = readSource('app/dashboard/workout/hub/HubClient.tsx')
  assert.match(src, /Bookmark/, 'must use the app-wide Bookmark icon convention (see SavedFoodCard.tsx), not Star/Heart')
  assert.match(src, /interface SessionLog[\s\S]*?favorite\?:\s*boolean[\s\S]*?\n\}/, 'SessionLog must type favorite')
})

test('toggleFavorite stops propagation so starring a card never opens the session', () => {
  const src = readSource('app/dashboard/workout/hub/HubClient.tsx')
  const start = src.indexOf('async function toggleFavorite')
  assert.ok(start !== -1, 'could not locate toggleFavorite')
  const fn = src.slice(start, start + 900)

  assert.match(fn, /e\.stopPropagation\(\)/, 'must stop propagation — the whole session Card is a click target (openSession)')
  assert.match(fn, /if \(!id \|\| togglingFavorite\) return/, 'must no-op without a sessionId and guard against overlapping toggles')
  assert.match(fn, /method:\s*'PATCH'/)
  assert.match(fn, /\/api\/workouts\/session/)
  assert.match(fn, /favorite:\s*next/, 'must send the optimistic next value in the PATCH body')

  // Rollback on failure — the card must not silently drift from server state.
  assert.match(fn, /if \(!res\.ok\) throw new Error/)
  assert.match(src.slice(start, start + 1200), /favorite:\s*!next/, 'must revert the optimistic update on failure')
})

test('the favorite button only renders for sessions with a sessionId, and sits beside (not inside) the tappable card', () => {
  const src = readSource('app/dashboard/workout/hub/HubClient.tsx')
  assert.match(src, /\{log\.sessionId && \(\s*<button/, 'button must be gated on log.sessionId (legacy logs without one cannot be toggled)')
  assert.match(src, /onClick=\{\(e\) => toggleFavorite\(e, log\)\}/)
  // Filled + amber when favorited, outline otherwise — matches the
  // Bookmark/fill-current/amber-500 convention from SavedFoodCard.tsx.
  assert.match(src, /log\.favorite \? 'fill-current text-amber-500' : ''/)
})
