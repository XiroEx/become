// Run with: npx tsx --test tests/unit/goals.test.ts

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { paceRead, etaWeeks, formatEta, defaultPaceKg, isAchieved, KG_PER_LB, fmtUnit, clampPaceKg, directionFromWeights } from '../../lib/goals/pace'
import { readAdherence } from '../../lib/goals/adherence'
import { avgWorkoutsPerWeek, suggestLiftTargets, liftProgress } from '../../lib/goals/training'
import { suggestNutrition, suggestTraining, pickGoalNudge } from '../../lib/goals/suggestions'

const LB = KG_PER_LB
const d = (s: string) => new Date(s + 'T12:00:00Z')

// ── pace ─────────────────────────────────────────────────────────────────────

test('Jon: 208 → 205 at 1 lb/wk is ~3 weeks', () => {
  const w = etaWeeks(208 * LB, 205 * LB, 1 * LB)
  assert.ok(w && Math.abs(w - 3) < 0.01)
  assert.equal(formatEta(w), '~3 wks')
  assert.equal(formatEta(0.4), '~3 days')
  assert.equal(formatEta(0.2), 'this week')
  assert.equal(formatEta(0), 'there')
})

test('on pace / behind / ahead read against the plan line from the baseline', () => {
  const base = { baselineKg: 200 * LB, baselineDate: d('2026-08-01'), targetKg: 180 * LB, paceKg: 1 * LB, direction: 'lose' as const, now: d('2026-08-29') } // 4 weeks in → plan says 196
  assert.equal(paceRead({ ...base, latestKg: 196 * LB }).status, 'on')
  assert.equal(paceRead({ ...base, latestKg: 195.5 * LB }).status, 'on', 'inside 1 lb tolerance')
  const behind = paceRead({ ...base, latestKg: 198 * LB })
  assert.equal(behind.status, 'behind')
  assert.ok(Math.abs(behind.behindByKg - 2 * LB) < 0.01)
  assert.equal(paceRead({ ...base, latestKg: 194 * LB }).status, 'ahead')
})

test('the plan line stops at the target; inside the finish band reads done', () => {
  const r = paceRead({ baselineKg: 200 * LB, baselineDate: d('2026-01-01'), latestKg: 181 * LB, targetKg: 180 * LB, paceKg: 1 * LB, direction: 'lose', now: d('2026-08-01') })
  assert.equal(r.status, 'done')
  assert.equal(r.remainingKg, 0)
})

test('gain direction flips the sign', () => {
  const r = paceRead({ baselineKg: 160 * LB, baselineDate: d('2026-08-01'), latestKg: 161 * LB, targetKg: 175 * LB, paceKg: 0.5 * LB, direction: 'gain', now: d('2026-08-29') }) // plan 162
  assert.equal(r.status, 'behind')
})

test('maintain has no pace', () => {
  const r = paceRead({ baselineKg: 200 * LB, baselineDate: d('2026-08-01'), latestKg: 201 * LB, targetKg: 200 * LB, paceKg: 0, direction: 'maintain', now: d('2026-08-29') })
  assert.equal(r.status, 'na')
})

test('defaults and formatting', () => {
  assert.ok(Math.abs(defaultPaceKg('lose') - LB) < 1e-9)
  assert.ok(Math.abs(defaultPaceKg('gain') - 0.5 * LB) < 1e-9)
  assert.equal(defaultPaceKg('maintain'), 0)
  assert.equal(isAchieved(205.5 * LB, 205 * LB), true)
  assert.equal(isAchieved(208 * LB, 205 * LB), false)
  assert.equal(fmtUnit(1 * LB, 'lbs'), '1 lb')
  assert.equal(fmtUnit(2.5 * LB, 'lbs'), '2.5 lbs')
  assert.equal(fmtUnit(0.5, 'kg'), '0.5 kg')
  assert.equal(clampPaceKg(9), 1.5)
  assert.equal(clampPaceKg(0), 0)
})

