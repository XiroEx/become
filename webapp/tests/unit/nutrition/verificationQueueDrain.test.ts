// Run with: npm run test:file tests/unit/nutrition/verificationQueueDrain.test.ts
//
// The drain is the first thing in the repo that takes a food OUT of
// `verification.state: 'queued'`, unattended, and every food it takes costs a
// grounded web search. So four things have to be true of it, and none of them
// is visible by reading a dashboard:
//
//   - it takes a BOUNDED batch, oldest first, and only rows that are actually
//     in the queue,
//   - the claim is a real compare-and-swap over `claimedAt` as a TTL: two
//     runners never verify the same food, and a food abandoned by a dead run
//     becomes claimable again instead of being wedged forever,
//   - a recheck request is honoured EXACTLY ONCE and never loops,
//   - `?dryRun=1` plans and writes NOTHING — including no verification, which
//     is the only write that costs money.
//
// The collection here is a fake that evaluates the REAL filters this module
// builds (so the claim race is genuine, not asserted) and throws on any write
// it was not expecting (so "wrote nothing" is proven rather than reported).

import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  runVerificationQueueDrain,
  queueSelector,
  claimableByPolicy,
  DEFAULT_QUEUE_BATCH,
  MAX_QUEUE_BATCH,
  DEFAULT_QUEUE_DEADLINE_MS,
  type DrainFoodsCollection,
  type QueuedFoodDoc,
  type QueueVerifyOutcome,
} from '../../../lib/nutrition/verificationQueue'
import { CLAIM_TTL_MS } from '../../../lib/nutrition/flagPolicy'

const NOW = new Date('2026-10-14T09:00:00.000Z')
const MINUTE = 60_000

// ── A fake foods collection that honours the real filters ────────────────────

type Doc = QueuedFoodDoc & Record<string, unknown>

function get(doc: unknown, path: string): unknown {
  return path
    .split('.')
    .reduce<unknown>(
      (o, k) => (o == null ? undefined : (o as Record<string, unknown>)[k]),
      doc,
    )
}

function setPath(doc: Record<string, unknown>, path: string, value: unknown): void {
  const keys = path.split('.')
  let cur: Record<string, unknown> = doc
  for (const k of keys.slice(0, -1)) {
    if (cur[k] == null || typeof cur[k] !== 'object') cur[k] = {}
    cur = cur[k] as Record<string, unknown>
  }
  cur[keys[keys.length - 1]] = value
}

function unsetPath(doc: Record<string, unknown>, path: string): void {
  const keys = path.split('.')
  let cur: Record<string, unknown> | undefined = doc
  for (const k of keys.slice(0, -1)) {
    cur = cur?.[k] as Record<string, unknown> | undefined
    if (cur == null) return
  }
  delete cur?.[keys[keys.length - 1]]
}

const asNumber = (v: unknown) => (v instanceof Date ? v.getTime() : (v as number))

function eq(a: unknown, b: unknown): boolean {
  if (a instanceof Date || b instanceof Date) return asNumber(a) === asNumber(b)
  return a === b
}

function valueMatches(value: unknown, cond: unknown): boolean {
  const isOperatorDoc =
    cond !== null &&
    typeof cond === 'object' &&
    !(cond instanceof Date) &&
    !Array.isArray(cond)

  if (isOperatorDoc) {
    return Object.entries(cond as Record<string, unknown>).every(([op, operand]) => {
      switch (op) {
        case '$exists':
          return (value !== undefined) === (operand === true)
        case '$in':
          return (operand as unknown[]).some((o) => eq(value, o))
        case '$nin':
          return !(operand as unknown[]).some((o) => eq(value, o))
        case '$ne':
          return !eq(value, operand)
        case '$lt':
          return value != null && asNumber(value) < asNumber(operand)
        case '$lte':
          return value != null && asNumber(value) <= asNumber(operand)
        case '$gt':
          return value != null && asNumber(value) > asNumber(operand)
        default:
          throw new Error(`fake collection: unsupported operator ${op}`)
      }
    })
  }

  // Mongo semantics: `field: null` matches a missing field too.
  if (cond === null) return value === null || value === undefined
  return eq(value, cond)
}

