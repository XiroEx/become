// Run with: npm run test:file tests/unit/billing/freeTrial.test.ts
//
// The no-card, no-Stripe 7-day trial (the card, George 2026-10-19):
//   1. Grants 7 days of Plus with no card and no Stripe involvement.
//   2. Declining costs nothing — the offer stays due until it is actually
//      started, from anywhere, including the Plan page.
//   3. The up-front "put a card down for +7 more days" option is a SEPARATE
//      predicate (`cardTrialAvailable`) that stays true during an active free
//      trial, unlike the onboarding-only `trialOfferDue`.
//   4/5. Putting a card down reuses the EXISTING card-backed trial
//      (`isTrialEligible` / `TRIAL_DAYS` / POST /api/billing/checkout) —
//      trialCheckout.test.ts already pins that route's wiring; this file only
//      pins that the no-card trial does not block it.
//
// Booting the real route needs a request, a database and (for checkout) a
// Stripe account — what actually breaks in practice is wiring, and wiring is
// visible in the source, same style as trialCheckout.test.ts.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import {
  TRIAL_DAYS,
  cardTrialAvailable,
  freeTrialActive,
  freeTrialDaysRemaining,
  freeTrialEndsAt,
  freeTrialOfferDue,
  hasStartedFreeTrial,
  isTrialEligible,
  trialOfferDue,
} from '../../../lib/billing/trial'

const ROOT = path.join(__dirname, '../../..')
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8')
const START_ROUTE = 'app/api/billing/trial/start/route.ts'
const STATUS_ROUTE = 'app/api/billing/trial/status/route.ts'

const DAY = 86_400_000
const NOW = new Date('2026-10-19T12:00:00.000Z')
const at = (days: number) => new Date(NOW.getTime() + days * DAY)

/** Source with comments stripped, so a rule about what the CODE must not do
 *  is not tripped by prose explaining the rule — same helper as
 *  tests/unit/entitlements/planPage.test.tsx. */
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:'"`])\/\/.*$/gm, '$1')
}

test('TRIAL_DAYS is the 7 days the card asks for, both halves', () => {
  assert.equal(TRIAL_DAYS, 7)
})

// ─── hasStartedFreeTrial / freeTrialEndsAt / freeTrialActive / freeTrialDaysRemaining ───

test('hasStartedFreeTrial is false for a brand-new account', () => {
  assert.equal(hasStartedFreeTrial(undefined), false)
  assert.equal(hasStartedFreeTrial(null), false)
  assert.equal(hasStartedFreeTrial({ status: 'none' }), false)
})

test('hasStartedFreeTrial is true the instant it is stamped, and stays true', () => {
  assert.equal(hasStartedFreeTrial({ status: 'none', freeTrialStartedAt: at(0) }), true)
  assert.equal(hasStartedFreeTrial({ status: 'none', freeTrialStartedAt: at(-30) }), true)
})

test('freeTrialEndsAt is null until the trial is started', () => {
  assert.equal(freeTrialEndsAt(undefined), null)
  assert.equal(freeTrialEndsAt({ status: 'none' }), null)
})

test('freeTrialEndsAt is exactly TRIAL_DAYS after it started', () => {
  const started = at(0)
  const ends = freeTrialEndsAt({ freeTrialStartedAt: started })
  assert.equal(ends?.getTime(), started.getTime() + TRIAL_DAYS * DAY)
})

test('freeTrialActive is true inside the week and false the instant it ends', () => {
  const justStarted = { status: 'none', freeTrialStartedAt: at(0) }
  const almostOver = { status: 'none', freeTrialStartedAt: at(-TRIAL_DAYS + 0.01) }
  const justOver = { status: 'none', freeTrialStartedAt: at(-TRIAL_DAYS) }
  const longOver = { status: 'none', freeTrialStartedAt: at(-30) }
  assert.equal(freeTrialActive(justStarted, NOW), true)
  assert.equal(freeTrialActive(almostOver, NOW), true)
  assert.equal(freeTrialActive(justOver, NOW), false)
  assert.equal(freeTrialActive(longOver, NOW), false)
})

