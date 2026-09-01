// Run with: npx tsx --test tests/unit/allowance/consume.test.ts
//
// The policy layer: given what the ledger returned, is this claim allowed?
//
// Four properties are load-bearing and none of them are visible in review:
//
//   1. ATOMICITY — the decision is taken from the POST-increment value, so two
//      requests arriving together against a limit of 1 cannot both pass.
//   2. SHADOW MODE — with ENTITLEMENTS_ENFORCED off, nothing is ever refused
//      but everything is still counted. That is what makes launch day safe, and
//      it is one boolean away from being wrong in either direction.
//   3. WINDOW ROLLOVER — the bucket is the MEMBER'S local day/week, resolved
//      from their own record and never from the request. A client-supplied `tz`
//      would be a window-minting oracle.
//   4. ONE OUTCOME, ONE UNIT — a correction rides the estimate it refines
//      instead of costing a second scan.
//
// No database: the ledger is injected and the timezone memo is primed.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  consumeAllowance,
  consumeFollowUp,
  refundAllowance,
  __clearTzCache,
  __primeTzCache,
  FOLLOW_UP_LIMITS,
} from '../../../lib/allowances'
import type {
  AllowanceLedger,
  ChargeQuery,
  ChargeResult,
  LedgerCounts,
} from '../../../lib/allowanceLedger'

const USER = '65f0000000000000000000aa'
/** Eastern Daylight Time — 240 minutes WEST of UTC (browser convention). */
const EDT = 240

/**
 * Models the real contract: one counter per (feature, bucketKey), and every
 * charge returns the value AFTER the increment.
 */
function fakeLedger(opts: { throws?: boolean } = {}) {
  const rows = new Map<string, LedgerCounts>()
  const charges: ChargeQuery[] = []
  const refunds: string[] = []

  const keyOf = (q: { feature: string; bucketKey: string }) => `${q.feature}|${q.bucketKey}`

  const ledger: AllowanceLedger = {
    async charge(q): Promise<ChargeResult> {
      if (opts.throws) throw new Error('ledger unreachable')
      charges.push(q)
      const k = keyOf(q)
      const row = rows.get(k) ?? { used: 0, followUps: 0, refunds: 0 }
      row[q.field ?? 'used'] += 1
      rows.set(k, row)
      return { ...row, charged: true, ticketId: `t${charges.length}` }
    },
    async read(q) {
      return rows.get(keyOf(q)) ?? null
    },
    async giveBack(ticketId) {
      refunds.push(ticketId)
    },
  }

  return { ledger, rows, charges, refunds, keyOf }
}

function ctxFor(l: ReturnType<typeof fakeLedger>, tz = EDT) {
  __clearTzCache()
  __primeTzCache(USER, tz)
  return { userId: USER, ledger: l.ledger }
}

// ─── 1. Atomicity ────────────────────────────────────────────────────────────

test('two claims against a limit of 1 produce exactly one allowed', async () => {
  const l = fakeLedger()
  const ctx = ctxFor(l)
  const [a, b] = await Promise.all([
    consumeAllowance('ai-food-estimate', ctx, { enforce: true }),
    consumeAllowance('ai-food-estimate', ctx, { enforce: true }),
  ])
  assert.equal([a, b].filter(r => r.allowed).length, 1)
})

test('one consume is one charge — never a read followed by a write', async () => {
  const l = fakeLedger()
  await consumeAllowance('ai-food-estimate', ctxFor(l), { enforce: true })
  assert.equal(l.charges.length, 1)
})

test('the limit boundary is inclusive of the unit just charged', async () => {
  const l = fakeLedger()
  const ctx = ctxFor(l)
  // 3 workout generations a week: the third must land, the fourth must not.
  for (let i = 1; i <= 3; i += 1) {
    const r = await consumeAllowance('workout-generation', ctx, { enforce: true })
    assert.equal(r.allowed, true, `generation ${i} should be allowed`)
  }
  const fourth = await consumeAllowance('workout-generation', ctx, { enforce: true })
  assert.equal(fourth.allowed, false)
  assert.equal(fourth.reason, 'limit')
  assert.equal(fourth.state.remaining, 0, 'remaining never goes negative')
})

