// Run with: npm run test:file tests/unit/billing/freeTrial.test.ts
//
// The no-card, no-Stripe trial — George, 2026-10-19:
//   "Trial prompt grants 7 days free absolutely no Stripe / no card required.
//    If user says no to the prompt, trial must still be reachable from the
//    Plan page. After 7 days, user can extend the trial another 7 days by
//    putting a card down for recurring monthly or yearly."
//
// trialOfferDue / isTrialEligible (the ORIGINAL, card-based offer) already
// have their own file, trialOfferGate.test.ts / trialCheckout.test.ts. This
// one is just the four functions this card added.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  TRIAL_DAYS,
  cardTrialAvailable,
  freeTrialActive,
  freeTrialDaysRemaining,
  freeTrialEndsAt,
  freeTrialOfferDue,
  hasStartedFreeTrial,
  isTrialEligible,
  type TrialOfferSnapshot,
} from '../../../lib/billing/trial'

const DAY = 24 * 60 * 60 * 1000
const NOW = new Date('2026-10-19T12:00:00.000Z')
const daysAgo = (n: number) => new Date(NOW.getTime() - n * DAY)

// ─── hasStartedFreeTrial / freeTrialActive / freeTrialEndsAt ────────────────

test('never started reads as never started, at every layer', () => {
  assert.equal(hasStartedFreeTrial(undefined), false)
  assert.equal(hasStartedFreeTrial(null), false)
  assert.equal(hasStartedFreeTrial({ status: 'none' }), false)
  assert.equal(freeTrialActive(undefined, NOW), false)
  assert.equal(freeTrialEndsAt(undefined), null)
  assert.equal(freeTrialDaysRemaining(undefined, NOW), 0)
})

test('an unreadable timestamp is treated as never started, not as "running forever"', () => {
  const sub = { status: 'none', freeTrialStartedAt: 'not-a-date' }
  assert.equal(hasStartedFreeTrial(sub), true, 'the field is present')
  assert.equal(freeTrialEndsAt(sub), null, 'but it names no real end')
  assert.equal(freeTrialActive(sub, NOW), false)
})

test('the window is open for exactly TRIAL_DAYS from the start, then closed', () => {
  const startedToday = { status: 'none', freeTrialStartedAt: daysAgo(0) }
  const startedYesterday = { status: 'none', freeTrialStartedAt: daysAgo(1) }
  const startedExactlyTrialDaysAgo = { status: 'none', freeTrialStartedAt: daysAgo(TRIAL_DAYS) }
  const startedLongAgo = { status: 'none', freeTrialStartedAt: daysAgo(TRIAL_DAYS + 1) }

  assert.equal(freeTrialActive(startedToday, NOW), true)
  assert.equal(freeTrialActive(startedYesterday, NOW), true)
  assert.equal(freeTrialActive(startedExactlyTrialDaysAgo, NOW), false, 'the window is closed, not half-open')
  assert.equal(freeTrialActive(startedLongAgo, NOW), false)
})

test('days remaining counts down to zero and never goes negative', () => {
  const startedToday = { status: 'none', freeTrialStartedAt: daysAgo(0) }
  const startedLongAgo = { status: 'none', freeTrialStartedAt: daysAgo(TRIAL_DAYS + 5) }
  assert.equal(freeTrialDaysRemaining(startedToday, NOW), TRIAL_DAYS)
  assert.equal(freeTrialDaysRemaining(startedLongAgo, NOW), 0)
})

// ─── freeTrialOfferDue — the Plan page / modal gate ─────────────────────────

const newMember = (over: Partial<TrialOfferSnapshot> = {}): TrialOfferSnapshot => ({
  tier: 'free',
  checkoutAvailable: true,
  subscription: null,
  ...over,
})

test('a brand-new free member is offered the no-card trial', () => {
  assert.equal(freeTrialOfferDue(newMember()), true)
})

test('UNLIKE trialOfferDue, no checkoutAvailable is required — no Stripe runs this', () => {
  assert.equal(freeTrialOfferDue(newMember({ checkoutAvailable: false })), true)
  assert.equal(freeTrialOfferDue(newMember({ checkoutAvailable: undefined })), true)
  assert.equal(freeTrialOfferDue(newMember({ checkoutAvailable: null })), true)
})

test('no offer to a member who already holds Plus', () => {
  assert.equal(freeTrialOfferDue(newMember({ tier: 'plus' })), false)
})

test('declining the prompt does not spend it — only STARTING it does', () => {
  // The card's bug report: "right now it seems to disappear after declining".
  // Nothing about "no" is recorded anywhere, so the predicate still answers
  // true on the very next read — the Plan page included.
  assert.equal(freeTrialOfferDue(newMember()), true)
  assert.equal(freeTrialOfferDue(newMember()), true)
})

test('once started, it is never offered again — even after it runs out', () => {
  const started = newMember({
    subscription: { status: 'none', freeTrialStartedAt: daysAgo(TRIAL_DAYS + 1) },
  })
  assert.equal(freeTrialOfferDue(started), false)
})

test('real subscription history (any status but none) means no free trial either', () => {
  for (const status of ['trialing', 'active', 'past_due', 'canceled', 'unpaid']) {
    assert.equal(freeTrialOfferDue(newMember({ subscription: { status } })), false, status)
  }
  assert.equal(freeTrialOfferDue(newMember({ subscription: { status: 'none' } })), true)
})

test('fails closed on a missing snapshot', () => {
  assert.equal(freeTrialOfferDue(null), false)
  assert.equal(freeTrialOfferDue(undefined), false)
})

// ─── cardTrialAvailable — the "add a card" extension ────────────────────────

test('a card can extend the trial WHILE it is still running — "get 7 more days instantly"', () => {
  const runningFreeTrial = newMember({
    tier: 'plus', // the no-card grant already put them here
    subscription: { status: 'none', freeTrialStartedAt: daysAgo(1) },
  })
  // Deliberately NOT excluded by tier === 'plus' — unlike freeTrialOfferDue.
  assert.equal(cardTrialAvailable(runningFreeTrial), true)
})

test('a card can extend the trial AFTER it has run out', () => {
  const lapsedFreeTrial = newMember({
    tier: 'free',
    subscription: { status: 'none', freeTrialStartedAt: daysAgo(TRIAL_DAYS + 1) },
  })
  assert.equal(cardTrialAvailable(lapsedFreeTrial), true)
})

test('no card option when checkout cannot work — no button that cannot be pressed', () => {
  assert.equal(cardTrialAvailable(newMember({ checkoutAvailable: false })), false)
})

test('no card option once real subscription history exists', () => {
  assert.equal(cardTrialAvailable(newMember({ subscription: { status: 'canceled' } })), false)
})

test('fails closed on a missing snapshot', () => {
  assert.equal(cardTrialAvailable(null), false)
  assert.equal(cardTrialAvailable(undefined), false)
})

// ─── Starting the no-card trial never spends the card trial ────────────────

test('isTrialEligible stays true through the whole no-card trial — status is never touched', () => {
  for (const daysSinceStart of [0, 1, TRIAL_DAYS, TRIAL_DAYS + 10]) {
    const sub = { status: 'none', freeTrialStartedAt: daysAgo(daysSinceStart) }
    assert.equal(isTrialEligible(sub), true, `${daysSinceStart} days in`)
  }
})
