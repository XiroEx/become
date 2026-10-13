// Run with: npm run test:file tests/unit/becomingSignals.test.ts
//
// The Becoming card has been rebuilt twice for one complaint. First it printed
// seven Sun→Sat dots beside a count that measured something else ("1/5" next to
// seven dots). Then the dots became text, but it was still a fixed table of
// pillar rows, so a member who did Mind last week read "Mind · 0 sessions" this
// week and every card had the same shape. These tests pin what replaced it: a
// short ranked list of things the member actually DID, never a zero, never the
// headline said twice, each carrying how it moved against the fair stretch of
// the week before.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildWeeks, emptyDay, type DayEvents } from '../../lib/becoming/weeks'
import {
  weekSignals, journeySignals, isPillarActive, mindMode, pillarCount, activeDays,
  RECENT_WEEKS, MAX_HIGHLIGHTS, RECORD_MIN_WEEKS,
} from '../../lib/becoming/signals'

function days(spec: Record<string, Partial<DayEvents>>): Map<string, DayEvents> {
  const m = new Map<string, DayEvents>()
  for (const [k, v] of Object.entries(spec)) m.set(k, { ...emptyDay(), ...v })
  return m
}
// Weeks start Sunday. 2026-08-16 is a Sunday, 2026-08-18 a Tuesday (day 3).
const base = {
  todayKey: '2026-08-18', weeklyTarget: 5 as number | null, logTarget: 5, proteinTarget: 5,
  targetWeight: 205, weightUnit: 'lbs' as const, direction: 'lose' as const, identity: null,
}
const build = (spec: Record<string, Partial<DayEvents>>, over: Partial<typeof base> = {}) =>
  buildWeeks({ ...base, ...over, days: days(spec) })

type S = ReturnType<typeof weekSignals>
const hl = (s: S, kind: string) => s.highlights.find(h => h.kind === kind)
const kinds = (s: S) => s.highlights.map(h => h.kind)
const live = (weeks: ReturnType<typeof build>) => weeks.length - 1

/* ── never a zero ──────────────────────────────────────────────────────── */

test('Mind last week and none this week is NOT "0 sessions" — it is simply not on the card', () => {
  // The exact report: Mind is in use (a session last week keeps it "active"),
  // so the old row printed "Mind · 0 sessions" on this week's card.
  const weeks = build({
    '2026-08-10': { workouts: ['A'], mindSession: true },
    '2026-08-16': { workouts: ['B'] }, '2026-08-17': { workouts: ['C'] },
  }, { weeklyTarget: null })
  const i = live(weeks)
  assert.equal(isPillarActive(weeks, i, 'mind'), true, 'Mind is still in use — that is what made the zero appear')
  const s = weekSignals(weeks, i)
  assert.equal(hl(s, 'sessions'), undefined)
  assert.equal(hl(s, 'checkins'), undefined)
  for (const h of s.highlights) assert.notEqual(h.value, '0', `${h.kind} drew a zero`)
})

test('no highlight is ever a zero, on any week of a long, patchy journey', () => {
  const weeks = build({
    '2026-06-07': { workouts: ['A'], foodLogged: true },
    '2026-06-15': { mindSession: true },
    '2026-06-23': { mood: 3 },
    '2026-07-05': { foodLogged: true, weight: 210 }, '2026-07-09': { weight: 208 },
    '2026-07-14': { workouts: ['A', 'B'], prs: [{ name: 'Squat', e1RM: 300 }] },
    '2026-07-28': { mindSession: true, states: ['stressed'] },
    '2026-08-04': { foodLogged: true, proteinHit: true },
    '2026-08-16': { workouts: ['C'] },
  })
  for (const [i, s] of journeySignals(weeks).entries()) {
    for (const h of s.highlights) {
      assert.doesNotMatch(h.value, /^[+−-]?0(\.0)?$/, `week ${i} ${h.kind} drew "${h.value}"`)
    }
  }
})

test('a training-only member gets training facts and nothing about food or Mind', () => {
  const weeks = build({
    '2026-08-09': { workouts: ['A'] }, '2026-08-11': { workouts: ['B'] },
    '2026-08-16': { workouts: ['C'] },
  }, { weeklyTarget: null })
  const s = weekSignals(weeks, live(weeks))
  assert.deepEqual(s.active, ['training'])
  assert.ok(s.highlights.length > 0)
  for (const h of s.highlights) assert.equal(h.pillar, 'training')
})

