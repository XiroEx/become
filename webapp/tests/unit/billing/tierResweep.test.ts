// Run with: npm run test:file tests/unit/billing/tierResweep.test.ts
//
// The resweep is the ONE writer that can move a member's tier with no Stripe
// event behind it, and it now runs unattended every six hours. Three things
// therefore have to be true of it, and none of them is visible by reading a
// dashboard:
//
//   - it takes Plus away when a paid period has actually ended (including a
//     test-mode cancellation made on beta, because beta and production share
//     one database and the sweep reads STORED state, not events),
//   - it never touches a row it is not moving — a run that changes nothing
//     must issue no write at all, because it runs forever over a database
//     where nothing has lapsed,
//   - it writes `tier` and only `tier`, under a filter that loses to any
//     webhook that landed in between.
//
// The collection here is a fake that THROWS on any write it was not expecting,
// so "wrote nothing" is proven rather than reported.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  runTierResweep,
  resweepSelector,
  classifyRow,
  SUBSCRIPTION_GRACE_MS,
  type ResweepUserDoc,
  type ResweepUsersCollection,
} from '../../../lib/billing/tierResweep'

const NOW = new Date('2026-09-22T12:00:00.000Z')
const DAY = 86_400_000
const at = (days: number) => new Date(NOW.getTime() + days * DAY)

/**
 * The candidate rule, restated independently of lib/billing/tierResweep so the
 * fake cannot simply agree with a broken selector. It is the same two branches
 * the real selector encodes — see the shape assertions at the bottom.
 */
function isCandidate(doc: ResweepUserDoc, now: Date): boolean {
  const sub = doc.subscription
  if (!sub) return false
  const end = sub.currentPeriodEnd ? new Date(sub.currentPeriodEnd).getTime() : null
  if (sub.status === 'canceled') return end === null || end < now.getTime()
  if (sub.status === 'active' || sub.status === 'trialing') {
    return end !== null && end < now.getTime() - SUBSCRIPTION_GRACE_MS
  }
  return false
}

interface RecordedWrite {
  ops: Array<{
    updateOne: {
      filter: Record<string, unknown>
      update: { $set: Record<string, unknown> }
    }
  }>
}

class FakeUsers implements ResweepUsersCollection {
  writes: RecordedWrite[] = []
  /** Set to make any write an immediate failure. */
  refuseWrites = false

  constructor(
    private docs: ResweepUserDoc[],
    private now: Date = NOW,
  ) {}

  private candidates(): ResweepUserDoc[] {
    return this.docs.filter((d) => isCandidate(d, this.now))
  }

  async countDocuments(): Promise<number> {
    return this.candidates().length
  }

  find(): AsyncIterable<ResweepUserDoc> {
    const rows = this.candidates()
    return (async function* () {
      for (const row of rows) yield row
    })()
  }

  async bulkWrite(ops: unknown[]): Promise<{ matchedCount: number; modifiedCount: number }> {
    if (this.refuseWrites) {
      throw new Error('a write was issued when none was expected')
    }
    const typed = ops as RecordedWrite['ops']
    this.writes.push({ ops: typed })
    // Apply them to the fake rows so a second run sees the new state.
    for (const op of typed) {
      const id = op.updateOne.filter._id
      const doc = this.docs.find((d) => d._id === id)
      if (doc) doc.tier = op.updateOne.update.$set.tier as 'free' | 'plus'
    }
    return { matchedCount: typed.length, modifiedCount: typed.length }
  }
}

// ── The case the job exists for ──────────────────────────────────────────────

test('a cancelled subscription loses Plus once the paid period has passed', async () => {
  const users = new FakeUsers([
    {
      _id: 'lapsed',
      tier: 'plus',
      subscription: { status: 'canceled', currentPeriodEnd: at(-1), mode: 'test' },
    },
  ])

  const result = await runTierResweep({ users, now: NOW, apply: true })

  assert.equal(result.candidates, 1)
  assert.equal(result.planned, 1)
  assert.equal(result.downgrades, 1)
  assert.equal(result.modified, 1)
  assert.deepEqual(result.changes.map((c) => [c.userId, c.from, c.to]), [['lapsed', 'plus', 'free']])
})

test('a cancellation made in TEST mode on beta is swept by the same run', async () => {
  // Beta and production are two workspaces over one database. The mode fence
  // governs which EVENT may write which state; by the time it is stored it is
  // just a subscription, and the clock expires it the same way. One scheduled
  // runner therefore covers both channels — which is why there is only one.
  const users = new FakeUsers([
    {
      _id: 'beta-tester',
      tier: 'plus',
      subscription: { status: 'canceled', currentPeriodEnd: at(-0.5), mode: 'test' },
    },
  ])

  const result = await runTierResweep({ users, now: NOW, apply: true })

  assert.equal(result.modified, 1)
  assert.equal(result.changes[0].to, 'free')
})

