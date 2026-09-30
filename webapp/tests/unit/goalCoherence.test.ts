// Run with: npm run test:file tests/unit/goalCoherence.test.ts
//
// Pinned to the real row that produced "the math ain't mathing": 2,214 cal
// stored against 232p/174c/77f, which is 2,317 cal of macros.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  caloriesFromMacros,
  incoherence,
  isCoherent,
  reconcileGoals,
  COHERENCE_TOLERANCE,
} from '../../lib/nutrition/goalCoherence'

/** The row as it actually sat in production. */
const BROKEN = { calories: 2214, protein: 232, carbs: 174, fats: 77 }

test('the real broken row is detected', () => {
  assert.equal(caloriesFromMacros(BROKEN), 2317)
  assert.equal(isCoherent(BROKEN), false)
  // 103 cal on a 2,214 target is ~4.7% — well past rounding.
  assert.ok(incoherence(BROKEN) > 0.04)
})

test('rounding four numbers to whole grams never trips the check', () => {
  // Worst case: every macro rounded half a gram the same way. 0.5*(4+4+9) = 8.5
  // cal, which must stay inside the tolerance on any realistic target.
  const target = 2000
  const p = 150.5, c = 200.5, f = 65.5
  const rounded = { calories: target, protein: Math.round(p), carbs: Math.round(c), fats: Math.round(f) }
  const exact = { calories: target, protein: p, carbs: c, fats: f }
  const drift = Math.abs(caloriesFromMacros(rounded) - caloriesFromMacros(exact))
  assert.ok(drift <= 9, `rounding drift ${drift} cal`)
  assert.ok(drift / target < COHERENCE_TOLERANCE, 'rounding must not look like an error')
})

test('editing macros recomputes the calorie target', () => {
  const r = reconcileGoals(BROKEN, true)
  assert.equal(r.fix, 'recomputed_calories')
  assert.equal(r.goals.calories, 2317)
  // The macros the member set are left exactly as they set them.
  assert.equal(r.goals.protein, 232)
  assert.equal(r.goals.carbs, 174)
  assert.equal(r.goals.fats, 77)
  assert.ok(isCoherent(r.goals))
})

test('editing calories rescales the macros and keeps the split', () => {
  const r = reconcileGoals(BROKEN, false)
  assert.equal(r.fix, 'rescaled_macros')
  assert.equal(r.goals.calories, 2214)
  assert.ok(isCoherent(r.goals), `still off: ${JSON.stringify(r.goals)}`)

  // Same style of diet, smaller. The protein share should barely move.
  const shareBefore = (4 * BROKEN.protein) / caloriesFromMacros(BROKEN)
  const shareAfter = (4 * r.goals.protein) / caloriesFromMacros(r.goals)
  assert.ok(Math.abs(shareBefore - shareAfter) < 0.01, 'the split must be preserved')
})

test('a row that already adds up is returned untouched', () => {
  const good = { calories: 2318, protein: 232, carbs: 174, fats: 77 }
  const r = reconcileGoals(good, true)
  assert.equal(r.fix, 'none')
  assert.deepEqual(r.goals, good)
  assert.equal(r.was, undefined)
})

test('degenerate input is left alone rather than guessed at', () => {
  // No calorie target: nothing to reconcile against.
  assert.equal(reconcileGoals({ calories: 0, protein: 10, carbs: 10, fats: 10 }, false).fix, 'none')
  // Calories but no macros to scale: a later real write will fix it. Scaling
  // zeros would produce zeros forever.
  const empty = reconcileGoals({ calories: 2000, protein: 0, carbs: 0, fats: 0 }, false)
  assert.equal(empty.fix, 'none')
  assert.equal(empty.goals.calories, 2000)
})

test('the fix is idempotent', () => {
  // Reconciling an already-reconciled row must be a no-op, or repeated saves
  // would walk the numbers away from what the member chose.
  const once = reconcileGoals(BROKEN, true).goals
  const twice = reconcileGoals(once, true)
  assert.equal(twice.fix, 'none')
  assert.deepEqual(twice.goals, once)
})
