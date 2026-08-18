// Run with: npx tsx --test tests/unit/becomingWeeks.test.ts

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildWeeks, emptyDay, weekScore, stepFor, subjectFor, STEP_UP, STEP_FLAT, STEP_DOWN, FLOOR_BELOW_PEAK, type DayEvents } from '../../lib/becoming/weeks'

function days(spec: Record<string, Partial<DayEvents>>): Map<string, DayEvents> {
  const m = new Map<string, DayEvents>()
  for (const [k, v] of Object.entries(spec)) m.set(k, { ...emptyDay(), ...v })
  return m
}
const base = { todayKey: '2026-08-18', weeklyTarget: 4, logTarget: 5, proteinTarget: 5, targetWeight: 205, weightUnit: 'lbs' as const, direction: 'lose' as const, identity: null }

test('score: full week hitting target + logging + mind ≈ 100; nothing = 0; partial week scored on days elapsed', () => {
  assert.equal(weekScore({ workouts: 4, target: 4, logDays: 7, mindDays: 7 }, 7), 100)
  assert.equal(weekScore({ workouts: 0, target: 4, logDays: 0, mindDays: 0 }, 7), 0)
  // Tuesday (2 days in): 1 workout, logged both days, mind both days → not punished for the 5 days that have not happened
  const partial = weekScore({ workouts: 1, target: 4, logDays: 2, mindDays: 2 }, 2)
  assert.ok(partial >= 90, String(partial))
})

test('steps: up ≥ 60, flat ≥ 30, else down', () => {
  assert.equal(stepFor(60), 'up'); assert.equal(stepFor(59), 'flat'); assert.equal(stepFor(30), 'flat'); assert.equal(stepFor(29), 'down')
})

test('the path always moves forward, climbs on good weeks, never drops much, floors at 0; the live week does not move it', () => {
  // wk Aug 2 (first, start), wk Aug 9 good, wk Aug 16 = current
  const d = days({
    '2026-08-03': { workouts: ['Day 1'], foodLogged: true, mindSession: true },
    '2026-08-10': { workouts: ['Day 1'], foodLogged: true, mindSession: true }, '2026-08-11': { workouts: ['Day 2'], foodLogged: true, mindSession: true },
    '2026-08-12': { workouts: ['Day 3'], foodLogged: true, mindSession: true }, '2026-08-13': { workouts: ['Day 4'], foodLogged: true, mindSession: true },
    '2026-08-14': { foodLogged: true, mindSession: true }, '2026-08-15': { foodLogged: true },
    '2026-08-17': { workouts: ['Day 1'], foodLogged: true },
  })
  const w = buildWeeks({ ...base, days: d })
  assert.equal(w.length, 3)
  assert.equal(w[0].step, 'start'); assert.equal(w[0].altitude, 0)
  assert.equal(w[1].step, 'up'); assert.equal(w[1].altitude, STEP_UP)
  assert.equal(w[2].isCurrent, true); assert.equal(w[2].altitude, STEP_UP, 'live week previews at the last frozen altitude')
  assert.equal(w[1].training.hit, true)
  assert.match(w[1].headline, /whole system|Week hit/)
})

test('a long run of empty weeks collapses into one "away" card; altitude floors at zero', () => {
  const d = days({ '2026-07-05': { workouts: ['x'] }, '2026-08-17': { foodLogged: true } })
  const w = buildWeeks({ ...base, days: d })
  // weeks: Jul 5 (start), Jul 12/19/26 + Aug 2/9 empty (5 → one gap card), Aug 16 current
  assert.equal(w.length, 3)
  assert.equal(w[1].gap?.weeks, 5)
  assert.match(w[1].headline, /Away for 5 weeks/)
  assert.equal(w[1].subject, 'empty')
  assert.equal(w[w.length - 1].altitude, 0, 'never below zero')
  assert.deepEqual(w.map(x => x.index), [0, 1, 2], 're-indexed')
  assert.equal(STEP_DOWN, -0.5)
})

test('short empty runs stay as individual weeks', () => {
  const d = days({ '2026-07-26': { workouts: ['x'] }, '2026-08-17': { foodLogged: true } })
  const w = buildWeeks({ ...base, days: d })
  // Jul 26 start, Aug 2 + Aug 9 empty (2 < 3 → kept), Aug 16 current
  assert.equal(w.length, 4)
  assert.equal(w[1].gap, undefined)
  assert.match(w[1].headline, /A week away/)
})

