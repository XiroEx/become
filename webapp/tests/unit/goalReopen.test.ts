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
//
// Both rules are judged in whole calendar days, because a weigh-in ROW is a
// day-keyed marker while the stamps it is compared against are instants — the
// "day-keyed rows vs instant stamps" block below is the half of the report
// that survived the first fix: a member west of UTC weighing in of an evening
// had the very next morning's 209 sort BEFORE their own achievement.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  KG_PER_LB,
  HOLD_BAND_KG,
  HOLD_WINDOW_DAYS,
  REOPEN_MARGIN_KG,
  driftedSinceAchieved,
  hasDriftedOut,
  holdConfirmed,
  isAchieved,
  utcDayIndex,
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

// ── day-keyed rows vs instant stamps ─────────────────────────────────────────
//
// A weigh-in row is NOT an instant. /api/weight writes
// `utcMidnightDateKey(localToday)`, so the row sits at 00:00Z of the member's
// LOCAL calendar day and denotes a day (lib/dayWindow.ts documents the
// convention, and documents the day-shift that follows from reading one back
// as an instant). `achievedAt` and `now` are instants — whenever ensureGoals
// happened to run. For a member west of UTC logging in the evening the two
// land on DIFFERENT UTC days, and comparing them directly is what these cover.

/** A weigh-in row exactly as /api/weight writes it: 00:00Z of a local day. */
const row = (weight: number, dayKey: string) => ({ kg: weight * LB, date: new Date(`${dayKey}T00:00:00.000Z`) })
/** 8:05pm on 2026-09-08 for a member at UTC−5 — the evening the hold confirmed. */
const EVENING_STAMP = new Date('2026-09-09T01:05:00.000Z')

test('the stamp and the weigh-in that earned it can land on different UTC days', () => {
  // The premise of everything below: this is why the comparison is day-wise.
  assert.equal(utcDayIndex(new Date('2026-09-08T00:00:00.000Z')), utcDayIndex(new Date('2026-09-08T23:59:59.000Z')))
  assert.ok(
    new Date('2026-09-09T00:00:00.000Z').getTime() < EVENING_STAMP.getTime(),
    'the NEXT local day\'s row sorts before an evening stamp when compared as instants',
  )
  assert.equal(utcDayIndex(new Date('2026-09-09T00:00:00.000Z')), utcDayIndex(EVENING_STAMP), 'but it is the same UTC day')
})

test('a 209 the morning after the confirmation re-opens the goal', () => {
  // The reported failure, in real rows: hold confirmed Monday evening, 209 on
  // Tuesday. Compared as instants Tuesday's row is "before" the stamp and this
  // weigh-in disappears from the check for good — "it still says reached".
  const series = [row(205, '2026-09-07'), row(205, '2026-09-08'), row(209, '2026-09-09')]
  assert.equal(driftedSinceAchieved(series, TARGET, HOLD_BAND_KG, EVENING_STAMP), true)
})

test('weigh-ins from calendar days before the confirmation are still history', () => {
  // The climb down, and the member's own confirming weigh-in. Neither re-opens.
  const series = [row(230, '2026-08-01'), row(212, '2026-08-20'), row(205, '2026-09-08')]
  assert.equal(driftedSinceAchieved(series, TARGET, HOLD_BAND_KG, EVENING_STAMP), false)
})

test('the hold window is seven whole days, not seven times twenty-four hours', () => {
  // Same member, same 8pm habit: `now` is on the next UTC day, so a rolling
  // instant window cuts their week down to six local days and drops the older
  // weigh-in — one reading where there were two, and a goal that never confirms.
  const now = new Date('2026-09-21T01:00:00.000Z') // 8pm on 2026-09-20 at UTC−5
  const series = [row(206, '2026-09-14'), row(205, '2026-09-20')]
  assert.ok(series[0].date.getTime() < now.getTime() - HOLD_WINDOW_DAYS * 86_400_000, 'outside a rolling 7×24h window')
  assert.equal(holdConfirmed(series, TARGET, HOLD_BAND_KG, now), true, 'inside the last seven calendar days')
})

test('a miss inside that window still blocks the confirmation', () => {
  // The wider window is not a rubber stamp — it only stops the week being cut short.
  const now = new Date('2026-09-21T01:00:00.000Z')
  assert.equal(holdConfirmed([row(209, '2026-09-14'), row(205, '2026-09-20')], TARGET, HOLD_BAND_KG, now), false)
  assert.equal(holdConfirmed([row(206, '2026-09-06'), row(205, '2026-09-20')], TARGET, HOLD_BAND_KG, now), false, 'and the week still ends')
})

test('the report end to end, in the rows the app actually writes', () => {
  // "I reached the goal weight which was 205 about 2 weeks ago… about a week
  // ago I tracked a weight of 209 and 206 and it still says reached."
  const achievedAt = new Date('2026-09-08T01:30:00.000Z') // 8:30pm on 2026-09-07, UTC−5
  const now = new Date('2026-09-22T14:00:00.000Z')
  const series = [
    row(212, '2026-08-10'), row(208, '2026-08-24'), row(206, '2026-09-06'),
    row(205, '2026-09-07'), row(209, '2026-09-14'), row(206, '2026-09-15'),
  ]
  assert.equal(driftedSinceAchieved(series, TARGET, HOLD_BAND_KG, achievedAt), true, 'the goal re-opens')
  assert.equal(holdConfirmed(series, TARGET, HOLD_BAND_KG, now), false, 'and does not confirm itself again on the same data')
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