function matches(doc: Doc, filter: Record<string, unknown>): boolean {
  return Object.entries(filter).every(([key, cond]) => {
    if (key === '$and') return (cond as Record<string, unknown>[]).every((f) => matches(doc, f))
    if (key === '$or') return (cond as Record<string, unknown>[]).some((f) => matches(doc, f))
    if (key === '$nor') return !(cond as Record<string, unknown>[]).some((f) => matches(doc, f))
    return valueMatches(get(doc, key), cond)
  })
}

interface RecordedWrite {
  op: 'findOneAndUpdate' | 'updateOne'
  filter: Record<string, unknown>
  update: Record<string, unknown>
}

class FakeFoods implements DrainFoodsCollection {
  writes: RecordedWrite[] = []
  /** Set to make any write an immediate failure. */
  refuseWrites = false

  constructor(public docs: Doc[]) {}

  private clone(doc: Doc): Doc {
    return structuredClone(doc)
  }

  async countDocuments(filter: Record<string, unknown>): Promise<number> {
    return this.docs.filter((d) => matches(d, filter)).length
  }

  find(
    filter: Record<string, unknown>,
    options?: { sort?: Record<string, 1 | -1>; limit?: number },
  ): AsyncIterable<QueuedFoodDoc> {
    let rows = this.docs.filter((d) => matches(d, filter)).map((d) => this.clone(d))
    const sort = options?.sort
    if (sort) {
      rows = rows.sort((a, b) => {
        for (const [key, dir] of Object.entries(sort)) {
          const av = asNumber(get(a, key)) ?? 0
          const bv = asNumber(get(b, key)) ?? 0
          if (av < bv) return -dir
          if (av > bv) return dir
          const as_ = String(get(a, key))
          const bs = String(get(b, key))
          if (as_ !== bs) return as_ < bs ? -dir : dir
        }
        return 0
      })
    }
    if (options?.limit) rows = rows.slice(0, options.limit)
    return (async function* () {
      for (const row of rows) yield row
    })()
  }

  /** Atomic by construction: no await between the match and the mutation. */
  async findOneAndUpdate(
    filter: Record<string, unknown>,
    update: Record<string, unknown>,
  ): Promise<QueuedFoodDoc | null> {
    if (this.refuseWrites) throw new Error('a write was issued when none was expected')
    const doc = this.docs.find((d) => matches(d, filter))
    if (!doc) {
      this.writes.push({ op: 'findOneAndUpdate', filter, update })
      return null
    }
    const before = this.clone(doc)
    this.apply(doc, update)
    this.writes.push({ op: 'findOneAndUpdate', filter, update })
    return before
  }

  async updateOne(
    filter: Record<string, unknown>,
    update: Record<string, unknown>,
  ): Promise<{ matchedCount: number; modifiedCount: number }> {
    if (this.refuseWrites) throw new Error('a write was issued when none was expected')
    const doc = this.docs.find((d) => matches(d, filter))
    this.writes.push({ op: 'updateOne', filter, update })
    if (!doc) return { matchedCount: 0, modifiedCount: 0 }
    this.apply(doc, update)
    return { matchedCount: 1, modifiedCount: 1 }
  }

  private apply(doc: Doc, update: Record<string, unknown>): void {
    for (const [k, v] of Object.entries((update.$set ?? {}) as Record<string, unknown>)) {
      setPath(doc, k, v)
    }
    for (const k of Object.keys((update.$unset ?? {}) as Record<string, unknown>)) {
      unsetPath(doc, k)
    }
  }

  byId(id: string): Doc {
    const doc = this.docs.find((d) => d._id === id)
    assert.ok(doc, `no food ${id}`)
    return doc
  }

  /** Every field any write of this run touched. */
  touchedFields(): string[] {
    const fields = new Set<string>()
    for (const w of this.writes) {
      for (const k of Object.keys((w.update.$set ?? {}) as Record<string, unknown>)) fields.add(k)
      for (const k of Object.keys((w.update.$unset ?? {}) as Record<string, unknown>)) fields.add(k)
    }
    return [...fields].sort()
  }
}

function queued(id: string, over: Partial<Doc> = {}): Doc {
  return {
    _id: id,
    name: `food ${id}`,
    updatedAt: new Date(NOW.getTime() - 60 * MINUTE),
    verification: { state: 'queued' },
    ...over,
  }
}

