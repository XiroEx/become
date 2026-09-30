// Run with: npm run test:file tests/unit/allowance/ledger.test.ts
//
// The charge rule, tested without a database.
//
// Everything interesting about the ledger is a CONCURRENCY property, and those
// are exactly the properties that pass in dev and fail in production. The two
// that matter:
//
//   • an upsert against the unique {userId, feature, bucketKey} index can lose
//     the insert race and surface E11000 instead of the increment. Without a
//     retry, the loser of two simultaneous first-of-the-day claims gets a 500;
//   • the SAME error code also means "the dedupe filter excluded an existing
//     row", i.e. this outcome was already paid for. Retrying THAT bills the
//     member twice for one estimate.
//
// One error code, two opposite correct responses. chargeWithRetry is separated
// from Mongo so that fork can be exercised directly.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  chargeWithRetry,
  encodeTicket,
  decodeTicket,
  type ChargeQuery,
  type LedgerCounts,
  type LedgerOps,
  type LedgerRow,
} from '../../../lib/allowanceLedger'

const Q: ChargeQuery = {
  userId: '65f0000000000000000000aa',
  feature: 'ai-food-estimate',
  bucketKey: '2026-09-01',
  resetsAt: new Date('2026-09-02T04:00:00.000Z'),
  shadow: false,
}

const duplicateKeyError = () => Object.assign(new Error('E11000 duplicate key'), { code: 11000 })

/** A store that models the post-increment contract: bump returns the NEW value. */
function fakeOps(opts: {
  /** Throw a duplicate-key error on the first N bumps. */
  failFirst?: number
  /** What readRow() answers after a duplicate-key error. */
  row?: LedgerRow | null
} = {}) {
  const counters: LedgerCounts = { used: 0, followUps: 0, refunds: 0 }
  let bumps = 0
  let reads = 0
  let toFail = opts.failFirst ?? 0

  const ops: LedgerOps = {
    async bump(q) {
      bumps += 1
      if (toFail > 0) {
        toFail -= 1
        throw duplicateKeyError()
      }
      const field = q.field ?? 'used'
      counters[field] += 1
      return { ...counters }
    },
    async readRow() {
      reads += 1
      return opts.row ?? null
    },
  }

  return {
    ops,
    counters,
    get bumps() { return bumps },
    get reads() { return reads },
  }
}

// ─── The happy path is ONE write ─────────────────────────────────────────────

test('a charge is exactly one bump, and the decision reads what it returned', async () => {
  const f = fakeOps()
  const res = await chargeWithRetry(f.ops, Q)

  assert.equal(f.bumps, 1, 'a charge must not read-then-write — that is the race')
  assert.equal(f.reads, 0)
  assert.equal(res.charged, true)
  assert.equal(res.used, 1, 'the POST-increment value is what the caller decides on')
  assert.ok(res.ticketId, 'a real charge must be refundable')
})

test('two racing charges see 1 and 2, so only one can be within a limit of 1', async () => {
  const f = fakeOps()
  const [a, b] = await Promise.all([chargeWithRetry(f.ops, Q), chargeWithRetry(f.ops, Q)])

  const seen = [a.used, b.used].sort()
  assert.deepEqual(seen, [1, 2])
  assert.equal(seen.filter(n => n <= 1).length, 1, 'exactly one claim is within the limit')
})

// ─── E11000: the two meanings ────────────────────────────────────────────────

test('a lost insert race retries exactly once and does not double-count', async () => {
  const f = fakeOps({ failFirst: 1, row: { used: 0, followUps: 0, refunds: 0, dedupes: [] } })
  const res = await chargeWithRetry(f.ops, Q)

  assert.equal(res.charged, true)
  assert.equal(res.used, 1, 'the retry is a plain $inc on a row that now exists')
  assert.equal(f.bumps, 2, 'exactly two bumps — never three, never a double-count')
})

test('a duplicate key on a row that already holds the dedupe key is FREE', async () => {
  // The opposite response to the same error code. Charging here would bill the
  // member a second time for one outcome.
  const f = fakeOps({
    failFirst: 1,
    row: { used: 1, followUps: 0, refunds: 0, dedupes: ['plate-run-7'] },
  })
  const res = await chargeWithRetry(f.ops, { ...Q, dedupeKey: 'plate-run-7' })

  assert.equal(res.charged, false)
  assert.equal(res.used, 1, 'the counter did not move')
  assert.equal(f.bumps, 1, 'the retry must NOT fire for a dedupe hit')
  assert.equal(res.ticketId, undefined, 'nothing was charged, so there is nothing to refund')
})

test('a duplicate key with a dedupe key the row does NOT hold is a real race', async () => {
  const f = fakeOps({
    failFirst: 1,
    row: { used: 1, followUps: 0, refunds: 0, dedupes: ['some-other-outcome'] },
  })
  const res = await chargeWithRetry(f.ops, { ...Q, dedupeKey: 'plate-run-9' })

  assert.equal(res.charged, true)
  assert.equal(f.bumps, 2)
})

test('a non-duplicate error propagates, so the caller can fail OPEN', async () => {
  const ops: LedgerOps = {
    async bump() { throw new Error('connection reset') },
    async readRow() { return null },
  }
  await assert.rejects(() => chargeWithRetry(ops, Q), /connection reset/)
})

test('a retry that hits the duplicate a second time gives up rather than spinning', async () => {
  const f = fakeOps({ failFirst: 2, row: { used: 3, followUps: 0, refunds: 0, dedupes: [] } })
  await assert.rejects(() => chargeWithRetry(f.ops, Q), (err: unknown) => {
    return !!err && (err as { code?: number }).code === 11000
  })
  assert.equal(f.bumps, 2, 'bounded at one retry')
})

// ─── Follow-ups move their own counter ───────────────────────────────────────

test('a follow-up charge never touches `used`', async () => {
  const f = fakeOps()
  await chargeWithRetry(f.ops, Q)
  const res = await chargeWithRetry(f.ops, { ...Q, field: 'followUps' })

  assert.equal(res.used, 1, "the member's scan for the day stays spent exactly once")
  assert.equal(res.followUps, 1)
})

// ─── Refund tickets ──────────────────────────────────────────────────────────

test('a ticket round-trips the fields a refund needs', () => {
  const raw = encodeTicket({ u: 'u1', f: 'ai-food-estimate', b: '2026-09-01', d: 'dk', fl: 'used', n: 'x' })
  const back = decodeTicket(raw)
  assert.deepEqual(back, { u: 'u1', f: 'ai-food-estimate', b: '2026-09-01', d: 'dk', fl: 'used', n: 'x' })
})

test('a follow-up ticket refunds the follow-up counter, not `used`', () => {
  const raw = encodeTicket({ u: 'u1', f: 'ai-food-estimate', b: '2026-09-01', fl: 'followUps', n: 'y' })
  assert.equal(decodeTicket(raw)?.fl, 'followUps')
})

test('an unparseable ticket is null, never a wild decrement', () => {
  assert.equal(decodeTicket('not-base64-json'), null)
  assert.equal(decodeTicket(''), null)
  assert.equal(decodeTicket(Buffer.from('{"nope":1}').toString('base64url')), null)
})

test('two charges in one window mint distinguishable tickets', async () => {
  const f = fakeOps()
  const a = await chargeWithRetry(f.ops, Q)
  const b = await chargeWithRetry(f.ops, Q)
  assert.notEqual(a.ticketId, b.ticketId, 'a shared ticket would make one refund cancel both')
})
