// Run with: npm run test:file tests/unit/becomingSignals.test.ts
//
// The Becoming card used to print all three pillars for everybody, forever, as
// seven Sun→Sat dots plus a count that measured something else ("1/5" beside
// seven dots). These tests pin the two fixes: only the pillars a member is
// actually using get a row, and every row carries how the number MOVED against
// the comparable stretch of the week before.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildWeeks, emptyDay, type DayEvents } from '../../lib/becoming/weeks'
import {
  weekSignals, journeySignals, isPillarActive, mindMode, pillarCount,
  PILLAR_ORDER, RECENT_WEEKS,
} from '../../lib/becoming/signals'

function days(spec: Record<string, Partial<DayEvents>>): Map<string, DayEvents> {
  const m = new Map<string, DayEvents>()
  for (const [k, v] of Object.entries(spec)) m.set(k, { ...emptyDay(), ...v })
  return m
}
// Weeks start Sunday. 2026-08-16 is a Sunday, 2026-08-18 a Tuesday (day 3).
const base = {
  todayKey: '2026-08-18', weeklyTarget: 5, logTarget: 5, proteinTarget: 5,
  targetWeight: 205, weightUnit: 'lbs' as const, direction: 'lose' as const, identity: null,
}
const build = (spec: Record<string, Partial<DayEvents>>, todayKey = base.todayKey) =>
  buildWeeks({ ...base, todayKey, days: days(spec) })

const row = (s: ReturnType<typeof weekSignals>, p: string) => s.rows.find(r => r.pillar === p)

/* ── relevance: only what they use ─────────────────────────────────────── */

test('a member who only trains gets a Training row and no Mind or Fuel rows', () => {
  const weeks = build({
    '2026-08-09': { workouts: ['A'] }, '2026-08-11': { workouts: ['B'] },
    '2026-08-17': { workouts: ['C'] },
  })
  const live = weeks.length - 1
  assert.equal(weeks[live].isCurrent, true)
  const s = weekSignals(weeks, live)
  assert.deepEqual(s.active, ['training'])
  assert.deepEqual(s.rows.map(r => r.pillar), ['training'])
  // The exact complaint: no "0 sessions" for a feature they never opened.
  assert.equal(row(s, 'mind'), undefined)
  assert.equal(row(s, 'fuel'), undefined)
})

test('rows come back in the coach\'s order — training, fuel, mind', () => {
  const weeks = build({
    '2026-08-17': { workouts: ['A'], foodLogged: true, mindSession: true },
  })
  const s = weekSignals(weeks, weeks.length - 1)
  assert.deepEqual(s.rows.map(r => r.pillar), PILLAR_ORDER)
})

test('a pillar dropped longer than the window stops taking up room; one off-week does not', () => {
  // Food logged 4+ weeks ago and never since → gone. Mind logged last week → stays.
  const weeks = build({
    '2026-07-13': { foodLogged: true },
    '2026-07-20': { workouts: ['A'] }, '2026-07-27': { workouts: ['A'] },
    '2026-08-03': { workouts: ['A'] }, '2026-08-10': { workouts: ['A'], mindSession: true },
    '2026-08-17': { workouts: ['A'] },
  })
  const live = weeks.length - 1
  assert.equal(isPillarActive(weeks, live, 'fuel'), false, 'food is more than RECENT_WEEKS old')
  assert.equal(isPillarActive(weeks, live, 'mind'), true, 'a mind session last week keeps the row')
  const s = weekSignals(weeks, live)
  assert.deepEqual(s.active, ['training', 'mind'])
  // And the row honestly reports the zero for the week they ARE mid-habit on.
  assert.equal(row(s, 'mind')!.value, '0 sessions')
})

test('the window is exactly RECENT_WEEKS wide', () => {
  assert.equal(RECENT_WEEKS, 4)
  // Every week carries a workout so none of them collapse into an "away" card —
  // a gap card compresses several weeks into one index and would move the edge.
  const trained = { '2026-07-20': { workouts: ['A'] }, '2026-07-27': { workouts: ['A'] }, '2026-08-03': { workouts: ['A'] }, '2026-08-10': { workouts: ['A'] }, '2026-08-17': { workouts: ['A'] } }
  // Food in the week RECENT_WEEKS-1 back is still in…
  const inWindow = build({ ...trained, '2026-07-28': { foodLogged: true } })
  assert.equal(isPillarActive(inWindow, inWindow.length - 1, 'fuel'), true)
  // …one week earlier than that is out.
  const outOfWindow = build({ ...trained, '2026-07-21': { foodLogged: true } })
  assert.equal(isPillarActive(outOfWindow, outOfWindow.length - 1, 'fuel'), false)
})