test('a check-in-only member is counted in check-ins, never sessions', () => {
  const weeks = build({
    '2026-08-10': { mood: 4 }, '2026-08-11': { mood: 3 },
    '2026-08-16': { mood: 5 }, '2026-08-17': { mood: 4 },
  })
  const i = live(weeks)
  assert.equal(mindMode(weeks, i), 'checkins')
  const s = weekSignals(weeks, i)
  assert.equal(hl(s, 'sessions'), undefined)
  // The headline already says "Checked in 2 days"; what is left is whether it moved.
  assert.deepEqual(weeks[i].said, ['checkins'])
})

test('a member who runs sessions but only checked in this week sees the check-ins, not "0 sessions"', () => {
  const weeks = build({
    '2026-08-02': { mindSession: true, workouts: ['A'] },
    '2026-08-09': { mindSession: true, workouts: ['A'] },
    '2026-08-16': { mood: 4, workouts: ['B'] }, '2026-08-17': { mood: 3 },
  }, { weeklyTarget: null })
  const i = live(weeks)
  assert.equal(mindMode(weeks, i), 'sessions')
  const s = weekSignals(weeks, i)
  assert.equal(hl(s, 'sessions'), undefined)
  assert.equal(hl(s, 'checkins')?.value, '2')
  assert.equal(hl(s, 'checkins')?.label, 'check-ins')
})

/* ── the shape follows the week ────────────────────────────────────────── */

test('different weeks lead with different things — the card is not a fixed table', () => {
  const weeks = build({
    // Aug 2: a PR week. Aug 9: every day logged. Aug 16 (live): Mind only.
    '2026-08-03': { workouts: ['A'], prs: [{ name: 'Bench', e1RM: 225 }], foodLogged: true },
    '2026-08-09': { foodLogged: true }, '2026-08-10': { foodLogged: true }, '2026-08-11': { foodLogged: true },
    '2026-08-12': { foodLogged: true }, '2026-08-13': { foodLogged: true }, '2026-08-14': { foodLogged: true },
    '2026-08-15': { foodLogged: true, workouts: ['B'] },
    '2026-08-16': { mindSession: true }, '2026-08-17': { mindSession: true },
  })
  const [first, second, third] = journeySignals(weeks)
  // Week one's headline is "Where it started", so the PR is the card's lead.
  assert.equal(first.highlights[0].kind, 'prs')
  assert.equal(first.highlights[0].label, 'Bench · new best')
  assert.equal(first.highlights[0].value, '225')
  // Seven of seven days logged leads the second week, and says why it earned it.
  assert.equal(second.highlights[0].kind, 'logging')
  assert.equal(second.highlights[0].flag, 'every day')
  // The live week was only Mind: its headline tells it, and the card does not
  // pad itself out with a training or food line to fill a template.
  assert.equal(weeks[2].headline, 'The mind is showing up')
  for (const h of third.highlights) assert.equal(h.pillar, 'mind')
  assert.notDeepEqual(kinds(first), kinds(second))
})

test('never more than MAX_HIGHLIGHTS, most telling first', () => {
  assert.equal(MAX_HIGHLIGHTS, 3)
  const weeks = build({
    '2026-08-09': { workouts: ['A'], foodLogged: true, proteinHit: true, mindSession: true, states: ['locked_in'], weight: 212 },
    '2026-08-10': { workouts: ['B'], foodLogged: true, proteinHit: true, mindSession: true, weight: 210 },
    '2026-08-12': { workouts: ['C'], foodLogged: true, proteinHit: true, mood: 4 },
    '2026-08-16': { workouts: ['D'] },
  })
  const s = weekSignals(weeks, 0)
  assert.equal(s.highlights.length, MAX_HIGHLIGHTS)
  const w = s.highlights.map(h => h.weight)
  assert.deepEqual(w, [...w].sort((a, b) => b - a))
})

test('the weigh-in the member wanted ranks near the top and says so', () => {
  const weeks = build({
    '2026-08-09': { weight: 212, mindSession: true }, '2026-08-13': { weight: 210, mindSession: true },
    '2026-08-16': { workouts: ['A'] },
  }, { weeklyTarget: null })
  // The headline for week 0 is "Where it started", so the scale is still the card's to tell.
  const s = weekSignals(weeks, 0, { unit: 'lbs', direction: 'lose' })
  assert.equal(s.highlights[0].kind, 'weight')
  assert.equal(s.highlights[0].value, '−2.0')
  assert.equal(s.highlights[0].unit, 'lbs')
  assert.equal(s.highlights[0].flag, 'the way you want')
})