test('a denied claim does NOT give its unit back', async () => {
  // `used` counts ATTEMPTS once enforcement is on. remaining still clamps to 0
  // and the denial still stands, and the inflation is a free abuse signal.
  const l = fakeLedger()
  const ctx = ctxFor(l)
  await consumeAllowance('ai-food-estimate', ctx, { enforce: true })
  await consumeAllowance('ai-food-estimate', ctx, { enforce: true })

  assert.equal(l.refunds.length, 0, 'a denial must not trigger a refund')
  assert.equal(l.rows.get('ai-food-estimate|2026-08-31')?.used ?? l.rows.values().next().value?.used, 2)
})

// ─── 2. Shadow mode ──────────────────────────────────────────────────────────

test('shadow mode never denies, but the count is real', async () => {
  const l = fakeLedger()
  const ctx = ctxFor(l)
  let last = await consumeAllowance('ai-food-estimate', ctx, { enforce: false })
  for (let i = 0; i < 5; i += 1) {
    last = await consumeAllowance('ai-food-estimate', ctx, { enforce: false })
  }
  assert.equal(last.allowed, true, 'with the switch off nothing is ever refused')
  assert.equal(last.state.used, 6, 'but the usage is recorded — that is the telemetry')
  assert.equal(last.state.remaining, 0, 'and the real remaining is reported honestly')
})

test('a shadow-mode charge is marked as such on the ledger row', async () => {
  const l = fakeLedger()
  await consumeAllowance('ai-food-estimate', ctxFor(l), { enforce: false })
  assert.equal(l.charges[0].shadow, true)

  const l2 = fakeLedger()
  await consumeAllowance('ai-food-estimate', ctxFor(l2), { enforce: true })
  assert.equal(l2.charges[0].shadow, false)
})

test('`enforce` defaults to OFF when the caller says nothing', async () => {
  const l = fakeLedger()
  const ctx = ctxFor(l)
  await consumeAllowance('ai-food-estimate', ctx, {})
  const second = await consumeAllowance('ai-food-estimate', ctx, {})
  assert.equal(second.allowed, true, 'an omitted flag must never start gating people')
})

// ─── 3. Window identity and rollover ─────────────────────────────────────────

test("the bucket is the member's LOCAL day, taken from their record", async () => {
  // 02:00Z on the 1st is still Monday the 31st, 10pm, in EDT.
  const l = fakeLedger()
  const ctx = ctxFor(l, EDT)
  await consumeAllowance('ai-food-estimate', ctx, {
    enforce: true,
    now: new Date('2026-09-01T02:00:00.000Z'),
  })
  assert.equal(l.charges[0].bucketKey, '2026-08-31')
})

test('a client-supplied tz cannot mint a fresh window', async () => {
  // The oracle: if the request could pick the offset, a different `tz` on every
  // call would land each one in its own bucket with its own full allowance.
  const l = fakeLedger()
  __clearTzCache()
  __primeTzCache(USER, EDT)
  const now = new Date('2026-09-01T02:00:00.000Z')

  await consumeAllowance('ai-food-estimate', { userId: USER, ledger: l.ledger, tzOffset: 0 }, { enforce: true, now })
  await consumeAllowance('ai-food-estimate', { userId: USER, ledger: l.ledger, tzOffset: -720 }, { enforce: true, now })

  assert.equal(l.charges[0].bucketKey, l.charges[1].bucketKey, 'both must land in the persisted-offset bucket')
  assert.equal(l.charges[0].bucketKey, '2026-08-31')
})

test('crossing local midnight opens a new window with a full allowance', async () => {
  const l = fakeLedger()
  const ctx = ctxFor(l, EDT)

  const before = await consumeAllowance('ai-food-estimate', ctx, {
    enforce: true,
    now: new Date('2026-09-01T03:59:00.000Z'), // 23:59 local
  })
  const after = await consumeAllowance('ai-food-estimate', ctx, {
    enforce: true,
    now: new Date('2026-09-01T04:01:00.000Z'), // 00:01 local, next day
  })

  assert.equal(before.allowed, true)
  assert.equal(after.allowed, true, 'the reset is the member\'s midnight, not UTC\'s')
  assert.notEqual(l.charges[0].bucketKey, l.charges[1].bucketKey)
  assert.equal(after.state.used, 1, 'the new window starts at one')
})

test('resetsAt is always in the future and is reported to the caller', async () => {
  const l = fakeLedger()
  const now = new Date('2026-09-01T02:00:00.000Z')
  const r = await consumeAllowance('ai-food-estimate', ctxFor(l), { enforce: true, now })
  assert.ok(r.state.resetsAt, 'the client needs a reset time to render an upsell')
  assert.ok(new Date(r.state.resetsAt!).getTime() > now.getTime())
})