test('freeTrialActive steps aside the moment a card lands, however old it is', () => {
  // status moved to 'trialing' — Stripe's own clock governs now, not this one.
  const cardStarted = { status: 'trialing', freeTrialStartedAt: at(0) }
  assert.equal(freeTrialActive(cardStarted, NOW), false)
})

test('freeTrialActive is false when never started', () => {
  assert.equal(freeTrialActive(undefined, NOW), false)
  assert.equal(freeTrialActive({ status: 'none' }, NOW), false)
})

test('freeTrialDaysRemaining rounds UP and floors at 0', () => {
  assert.equal(freeTrialDaysRemaining({ freeTrialStartedAt: at(0) }, NOW), TRIAL_DAYS)
  // A few hours in — still reads as the full week, not "6 days".
  const sixHoursIn = new Date(at(0).getTime() + 6 * 60 * 60 * 1000)
  assert.equal(freeTrialDaysRemaining({ freeTrialStartedAt: at(0) }, sixHoursIn), TRIAL_DAYS)
  assert.equal(freeTrialDaysRemaining({ freeTrialStartedAt: at(-TRIAL_DAYS) }, NOW), 0)
  assert.equal(freeTrialDaysRemaining({ freeTrialStartedAt: at(-30) }, NOW), 0)
  assert.equal(freeTrialDaysRemaining(undefined, NOW), 0)
})

// ─── freeTrialOfferDue ────────────────────────────────────────────────────────

test('a brand-new free member is offered the free trial, with no Stripe required', () => {
  assert.equal(freeTrialOfferDue({ tier: 'free', checkoutAvailable: false, subscription: null }), true)
  assert.equal(
    freeTrialOfferDue({ tier: 'free', checkoutAvailable: undefined, subscription: { status: 'none' } }),
    true,
  )
})

test('declining costs nothing — the offer is still due after a decline', () => {
  // "Declining" never writes anything: freeTrialStartedAt stays absent, so the
  // predicate that gates the Plan page's CTA is unchanged either way.
  const declined = { tier: 'free', subscription: { status: 'none' } }
  assert.equal(freeTrialOfferDue(declined), true)
})

test('no second grant once the free trial has been started, active or spent', () => {
  assert.equal(
    freeTrialOfferDue({ tier: 'plus', subscription: { status: 'none', freeTrialStartedAt: at(-1) } }),
    false,
  )
  // Expired back to free — still not due again; it is a one-time grant.
  assert.equal(
    freeTrialOfferDue({ tier: 'free', subscription: { status: 'none', freeTrialStartedAt: at(-30) } }),
    false,
  )
})

test('already Plus some other way (grandfathered, admin, a real sub) is not due', () => {
  assert.equal(freeTrialOfferDue({ tier: 'plus', subscription: { status: 'none' } }), false)
  assert.equal(freeTrialOfferDue({ tier: 'plus', subscription: { status: 'active' } }), false)
})

test('freeTrialOfferDue fails closed on a missing snapshot', () => {
  assert.equal(freeTrialOfferDue(null), false)
  assert.equal(freeTrialOfferDue(undefined), false)
})

// ─── cardTrialAvailable ───────────────────────────────────────────────────────

test('cardTrialAvailable needs checkoutAvailable, same as the onboarding offer', () => {
  assert.equal(
    cardTrialAvailable({ tier: 'free', checkoutAvailable: false, subscription: { status: 'none' } }),
    false,
  )
})

test('cardTrialAvailable stays true DURING an active free trial — the gap trialOfferDue leaves', () => {
  const midFreeTrial = {
    tier: 'plus',
    checkoutAvailable: true,
    subscription: { status: 'none', freeTrialStartedAt: at(-2) },
  }
  // The onboarding-only predicate would wrongly bail here:
  assert.equal(trialOfferDue(midFreeTrial), false)
  // ...but the plan page's predicate must not:
  assert.equal(cardTrialAvailable(midFreeTrial), true)
})

