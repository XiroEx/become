// Run with: npm run test:file tests/unit/allowance/milestoneClamp.test.ts
//
// WHAT A MILESTONE ALLOWANCE REPORTS vs WHAT IT DECIDES.
//
// A 'milestone' allowance is the odd one out: it is a monotonic number owned by
// another feature (MindProgress.completedMainSessions), so in normal use it runs
// straight past the limit and keeps going. GET /api/me/entitlements therefore
// answered `mind-sessions: { used: 20, limit: 10 }` for an ordinary member, and
// any meter drawing used/limit renders that at 200%.
//
// `remaining` and `canCreate` were already right, so this is cosmetic — which is
// exactly why it has to be fixed WITHOUT touching a decision. The clamp is safe
// because every reader asks `used < limit`, and min(used, limit) < limit is
// false in precisely the cases used >= limit was.
//
// The clamp is deliberately NOT applied to the other two kinds:
//   'window'    — `used` counts ATTEMPTS once enforcement is on, and a denied
//                 claim does not decrement. The overshoot is a free abuse
//                 signal and clamping it would throw that away.
//   'inventory' — a member who drops from plus to free legitimately holds more
//                 rows than the cap. "5 of 3" is how they know to delete two;
//                 "3 of 3" hides the only escape hatch an inventory cap has.

import { test } from 'node:test'
import assert from 'node:assert/strict'

import {
  peekAllowance,
  consumeAllowance,
  __primeTzCache,
  __clearTzCache,
} from '../../../lib/allowances'
import { FREE_LIMITS, type Feature } from '../../../lib/entitlements'
import type { AllowanceLedger, ChargeResult, LedgerCounts } from '../../../lib/allowanceLedger'

const USER = '65f0000000000000000000ab'
const MILESTONE: Feature = 'mind-sessions'
const INVENTORY: Feature = 'custom-exercises'
const WINDOWED: Feature = 'ai-food-estimate'

const limitOf = (f: Feature) => FREE_LIMITS[f].limit

const at = (feature: Feature, n: number) =>
  peekAllowance(feature, { userId: USER, countRows: async () => n })

// ─── The report ──────────────────────────────────────────────────────────────

test('a milestone allowance never reports more used than the limit', async () => {
  const limit = limitOf(MILESTONE)
  const over = await at(MILESTONE, limit * 2)
  assert.equal(over.limit, limit)
  assert.equal(over.used, limit, 'used 20 of 10 renders a 200% meter')
  assert.equal(over.remaining, 0)

  // Below the limit it is reported exactly as it is — the clamp is a ceiling,
  // not a rounding.
  const under = await at(MILESTONE, 3)
  assert.equal(under.used, 3)
  assert.equal(under.remaining, limit - 3)
})

test('an inventory allowance still reports the honest overshoot', async () => {
  const limit = limitOf(INVENTORY)
  const over = await at(INVENTORY, limit + 2)
  assert.equal(over.used, limit + 2, 'a downgraded member must see how many to delete')
  assert.equal(over.remaining, 0)
})

test('a windowed allowance still reports attempts past the limit', async () => {
  __clearTzCache()
  __primeTzCache(USER, 0)

  const row: LedgerCounts = { used: 0, followUps: 0, refunds: 0 }
  const ledger: AllowanceLedger = {
    async charge(): Promise<ChargeResult> {
      row.used += 1
      return { ...row, charged: true, ticketId: `t${row.used}` }
    },
    async read() { return row },
    async giveBack() {},
  }

  const limit = limitOf(WINDOWED)
  for (let i = 0; i < limit + 3; i++) {
    await consumeAllowance(WINDOWED, { userId: USER, ledger }, { enforce: true })
  }
  const state = await peekAllowance(WINDOWED, { userId: USER, ledger })
  assert.ok(state.used > limit, 'the overshoot is the abuse signal — do not clamp it')
  assert.equal(state.remaining, 0)
  __clearTzCache()
})

// ─── The decision ────────────────────────────────────────────────────────────

test('clamping the report changes no decision, at or either side of the limit', async () => {
  const limit = limitOf(MILESTONE)
  const ctx = (n: number) => ({ userId: USER, countRows: async () => n })

  const under = await consumeAllowance(MILESTONE, ctx(limit - 1), { enforce: true })
  assert.equal(under.allowed, true)

  const exactly = await consumeAllowance(MILESTONE, ctx(limit), { enforce: true })
  assert.equal(exactly.allowed, false)
  assert.equal(exactly.reason, 'limit')

  const far = await consumeAllowance(MILESTONE, ctx(limit * 4), { enforce: true })
  assert.equal(far.allowed, false, 'a clamped `used` must not read as "room left"')
  assert.equal(far.reason, 'limit')

  // Shadow mode is unaffected: nothing is refused while the switch is off.
  const shadow = await consumeAllowance(MILESTONE, ctx(limit * 4), { enforce: false })
  assert.equal(shadow.allowed, true)
  assert.equal(shadow.state.used, limit)
})

test('a milestone consume writes nothing — it is a read of someone else’s number', async () => {
  // This is what makes it safe to ask on the AI dispatch AND on the session
  // route: two gates, one number, no double-spend.
  let counted = 0
  const ctx = { userId: USER, countRows: async () => { counted++; return 0 } }
  const a = await consumeAllowance(MILESTONE, ctx, { enforce: true })
  const b = await consumeAllowance(MILESTONE, ctx, { enforce: true })
  assert.equal(a.allowed, true)
  assert.equal(b.allowed, true)
  assert.equal(a.state.used, b.state.used, 'asking twice must not move the number')
  assert.equal(counted, 2)
  assert.equal(a.ticketId, undefined, 'nothing was charged, so there is nothing to refund')
})
