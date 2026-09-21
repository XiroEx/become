// Run with: npm run test:file tests/unit/goalReopen.test.ts
//
// Pinned to the report that produced it: "I reached the goal weight which was
// 205 about 2 weeks ago. I haven't tracked every single day. About a week ago
// I tracked a weight of 209 and 206 and it still says reached."
//
// Reaching a weight goal used to be a one-way flip — the first week inside the
// finish band set Goal.status = 'achieved' and nothing ever set it back, so
// every surface kept reading "Reached ✓" through weigh-ins that said otherwise.
// These tests cover the two pure rules the goal state machine now runs on
// (lib/goals/pace.ts): the week-long hold that CONFIRMS a goal, and the drift
// that RE-OPENS one, with hysteresis between them so an edge-of-band scale
// can't flap it. lib/goals/ensure.ts is the (DB-bound) caller of both.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  KG_PER_LB,
  HOLD_BAND_KG,
  REOPEN_MARGIN_KG,
  driftedSinceAchieved,
  hasDriftedOut,
  holdConfirmed,
  isAchieved,
} from '../../lib/goals/pace'
import { readReached } from '../../lib/goals/status'

const LB = KG_PER_LB
const TARGET = 205 * LB
const NOW = new Date('2026-09-21T12:00:00Z')
/** `d` days before NOW. */
const ago = (d: number) => new Date(NOW.getTime() - d * 86_400_000)
const lb = (weight: number, days: number) => ({ kg: weight * LB, date: ago(days) })

// ── the drift line ───────────────────────────────────────────────────────────

test('drifting out needs to clear the band AND the hysteresis margin', () => {
  // The band is ≈2 lb; the re-open line sits ≈1 lb past it.
  assert.equal(hasDriftedOut(205 * LB, TARGET), false, 'on the number')
  assert.equal(hasDriftedOut(206 * LB, TARGET), false, 'inside the band')
  assert.equal(hasDriftedOut(207 * LB, TARGET), false, 'edge of the band, still holding')
  assert.equal(hasDriftedOut(207.5 * LB, TARGET), false, 'outside the band but inside the margin — noise, not drift')
  assert.equal(hasDriftedOut(209 * LB, TARGET), true, 'the weigh-in from the report')
  assert.equal(hasDriftedOut(201 * LB, TARGET), true, 'drift below the target counts too')
  // The margin is what stops the status flapping day to day.
  assert.ok(REOPEN_MARGIN_KG > 0)
  const edge = TARGET + HOLD_BAND_KG + REOPEN_MARGIN_KG / 2
  assert.equal(isAchieved(edge, TARGET), false, 'outside the finish band')
  assert.equal(hasDriftedOut(edge, TARGET), false, 'yet not far enough out to re-open')
})

// ── the reported bug ─────────────────────────────────────────────────────────

test("the report: 205 two weeks ago, then 209 and 206 — the goal re-opens", () => {
  const achievedAt = ago(14)
  const series = [
    lb(212, 40), lb(208, 30), lb(206, 20), lb(205, 15), lb(205, 14),
    lb(209, 8), lb(206, 7),
  ]
  assert.equal(
    driftedSinceAchieved(series, TARGET, HOLD_BAND_KG, achievedAt), true,
    'a 209 logged after the goal was marked achieved breaks the hold',
  )
})

test('the LAST weigh-in being back inside the band does not undo the drift', () => {
  // Reading only the newest number called 209 → 206 "still holding". Every
  // weigh-in since the achievement is judged, not just the latest.
  const achievedAt = ago(14)
  assert.equal(driftedSinceAchieved([lb(209, 8), lb(206, 7)], TARGET, HOLD_BAND_KG, achievedAt), true)
  assert.equal(driftedSinceAchieved([lb(206, 8), lb(209, 7)], TARGET, HOLD_BAND_KG, achievedAt), true, 'order does not matter')
})

test('weigh-ins from BEFORE the achievement never re-open the goal', () => {
  // The climb down to the target is full of numbers outside the band. They are
  // history, not drift.
  const series = [lb(230, 120), lb(220, 90), lb(212, 40), lb(205, 15), lb(205, 14), lb(206, 3)]
  assert.equal(driftedSinceAchieved(series, TARGET, HOLD_BAND_KG, ago(14)), false)
})

test('holding the band after the achievement keeps the goal achieved', () => {
  const series = [lb(205, 14), lb(206, 6), lb(204, 3), lb(205.5, 1)]
  assert.equal(driftedSinceAchieved(series, TARGET, HOLD_BAND_KG, ago(14)), false)
})

test('a goal with no achievedAt stamp is judged on its whole series', () => {
  assert.equal(driftedSinceAchieved([lb(205, 14), lb(209, 7)], TARGET, HOLD_BAND_KG, null), true)
  assert.equal(driftedSinceAchieved([lb(205, 14), lb(206, 7)], TARGET, HOLD_BAND_KG, null), false)
})

// ── the confirmation rule, and what a re-opened goal can do next ─────────────

test('the week-long hold needs two weigh-ins and no misses', () => {
  assert.equal(holdConfirmed([lb(205, 3), lb(206, 1)], TARGET, HOLD_BAND_KG, NOW), true)
  assert.equal(holdConfirmed([lb(205, 3)], TARGET, HOLD_BAND_KG, NOW), false, 'one weigh-in is not a hold')
  assert.equal(holdConfirmed([lb(205, 3), lb(209, 1)], TARGET, HOLD_BAND_KG, NOW), false, 'a miss inside the week breaks it')
  assert.equal(holdConfirmed([lb(205, 30), lb(205, 20)], TARGET, HOLD_BAND_KG, NOW), false, 'both weigh-ins are older than the week')
})

test("the reported goal does not immediately re-achieve: the 209 is still inside the week", () => {
  const series = [lb(205, 15), lb(205, 14), lb(209, 6), lb(206, 5)]
  assert.equal(driftedSinceAchieved(series, TARGET, HOLD_BAND_KG, ago(14)), true, 're-opens')
  assert.equal(holdConfirmed(series, TARGET, HOLD_BAND_KG, NOW), false, 'and stays open until a clean week')
})

test('a clean week after the drift earns the goal back', () => {
  const series = [lb(209, 20), lb(206, 5), lb(205, 2)]
  assert.equal(holdConfirmed(series, TARGET, HOLD_BAND_KG, NOW), true)
})

// ── what the badge is allowed to say ─────────────────────────────────────────

test('"Reached" is the confirmed goal; inside the band today is "At goal"', () => {
  assert.equal(readReached('achieved', 'behind'), 'reached', 'the confirmed goal wins')
  assert.equal(readReached('achieved', null), 'reached')
  assert.equal(readReached('active', 'done'), 'at-goal', 'inside the band, hold not confirmed')
  assert.equal(readReached('active', 'behind'), null)
  assert.equal(readReached('active', 'on'), null)
  assert.equal(readReached('none', null), null)
  assert.equal(readReached(undefined, undefined), null)
})