test('a cancelled subscription still inside its paid period keeps Plus', async () => {
  const users = new FakeUsers([
    {
      _id: 'still-paid',
      tier: 'plus',
      subscription: { status: 'canceled', currentPeriodEnd: at(+5) },
    },
  ])
  users.refuseWrites = true

  const result = await runTierResweep({ users, now: NOW, apply: true })

  // Not even a candidate: the period has not ended.
  assert.equal(result.candidates, 0)
  assert.equal(result.planned, 0)
  assert.equal(result.wrote, false)
})

test('an active subscription is expired only once it is past the grace', async () => {
  const insideGrace = new FakeUsers([
    {
      _id: 'one-missed-webhook',
      tier: 'plus',
      subscription: {
        status: 'active',
        currentPeriodEnd: new Date(NOW.getTime() - SUBSCRIPTION_GRACE_MS + DAY),
      },
    },
  ])
  insideGrace.refuseWrites = true
  const kept = await runTierResweep({ users: insideGrace, now: NOW, apply: true })
  assert.equal(kept.candidates, 0)
  assert.equal(kept.wrote, false)

  const pastGrace = new FakeUsers([
    {
      _id: 'webhook-never-came',
      tier: 'plus',
      subscription: {
        status: 'active',
        currentPeriodEnd: new Date(NOW.getTime() - SUBSCRIPTION_GRACE_MS - DAY),
      },
    },
  ])
  const swept = await runTierResweep({ users: pastGrace, now: NOW, apply: true })
  assert.equal(swept.modified, 1)
  assert.equal(swept.changes[0].to, 'free')
})

// ── A run that changes nothing writes nothing ────────────────────────────────

test('no candidates at all means no write, and says so', async () => {
  const users = new FakeUsers([
    { _id: 'free-member', tier: 'free' },
    { _id: 'paying', tier: 'plus', subscription: { status: 'active', currentPeriodEnd: at(+20) } },
  ])
  users.refuseWrites = true

  const result = await runTierResweep({ users, now: NOW, apply: true })

  assert.equal(result.candidates, 0)
  assert.equal(result.planned, 0)
  assert.equal(result.wrote, false)
  assert.equal(result.modified, 0)
  assert.equal(users.writes.length, 0)
})

test('candidates whose tier is already right are left alone — still no write', async () => {
  // The steady state once the sweep has caught up: the rows keep matching the
  // selector forever, and every run after the first must be a pure read.
  const users = new FakeUsers([
    {
      _id: 'already-free',
      tier: 'free',
      subscription: { status: 'canceled', currentPeriodEnd: at(-30) },
    },
  ])
  users.refuseWrites = true

  const result = await runTierResweep({ users, now: NOW, apply: true })

  assert.equal(result.candidates, 1)
  assert.equal(result.alreadyCorrect, 1)
  assert.equal(result.planned, 0)
  assert.equal(result.wrote, false)
})

test('running it twice in a row writes once', async () => {
  const users = new FakeUsers([
    {
      _id: 'lapsed',
      tier: 'plus',
      subscription: { status: 'canceled', currentPeriodEnd: at(-2) },
    },
  ])

  const first = await runTierResweep({ users, now: NOW, apply: true })
  assert.equal(first.modified, 1)

  users.refuseWrites = true
  const second = await runTierResweep({ users, now: NOW, apply: true })
  assert.equal(second.planned, 0)
  assert.equal(second.wrote, false)
  assert.equal(users.writes.length, 1)
})

test('a dry run computes the plan and writes nothing', async () => {
  const users = new FakeUsers([
    {
      _id: 'lapsed',
      tier: 'plus',
      subscription: { status: 'canceled', currentPeriodEnd: at(-2) },
    },
  ])
  users.refuseWrites = true

  const result = await runTierResweep({ users, now: NOW, apply: false })

  assert.equal(result.planned, 1)
  assert.equal(result.wrote, false)
  assert.equal(result.modified, 0)
  assert.equal(users.writes.length, 0)
})

// ── What a write may say ─────────────────────────────────────────────────────

