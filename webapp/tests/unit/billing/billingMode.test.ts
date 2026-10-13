// Run with: npm run test:file tests/unit/billing/billingMode.test.ts
//
// Production and beta are two RedRun workspaces on ONE MongoDB. If beta runs
// Stripe in test mode and production runs live, both webhooks write the same
// user.subscription document, and every rule in lib/billing/mode.ts is part of
// keeping a fake beta checkout from granting real paid access — or, worse, a
// beta event from cancelling a subscription somebody is actually paying for.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  BILLING_PLANS,
  canApplyMode,
  customerIdField,
  isPlan,
  resolveStripeMode,
} from '../../../lib/billing/mode'

test('the key decides the mode, not the declaration', () => {
  // A mislabelled STRIPE_MODE next to a live key is the dangerous case: it
  // would let the mode guard treat real money as a test.
  assert.equal(resolveStripeMode('test', 'sk_live_abc123'), 'live')
  assert.equal(resolveStripeMode('live', 'sk_test_abc123'), 'test')

  // Restricted keys carry the same prefix convention.
  assert.equal(resolveStripeMode(undefined, 'rk_live_abc123'), 'live')
  assert.equal(resolveStripeMode(undefined, 'rk_test_abc123'), 'test')
})

test('with no key the declaration breaks the tie, defaulting to test', () => {
  assert.equal(resolveStripeMode('live', undefined), 'live')
  assert.equal(resolveStripeMode('test', undefined), 'test')
  assert.equal(resolveStripeMode(undefined, undefined), 'test')
  assert.equal(resolveStripeMode('', undefined), 'test')
  assert.equal(resolveStripeMode('LIVE', undefined), 'test', 'exact match only')
  assert.equal(resolveStripeMode(42, undefined), 'test')
  assert.equal(resolveStripeMode(undefined, 'not-a-stripe-key'), 'test')
})

test('each mode owns its own customer-id field', () => {
  // A member can hold a live customer and a test customer at once — they live
  // in different Stripe accounts and can never share one field.
  assert.equal(customerIdField('live'), 'stripeCustomerId')
  assert.equal(customerIdField('test'), 'stripeTestCustomerId')
})

test('live state is never overwritten by a test-mode event', () => {
  assert.equal(canApplyMode('live', 'test'), false, 'the whole point of the guard')
  assert.equal(canApplyMode('test', 'live'), true, 'real money wins')
  assert.equal(canApplyMode('live', 'live'), true)
  assert.equal(canApplyMode('test', 'test'), true)
  assert.equal(canApplyMode(undefined, 'test'), true, 'never written before')
  assert.equal(canApplyMode(undefined, 'live'), true)
  assert.equal(canApplyMode(null, 'test'), true, 'mongoose defaults the field to null')
})

test('isPlan accepts only the two real plans', () => {
  for (const plan of BILLING_PLANS) assert.equal(isPlan(plan), true, plan)
  for (const bad of ['weekly', '', null, undefined, 0, {}, ['monthly']]) {
    assert.equal(isPlan(bad), false, JSON.stringify(bad))
  }
})
