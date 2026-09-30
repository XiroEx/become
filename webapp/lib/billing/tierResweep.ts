// The sweep that re-derives `tier` from stored billing state. ONE implementation,
// shared by the scheduled route (`app/api/cron/resweep-tiers`) and the hand-run
// script (`scripts/resweep-subscription-tiers.mjs`), because those two
// disagreeing about what a lapsed subscription means is exactly the failure this
// exists to prevent.
//
// WHY IT EXISTS
//
// `tier` is WRITTEN, never derived on read (lib/subscription.ts says so, and
// lib/entitlements.ts deliberately cannot import it). Every writer is an event
// handler — and two of deriveTier's branches are functions of the CLOCK, not of
// any event, so at the instant their answer changes there is nothing to run
// them:
//
//   • `canceled` keeps Plus only while `now < currentPeriodEnd`. Stripe's last
//     word on a cancelled subscription is `customer.subscription.deleted`; the
//     period end simply passing emits nothing. The row keeps whatever the last
//     event wrote — Plus, forever, unpaid.
//   • `active`/`trialing` expire SUBSCRIPTION_GRACE_MS past their period end.
//     That grace survives ONE missed webhook; a permanently missed one
//     (endpoint disabled, secret rotated, an event Stripe gave up retrying) is
//     never closed by anything.
//
// IT CALLS THE REAL `deriveTier`, never a copy of its rules. The selector below
// mirrors two of its branches only to keep the candidate READ cheap; the
// derivation still runs per row, so a selector that drifts can cost a read and
// can never cost a wrong tier.
//
// WHAT IT WILL NOT DO
//
// It writes `tier` and nothing else. Stripe's state is Stripe's: `status`,
// `currentPeriodEnd` and the ids are left exactly as the webhook left them. It
// cannot revoke `grandfathered` or demote an admin either, because deriveTier
// pins both to plus and this only ever writes what deriveTier returned.
//
// It is mode-blind ON PURPOSE. The mode fence (lib/billing/mode.ts) governs
// which STRIPE EVENT may write which state; this reads the state that already
// landed and answers "what does it mean now". A beta test-mode cancellation is
// written to the shared database as a real `subscription.status`, so the same
// sweep expires it — which is why ONE scheduled runner covers both channels.
//
// A RUN THAT CHANGES NOTHING WRITES NOTHING: `bulkWrite` is issued only when a
// row's stored tier actually differs from the derived one, so the common case
// (and today's, with no subscriptions at all) touches the database zero times.
// `wrote` reports that, so a caller can hold itself to the same rule.

import { deriveTier, SUBSCRIPTION_GRACE_MS } from '../subscription'
import type { Tier } from '../entitlements'
import type { IUserSubscription, UserRole } from '../../models/User'

export { SUBSCRIPTION_GRACE_MS }

/** The projection this needs, and the shape deriveTier is fed. */
export interface ResweepUserDoc {
  _id: unknown
  tier?: Tier | null
  role?: UserRole
  grandfathered?: boolean
  subscription?: IUserSubscription | null
}

/** One row the sweep would move, reported by id only — never by email. */
export interface ResweepChange {
  userId: string
  from: Tier | null
  to: Tier
  /** Stored subscription status that produced the decision. */
  status: string
  /** ISO, or null when the row never recorded one. */
  periodEnd: string | null
}

export interface ResweepResult {
  ranAt: string
  durationMs: number
  /** false when asked for a dry run: the plan is computed, nothing is written. */
  apply: boolean
  /** Rows the selector matched. */
  candidates: number
  /** Candidates whose stored tier already equals the derived one. Left alone. */
  alreadyCorrect: number
  planned: number
  downgrades: number
  upgrades: number
  matched: number
  modified: number
  /** The planned rows, capped for reporting; the counts above are complete. */
  changes: ResweepChange[]
  /** Whether ANY write was issued. False on every no-op run, by construction. */
  wrote: boolean
}

/**
 * The minimum of a MongoDB collection this needs. Narrow on purpose: the route
 * hands it `User.collection`, the script hands it the raw driver collection,
 * and a unit test hands it an object that throws on any write.
 */
export interface ResweepUsersCollection {
  countDocuments(filter: Record<string, unknown>): Promise<number>
  find(
    filter: Record<string, unknown>,
    options?: { projection?: Record<string, number> },
  ): AsyncIterable<ResweepUserDoc>
  bulkWrite(
    ops: unknown[],
    options?: { ordered?: boolean },
  ): Promise<{ matchedCount?: number; modifiedCount?: number }>
}