test('a weekly allowance holds across days and rolls at the week boundary', async () => {
  const l = fakeLedger()
  const ctx = ctxFor(l, EDT)
  await consumeAllowance('workout-generation', ctx, { enforce: true, now: new Date('2026-09-01T14:00:00.000Z') })
  await consumeAllowance('workout-generation', ctx, { enforce: true, now: new Date('2026-09-03T14:00:00.000Z') })
  assert.equal(l.charges[0].bucketKey, l.charges[1].bucketKey, 'Tuesday and Thursday are one week')

  await consumeAllowance('workout-generation', ctx, { enforce: true, now: new Date('2026-09-08T14:00:00.000Z') })
  assert.notEqual(l.charges[2].bucketKey, l.charges[0].bucketKey, 'the next week is a new bucket')
})

// ─── 4. One outcome, one unit ────────────────────────────────────────────────

test('a follow-up refines an outcome without spending another scan', async () => {
  const l = fakeLedger()
  const ctx = ctxFor(l)
  await consumeAllowance('ai-food-estimate', ctx, { enforce: true })
  const corrected = await consumeFollowUp('ai-food-estimate', ctx, { enforce: true })

  assert.equal(corrected.allowed, true)
  assert.equal(corrected.state.used, 1, "the member's one scan stays spent exactly once")
  assert.equal(l.charges[1].field, 'followUps')
})

test('follow-ups are bounded, and the refusal is not a limit refusal', async () => {
  const l = fakeLedger()
  const ctx = ctxFor(l)
  const cap = FOLLOW_UP_LIMITS['ai-food-estimate']!
  await consumeAllowance('ai-food-estimate', ctx, { enforce: true })

  for (let i = 1; i <= cap; i += 1) {
    const r = await consumeFollowUp('ai-food-estimate', ctx, { enforce: true })
    assert.equal(r.allowed, true, `correction ${i} of ${cap} should be allowed`)
  }
  const over = await consumeFollowUp('ai-food-estimate', ctx, { enforce: true })
  assert.equal(over.allowed, false)
  assert.equal(over.reason, 'follow-up', 'a spent correction budget is not the same refusal as a spent scan')
})

test('a follow-up in shadow mode is never refused either', async () => {
  const l = fakeLedger()
  const ctx = ctxFor(l)
  for (let i = 0; i < 20; i += 1) {
    const r = await consumeFollowUp('ai-food-estimate', ctx, { enforce: false })
    assert.equal(r.allowed, true)
  }
})

// ─── Refunds and failure ─────────────────────────────────────────────────────

test('a charge that is allowed hands back a refund ticket', async () => {
  const l = fakeLedger()
  const r = await consumeAllowance('ai-food-estimate', ctxFor(l), { enforce: true })
  assert.ok(r.ticketId, 'the route needs this to give the unit back on a trigger failure')

  await refundAllowance(r.ticketId!, l.ledger)
  assert.deepEqual(l.refunds, [r.ticketId])
})

test('refunding nothing is a no-op, not an error', async () => {
  const l = fakeLedger()
  await refundAllowance('', l.ledger)
  assert.equal(l.refunds.length, 0)
})

test('a ledger outage fails OPEN', async () => {
  // A metering failure must never take a feature away from someone entitled to
  // it. The gate is a product boundary, not a security one.
  const l = fakeLedger({ throws: true })
  const r = await consumeAllowance('ai-food-estimate', ctxFor(l), { enforce: true })
  assert.equal(r.allowed, true)
  assert.equal(r.degraded, true, 'and it says so, so the outage is visible in logs')
  assert.equal(r.ticketId, undefined, 'nothing was recorded, so there is nothing to refund')
})

// ─── Non-window features are untouched ───────────────────────────────────────

test('a non-window feature never reaches the ledger', async () => {
  // Inventory allowances are a LIVE count of rows the member owns — deleting
  // one frees a slot. A ledger row would make that cap permanent. Guards the
  // boundary between the two kinds of allowance.
  const l = fakeLedger()
  await consumeFollowUp('vision', { userId: USER, ledger: l.ledger }, { enforce: true })
  await consumeAllowance('vision', { userId: USER, ledger: l.ledger }, { enforce: true })
  assert.equal(l.charges.length, 0)
})
