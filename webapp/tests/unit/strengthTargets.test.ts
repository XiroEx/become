// Run with: npx tsx --test tests/unit/strengthTargets.test.ts
//
// The target model exists because the old one (flat +5%, frozen at goal
// creation) produced targets members had already beaten and rates that made no
// sense for the lift in question. The cases worth pinning are therefore about
// the properties that were previously violated: a target is always ahead of
// you, always on the plate grid, and its rate reflects that lift's own history.

import { test } from 'node:test'
import assert from 'node:assert/strict'

import {
  DEFAULT_HORIZON_WEEKS,
  PLAUSIBLE_E1RM_MAX,
  TIER_RATES,
  assessLift,
  buildStrengthTarget,
  explainTarget,
  isTargetReached,
  loadStep,
  type LiftHistoryPoint,
} from '../../lib/strength/targets'

const NOW = new Date('2026-08-22T12:00:00Z')
const weeksAgo = (n: number) => new Date(NOW.getTime() - n * 7 * 86_400_000)

/** One session, `w` weeks ago, with that day's best-set estimated max. */
const at = (w: number, e1RM: number): LiftHistoryPoint => ({ t: weeksAgo(w), e1RM })

/**
 * The trend window is the last 8 weeks, so these fixtures put the "prior" half
 * at 10 weeks and older and the "recent" half at 7 weeks and newer. Building
 * them by hand rather than interpolating keeps which side of the cutoff each
 * point lands on obvious — an earlier generated version of these fixtures
 * quietly spilled the climb into the recent window and inverted the tiers.
 */
const PRIOR_CLIMB = [at(30, 100), at(25, 108), at(20, 114), at(15, 118), at(12, 120), at(10, 120)]

/** Long history, still climbing hard in the recent window. */
const STILL_CLIMBING = [...PRIOR_CLIMB, at(7, 130), at(5, 138), at(3, 145), at(1, 150)]

/** Long history, best set unchanged for the last 8 weeks. */
function flatAt(peak: number): LiftHistoryPoint[] {
  return [
    at(30, peak * 0.7), at(25, peak * 0.8), at(20, peak * 0.9), at(15, peak * 0.97), at(10, peak),
    at(7, peak), at(5, peak), at(3, peak), at(1, peak),
  ]
}

// ── tier assessment ─────────────────────────────────────────────────────────

test('no history at all is treated as early-stage, and says it could not measure', () => {
  const a = assessLift([], NOW)
  assert.equal(a.tier, 'building')
  assert.equal(a.recentGain, null, 'null means "no trend measured", not "no gain"')
  assert.equal(a.sessions, 0)
})

test('a lift only a few weeks old is early-stage regardless of what it did', () => {
  const a = assessLift([at(3, 100), at(2, 112), at(1, 124), at(0, 130)], NOW)
  assert.equal(a.tier, 'building')
  assert.equal(a.recentGain, null, 'too young to read a trend from')
})

test('a long-trained lift still climbing fast stays on the fast rate', () => {
  const a = assessLift(STILL_CLIMBING, NOW)
  assert.equal(a.tier, 'building')
  assert.ok((a.recentGain ?? 0) > 0.06)
})

test('a long-trained lift that has stopped moving drops to the slow rate', () => {
  const a = assessLift(flatAt(150), NOW)
  assert.equal(a.tier, 'refining')
  assert.ok((a.recentGain ?? 1) <= 0, 'best-recent does not exceed best-prior')
})

test('tier rates are ordered fast → slow', () => {
  assert.ok(TIER_RATES.building > TIER_RATES.progressing)
  assert.ok(TIER_RATES.progressing > TIER_RATES.refining)
})

// ── target construction ─────────────────────────────────────────────────────

test('the target is built from where you are now, not from a stale baseline', () => {
  // The leg-press case from the member report: baseline 547, now 1020. The old
  // model kept pointing at 575. Anything built from `now` cannot do that.
  const t = buildStrengthTarget({ slug: 'leg-press', name: 'Leg Press', currentE1RM: 1020, unit: 'lbs', now: NOW })
  assert.ok(t)
  assert.equal(t.baselineE1RM, 1020)
  assert.ok(t.targetE1RM > 1020, 'a target below your current lift is not a target')
})

test('a light lift still gets a target a whole plate step above it', () => {
  // 0.75%/4wks on a 60 lb curl compounds to well under the 5 lb step. Rounding
  // alone would hand back 60 and render as "target: where you already are".
  const t = buildStrengthTarget({ slug: 'curl', name: 'Curl', currentE1RM: 60, history: flatAt(60), unit: 'lbs', now: NOW })
  assert.ok(t)
  assert.equal(t.tier, 'refining')
  assert.equal(t.targetE1RM, 65, 'floors at one 5 lb step')
})