/** A verifier that records what it was asked to do and answers 'confirmed'. */
function recorder(
  outcome: Partial<QueueVerifyOutcome> = {},
): { verify: (id: string) => Promise<QueueVerifyOutcome>; calls: string[] } {
  const calls: string[] = []
  return {
    calls,
    verify: async (id) => {
      calls.push(id)
      // A real verification is slow; yield so concurrent lanes interleave.
      await new Promise((r) => setTimeout(r, 0))
      return { verdict: 'confirmed', written: false, ...outcome }
    },
  }
}

const neverVerify = async (): Promise<QueueVerifyOutcome> => {
  throw new Error('a verification was dispatched when none was expected')
}

// ── Batch selection ──────────────────────────────────────────────────────────

test('it takes the oldest queued foods, bounded by the batch limit', async () => {
  const foods = new FakeFoods([
    queued('c', { updatedAt: new Date(NOW.getTime() - 10 * MINUTE) }),
    queued('a', { updatedAt: new Date(NOW.getTime() - 90 * MINUTE) }),
    queued('d', { updatedAt: new Date(NOW.getTime() - 5 * MINUTE) }),
    queued('b', { updatedAt: new Date(NOW.getTime() - 30 * MINUTE) }),
  ])
  const { verify, calls } = recorder()

  const result = await runVerificationQueueDrain({
    foods,
    verify,
    apply: true,
    limit: 2,
    clock: () => NOW.getTime(),
  })

  assert.equal(result.waiting, 4, 'the whole backlog is reported, not just the batch')
  assert.equal(result.selected, 2)
  assert.equal(result.claimed, 2)
  assert.equal(result.leftAlone, 2, 'what it did not touch is reported too')
  assert.deepEqual(calls, ['a', 'b'], 'oldest first')
  assert.equal(result.confirmed, 2)
})

test('rows that are not in the queue are never picked up', async () => {
  const foods = new FakeFoods([
    { _id: 'verified', updatedAt: NOW, verification: { state: 'verified' } },
    { _id: 'unverified', updatedAt: NOW, verification: { state: 'unverified' } },
    { _id: 'insufficient', updatedAt: NOW, verification: { state: 'insufficient' } },
    // No verification sub-document at all: an ordinary catalogue row.
    { _id: 'plain', updatedAt: NOW },
  ])

  const result = await runVerificationQueueDrain({
    foods,
    verify: neverVerify,
    apply: true,
    clock: () => NOW.getTime(),
  })

  assert.equal(result.waiting, 0)
  assert.equal(result.selected, 0)
  assert.equal(result.wrote, false, 'an empty queue writes nothing at all')
  assert.deepEqual(foods.writes, [])
})

test('the batch bound cannot be raised past the module cap, nor set to nothing', async () => {
  const docs = Array.from({ length: MAX_QUEUE_BATCH + 10 }, (_, i) =>
    queued(`f${String(i).padStart(3, '0')}`),
  )
  const clock = () => NOW.getTime()

  const big = await runVerificationQueueDrain({
    foods: new FakeFoods(docs.map((d) => structuredClone(d))),
    verify: recorder().verify,
    apply: true,
    limit: 5000,
    clock,
  })
  assert.equal(big.limit, MAX_QUEUE_BATCH)
  assert.equal(big.selected, MAX_QUEUE_BATCH)

  const defaulted = await runVerificationQueueDrain({
    foods: new FakeFoods(docs.map((d) => structuredClone(d))),
    verify: recorder().verify,
    apply: true,
    limit: Number.NaN,
    clock,
  })
  assert.equal(defaulted.limit, DEFAULT_QUEUE_BATCH)

  const zero = await runVerificationQueueDrain({
    foods: new FakeFoods(docs.map((d) => structuredClone(d))),
    verify: recorder().verify,
    apply: true,
    limit: 0,
    clock,
  })
  assert.equal(zero.limit, DEFAULT_QUEUE_BATCH, '0 is not a batch, it is a typo')
})

test('it stops claiming at the deadline and says so', async () => {
  const foods = new FakeFoods([queued('a'), queued('b'), queued('c')])
  const { verify, calls } = recorder()
  let t = NOW.getTime()

  const result = await runVerificationQueueDrain({
    foods,
    verify,
    apply: true,
    concurrency: 1,
    deadlineMs: 1_000,
    clock: () => {
      // Every reading of the clock advances it; the first food fits, the rest
      // are left in the queue for the next run.
      t += 600
      return t
    },
  })

  assert.ok(result.claimed >= 1 && result.claimed < 3, `claimed ${result.claimed}`)
  assert.equal(result.deadlineHit, true)
  assert.equal(calls.length, result.claimed)
  assert.ok(result.leftAlone > 0)
})