test('directionFromWeights reads the target against today, not the goal name', () => {
  // 209 current, 205 target, "Gain Weight" selected in the audit screenshot —
  // the target says lose, whatever the direction button says.
  assert.equal(directionFromWeights(209 * LB, 205 * LB), 'lose')
  assert.equal(directionFromWeights(160 * LB, 175 * LB), 'gain')
  assert.equal(directionFromWeights(180 * LB, 180 * LB), 'maintain')
  assert.equal(directionFromWeights(180 * LB, 181 * LB), 'maintain', 'inside the hold band')
  assert.equal(directionFromWeights(undefined, 180 * LB), null)
  assert.equal(directionFromWeights(180 * LB, undefined), null)
  assert.equal(directionFromWeights(null, null), null)
})

// ── adherence ────────────────────────────────────────────────────────────────

const day = (date: string, calories: number, protein: number, hasData = true) => ({ date, calories, protein, hasData, mealCount: hasData ? 2 : 0 })

test('adherence counts logged days and protein days against the member targets', () => {
  const a = readAdherence([
    day('1', 2200, 160), day('2', 2400, 140), day('3', 0, 0, false), day('4', 2100, 155), day('5', 2600, 120), day('6', 0, 0, false), day('7', 2300, 150),
  ], 150, { logDaysPerWeek: 5, proteinDaysPerWeek: 5 })
  assert.equal(a.logDays, 5); assert.equal(a.logOk, true)
  assert.equal(a.proteinDays, 3); assert.equal(a.proteinOk, false)
})

test('protein is not judged without a goal', () => {
  const a = readAdherence([day('1', 2200, 160)], null, { logDaysPerWeek: 5, proteinDaysPerWeek: 5 })
  assert.equal(a.proteinJudged, false); assert.equal(a.proteinOk, null)
})

// ── training ─────────────────────────────────────────────────────────────────

test('average per week over the last 4 complete weeks, this week excluded', () => {
  const days = ['2026-07-20', '2026-07-22', '2026-07-27', '2026-07-29', '2026-07-31', '2026-08-03', '2026-08-12', '2026-08-17']
  const r = avgWorkoutsPerWeek(days, '2026-08-17', 4)
  // weeks: Jul 19 → 2, Jul 26 → 3, Aug 2 → 1, Aug 9 → 1  (Aug 16 excluded)
  assert.deepEqual(r.counts, [1, 1, 3, 2])
  assert.equal(r.avg, 1.8)
})

test('suggested lift targets are +5% on the top lifts, rounded to 5', () => {
  const s = suggestLiftTargets([{ slug: 'bench', name: 'Bench', e1RM: 200 }, { slug: 'squat', name: 'Squat', e1RM: 300 }, { slug: 'curl', name: 'Curl', e1RM: 60 }, { slug: 'dl', name: 'Deadlift', e1RM: 350 }])
  assert.deepEqual(s.map(x => [x.slug, x.targetE1RM]), [['dl', 370], ['squat', 315], ['bench', 210]])
})

test('lift progress: targets first, then → now → target with % toward it', () => {
  const rows = liftProgress(
    [{ slug: 'bench', name: 'Bench', e1RM: 200 }, { slug: 'squat', name: 'Squat', e1RM: 300 }],
    [{ slug: 'bench', name: 'Bench', e1RM: 205 }, { slug: 'squat', name: 'Squat', e1RM: 320 }],
    [{ slug: 'bench', baselineE1RM: 200, targetE1RM: 210 }],
  )
  assert.equal(rows[0].slug, 'bench'); assert.equal(rows[0].toTargetPct, 50); assert.equal(rows[0].remaining, 5)
  assert.equal(rows[1].slug, 'squat'); assert.equal(rows[1].delta, 20); assert.equal(rows[1].pct, 7)
})

// ── suggestions ──────────────────────────────────────────────────────────────