test('targets land on the plate grid for both units', () => {
  const lbs = buildStrengthTarget({ slug: 'x', name: 'X', currentE1RM: 187, unit: 'lbs', now: NOW })
  const kg = buildStrengthTarget({ slug: 'x', name: 'X', currentE1RM: 84, unit: 'kg', now: NOW })
  assert.equal(lbs!.targetE1RM % loadStep('lbs'), 0)
  assert.equal(kg!.targetE1RM % loadStep('kg'), 0)
})

test('a faster tier produces a further target than a slower one', () => {
  const fast = buildStrengthTarget({ slug: 'a', name: 'A', currentE1RM: 300, history: STILL_CLIMBING, unit: 'lbs', now: NOW })
  const slow = buildStrengthTarget({ slug: 'a', name: 'A', currentE1RM: 300, history: flatAt(300), unit: 'lbs', now: NOW })
  assert.equal(fast!.tier, 'building')
  assert.equal(slow!.tier, 'refining')
  assert.ok(fast!.targetE1RM > slow!.targetE1RM)
})

test('an implausible entry never becomes a target', () => {
  // The 1,939 lb leg extension in real data is a mis-typed weight.
  assert.equal(buildStrengthTarget({ slug: 'le', name: 'Leg Extension', currentE1RM: 1939, unit: 'lbs', now: NOW }), null)
})

test('a target is capped at the plausibility ceiling', () => {
  const t = buildStrengthTarget({ slug: 'x', name: 'X', currentE1RM: PLAUSIBLE_E1RM_MAX - 2, unit: 'lbs', now: NOW })
  assert.ok(t!.targetE1RM <= PLAUSIBLE_E1RM_MAX)
})

test('zero and nonsense current values yield no target rather than NaN', () => {
  for (const bad of [0, -5, Number.NaN, Number.POSITIVE_INFINITY]) {
    assert.equal(buildStrengthTarget({ slug: 'x', name: 'X', currentE1RM: bad, unit: 'lbs', now: NOW }), null)
  }
})

test('the horizon is a training block by default', () => {
  const t = buildStrengthTarget({ slug: 'x', name: 'X', currentE1RM: 200, unit: 'lbs', now: NOW })
  assert.equal(t!.horizonWeeks, DEFAULT_HORIZON_WEEKS)
})

// ── reached ─────────────────────────────────────────────────────────────────

test('a beaten target reports as reached', () => {
  assert.equal(isTargetReached(1020, 575), true)
  assert.equal(isTargetReached(200, 210), false)
  assert.equal(isTargetReached(210, 210), true, 'hitting it exactly counts')
})

// ── explanation ─────────────────────────────────────────────────────────────

test('the explanation names the tier, cites their own numbers, and never promises', () => {
  const t = buildStrengthTarget({ slug: 'bench', name: 'Bench', currentE1RM: 225, history: STILL_CLIMBING, unit: 'lbs', now: NOW })!
  const e = explainTarget(t, 'lbs')
  assert.equal(e.tier, 'building')
  assert.match(e.tierLabel, /Building/)
  assert.ok(e.why.length >= 2, 'at least the trend reason and the rate reason')
  assert.match(e.why.join(' '), /%/, 'quotes a real percentage from their history')
  assert.match(e.method, /right now/, 'says it is built from current strength')
  assert.match(e.caveat, /not a promise/i)
  assert.match(e.headline, /8 weeks/)
})

test('with no history the explanation says so instead of quoting a fake trend', () => {
  const t = buildStrengthTarget({ slug: 'new', name: 'New Lift', currentE1RM: 100, unit: 'lbs', now: NOW })!
  const e = explainTarget(t, 'lbs')
  assert.match(e.why[0], /new lift/i)
})

test('a flat lift is told it is normal rather than that it failed', () => {
  const t = buildStrengthTarget({ slug: 'dl', name: 'Deadlift', currentE1RM: 300, history: flatAt(300), unit: 'lbs', now: NOW })!
  const e = explainTarget(t, 'lbs')
  assert.match(e.why[0], /normal once a lift is well trained/)
})

test('a target the member has already passed explains that, not a negative gain', () => {
  // The real leg-press row: stored target 575, current strength 1020. Explaining
  // the stored number against current strength makes the arithmetic negative,
  // and "works out to about -445 lbs" would be worse than saying nothing.
  const rebuilt = buildStrengthTarget({ slug: 'leg-press', name: 'Leg Press', currentE1RM: 1020, unit: 'lbs', now: NOW })!
  const e = explainTarget({ ...rebuilt, targetE1RM: 575 }, 'lbs')
  assert.match(e.headline, /Already past it/)
  assert.match(e.why.join(' '), /passed it by 445 lbs/)
  assert.doesNotMatch(e.why.join(' '), /-\d/, 'never prints a negative load')
  assert.match(e.why.join(' '), /Set a new one/)
})