// ── The claim, and the TTL ───────────────────────────────────────────────────

test('a live claim is left alone — the food belongs to the run that holds it', async () => {
  const foods = new FakeFoods([
    queued('held', { verification: { state: 'queued', claimedAt: new Date(NOW.getTime() - MINUTE) } }),
    { _id: 'running', updatedAt: NOW, verification: { state: 'running', claimedAt: new Date(NOW.getTime() - 2 * MINUTE) } },
  ])

  const result = await runVerificationQueueDrain({
    foods,
    verify: neverVerify,
    apply: true,
    clock: () => NOW.getTime(),
  })

  assert.equal(result.waiting, 0)
  assert.equal(result.claimed, 0)
  assert.equal(result.wrote, false)
})

test('a food abandoned by a dead run becomes claimable once the TTL has passed', async () => {
  // Both halves of the dead-run case: killed before `verifyFood` flipped the
  // state (still `queued`), and killed mid-flight (`running`). Nothing else in
  // the codebase frees either one, so without this they are wedged forever.
  const stale = new Date(NOW.getTime() - CLAIM_TTL_MS - MINUTE)
  const foods = new FakeFoods([
    queued('died-queued', { verification: { state: 'queued', claimedAt: stale } }),
    {
      _id: 'died-running',
      updatedAt: new Date(NOW.getTime() - 30 * MINUTE),
      verification: { state: 'running', claimedAt: stale, runId: 'a-run-that-is-gone' },
    },
    // Same thing with no claim recorded at all.
    { _id: 'running-unclaimed', updatedAt: NOW, verification: { state: 'running' } },
  ])
  const { verify, calls } = recorder()

  const result = await runVerificationQueueDrain({
    foods,
    verify,
    apply: true,
    runId: 'the-live-run',
    clock: () => NOW.getTime(),
  })

  assert.equal(result.waiting, 3)
  assert.equal(result.claimed, 3)
  assert.deepEqual([...calls].sort(), ['died-queued', 'died-running', 'running-unclaimed'])
  // The claim is re-stamped with THIS run, so the next TTL starts now and the
  // next runner can tell whose work it is.
  assert.equal(foods.byId('died-running').verification!.runId, 'the-live-run')
  assert.equal(
    (foods.byId('died-running').verification!.claimedAt as Date).getTime(),
    NOW.getTime(),
  )
})

test('two concurrent runs never verify the same food', async () => {
  const foods = new FakeFoods([queued('a'), queued('b'), queued('c'), queued('d')])
  const one = recorder()
  const two = recorder()
  const clock = () => NOW.getTime()

  const [a, b] = await Promise.all([
    runVerificationQueueDrain({ foods, verify: one.verify, apply: true, runId: 'run-1', clock }),
    runVerificationQueueDrain({ foods, verify: two.verify, apply: true, runId: 'run-2', clock }),
  ])

  const verified = [...one.calls, ...two.calls]
  assert.equal(new Set(verified).size, verified.length, 'a food was verified twice')
  assert.deepEqual([...verified].sort(), ['a', 'b', 'c', 'd'])
  assert.equal(a.claimed + b.claimed, 4, 'between them they drained the queue exactly once')
  // Whichever run reached a row second lost the compare-and-swap on it and said
  // so, rather than verifying it again.
  assert.ok(a.lostClaim + b.lostClaim > 0, 'the losing run must report the rows it did not get')
  for (const r of [a, b]) {
    assert.equal(r.claimed + r.lostClaim, r.selected, 'every selected row is accounted for')
    for (const food of r.foods.filter((f) => f.outcome === 'lost-claim')) {
      assert.equal(food.reason, 'claimed_elsewhere')
    }
  }
})

test('the claim is released when a verification throws', async () => {
  const foods = new FakeFoods([queued('boom')])

  const result = await runVerificationQueueDrain({
    foods,
    verify: async () => {
      throw new Error('the graph fell over')
    },
    apply: true,
    clock: () => NOW.getTime(),
  })

  assert.equal(result.failed, 1)
  assert.equal(result.claimed, 1)
  const v = foods.byId('boom').verification!
  assert.equal(v.state, 'unverified', 'a food that just failed must leave the queue')
  assert.equal(v.claimedAt, undefined, 'the claim is given back')
  assert.equal((v as { lastOutcome?: string }).lastOutcome, 'drain_error')
})