test('a check-in-only member gets a Mind row counted in check-ins, never "0 sessions"', () => {
  const weeks = build({
    '2026-08-10': { mood: 4 }, '2026-08-11': { mood: 3 },
    '2026-08-16': { mood: 5 }, '2026-08-17': { mood: 4 },
  })
  const live = weeks.length - 1
  assert.equal(mindMode(weeks, live), 'checkins')
  assert.equal(row(weekSignals(weeks, live), 'mind')!.value, '2 check-ins')
})

test('one session anywhere in the window switches Mind back to reporting sessions', () => {
  const weeks = build({ '2026-08-10': { mindSession: true }, '2026-08-17': { mood: 4 } })
  const live = weeks.length - 1
  assert.equal(mindMode(weeks, live), 'sessions')
  assert.equal(row(weekSignals(weeks, live), 'mind')!.value, '0 sessions')
})

/* ── the change, measured fairly ───────────────────────────────────────── */

test('the live week is compared against the SAME days of the week before, not a full seven', () => {
  // Last week: workouts Sun + Mon + Thu (3). This week (Tue = day 3): Sun + Mon (2).
  const weeks = build({
    '2026-08-09': { workouts: ['A'] }, '2026-08-10': { workouts: ['B'] }, '2026-08-13': { workouts: ['C'] },
    '2026-08-16': { workouts: ['D'] }, '2026-08-17': { workouts: ['E'] },
  })
  const live = weeks.length - 1
  assert.equal(weeks[live].daysElapsed, 3)
  const t = row(weekSignals(weeks, live), 'training')!
  assert.equal(t.value, '2 of 5 workouts')
  // Sun+Mon last week is 2 as well — level, not "down 1" against a full week.
  assert.equal(t.delta, 0)
})

test('a frozen week is compared against the whole week before it', () => {
  const weeks = build({
    '2026-08-03': { workouts: ['A'] },
    '2026-08-10': { workouts: ['B'] }, '2026-08-11': { workouts: ['C'] }, '2026-08-12': { workouts: ['D'] },
    '2026-08-17': { workouts: ['E'] },
  })
  // index 1 is the Aug 9 week (3 workouts) against the Aug 2 week (1).
  const s = weekSignals(weeks, 1)
  assert.equal(weeks[1].isCurrent, false)
  assert.equal(row(s, 'training')!.value, '3 of 5 workouts')
  assert.equal(row(s, 'training')!.delta, 2)
})

test('two workouts in one day count as two — the delta is not a day flag', () => {
  const weeks = build({
    '2026-08-09': { workouts: ['A'] },
    '2026-08-16': { workouts: ['B', 'C'] },
  })
  const live = weeks.length - 1
  assert.equal(pillarCount(weeks[live], 'training', 7), 2)
  assert.equal(row(weekSignals(weeks, live), 'training')!.delta, 1)
})

test('the first week has nothing to compare against, so it shows no delta', () => {
  const weeks = build({ '2026-08-17': { workouts: ['A'], foodLogged: true } })
  const s = weekSignals(weeks, 0)
  assert.equal(s.hasDeltas, false)
  for (const r of s.rows) assert.equal(r.delta, null)
})

test('deltas can be negative, and hasDeltas is true as soon as one row can compare', () => {
  const weeks = build({
    '2026-08-02': { foodLogged: true }, '2026-08-03': { foodLogged: true }, '2026-08-04': { foodLogged: true },
    '2026-08-09': { foodLogged: true },
  })
  const s = weekSignals(weeks, 1)
  assert.equal(row(s, 'fuel')!.delta, -2)
  assert.equal(s.hasDeltas, true)
})