test('the floor: never more than 1.5 below your best; a clamped dip reads as a hold', () => {
  const spec: Record<string, Partial<DayEvents>> = {}
  // 4 great weeks (Jun 7 → Jul 4), then 5 weeks with one tiny thing each (down but not empty)
  for (const wkStart of ['2026-06-07', '2026-06-14', '2026-06-21', '2026-06-28']) {
    for (let k = 0; k < 5; k++) { const dt = new Date(Date.UTC(2026, 5, Number(wkStart.slice(8)) + k)); const key = dt.toISOString().slice(0, 10); spec[key] = { workouts: ['w'], foodLogged: true, mindSession: true } }
  }
  for (const k of ['2026-07-06', '2026-07-13', '2026-07-20', '2026-07-27', '2026-08-03']) spec[k] = { mood: 3 }
  spec['2026-08-17'] = { foodLogged: true }
  const w = buildWeeks({ ...base, days: days(spec) })
  const peakAlt = Math.max(...w.map(x => x.altitude))
  const minAfterPeak = Math.min(...w.filter(x => x.weekKey >= '2026-07-05').map(x => x.altitude))
  assert.ok(peakAlt - minAfterPeak <= FLOOR_BELOW_PEAK + 1e-9, `${peakAlt} vs ${minAfterPeak}`)
  const clamped = w.filter(x => x.weekKey >= '2026-07-05' && !x.isCurrent)
  assert.ok(clamped.some(x => x.step === 'flat'), 'once the floor holds, dips read as holds')
})

test('subject: what the week was about', () => {
  assert.equal(subjectFor({ workouts: 4, target: 4, logDays: 6, mindDays: 6, sessions: 3 }, 7), 'all')
  assert.equal(subjectFor({ workouts: 4, target: 4, logDays: 1, mindDays: 1, sessions: 0 }, 7), 'training')
  assert.equal(subjectFor({ workouts: 0, target: 4, logDays: 6, mindDays: 1, sessions: 0 }, 7), 'fuel')
  assert.equal(subjectFor({ workouts: 0, target: 4, logDays: 0, mindDays: 5, sessions: 3 }, 7), 'mind')
  assert.equal(subjectFor({ workouts: 0, target: 4, logDays: 0, mindDays: 0, sessions: 0 }, 7), 'empty')
})

test('proof strip: seven days Sun→Sat with what happened; future days on the live week', () => {
  const d = days({ '2026-08-10': { workouts: ['x'] }, '2026-08-17': { workouts: ['a'], foodLogged: true } })
  const w = buildWeeks({ ...base, days: d, todayKey: '2026-08-18' })
  const cur = w[w.length - 1]
  assert.equal(cur.days.length, 7)
  assert.equal(cur.days[0].key, '2026-08-16')
  assert.equal(cur.days[1].workout, true); assert.equal(cur.days[1].food, true)
  assert.equal(cur.days[3].future, true); assert.equal(cur.days[2].future, false)
})

test('story: PRs beat everything but chapters; the scale moving the right way reads as such', () => {
  const d = days({
    '2026-08-03': { workouts: ['x'] },
    '2026-08-10': { workouts: ['a'], prs: [{ name: 'Bench', e1RM: 210 }, { name: 'Squat', e1RM: 300 }], weight: 210 },
    '2026-08-14': { weight: 208 },
    '2026-08-17': { foodLogged: true },
  })
  const w = buildWeeks({ ...base, days: d })
  assert.equal(w[1].headline, '2 personal records')
  assert.equal(w[1].nutrition.delta, -2)
  const d2 = days({ '2026-08-03': { workouts: ['x'] }, '2026-08-10': { weight: 210, foodLogged: true }, '2026-08-14': { weight: 208.5, foodLogged: true }, '2026-08-17': { foodLogged: true } })
  const w2 = buildWeeks({ ...base, days: d2 })
  assert.equal(w2[1].headline, 'The scale moved')
})

test('the current week on its first day is a blank card, not a bad week', () => {
  const d = days({ '2026-08-10': { workouts: ['x'], foodLogged: true }, '2026-08-16': {} })
  const w = buildWeeks({ ...base, days: d, todayKey: '2026-08-16' })
  const cur = w[w.length - 1]
  assert.equal(cur.isCurrent, true)
  assert.equal(cur.headline, 'A new week of becoming')
})

test('maxWeeks caps from the end; the empty middle collapses; indexes stay a simple sequence', () => {
  const d = days({ '2026-01-04': { workouts: ['x'] }, '2026-08-17': { foodLogged: true } })
  const w = buildWeeks({ ...base, days: d, maxWeeks: 10 })
  // 10 weeks kept (Jun 14 → Aug 16): first kept week is empty → 9 empties collapse into one gap + the live week
  assert.equal(w.length, 2)
  assert.equal(w[0].gap?.weeks, 9)
  assert.deepEqual(w.map(x => x.index), [0, 1]); assert.equal(w[1].isCurrent, true)
})

