// Run with: npx tsx --test tests/unit/entitlements/tierModel.test.ts
//
// The tier model collapsed from free|plus|premium|pro to free|plus, and the
// two fail-OPEN defaults that came with the old model (User.tier defaulting to
// 'pro', loadUserEntitlement falling back to 'pro') were removed at the same
// time. Those defaults were harmless while everyone was 'pro'; the moment the
// default flips to 'free' they become the difference between "gated" and
// "everything is free forever". This pins both the shape and the defaults.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import {
  TIERS,
  TIER_RANK,
  DEFAULT_TIER,
  FEATURES,
  FEATURE_MIN_TIER,
  FREE_LIMITS,
  hasFeature,
  featureAccess,
  type Feature,
} from '../../../lib/entitlements'

const ROOT = path.join(__dirname, '../../..')
const readSource = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8')

// ─── shape ───────────────────────────────────────────────────────────────────

test('tiers are exactly free|plus, ranked', () => {
  assert.deepEqual(TIERS, ['free', 'plus'])
  assert.ok(TIER_RANK.free < TIER_RANK.plus)
  assert.equal(DEFAULT_TIER, 'free')
})

test('every FEATURE_MIN_TIER value is a real tier (catches a stray "premium")', () => {
  for (const feature of FEATURES) {
    assert.ok(
      TIERS.includes(FEATURE_MIN_TIER[feature]),
      `${feature} requires "${FEATURE_MIN_TIER[feature]}", which is not a tier`,
    )
  }
})

// ─── access ──────────────────────────────────────────────────────────────────

test('admin bypasses every gate regardless of tier', () => {
  for (const feature of FEATURES) {
    assert.equal(hasFeature('admin', 'free', feature), true, feature)
    assert.equal(featureAccess('admin', 'free', feature), 'full', feature)
  }
})

test('plus is uncapped and free is not, for every feature', () => {
  for (const feature of FEATURES) {
    assert.equal(hasFeature('user', 'plus', feature), true, feature)
    assert.equal(hasFeature('user', 'free', feature), false, feature)
  }
})

test('featureAccess splits free into limited (has an allowance) and none', () => {
  assert.equal(featureAccess('user', 'free', 'custom-exercises'), 'limited')
  assert.equal(featureAccess('user', 'free', 'custom-programs'), 'limited')
  assert.equal(featureAccess('user', 'free', 'mind-sessions'), 'limited')
  // Binary features — no free allowance at all.
  assert.equal(featureAccess('user', 'free', 'vision'), 'none')
  assert.equal(featureAccess('user', 'free', 'share-programs'), 'none')
})

// ─── allowances ──────────────────────────────────────────────────────────────

test('FREE_LIMITS covers every feature with the agreed numbers', () => {
  const expected: Record<Feature, number> = {
    'ai-food-estimate': 1,
    'workout-generation': 3,
    'custom-programs': 3,
    'custom-sessions': 3,
    'custom-exercises': 3,
    'custom-meals': 3,
    'custom-foods': 3,
    'mind-sessions': 10,
    vision: 0,
    'share-programs': 0,
  }
  for (const feature of FEATURES) {
    assert.ok(FREE_LIMITS[feature], `no FREE_LIMITS entry for ${feature}`)
    assert.equal(FREE_LIMITS[feature].limit, expected[feature], feature)
  }
  assert.equal(Object.keys(FREE_LIMITS).length, FEATURES.length)
})

test('allowance kinds and windows are coherent', () => {
  for (const feature of FEATURES) {
    const spec = FREE_LIMITS[feature]
    assert.ok(['inventory', 'window', 'milestone'].includes(spec.kind), feature)
    // Only a windowed allowance resets; inventory and milestone are lifetime.
    if (spec.kind === 'window') assert.notEqual(spec.window, 'lifetime', feature)
    else assert.equal(spec.window, 'lifetime', feature)
  }
})

// ─── the two fail-open defaults are gone ─────────────────────────────────────

test('User.tier defaults to free with a two-value enum', () => {
  const src = readSource('models/User.ts')
  assert.match(src, /enum:\s*\['free',\s*'plus'\],\s*default:\s*'free'/)
  assert.doesNotMatch(src, /default:\s*'pro'/)
  // The union and the enum are the two places a legacy tier could survive as a
  // real value (prose about them is fine — the migration doc lives here).
  assert.match(src, /export type Tier = 'free' \| 'plus';/)
  assert.doesNotMatch(src, /enum:\s*\[[^\]]*'premium'/)
})

test('loadUserEntitlement no longer falls back to pro', () => {
  const src = readSource('lib/entitlements.ts')
  assert.doesNotMatch(src, /\|\|\s*'pro'/)
  assert.match(src, /DEFAULT_TIER/)
})

test('no tier literal survives in the program creator or the seed script', () => {
  assert.doesNotMatch(readSource('app/dashboard/programs/new/NewProgramClient.tsx'), /'premium'/)
  assert.doesNotMatch(readSource('scripts/nadine-seed14.mjs'), /tier:\s*'pro'/)
})