test('notes carry the facts worth a glance: PRs, the weight move, the mood', () => {
  const weeks = build({
    '2026-08-16': { workouts: ['A'], prs: [{ name: 'Bench', e1RM: 315 }], weight: 200, foodLogged: true, mindSession: true, states: ['locked_in'] },
    '2026-08-17': { weight: 204, foodLogged: true },
  })
  const s = weekSignals(weeks, weeks.length - 1, 'lbs')
  assert.equal(row(s, 'training')!.note, '1 PR')
  assert.equal(row(s, 'fuel')!.note, '+4.0 lbs')
  assert.equal(row(s, 'mind')!.note, 'locked in')
})

test('fuel counts against days elapsed on the live week and seven on a frozen one', () => {
  const weeks = build({
    '2026-08-09': { foodLogged: true },
    '2026-08-16': { foodLogged: true }, '2026-08-17': { foodLogged: true },
  })
  assert.equal(row(weekSignals(weeks, 0), 'fuel')!.value, '1 of 7 days')
  assert.equal(row(weekSignals(weeks, weeks.length - 1), 'fuel')!.value, '2 of 3 days')
})

test('training with no weekly target names the workouts instead of inventing a denominator', () => {
  const weeks = buildWeeks({ ...base, weeklyTarget: null, days: days({ '2026-08-17': { workouts: ['A'] } }) })
  assert.equal(row(weekSignals(weeks, 0), 'training')!.value, '1 workout')
})

/* ── the nudge ─────────────────────────────────────────────────────────── */

test('one nudge, on the live week only, for the highest-priority pillar going unused', () => {
  const weeks = build({ '2026-08-10': { foodLogged: true }, '2026-08-17': { foodLogged: true } })
  const live = weeks.length - 1
  const s = weekSignals(weeks, live)
  // Training and Mind are both idle; training leads the order, so it is the one ask.
  assert.equal(s.nudge?.pillar, 'training')
  assert.equal(s.nudge?.lapsed, false)
  assert.equal(s.nudge?.label, 'Log a workout')
  assert.equal(s.nudge?.href, '/dashboard/workout')
  // Never on a frozen card — an August card cannot be acted on.
  assert.equal(weekSignals(weeks, 0).nudge, null)
})

test('a pillar they used before and dropped is invited back, not sold from scratch', () => {
  const weeks = build({
    '2026-07-13': { mindSession: true },
    '2026-07-20': { workouts: ['A'], foodLogged: true }, '2026-07-27': { workouts: ['A'], foodLogged: true },
    '2026-08-03': { workouts: ['A'], foodLogged: true }, '2026-08-10': { workouts: ['A'], foodLogged: true },
    '2026-08-17': { workouts: ['A'], foodLogged: true },
  })
  const s = weekSignals(weeks, weeks.length - 1)
  assert.equal(s.nudge?.pillar, 'mind')
  assert.equal(s.nudge?.lapsed, true)
  assert.equal(s.nudge?.label, 'Pick Mind back up')
})

test('a member using everything is not nudged at all', () => {
  const weeks = build({ '2026-08-17': { workouts: ['A'], foodLogged: true, mindSession: true } })
  assert.equal(weekSignals(weeks, 0).nudge, null)
})

/* ── the quiet cases ───────────────────────────────────────────────────── */

test('an "away" card reports nothing rather than three zeroes', () => {
  const weeks = build({ '2026-07-05': { workouts: ['x'] }, '2026-08-17': { foodLogged: true } })
  const gap = weeks.findIndex(w => !!w.gap)
  assert.ok(gap > 0, 'the fixture collapses a run of empty weeks')
  const s = weekSignals(weeks, gap)
  assert.deepEqual(s.rows, [])
  assert.equal(s.nudge, null)
  assert.equal(s.hasDeltas, false)
})

test('journeySignals covers every week and indexes line up with the weeks array', () => {
  const weeks = build({ '2026-08-10': { workouts: ['A'] }, '2026-08-17': { workouts: ['B'] } })
  const all = journeySignals(weeks, 'lbs')
  assert.equal(all.length, weeks.length)
  assert.deepEqual(all[weeks.length - 1], weekSignals(weeks, weeks.length - 1, 'lbs'))
})

test('an out-of-range index is empty rather than a crash', () => {
  const weeks = build({ '2026-08-17': { workouts: ['A'] } })
  const s = weekSignals(weeks, 99)
  assert.deepEqual(s, { active: [], rows: [], nudge: null, hasDeltas: false })
})