test('hard-week override: stressed or low energy AND the training target hit → the week climbs', () => {
  const spec: Record<string, Partial<DayEvents>> = { '2026-08-03': { workouts: ['x'] } }
  // wk Aug 9: 4 workouts (target 4), nothing else logged (score ~40 → flat), but mostly stressed
  for (const k of ['2026-08-10', '2026-08-11', '2026-08-13', '2026-08-14']) spec[k] = { workouts: ['w'], states: ['stressed'] }
  spec['2026-08-17'] = { foodLogged: true }
  const w = buildWeeks({ ...base, days: days(spec) })
  const hard = w.find(x => x.weekKey === '2026-08-09')!
  assert.equal(hard.step, 'up')
})

test('quiet weeks with a trace are not "away": mood-only, win-only, weight-only; the live week is "still being written"', () => {
  const d = days({ '2026-08-03': { workouts: ['x'] }, '2026-08-10': { mood: 3 }, '2026-08-11': { mood: 4 }, '2026-08-12': { mood: 2, states: ['stressed'] }, '2026-08-17': { mood: 4 } })
  const w = buildWeeks({ ...base, days: d, todayKey: '2026-08-18' })
  const mid = w.find(x => x.weekKey === '2026-08-09')!
  assert.match(mid.headline, /Checked in 3 days/)
  assert.doesNotMatch(mid.sub, /Nothing logged/)
  const live = w[w.length - 1]
  assert.equal(live.isCurrent, true); assert.equal(live.headline, 'Still being written')
  const win = buildWeeks({ ...base, days: days({ '2026-08-03': { workouts: ['x'] }, '2026-08-11': { wins: ['Went anyway'] }, '2026-08-17': { foodLogged: true } }) }).find(x => x.weekKey === '2026-08-09')!
  assert.match(win.headline, /A win, banked/)
  const wt = buildWeeks({ ...base, days: days({ '2026-08-03': { workouts: ['x'] }, '2026-08-11': { weight: 208.2 }, '2026-08-17': { foodLogged: true } }) }).find(x => x.weekKey === '2026-08-09')!
  assert.match(wt.headline, /Weighed in/)
})

test('PR count survives the display cap of 5', () => {
  const prs = Array.from({ length: 8 }, (_, i) => ({ name: `Lift ${i}`, e1RM: 100 + i }))
  const w = buildWeeks({ ...base, days: days({ '2026-08-03': { workouts: ['x'] }, '2026-08-11': { workouts: ['a'], prs }, '2026-08-17': { foodLogged: true } }) })
  const wk = w.find(x => x.weekKey === '2026-08-09')!
  assert.equal(wk.training.prCount, 8); assert.equal(wk.training.prs.length, 5)
  assert.equal(wk.headline, '8 personal records'); assert.ok(wk.tags.includes('8 PRs'))
})

test('a collapsed gap is labelled from its keys, end month included', () => {
  const w = buildWeeks({ ...base, days: days({ '2026-07-05': { workouts: ['x'] }, '2026-08-17': { foodLogged: true } }) })
  assert.equal(w[1].label, 'Jul 12 – Aug 15')
})

test('the live week speaks in the present tense until Sunday', () => {
  // Tue Aug 18: one workout Mon, one meal, target 5 → "1 down, 4 to go"
  let w = buildWeeks({ ...base, weeklyTarget: 5, days: days({ '2026-08-03': { workouts: ['x'] }, '2026-08-17': { workouts: ['a'], foodLogged: true } }), todayKey: '2026-08-18' })
  let live = w[w.length - 1]
  assert.equal(live.headline, '1 down, 4 to go'); assert.match(live.sub, /days left/)
  // Two PRs on the live week → "so far", not "the strongest week on paper so far." past-tense form
  w = buildWeeks({ ...base, days: days({ '2026-08-03': { workouts: ['x'] }, '2026-08-17': { workouts: ['a'], prs: [{ name: 'Bench', e1RM: 200 }, { name: 'Curl', e1RM: 100 }] } }), todayKey: '2026-08-18' })
  live = w[w.length - 1]
  assert.equal(live.headline, '2 personal records, so far'); assert.match(live.sub, /days left/)
  // Frozen weeks keep the past tense
  const frozen = w.find(x => x.weekKey === '2026-08-02')!
  assert.match(frozen.headline, /Where it started/)
  // Week hit early
  w = buildWeeks({ ...base, weeklyTarget: 2, days: days({ '2026-08-03': { workouts: ['x'] }, '2026-08-16': { workouts: ['a'] }, '2026-08-17': { workouts: ['b'] } }), todayKey: '2026-08-18' })
  assert.match(w[w.length - 1].headline, /Week hit, 4 days left/)
})
