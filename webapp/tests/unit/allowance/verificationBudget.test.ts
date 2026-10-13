// Run with: npm run test:file tests/unit/allowance/verificationBudget.test.ts
//
// The food-flag relaunch loop was the largest uncapped spend surface in the
// app, and none of it was monetization-specific.
//
// POST /api/nutrition/flags/[id]/evidence incremented `rounds` with no ceiling
// anywhere in the codebase, cleared the re-verify cooldown so the run could not
// be skipped, never called decideFlag(), and never took the atomic Food claim.
// Meanwhile /flags/mine set `canAddEvidence: settled` with no round check, so
// the UI offered "Still wrong? Send better photos" forever. Each turn fired up
// to three graph dispatches, one of them the grounded web search that
// flagPolicy.ts itself calls "the metered cost in this pipeline, roughly an
// order of magnitude above the tokens".
//
// These are the pure halves of the fix.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  MAX_VERIFICATION_ROUNDS,
  verificationBudgetFor,
  roundsExhausted,
} from '../../../lib/nutrition/flagPolicy'

test('round 1 gets the full pipeline', () => {
  const b = verificationBudgetFor(1)
  assert.equal(b.allowLabelRead, true)
  assert.equal(b.allowSearch, true)
  assert.equal(b.allowReview, true)
  assert.equal(b.maxDispatches, 3)
})

test('a relaunch drops the SEARCH and keeps the photo read', () => {
  // The member's new photo is the only genuinely new information in the system.
  // The web has not changed in the minutes since the last search, and
  // gatherEvidence() (OpenFoodFacts, USDA, the photo — deterministic, zero AI
  // cost) still runs in full. So the relaunch keeps its value and sheds the
  // order-of-magnitude cost.
  for (const round of [2, 3]) {
    const b = verificationBudgetFor(round)
    assert.equal(b.allowSearch, false, `round ${round} must not fire the grounded search`)
    assert.equal(b.allowLabelRead, true, `round ${round} must still read the new photo`)
    assert.equal(b.maxDispatches, 2)
  }
})

test('the verdict is never sacrificed', () => {
  // A round that cannot reach a verdict has spent its other dispatches for
  // nothing and leaves the member with no answer at all.
  for (const round of [1, 2, 3, 9]) {
    assert.equal(verificationBudgetFor(round).allowReview, true)
  }
})

test('a malformed round is treated as the first one', () => {
  for (const round of [0, -1, NaN]) {
    assert.equal(verificationBudgetFor(round).allowSearch, true)
  }
})

test('the ceiling is the first round plus two re-runs', () => {
  assert.equal(MAX_VERIFICATION_ROUNDS, 3)
  assert.equal(roundsExhausted(undefined), false, 'a report with no rounds field is on its first')
  assert.equal(roundsExhausted(1), false)
  assert.equal(roundsExhausted(2), false)
  assert.equal(roundsExhausted(3), true)
  assert.equal(roundsExhausted(4), true, 'a row already past the ceiling stays refused')
})
