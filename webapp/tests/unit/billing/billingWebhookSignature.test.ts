// Run with: npx tsx --test tests/unit/billing/billingWebhookSignature.test.ts
//
// The webhook has no verifyAuth — the signature IS the auth. That makes these
// the access-control tests for a route that will happily be POSTed to by
// anyone who finds the URL.
//
// Fully offline: constructEvent and generateTestHeaderString are pure
// node-crypto HMAC on a static of the Stripe class, so this exercises the REAL
// SDK with no key, no account and no socket.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import Stripe from 'stripe'
import { verifyStripeSignature } from '../../../lib/billing/stripeClient'

const SECRET = 'whsec_become_unit_test_secret'
const OTHER_SECRET = 'whsec_a_completely_different_endpoint'

const FIXTURE = {
  id: 'evt_test_signature',
  object: 'event',
  api_version: '2026-08-26.dahlia',
  created: 1_756_700_000,
  livemode: false,
  type: 'customer.subscription.updated',
  data: { object: { id: 'sub_test_1', object: 'subscription' } },
}

const payload = JSON.stringify(FIXTURE)

function header(overrides: { secret?: string; timestamp?: number } = {}): string {
  return Stripe.webhooks.generateTestHeaderString({
    payload,
    secret: overrides.secret ?? SECRET,
    ...(overrides.timestamp !== undefined ? { timestamp: overrides.timestamp } : {}),
  })
}

test('a correctly signed payload verifies and yields the event', async () => {
  const result = await verifyStripeSignature(payload, header(), SECRET)
  assert.equal(result.ok, true)
  if (!result.ok) return
  assert.equal(result.event.id, 'evt_test_signature')
  assert.equal(result.event.type, 'customer.subscription.updated')
})

test('a tampered payload is refused', async () => {
  // The classic real-world cause is re-serializing the body: request.json()
  // then JSON.stringify changes key order or whitespace and the HMAC no longer
  // matches. This simulates that with an outright edit.
  const tampered = payload.replace('"livemode":false', '"livemode":true')
  const result = await verifyStripeSignature(tampered, header(), SECRET)
  assert.deepEqual(result, { ok: false, reason: 'invalid_signature' })
})

test('a signature from a different endpoint secret is refused', async () => {
  const result = await verifyStripeSignature(payload, header({ secret: OTHER_SECRET }), SECRET)
  assert.deepEqual(result, { ok: false, reason: 'invalid_signature' })
})

test('a stale timestamp is refused by the default tolerance', async () => {
  // Replay protection. An hour old is far outside Stripe's 300s default.
  const stale = header({ timestamp: Math.floor(Date.now() / 1000) - 3600 })
  const result = await verifyStripeSignature(payload, stale, SECRET)
  assert.deepEqual(result, { ok: false, reason: 'invalid_signature' })
})

test('a missing signature header is its own distinct refusal', async () => {
  assert.deepEqual(await verifyStripeSignature(payload, null, SECRET), {
    ok: false,
    reason: 'missing_signature',
  })
  assert.deepEqual(await verifyStripeSignature(payload, '', SECRET), {
    ok: false,
    reason: 'missing_signature',
  })
})

test('no configured secret refuses everything — it never verifies by default', async () => {
  // Fail CLOSED. A missing whsec must not mean "skip verification".
  assert.deepEqual(await verifyStripeSignature(payload, header(), undefined), {
    ok: false,
    reason: 'unconfigured',
  })
  assert.deepEqual(await verifyStripeSignature(payload, header(), ''), {
    ok: false,
    reason: 'unconfigured',
  })
})

test('the real SDK rejects a bad signature with StripeSignatureVerificationError', () => {
  // Pinning the error class the wrapper swallows, so a future refactor that
  // narrows on it has something to narrow on.
  assert.throws(
    () => Stripe.webhooks.constructEvent(payload, header({ secret: OTHER_SECRET }), SECRET),
    (error: unknown) => error instanceof Stripe.errors.StripeSignatureVerificationError,
  )
})