test('the write sets tier (and updatedAt) and nothing else', async () => {
  const users = new FakeUsers([
    {
      _id: 'lapsed',
      tier: 'plus',
      subscription: { status: 'canceled', currentPeriodEnd: at(-2), stripeSubscriptionId: 'sub_1' },
    },
  ])

  await runTierResweep({ users, now: NOW, apply: true })

  const set = users.writes[0].ops[0].updateOne.update.$set
  assert.deepEqual(Object.keys(set).sort(), ['tier', 'updatedAt'])
  assert.equal(set.tier, 'free')
})

test('the write re-asserts the candidate selector and the tier that was read', async () => {
  const users = new FakeUsers([
    {
      _id: 'lapsed',
      tier: 'plus',
      subscription: { status: 'canceled', currentPeriodEnd: at(-2) },
    },
  ])

  await runTierResweep({ users, now: NOW, apply: true })

  const filter = users.writes[0].ops[0].updateOne.filter as {
    _id: unknown
    $and: Array<Record<string, unknown>>
  }
  // A webhook landing between the read and the write wins: both halves of the
  // decision are conditions on the update itself.
  assert.deepEqual(filter.$and[0], resweepSelector(NOW))
  assert.deepEqual(filter.$and[1], { tier: 'plus' })
})

test('the filter carries the RAW _id, never a stringified one', async () => {
  // The driver does no casting. `String(_id)` matches no ObjectId row, so every
  // write would modify nothing while reporting success.
  const objectIdish = { toString: () => '651f1f1f1f1f1f1f1f1f1f1f' }
  const users = new FakeUsers([
    {
      _id: objectIdish,
      tier: 'plus',
      subscription: { status: 'canceled', currentPeriodEnd: at(-2) },
    },
  ])

  await runTierResweep({ users, now: NOW, apply: true })

  assert.equal(users.writes[0].ops[0].updateOne.filter._id, objectIdish)
  // …and the report still names the member by a printable id.
  assert.equal(users.writes.length, 1)
})

// ── What it must never do ────────────────────────────────────────────────────

test('grandfathered and admin rows are never demoted by the clock', async () => {
  const users = new FakeUsers([
    {
      _id: 'grandfathered',
      tier: 'plus',
      grandfathered: true,
      subscription: { status: 'canceled', currentPeriodEnd: at(-100) },
    },
    {
      _id: 'admin',
      tier: 'plus',
      role: 'admin',
      subscription: { status: 'canceled', currentPeriodEnd: at(-100) },
    },
  ])
  users.refuseWrites = true

  const result = await runTierResweep({ users, now: NOW, apply: true })

  assert.equal(result.candidates, 2)
  assert.equal(result.alreadyCorrect, 2)
  assert.equal(result.planned, 0)
  assert.equal(result.wrote, false)
})

test('a missing tier is repaired rather than skipped', async () => {
  const users = new FakeUsers([
    {
      _id: 'no-tier-field',
      subscription: { status: 'canceled', currentPeriodEnd: at(-2) },
    },
  ])

  const result = await runTierResweep({ users, now: NOW, apply: true })

  assert.equal(result.planned, 1)
  assert.equal(result.changes[0].from, null)
  const filter = users.writes[0].ops[0].updateOne.filter as { $and: Array<Record<string, unknown>> }
  assert.deepEqual(filter.$and[1], { tier: null })
})

// ── The selector, read directly ──────────────────────────────────────────────

test('the selector reads exactly the two clock-dependent deriveTier branches', () => {
  const selector = resweepSelector(NOW) as {
    $or: Array<Record<string, unknown>>
  }
  assert.equal(selector.$or.length, 2)

  const [cancelled, stale] = selector.$or
  assert.equal(cancelled['subscription.status'], 'canceled')
  assert.deepEqual(cancelled.$or, [
    { 'subscription.currentPeriodEnd': { $lt: NOW } },
    { 'subscription.currentPeriodEnd': null },
  ])

  assert.deepEqual(stale['subscription.status'], { $in: ['active', 'trialing'] })
  assert.deepEqual(stale['subscription.currentPeriodEnd'], {
    $lt: new Date(NOW.getTime() - SUBSCRIPTION_GRACE_MS),
  })

  // past_due / unpaid / incomplete are NOT here: they derive to free the moment
  // the event lands, so nothing about them changes with time.
  assert.doesNotMatch(JSON.stringify(selector), /past_due|unpaid|incomplete/)
})

test('classifyRow returns null for a row that is already right', () => {
  const doc: ResweepUserDoc = {
    _id: 'x',
    tier: 'free',
    subscription: { status: 'canceled', currentPeriodEnd: at(-2) },
  }
  assert.equal(classifyRow(doc, NOW), null)
})
