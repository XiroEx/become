// Run with: npx tsx --test tests/unit/entitlements/gatePayload.test.ts
//
// Every gate in the app answers with one shape, so the client has exactly one
// branch to render an upsell from. If a route invents its own 403 body the
// upsell silently degrades into a generic error toast, which is how a paywall
// ends up looking like a bug.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  gateResponse,
  defaultMessage,
  FEATURES,
  FREE_LIMITS,
  FEATURE_MIN_TIER,
  TIERS,
  type Feature,
} from '../../../lib/entitlements'

test('gateResponse is always a 403 carrying error + requiresTier + feature', async () => {
  for (const feature of FEATURES) {
    const res = gateResponse({
      error: defaultMessage(feature),
      requiresTier: FEATURE_MIN_TIER[feature],
      feature,
    })
    assert.equal(res.status, 403, feature)

    const body = (await res.json()) as Record<string, unknown>
    assert.equal(typeof body.error, 'string', feature)
    assert.ok((body.error as string).length > 0, feature)
    assert.ok(TIERS.includes(body.requiresTier as (typeof TIERS)[number]), feature)
    assert.equal(body.feature, feature)
  }
})

test('a windowed gate carries a parseable resetsAt; a lifetime one carries null', async () => {
  const windowed: Feature = 'ai-food-estimate'
  const lifetime: Feature = 'custom-exercises'

  const soon = new Date(Date.now() + 3_600_000).toISOString()
  const a = await gateResponse({
    error: defaultMessage(windowed),
    requiresTier: 'plus',
    feature: windowed,
    limit: FREE_LIMITS[windowed].limit,
    remaining: 0,
    resetsAt: soon,
    window: FREE_LIMITS[windowed].window,
  }).json()
  assert.equal(a.remaining, 0)
  assert.ok(Number.isFinite(Date.parse(a.resetsAt as string)))
  assert.equal(a.window, 'day')

  const b = await gateResponse({
    error: defaultMessage(lifetime),
    requiresTier: 'plus',
    feature: lifetime,
    limit: FREE_LIMITS[lifetime].limit,
    remaining: 0,
    resetsAt: null,
    window: FREE_LIMITS[lifetime].window,
  }).json()
  assert.equal(b.resetsAt, null)
  assert.equal(b.window, 'lifetime')
})

test('every feature has its own non-empty copy — no holes, no duplicates', () => {
  const seen = new Set<string>()
  for (const feature of FEATURES) {
    const msg = defaultMessage(feature)
    assert.equal(typeof msg, 'string', feature)
    assert.ok(msg.trim().length > 0, `${feature} has no gate copy`)
    assert.ok(!seen.has(msg), `${feature} reuses another feature's copy: "${msg}"`)
    seen.add(msg)
  }
})