test('the selector and flagPolicy.canClaim never disagree', async () => {
  // Two independent spellings of one rule: the query this module builds, and
  // the pure predicate the flag route uses. They are checked against each other
  // over every state and every claim age that matters.
  const states = ['unverified', 'queued', 'running', 'verified', 'insufficient'] as const
  const ages: Array<number | undefined> = [
    undefined,
    0,
    CLAIM_TTL_MS - 1,
    CLAIM_TTL_MS,
    CLAIM_TTL_MS + MINUTE,
  ]
  const selector = queueSelector(NOW)

  for (const state of states) {
    for (const age of ages) {
      const claimedAt = age === undefined ? undefined : new Date(NOW.getTime() - age)
      const doc: Doc = {
        _id: `${state}-${String(age)}`,
        verification: { state, ...(claimedAt ? { claimedAt } : {}) },
      }
      assert.equal(
        matches(doc, selector),
        claimableByPolicy(state, claimedAt?.getTime(), NOW.getTime()),
        `${state} claimed ${String(age)}ms ago`,
      )
    }
  }
})

// ── The recheck, exactly once ────────────────────────────────────────────────

test('a pending recheck is consumed by the claim, not turned into a second run', async () => {
  const foods = new FakeFoods([
    queued('asked', { verification: { state: 'queued', recheckRequested: true } }),
  ])
  const { verify, calls } = recorder()

  const result = await runVerificationQueueDrain({
    foods,
    verify,
    apply: true,
    clock: () => NOW.getTime(),
  })

  assert.equal(result.rechecksHonoured, 1)
  assert.equal(result.requeued, 0, 'the run it bought IS the recheck')
  assert.deepEqual(calls, ['asked'])
  assert.equal(
    foods.byId('asked').verification!.recheckRequested,
    undefined,
    'the request is cleared in the same atomic write that claims the food',
  )
  assert.equal(result.foods[0].recheckConsumed, true)
})

test('a recheck that arrives mid-run buys exactly one more pass, and no loop', async () => {
  const foods = new FakeFoods([queued('mid')])
  const calls: string[] = []
  let flagMidRun = true

  const verify = async (id: string): Promise<QueueVerifyOutcome> => {
    calls.push(id)
    // A member flags the food while this run is in flight. Today that is
    // `verification.recheckRequested` being set by a writer outside this run.
    if (flagMidRun) foods.byId(id).verification!.recheckRequested = true
    // The real verifyFood finishes by leaving the food verified and claim-free.
    const v = foods.byId(id).verification as Record<string, unknown>
    v.state = 'verified'
    delete v.claimedAt
    return { verdict: 'confirmed', written: false }
  }

  const first = await runVerificationQueueDrain({
    foods,
    verify,
    apply: true,
    clock: () => NOW.getTime(),
  })

  assert.equal(first.rechecksHonoured, 0, 'nothing was pending when it was claimed')
  assert.equal(first.requeued, 1)
  const after = foods.byId('mid').verification!
  assert.equal(after.state, 'queued', 'honoured by re-queueing, within the next batch bound')
  assert.equal(after.recheckRequested, undefined, 'the request is down before the extra pass')
  assert.equal(after.claimedAt, undefined)

  // The extra pass. Nothing new is requested this time.
  flagMidRun = false
  const second = await runVerificationQueueDrain({
    foods,
    verify,
    apply: true,
    clock: () => NOW.getTime() + MINUTE,
  })

  assert.equal(second.claimed, 1)
  assert.equal(second.requeued, 0, 'ONCE — a request cannot renew itself')
  assert.equal(second.rechecksHonoured, 0)
  assert.deepEqual(calls, ['mid', 'mid'], 'two passes in total, not a loop')

  // And a third run finds nothing left to do, which is the whole point.
  const third = await runVerificationQueueDrain({
    foods,
    verify: neverVerify,
    apply: true,
    clock: () => NOW.getTime() + 2 * MINUTE,
  })
  assert.equal(third.selected, 0)
  assert.equal(third.wrote, false)
})