test('cardTrialAvailable stays true AFTER the free trial has expired', () => {
  const expired = {
    tier: 'free',
    checkoutAvailable: true,
    subscription: { status: 'none', freeTrialStartedAt: at(-30) },
  }
  assert.equal(cardTrialAvailable(expired), true)
})

test('cardTrialAvailable is false once a real subscription exists', () => {
  const realSub = {
    tier: 'plus',
    checkoutAvailable: true,
    subscription: { status: 'trialing', freeTrialStartedAt: at(-2) },
  }
  assert.equal(isTrialEligible(realSub.subscription), false)
  assert.equal(cardTrialAvailable(realSub), false)
})

test('cardTrialAvailable is false for Plus-for-another-reason (grandfathered / admin)', () => {
  const grandfathered = { tier: 'plus', checkoutAvailable: true, subscription: { status: 'none' } }
  assert.equal(cardTrialAvailable(grandfathered), false)
})

test('cardTrialAvailable fails closed on a missing snapshot', () => {
  assert.equal(cardTrialAvailable(null), false)
  assert.equal(cardTrialAvailable(undefined), false)
})

// ─── The routes' wiring ───────────────────────────────────────────────────────

test('the start route reads freeTrialOfferDue before writing anything', () => {
  const src = read(START_ROUTE)
  assert.match(src, /from ['"]@\/lib\/billing\/trial['"]/)
  assert.match(src, /freeTrialOfferDue\(/)
  assert.match(src, /if \(!freeTrialOfferDue\(snapshot\)\)/)
  assert.match(src, /status: 409/, 'a stale request is refused, not silently accepted')
})

test('the start route never hand-writes tier — it derives, like every other writer', () => {
  // tests/unit/entitlements/gates.test.ts ("no API route other than the admin
  // one writes tier") is the scan that enforces this across app/api — this
  // pins the SAME rule for this one route, with the reason attached.
  const src = read(START_ROUTE)
  assert.doesNotMatch(src, /tier:\s*['"]/, 'no hand-written tier literal')
  assert.doesNotMatch(src, /\.tier\s*=[^=]/, 'no hand-written tier assignment')
  assert.match(src, /from ['"]@\/lib\/subscription['"]/)
  assert.match(src, /tierUpdateFor\(/)
  assert.match(src, /'subscription\.freeTrialStartedAt':\s*now/)
})

test('the start route never writes trial_period_days or imports Stripe', () => {
  // Comments are allowed to explain the relationship to the card-backed
  // trial (which DOES touch Stripe) — the rule is about the CODE.
  const code = stripComments(read(START_ROUTE))
  assert.doesNotMatch(code, /stripe/i)
  assert.doesNotMatch(code, /trial_period_days/)
})

test('the status route reports every predicate from the one shared module', () => {
  const src = read(STATUS_ROUTE)
  for (const fn of [
    'hasStartedFreeTrial',
    'freeTrialActive',
    'freeTrialOfferDue',
    'freeTrialEndsAt',
    'freeTrialDaysRemaining',
    'cardTrialAvailable',
  ]) {
    assert.match(src, new RegExp(`${fn}\\(`), `${STATUS_ROUTE} must call ${fn}`)
  }
  assert.match(src, /from ['"]@\/lib\/billing\/trial['"]/)
})

test('neither new route is the pinned NP-015 surface — both stay separate from it', () => {
  // tests/unit/contract/np015Routes.test.ts pins /api/me/entitlements and
  // /api/billing/status field-for-field against the published @become/core
  // schema. Folding the free trial into either would need a core version
  // bump this repo cannot publish — see the header comment on both routes.
  const contract = read('tests/unit/contract/np015Routes.test.ts')
  assert.doesNotMatch(contract, /billing\/trial/)
})
