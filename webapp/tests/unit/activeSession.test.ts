// Run with: npm run test:file tests/unit/activeSession.test.ts
//
// The rule, as the product owner stated it: "if you generated a session and
// never finished it, it stays till you finish. If a new day comes or if you log
// something else (workout, nutrition), regenerate."

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { staleReason, isStillValid } from '../../lib/mind/activeSession'

const TODAY = '2026-08-12'
const AT = (iso: string) => new Date(iso)

const stored = (over: Partial<Parameters<typeof staleReason>[0]> = {}) => ({
  dateKey: TODAY,
  generatedAt: AT('2026-08-12T14:00:00Z'),
  lastWorkoutAt: AT('2026-08-12T11:00:00Z'),
  lastMealAt: AT('2026-08-12T13:00:00Z'),
  ...over,
})

const activity = (workout: string | null, meal: string | null) => ({
  lastWorkoutAt: workout ? AT(workout) : null,
  lastMealAt: meal ? AT(meal) : null,
})

test('an unfinished session survives — that is the whole point', () => {
  const r = staleReason(stored(), TODAY, activity('2026-08-12T11:00:00Z', '2026-08-12T13:00:00Z'))
  assert.equal(r, null)
  assert.equal(isStillValid(stored(), TODAY, activity('2026-08-12T11:00:00Z', '2026-08-12T13:00:00Z')), true)
})

test('a new day regenerates', () => {
  const r = staleReason(stored(), '2026-08-13', activity('2026-08-12T11:00:00Z', '2026-08-12T13:00:00Z'))
  assert.equal(r, 'new_day')
})

test('logging a workout regenerates', () => {
  const r = staleReason(stored(), TODAY, activity('2026-08-12T16:00:00Z', '2026-08-12T13:00:00Z'))
  assert.equal(r, 'workout_logged')
})

test('logging a meal regenerates', () => {
  const r = staleReason(stored(), TODAY, activity('2026-08-12T11:00:00Z', '2026-08-12T18:00:00Z'))
  assert.equal(r, 'meal_logged')
})

test('a first-ever workout regenerates, even though there was nothing to compare to', () => {
  // Stored with no workout watermark; one now exists. The picture moved.
  const r = staleReason(stored({ lastWorkoutAt: null }), TODAY, activity('2026-08-12T16:00:00Z', null))
  assert.equal(r, 'workout_logged')
})

test('deleting a log does not regenerate', () => {
  // Nothing newer than the watermark, so the session stands. Regenerating on a
  // DELETE would let someone lose their place by tidying yesterday's food.
  const r = staleReason(stored(), TODAY, activity(null, null))
  assert.equal(r, null)
})

test('a re-logged meal regenerates even though the count is unchanged', () => {
  // Why watermarks and not counts: delete one meal, add another, count is the
  // same but the day genuinely changed.
  const r = staleReason(stored(), TODAY, activity('2026-08-12T11:00:00Z', '2026-08-12T13:00:01Z'))
  assert.equal(r, 'meal_logged')
})

test('no stored session is not a staleness question', () => {
  assert.equal(staleReason(null, TODAY, activity(null, null)), null)
  assert.equal(isStillValid(null, TODAY, activity(null, null)), false)
})

test('the day check wins over the activity checks', () => {
  // Both would fire; "new day" is the more honest reason to report.
  const r = staleReason(stored(), '2026-08-13', activity('2026-08-13T09:00:00Z', '2026-08-13T09:30:00Z'))
  assert.equal(r, 'new_day')
})