test('a scale wobble under a pound is noise, not a highlight', () => {
  const weeks = build({ '2026-08-16': { weight: 210, workouts: ['A'] }, '2026-08-17': { weight: 209.6 } })
  assert.equal(hl(weekSignals(weeks, live(weeks)), 'weight'), undefined)
})

test('"days active" appears only when pillars fell on different days', () => {
  // Workout Sunday, food Monday, Mind Tuesday → 3 days active, 1 per pillar.
  const spread = build({ '2026-08-16': { workouts: ['A'] }, '2026-08-17': { foodLogged: true }, '2026-08-18': { mindSession: true } }, { weeklyTarget: null })
  assert.equal(activeDays(spread[0], 3), 3)
  const h = hl(weekSignals(spread, 0), 'active')
  assert.equal(h?.value, '3')
  assert.equal(h?.of, '/3')
  assert.equal(h?.flag, 'every day')
  // Everything on the same day says nothing a single pillar did not.
  const stacked = build({ '2026-08-16': { workouts: ['A'], foodLogged: true, mindSession: true } }, { weeklyTarget: null })
  assert.equal(hl(weekSignals(stacked, 0), 'active'), undefined)
})

/* ── records ───────────────────────────────────────────────────────────── */

test('a count no earlier week reached is "best week yet" — once there is a history to beat', () => {
  assert.equal(RECORD_MIN_WEEKS, 4)
  const weeks = build({
    '2026-07-19': { foodLogged: true }, '2026-07-26': { foodLogged: true },
    '2026-08-02': { foodLogged: true }, '2026-08-03': { foodLogged: true },
    '2026-08-09': { foodLogged: true }, '2026-08-10': { foodLogged: true }, '2026-08-11': { foodLogged: true },
    '2026-08-16': { foodLogged: true },
  })
  const s = journeySignals(weeks)
  assert.equal(hl(s[3], 'logging')?.flag, 'best week yet', '3 days beats 1, 1 and 2 across three earlier weeks')
  // Week two out-logged week one, but "best yet" in week two is just week two.
  assert.equal(hl(s[1], 'logging')?.flag ?? null, null)
})

test('"most in N weeks" counts calendar weeks, so a collapsed away card does not shorten it', () => {
  const weeks = build({
    '2026-06-07': { workouts: ['A', 'B', 'C'] },
    // Jun 14 → Aug 8: eight empty weeks collapse into one "away" card.
    '2026-08-09': { workouts: ['A'] },
    '2026-08-16': { workouts: ['A'] }, '2026-08-17': { workouts: ['B'] }, '2026-08-18': { workouts: ['C'] },
  }, { weeklyTarget: null })
  const i = live(weeks)
  assert.ok(weeks.some(w => w.gap), 'the fixture has an away card')
  assert.ok(i < 10, 'fewer cards than calendar weeks')
  // Three workouts by Tuesday is the most since the Jun 7 week, ten weeks back.
  assert.equal(hl(weekSignals(weeks, i), 'workouts')?.flag, 'most in 10 weeks')
})

test('a tie with a recent week is not a record', () => {
  const weeks = build({
    '2026-07-19': { workouts: ['A'] }, '2026-07-26': { workouts: ['A'] }, '2026-08-02': { workouts: ['A', 'B'] },
    '2026-08-09': { workouts: ['A', 'B'] }, '2026-08-16': { workouts: ['A'] },
  }, { weeklyTarget: null })
  assert.equal(hl(weekSignals(weeks, 3), 'workouts')?.flag ?? null, null)
})

/* ── nothing said twice ────────────────────────────────────────────────── */

test('a PR the headline announced is not repeated underneath it', () => {
  const weeks = build({
    '2026-08-02': { workouts: ['A'] },
    '2026-08-09': { workouts: ['A'] }, '2026-08-10': { workouts: ['A'] },
    '2026-08-11': { workouts: ['B'], prs: [{ name: 'Preacher Curl', e1RM: 120 }] },
    '2026-08-16': { workouts: ['C'] },
  })
  assert.equal(weeks[0].headline, 'Where it started')
  assert.equal(weeks[1].headline, 'New best: Preacher Curl')
  assert.deepEqual(weeks[1].said, ['prs'])
  assert.equal(hl(weekSignals(weeks, 1), 'prs'), undefined)
})

