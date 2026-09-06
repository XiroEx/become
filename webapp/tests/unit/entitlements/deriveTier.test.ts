// Run with: npm run test:file tests/unit/entitlements/deriveTier.test.ts
//
// deriveTier is the single definition of "what tier does this billing state
// mean". It is pure, so it is the cheapest place to pin the product rules that
// are easy to get subtly wrong: past_due does NOT grant Plus, a canceled sub is
// honoured through the period the member already paid for, and one missed
// webhook must not downgrade someone mid-session.
//
// It is also a WRITER-side helper only. The read path reads the stored tier;
// deriving on read would grandfather members automatically, which is exactly
// what the offline migration exists to do deliberately.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { deriveTier, SUBSCRIPTION_GRACE_MS } from '../../../lib/subscription'
import type { IUserSubscription, SubscriptionStatus } from '../../../models/User'

const ROOT = path.join(__dirname, '../../..')
const NOW = new Date('2026-09-01T12:00:00.000Z')
const DAY = 86_400_000

const at = (days: number) => new Date(NOW.getTime() + days * DAY)
const sub = (status: SubscriptionStatus, currentPeriodEnd: Date | null = null): IUserSubscription => ({
  status,
  currentPeriodEnd,
})

test('deriveTier maps every subscription status to the agreed tier', () => {
  const cases: Array<[string, Parameters<typeof deriveTier>[0], 'free' | 'plus']> = [
    ['no subscription at all', {}, 'free'],
    ['status none', { subscription: sub('none') }, 'free'],

    ['active, period ahead', { subscription: sub('active', at(30)) }, 'plus'],
    ['active, no period recorded', { subscription: sub('active', null) }, 'plus'],
    ['active, 1 day stale — inside grace', { subscription: sub('active', at(-1)) }, 'plus'],
    ['active, 10 days stale — grace blown', { subscription: sub('active', at(-10)) }, 'free'],
    ['trialing, period ahead', { subscription: sub('trialing', at(7)) }, 'plus'],

    // A lapsed payment is not access, even inside a paid-for period.
    ['past_due with a live period', { subscription: sub('past_due', at(30)) }, 'free'],

    ['canceled, paid through', { subscription: sub('canceled', at(5)) }, 'plus'],
    ['canceled, period over', { subscription: sub('canceled', at(-1)) }, 'free'],
    ['canceled, no period recorded', { subscription: sub('canceled', null) }, 'free'],
    ['incomplete', { subscription: sub('incomplete', at(30)) }, 'free'],
    ['unpaid', { subscription: sub('unpaid', at(30)) }, 'free'],

    // Grandfathered and admin both win outright.
    ['grandfathered, no sub', { grandfathered: true }, 'plus'],
    ['grandfathered, past_due', { grandfathered: true, subscription: sub('past_due') }, 'plus'],
    ['admin, no sub', { role: 'admin' }, 'plus'],
  ]

  for (const [label, input, expected] of cases) {
    assert.equal(deriveTier({ ...input, now: NOW }), expected, label)
  }
})

test('the grace window is exactly SUBSCRIPTION_GRACE_MS, not open-ended', () => {
  const justInside = new Date(NOW.getTime() - SUBSCRIPTION_GRACE_MS + 1_000)
  const justOutside = new Date(NOW.getTime() - SUBSCRIPTION_GRACE_MS - 1_000)
  assert.equal(deriveTier({ subscription: sub('active', justInside), now: NOW }), 'plus')
  assert.equal(deriveTier({ subscription: sub('active', justOutside), now: NOW }), 'free')
})

test('deriveTier is deterministic under an injected now', () => {
  const input = { subscription: sub('canceled', at(2)), now: NOW }
  assert.equal(deriveTier(input), deriveTier(input))
})

test('tier is never derived on the read path', () => {
  // lib/entitlements.ts is what every request calls. If it ever imported
  // deriveTier, a legacy member with no stored tier would be silently
  // grandfathered at request time instead of by the offline migration.
  const src = fs.readFileSync(path.join(ROOT, 'lib/entitlements.ts'), 'utf8')
  assert.doesNotMatch(src, /deriveTier/)
  assert.doesNotMatch(src, /from ['"]@\/lib\/subscription['"]/)
})