export interface ResweepOptions {
  users: ResweepUsersCollection
  /** Injected so a test can move the clock. Defaults to now. */
  now?: Date
  /** false = dry run. */
  apply: boolean
  /** Cap on rows echoed back in `changes`. Counts are never capped. */
  maxReportedChanges?: number
}

/**
 * Rows whose tier MIGHT have gone stale with the clock. Both clauses mirror a
 * deriveTier branch:
 *
 *  1. `canceled` and the paid period is over (or was never recorded).
 *  2. `active`/`trialing` whose period end is past the grace — the missed
 *     webhook case.
 *
 * Nothing else can change answer without an event, so nothing else is read.
 */
export function resweepSelector(now: Date): Record<string, unknown> {
  const graceCutoff = new Date(now.getTime() - SUBSCRIPTION_GRACE_MS)
  return {
    $or: [
      {
        'subscription.status': 'canceled',
        $or: [
          { 'subscription.currentPeriodEnd': { $lt: now } },
          { 'subscription.currentPeriodEnd': null },
        ],
      },
      {
        'subscription.status': { $in: ['active', 'trialing'] },
        'subscription.currentPeriodEnd': { $lt: graceCutoff },
      },
    ],
  }
}

/** PURE. What this row should become, or null when it is already right. */
export function classifyRow(doc: ResweepUserDoc, now: Date): ResweepChange | null {
  const want = deriveTier({
    subscription: doc.subscription ?? null,
    grandfathered: doc.grandfathered === true,
    role: doc.role,
    now,
  })
  const have = (doc.tier ?? null) as Tier | null
  if (want === have) return null

  const end = doc.subscription?.currentPeriodEnd ?? null
  return {
    userId: String(doc._id),
    from: have,
    to: want,
    status: doc.subscription?.status ?? 'none',
    periodEnd: end ? new Date(end).toISOString() : null,
  }
}

/**
 * The guarded write for one row. Re-asserts EVERYTHING the decision rested on —
 * still a candidate, and the tier still the one that was read — so a webhook
 * that landed between the read and the write wins, and a second run matches
 * nothing.
 *
 * `_id` is the RAW value off the document, never `String(_id)`: the driver does
 * no casting, so a stringified ObjectId matches no row and every write would
 * silently modify nothing.
 */
function updateOpFor(id: unknown, change: ResweepChange, selector: Record<string, unknown>) {
  return {
    updateOne: {
      filter: {
        _id: id,
        $and: [selector, change.from === null ? { tier: null } : { tier: change.from }],
      },
      update: { $set: { tier: change.to, updatedAt: new Date() } },
    },
  }
}

const DEFAULT_MAX_REPORTED = 50

/**
 * Read the candidates, derive each one, and write only the rows that moved.
 *
 * Safe at any cadence and safe to run twice in a row: idempotent twice over, by
 * the equality check in classifyRow and by the re-asserting filter above.
 */
export async function runTierResweep(opts: ResweepOptions): Promise<ResweepResult> {
  const now = opts.now ?? new Date()
  const startedAt = Date.now()
  const selector = resweepSelector(now)
  const maxReported = opts.maxReportedChanges ?? DEFAULT_MAX_REPORTED

  const candidates = await opts.users.countDocuments(selector)

  const planned: Array<{ id: unknown; change: ResweepChange }> = []
  let alreadyCorrect = 0

  const cursor = opts.users.find(selector, {
    projection: { tier: 1, role: 1, grandfathered: 1, subscription: 1 },
  })
  for await (const doc of cursor) {
    const change = classifyRow(doc, now)
    if (change === null) alreadyCorrect++
    else planned.push({ id: doc._id, change })
  }

  let matched = 0
  let modified = 0
  let wrote = false

  // The whole point: no plan, no write. Not an empty bulkWrite, not a
  // "nothing to do" audit row — nothing.
  if (opts.apply && planned.length > 0) {
    wrote = true
    const result = await opts.users.bulkWrite(
      planned.map((p) => updateOpFor(p.id, p.change, selector)),
      { ordered: false },
    )
    matched = result.matchedCount ?? 0
    modified = result.modifiedCount ?? 0
  }

  const changes = planned.map((p) => p.change)

  return {
    ranAt: now.toISOString(),
    durationMs: Date.now() - startedAt,
    apply: opts.apply,
    candidates,
    alreadyCorrect,
    planned: changes.length,
    downgrades: changes.filter((c) => c.to === 'free').length,
    upgrades: changes.filter((c) => c.to === 'plus').length,
    matched,
    modified,
    changes: changes.slice(0, maxReported),
    wrote,
  }
}