test('a count the headline stated comes back as its change, and only if it moved', () => {
  // "2 down, 3 to go" already names the count. Last week had 1 by Tuesday, so
  // the card adds the one thing the headline cannot: +1 on last week.
  const moved = build({
    '2026-08-09': { workouts: ['A'] },
    '2026-08-16': { workouts: ['B'] }, '2026-08-17': { workouts: ['C'] },
  })
  const i = live(moved)
  assert.equal(moved[i].headline, '2 down, 3 to go')
  const h = hl(weekSignals(moved, i), 'workouts')!
  assert.equal(h.change, true)
  assert.equal(h.value, '+1')
  assert.equal(h.label, 'workout vs last week')
  assert.equal(h.of, null)

  // Level with last week: nothing to add, so nothing drawn.
  const level = build({
    '2026-08-09': { workouts: ['A'] }, '2026-08-10': { workouts: ['B'] },
    '2026-08-16': { workouts: ['C'] }, '2026-08-17': { workouts: ['D'] },
  })
  assert.equal(level[live(level)].headline, '2 down, 3 to go')
  assert.equal(hl(weekSignals(level, live(level)), 'workouts'), undefined)
})

/* ── the change, measured fairly ───────────────────────────────────────── */

test('the live week is compared against the SAME days of the week before, not a full seven', () => {
  // Last week: Sun + Mon + Thu (3). This week (Tue = day 3): Sun + Mon + Tue (3).
  const weeks = build({
    '2026-08-09': { workouts: ['A'] }, '2026-08-10': { workouts: ['B'] }, '2026-08-13': { workouts: ['C'] },
    '2026-08-16': { workouts: ['D'] }, '2026-08-17': { workouts: ['E'] }, '2026-08-18': { workouts: ['F'] },
  }, { weeklyTarget: null })
  const i = live(weeks)
  assert.equal(weeks[i].daysElapsed, 3)
  const t = hl(weekSignals(weeks, i), 'workouts')!
  assert.equal(t.value, '3')
  // Sun–Tue last week was 2, so this is +1 — not level against a full week of 3.
  assert.equal(t.delta, 1)
})

test('a frozen week is compared against the whole week before it', () => {
  const weeks = build({
    '2026-08-02': { workouts: ['A'] },
    '2026-08-09': { mindSession: true }, '2026-08-10': { workouts: ['B'] }, '2026-08-11': { workouts: ['C'] }, '2026-08-12': { workouts: ['D'] },
    '2026-08-16': { workouts: ['E'] },
  }, { weeklyTarget: null })
  const s = weekSignals(weeks, 1)
  assert.equal(weeks[1].isCurrent, false)
  assert.equal(hl(s, 'workouts')!.value, '3')
  assert.equal(hl(s, 'workouts')!.delta, 2)
})

test('two workouts in one day count as two', () => {
  const weeks = build({ '2026-08-09': { workouts: ['A'] }, '2026-08-16': { workouts: ['B', 'C'] } }, { weeklyTarget: null })
  const i = live(weeks)
  assert.equal(pillarCount(weeks[i], 'training', 7), 2)
  assert.equal(hl(weekSignals(weeks, i), 'workouts')!.delta, 1)
})

test('the first week has nothing to compare against, so it shows no change', () => {
  const weeks = build({ '2026-08-17': { workouts: ['A'], foodLogged: true } })
  const s = weekSignals(weeks, 0)
  assert.equal(s.hasDeltas, false)
  for (const h of s.highlights) assert.equal(h.delta, null)
})

test('a workout target is the denominator, and hitting it is the flag', () => {
  const weeks = build({
    '2026-08-02': { workouts: ['A'] },
    '2026-08-09': { workouts: ['A', 'B'], prs: [{ name: 'Row', e1RM: 200 }] }, '2026-08-10': { workouts: ['C'] },
    '2026-08-11': { workouts: ['D'], prs: [{ name: 'Dip', e1RM: 150 }] }, '2026-08-12': { workouts: ['E'] },
    '2026-08-16': { workouts: ['F'] },
  })
  // Two PRs take the headline, so the target is the card's to tell.
  assert.equal(weeks[1].headline, '2 personal records')
  const h = hl(weekSignals(weeks, 1), 'workouts')!
  assert.equal(h.value, '5')
  assert.equal(h.of, '/5')
  assert.equal(h.label, 'workouts')
  assert.equal(h.flag, 'target hit')
})

