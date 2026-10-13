import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import {
  gateFrom,
  syntheticGate,
  planGate,
  allowanceLine,
  featureHeadline,
  tierLabel,
  formatResetsAt,
  hasManageableBilling,
  FREE_LIMITS,
  FEATURE_LABELS,
  TIER_RANK,
} from '../src/entitlements'

describe('entitlements/gateFrom', () => {
  it('parses valid 403 gate payload', () => {
    const gate = gateFrom(403, {
      error: "You've saved all 3 of your free custom exercises.",
      requiresTier: 'plus',
      feature: 'custom-exercises',
      limit: 3,
      remaining: 0,
      resetsAt: null,
      window: 'lifetime',
    })
    assert.ok(gate)
    assert.equal(gate.feature, 'custom-exercises')
    assert.equal(gate.requiresTier, 'plus')
    assert.equal(gate.limit, 3)
    assert.equal(gate.remaining, 0)
    assert.equal(gate.resetsAt, null)
    assert.equal(gate.window, 'lifetime')
  })

  it('rejects non-403 or non-gate payload', () => {
    assert.equal(gateFrom(401, { error: 'Unauthorized' }), null)
    assert.equal(gateFrom(403, { error: 'Forbidden' }), null)
    assert.equal(gateFrom(403, { error: 'Not owner', feature: 'custom-exercises' }), null)
    assert.equal(gateFrom(403, null), null)
    assert.equal(gateFrom(200, { error: 'OK', feature: 'vision', requiresTier: 'plus' }), null)
  })
})

describe('entitlements copy helpers', () => {
  it('tierLabel capitalizes tier name', () => {
    assert.equal(tierLabel('free'), 'Free')
    assert.equal(tierLabel('plus'), 'Plus')
  })

  it('featureHeadline derived from requiresTier', () => {
    assert.equal(featureHeadline('custom-exercises', 'plus'), 'Unlimited custom exercises are a Plus feature')
    assert.equal(featureHeadline('workout-generation', 'plus'), 'Unlimited workout generation is a Plus feature')
    assert.equal(featureHeadline(undefined, 'plus'), 'What Plus unlocks')
  })

  it('formatResetsAt handles windows cleanly', () => {
    assert.equal(formatResetsAt('2026-10-01T00:00:00Z', 'day'), 'at midnight')
    assert.equal(formatResetsAt('2026-10-05T00:00:00Z', 'week'), 'on Monday')
    assert.equal(formatResetsAt(null), null)
  })

  it('allowanceLine produces friendly string', () => {
    assert.equal(
      allowanceLine({ error: 'x', requiresTier: 'plus', limit: 3, remaining: 1, window: 'lifetime' }),
      '1 of 3 left.'
    )
    assert.equal(
      allowanceLine({ error: 'x', requiresTier: 'plus', limit: 3, remaining: 0, window: 'lifetime', feature: 'custom-exercises' }),
      "You're using all 3 of your free slots. Delete one to free a slot, or upgrade for unlimited."
    )
    assert.equal(
      allowanceLine({ error: 'x', requiresTier: 'plus', limit: 10, remaining: 0, window: 'lifetime', feature: 'mind-sessions' }),
      "You've finished all 10 of your free sessions."
    )
  })

  it('syntheticGate builds proper gate payload', () => {
    const gate = syntheticGate('custom-meals', 'plus', { limit: 3, remaining: 0, resetsAt: null, window: 'lifetime' })
    assert.equal(gate.feature, 'custom-meals')
    assert.equal(gate.requiresTier, 'plus')
    assert.equal(gate.error, 'Saved meals are included with Plus.')
    assert.equal(gate.limit, 3)
    assert.equal(gate.remaining, 0)
  })

  it('planGate builds SheetGate without feature', () => {
    const gate = planGate('Explore our plans', 'plus')
    assert.equal(gate.error, 'Explore our plans')
    assert.equal(gate.requiresTier, 'plus')
    assert.equal(gate.feature, undefined)
  })

  it('hasManageableBilling checks active subscription', () => {
    assert.equal(hasManageableBilling({ status: 'active', currentPeriodEnd: null, cancelAtPeriodEnd: false }), true)
    assert.equal(hasManageableBilling({ status: 'past_due', currentPeriodEnd: null, cancelAtPeriodEnd: false }), true)
    assert.equal(hasManageableBilling({ status: 'none', currentPeriodEnd: null, cancelAtPeriodEnd: false }), false)
    assert.equal(hasManageableBilling(null), false)
  })
})
