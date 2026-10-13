// Run with: npm run test:file tests/unit/billing/trialCheckout.test.ts
//
// The 10-day Plus trial — the card: a member must ACTIVATE it (never an
// automatic grant), and once started it still goes through the one checkout
// route every other purchase does. Two things are load-bearing here and both
// get their own test:
//
//   1. `isTrialEligible` is pure and total — the gate against a cancel-and-
//      rejoin minting a free trial every time.
//   2. The route only ever writes `trial_period_days` from the SERVER'S own
//      eligibility check, never from the raw request flag — source-text
//      assertions in the style of billingRoutes.test.ts (booting the real
//      handler needs a request, a database and a Stripe account; what
//      actually breaks in practice is wiring, and wiring is visible in the
//      source).

import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { TRIAL_DAYS, isTrialEligible } from '../../../lib/billing/trial'

const ROOT = path.join(__dirname, '../../..')
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8')
const CHECKOUT = 'app/api/billing/checkout/route.ts'

// ─── isTrialEligible ─────────────────────────────────────────────────────────

test('a brand-new account — no subscription subdocument at all — is eligible', () => {
  assert.equal(isTrialEligible(undefined), true)
  assert.equal(isTrialEligible(null), true)
})

test('status "none" (a customer with no completed checkout) is eligible', () => {
  assert.equal(isTrialEligible({ status: 'none' }), true)
})

test('every real subscription status ever written means the trial is spent', () => {
  for (const status of [
    'trialing',
    'active',
    'past_due',
    'canceled',
    'incomplete',
    'incomplete_expired',
    'unpaid',
    'paused',
  ]) {
    assert.equal(isTrialEligible({ status }), false, `${status} must not be eligible`)
  }
})

test('TRIAL_DAYS is the 10 days the card asks for', () => {
  assert.equal(TRIAL_DAYS, 10)
})

// ─── the route's wiring ──────────────────────────────────────────────────────

test('checkout imports the shared trial constant and eligibility check', () => {
  const src = read(CHECKOUT)
  assert.match(src, /from ['"]@\/lib\/billing\/trial['"]/)
  assert.match(src, /isTrialEligible\(/)
})

test('trial_period_days is written from applyTrial, and applyTrial from BOTH the request flag and the eligibility check', () => {
  const src = read(CHECKOUT)
  // The request flag alone must never reach Stripe.
  assert.doesNotMatch(
    src,
    /trial_period_days:\s*wantsTrial/,
    'the raw request flag must not decide the trial on its own',
  )
  assert.match(src, /const applyTrial = wantsTrial && isTrialEligible\(/)
  assert.match(src, /trial_period_days:\s*TRIAL_DAYS/)
  // ...and it rides inside subscription_data, where Checkout expects it.
  const subscriptionDataBlock = src.slice(
    src.indexOf('subscription_data:'),
    src.indexOf('subscription_data:') + 400,
  )
  assert.match(subscriptionDataBlock, /applyTrial \? \{ trial_period_days: TRIAL_DAYS \}/)
})

test('the response always reports what actually happened, not what was asked for', () => {
  const src = read(CHECKOUT)
  assert.match(src, /trialApplied:\s*applyTrial/)
})

test('a request flag of anything but the literal boolean true is not a trial request', () => {
  // Reusing the house pattern from rawPlan: `=== true` only, so `"true"` (a
  // stringified body) or 1 cannot slip a trial past a client that sends the
  // wrong type.
  const src = read(CHECKOUT)
  assert.match(src, /const wantsTrial = \([^)]*\)\?\.trial === true/)
})
