// Run with: npx tsx --test tests/unit/entitlements/grandfathered.test.ts
//
// `grandfathered` is not a grant, and the payload must not read like one.
//
// deriveTier() maps grandfathered → plus, but it is WRITER-SIDE on purpose:
// it runs where tier is stored (the billing webhook, scripts/migrate-tiers.mjs)
// and never on the request path, so nobody is promoted silently at read time.
// loadUserEntitlement therefore gates on `tier` ALONE — and that is correct and
// must stay that way (tests/unit/entitlements/deriveTier.test.ts pins the same
// rule from the other side).
//
// The consequence is that `grandfathered: true` in a client payload holds only
// because migrate-tiers.mjs stamped `tier: 'plus'` in the same $set. Reported
// raw, it says "you are grandfathered" to a row that is being gated as free —
// "Thanks for being here early" over a screen of locks. So it is reported as
// what it actually is: the REASON this member holds Plus.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { reportedGrandfathered } from '../../../lib/entitlements'

const ROOT = path.join(__dirname, '../../..')
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8')

test('the flag is only reported alongside the access it explains', () => {
  assert.equal(reportedGrandfathered('plus', true), true)
  assert.equal(reportedGrandfathered('plus', false), false)
  // The impossible state, reported honestly: this member is gated as free.
  assert.equal(reportedGrandfathered('free', true), false)
  assert.equal(reportedGrandfathered('free', false), false)
})

test('GET /api/me/entitlements reports it through the helper, not raw', () => {
  const src = read('app/api/me/entitlements/route.ts')
  assert.match(src, /grandfathered: reportedGrandfathered\(tier, grandfathered\)/)
  // The raw flag must not also be spread into the body under another name.
  assert.doesNotMatch(src, /grandfathered,\s*$/m)
})

test('GET /api/billing/status reports it the same way', () => {
  const src = read('app/api/billing/status/route.ts')
  assert.match(src, /grandfathered: reportedGrandfathered\(/)
  assert.doesNotMatch(src, /grandfathered: user\?\.grandfathered === true/)
})

test('the request path still gates on tier alone — the design is unchanged', () => {
  const src = read('lib/entitlements.ts')
  // loadUserEntitlement reads tier; it must not derive one.
  const fn = src.slice(src.indexOf('export async function loadUserEntitlement'))
  assert.doesNotMatch(fn, /deriveTier/)
  assert.match(fn, /user\?\.tier === 'plus' \? 'plus' : DEFAULT_TIER/)
  // hasFeature is the gate, and it reads TIER_RANK[tier] — never grandfathered.
  const gate = src.slice(src.indexOf('export function hasFeature'), src.indexOf('export function featureAccess'))
  assert.doesNotMatch(gate, /grandfathered/)
})

test('an impossible row is logged rather than quietly gated as free', () => {
  const src = read('lib/entitlements.ts')
  const fn = src.slice(src.indexOf('export async function loadUserEntitlement'))
  assert.match(fn, /if \(grandfathered && tier !== 'plus'\)/)
  assert.match(fn, /console\.error\(/)
  assert.match(fn, /impossible state/)
})

test('the client type says what the field means', () => {
  const src = read('lib/entitlementsClient.ts')
  const at = src.indexOf('grandfathered: boolean')
  assert.ok(at > 0)
  const doc = src.slice(Math.max(0, at - 400), at)
  assert.match(doc, /never a grant|not a grant|WHY this member/)
})