test('a run that reached no verdict leaves the request standing', async () => {
  // `skipped` means verifyFood declined to decide (no comparable basis, review
  // unavailable). Re-queueing then would spend another round on a food nothing
  // can resolve, so the flag is left for the next claim to consume instead.
  const foods = new FakeFoods([queued('nobasis')])
  foods.byId('nobasis').verification!.state = 'queued'

  const result = await runVerificationQueueDrain({
    foods,
    verify: async () => {
      foods.byId('nobasis').verification!.recheckRequested = true
      return { verdict: 'skipped', written: false, reason: 'no_comparable_basis' }
    },
    apply: true,
    clock: () => NOW.getTime(),
  })

  assert.equal(result.skipped, 1)
  assert.equal(result.requeued, 0)
  assert.equal(foods.byId('nobasis').verification!.recheckRequested, true)
})

// ── The dry run ──────────────────────────────────────────────────────────────

test('a dry run plans the batch and writes nothing — not even a verification', async () => {
  const foods = new FakeFoods([
    queued('a', { updatedAt: new Date(NOW.getTime() - 90 * MINUTE) }),
    queued('b', { verification: { state: 'queued', recheckRequested: true } }),
  ])
  foods.refuseWrites = true

  const result = await runVerificationQueueDrain({
    foods,
    // A verification IS a write, in the only currency that matters here.
    verify: neverVerify,
    apply: false,
    clock: () => NOW.getTime(),
  })

  assert.equal(result.apply, false)
  assert.equal(result.wrote, false)
  assert.equal(result.waiting, 2)
  assert.equal(result.selected, 2)
  assert.equal(result.claimed, 0)
  assert.equal(result.leftAlone, 2)
  assert.deepEqual(result.foods.map((f) => f.outcome), ['planned', 'planned'])
  assert.deepEqual(result.foods.map((f) => f.foodId).sort(), ['a', 'b'])
  // It still reports what it WOULD have honoured.
  assert.equal(result.foods.find((f) => f.foodId === 'b')!.recheckConsumed, true)
  assert.deepEqual(foods.writes, [], 'a planned run touches the database zero times')
  // And the rows themselves are untouched.
  assert.equal(foods.byId('b').verification!.recheckRequested, true)
  assert.equal(foods.byId('a').verification!.claimedAt, undefined)
})

// ── What it is not allowed to touch ──────────────────────────────────────────

test('the drain writes the queue and nothing else', async () => {
  // `isVerified` is never flipped here — `verifyFood` owns the outcome and the
  // evidence that justifies it — and a MANUAL review decision must survive
  // every automatic writer that passes over the row.
  const foods = new FakeFoods([
    queued('a', { verification: { state: 'queued', recheckRequested: true } }),
    queued('b'),
  ])
  foods.docs[0].isVerified = false
  foods.docs[0].needsReview = true
  foods.docs[0].reviewFlag = { owner: 'manual', ruleVersion: 'v1' }

  await runVerificationQueueDrain({
    foods,
    verify: async () => ({ verdict: 'corrected', written: true }),
    apply: true,
    clock: () => NOW.getTime(),
  })

  const allowed = new Set([
    'verification.state',
    'verification.claimedAt',
    'verification.runId',
    'verification.recheckRequested',
    'verification.lastOutcome',
  ])
  for (const field of foods.touchedFields()) {
    assert.ok(allowed.has(field), `the drain must not write ${field}`)
  }
  assert.equal(foods.byId('a').isVerified, false)
  assert.equal(foods.byId('a').needsReview, true)
  assert.deepEqual(foods.byId('a').reviewFlag, { owner: 'manual', ruleVersion: 'v1' })
})

test('the defaults are the ones the budget argument assumes', () => {
  // A few tens of foods per run, and a wall clock short enough that the caller
  // gets an answer. Both are quoted in the route and in the workflow comment,
  // so a change here is a change there.
  assert.ok(DEFAULT_QUEUE_BATCH >= 10 && DEFAULT_QUEUE_BATCH <= 40)
  assert.ok(MAX_QUEUE_BATCH >= DEFAULT_QUEUE_BATCH && MAX_QUEUE_BATCH <= 50)
  assert.ok(DEFAULT_QUEUE_DEADLINE_MS >= 60_000 && DEFAULT_QUEUE_DEADLINE_MS <= 540_000)
})