/* ── relevance window (still decides the nudge and the story copy) ─────── */

test('a pillar dropped longer than the window stops counting as in use; one off-week does not', () => {
  const weeks = build({
    '2026-07-12': { foodLogged: true },
    '2026-07-19': { workouts: ['A'] }, '2026-07-26': { workouts: ['A'] },
    '2026-08-02': { workouts: ['A'] }, '2026-08-09': { workouts: ['A'], mindSession: true },
    '2026-08-16': { workouts: ['A'] },
  })
  const i = live(weeks)
  assert.equal(isPillarActive(weeks, i, 'fuel'), false, 'food is more than RECENT_WEEKS old')
  assert.equal(isPillarActive(weeks, i, 'mind'), true, 'a mind session last week keeps it in use')
  assert.deepEqual(weekSignals(weeks, i).active, ['training', 'mind'])
})

test('the window is exactly RECENT_WEEKS wide', () => {
  assert.equal(RECENT_WEEKS, 4)
  const trained = { '2026-07-19': { workouts: ['A'] }, '2026-07-26': { workouts: ['A'] }, '2026-08-02': { workouts: ['A'] }, '2026-08-09': { workouts: ['A'] }, '2026-08-16': { workouts: ['A'] } }
  const inWindow = build({ ...trained, '2026-07-27': { foodLogged: true } })
  assert.equal(isPillarActive(inWindow, inWindow.length - 1, 'fuel'), true)
  const outOfWindow = build({ ...trained, '2026-07-20': { foodLogged: true } })
  assert.equal(isPillarActive(outOfWindow, outOfWindow.length - 1, 'fuel'), false)
})

/* ── the nudge ─────────────────────────────────────────────────────────── */

test('one nudge, on the live week only, for the highest-priority pillar going unused', () => {
  const weeks = build({ '2026-08-10': { foodLogged: true }, '2026-08-17': { foodLogged: true } })
  const s = weekSignals(weeks, live(weeks))
  assert.equal(s.nudge?.pillar, 'training')
  assert.equal(s.nudge?.lapsed, false)
  assert.equal(s.nudge?.label, 'Log a workout')
  assert.equal(s.nudge?.href, '/dashboard/workout')
  assert.equal(weekSignals(weeks, 0).nudge, null)
})

test('a pillar they used before and dropped is invited back, not sold from scratch', () => {
  const weeks = build({
    '2026-07-12': { mindSession: true },
    '2026-07-19': { workouts: ['A'], foodLogged: true }, '2026-07-26': { workouts: ['A'], foodLogged: true },
    '2026-08-02': { workouts: ['A'], foodLogged: true }, '2026-08-09': { workouts: ['A'], foodLogged: true },
    '2026-08-16': { workouts: ['A'], foodLogged: true },
  })
  const s = weekSignals(weeks, live(weeks))
  assert.equal(s.nudge?.pillar, 'mind')
  assert.equal(s.nudge?.lapsed, true)
  assert.equal(s.nudge?.label, 'Pick Mind back up')
})

test('a member using everything is not nudged at all', () => {
  const weeks = build({ '2026-08-17': { workouts: ['A'], foodLogged: true, mindSession: true } })
  assert.equal(weekSignals(weeks, 0).nudge, null)
})

/* ── the quiet cases ───────────────────────────────────────────────────── */

test('an "away" card reports nothing', () => {
  const weeks = build({ '2026-07-05': { workouts: ['x'] }, '2026-08-17': { foodLogged: true } })
  const gap = weeks.findIndex(w => !!w.gap)
  assert.ok(gap > 0, 'the fixture collapses a run of empty weeks')
  assert.deepEqual(weekSignals(weeks, gap), { active: [], highlights: [], nudge: null, hasDeltas: false })
})

test('journeySignals covers every week, and a bare unit still works as the option', () => {
  const weeks = build({ '2026-08-10': { workouts: ['A'] }, '2026-08-17': { workouts: ['B'] } })
  const all = journeySignals(weeks, 'kg')
  assert.equal(all.length, weeks.length)
  assert.deepEqual(all[weeks.length - 1], weekSignals(weeks, weeks.length - 1, { unit: 'kg' }))
})

test('an out-of-range index is empty rather than a crash', () => {
  const weeks = build({ '2026-08-17': { workouts: ['A'] } })
  assert.deepEqual(weekSignals(weeks, 99), { active: [], highlights: [], nudge: null, hasDeltas: false })
})