test('nutrition suggestion order: target → achieved → protein → logging → pace', () => {
  assert.equal(suggestNutrition({ hasTarget: false, direction: null, pace: null, adherence: null, unit: 'lbs', achieved: false }).key, 'nutrition.set-target')
  const a = readAdherence([day('1', 2000, 100), day('2', 2000, 100), day('3', 2000, 100), day('4', 2000, 100), day('5', 2000, 100)], 150, { logDaysPerWeek: 5, proteinDaysPerWeek: 5 })
  const behind = { status: 'behind' as const, expectedKg: 1, aheadByKg: -1, behindByKg: 1, etaWeeks: 3, remainingKg: 2 }
  assert.equal(suggestNutrition({ hasTarget: true, direction: 'lose', pace: behind, adherence: a, unit: 'lbs', achieved: false }).key, 'nutrition.protein', 'protein before pace')
  const good = readAdherence([day('1', 2000, 160), day('2', 2000, 160), day('3', 2000, 160), day('4', 2000, 160), day('5', 2000, 160)], 150, { logDaysPerWeek: 5, proteinDaysPerWeek: 5 })
  const s = suggestNutrition({ hasTarget: true, direction: 'lose', pace: behind, adherence: good, unit: 'lbs', achieved: false })
  assert.equal(s.key, 'nutrition.behind'); assert.match(s.title, /Behind pace by 2\.2 lbs/)
})

test('nutrition suggestion congratulates the instant pace crosses into the finish band, not just once officially achieved', () => {
  const done = { status: 'done' as const, expectedKg: 205 * LB, aheadByKg: 0, behindByKg: 0, etaWeeks: 0, remainingKg: 0 }
  const s = suggestNutrition({ hasTarget: true, direction: 'lose', pace: done, adherence: null, unit: 'lbs', achieved: false })
  assert.equal(s.key, 'nutrition.reached')
  assert.equal(s.severity, 'good')
  // Not the flat "On pace" fallback a member hitting their number used to see.
  assert.notEqual(s.key, 'nutrition.on-pace')
})

test('training suggestion: tight week, lost week, near lift, consistency', () => {
  assert.equal(suggestTraining({ target: 5, thisWeek: 3, remainingThisWeek: 2, chancesLeft: 2, weekLost: false, avgLast4: 4, lifts: [] }).key, 'training.week-tight')
  assert.equal(suggestTraining({ target: 5, thisWeek: 1, remainingThisWeek: 4, chancesLeft: 1, weekLost: true, avgLast4: 4, lifts: [] }).key, 'training.week-lost')
  const near = suggestTraining({ target: 4, thisWeek: 1, remainingThisWeek: 3, chancesLeft: 6, weekLost: false, avgLast4: 4, lifts: [{ slug: 'bench', name: 'Bench', then: 200, now: 206, delta: 6, pct: 3, target: 210, toTargetPct: 60, remaining: 4 }] })
  assert.equal(near.key, 'training.lift.bench')
  assert.equal(suggestTraining({ target: 5, thisWeek: 1, remainingThisWeek: 4, chancesLeft: 5, weekLost: false, avgLast4: 2, lifts: [] }).key, 'training.consistency')
  assert.equal(suggestTraining({ target: null, thisWeek: 0, remainingThisWeek: 0, chancesLeft: 0, weekLost: false, avgLast4: null, lifts: [] }).key, 'training.set-days')
})

test('nudge pick: actionable only, warn first, no repeat inside cooldown', () => {
  const warn = { key: 'nutrition.behind', title: 'b', sub: '', severity: 'warn' as const, url: '/' }
  const nudge = { key: 'training.week-tight', title: 't', sub: '', severity: 'nudge' as const, url: '/' }
  const good = { key: 'nutrition.on-pace', title: 'g', sub: '', severity: 'good' as const, url: '/' }
  const day = 86_400_000
  assert.equal(pickGoalNudge([good], {}, 0, 3 * day), null, 'good never pushes')
  assert.equal(pickGoalNudge([nudge, warn], {}, 0, 3 * day)?.key, 'nutrition.behind', 'warn first')
  assert.equal(pickGoalNudge([warn, nudge], { key: 'nutrition.behind', at: 10 * day }, 11 * day, 3 * day)?.key, 'training.week-tight', 'same rule inside cooldown → next one')
  assert.equal(pickGoalNudge([warn], { key: 'nutrition.behind', at: 10 * day }, 14 * day, 3 * day)?.key, 'nutrition.behind', 'cooldown over → allowed again')
})
