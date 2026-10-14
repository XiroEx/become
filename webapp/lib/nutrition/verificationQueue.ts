/**
 * THE DRAIN for `verification.state: 'queued'`.
 *
 * The verification pipeline could be ENTERED and never left. Three writers put
 * a food into the queue — `POST /api/nutrition/foods/[id]/flag` (over its daily
 * limit, or recently verified), `POST /api/nutrition/flags/[id]/evidence`, and
 * `scripts/audit-food-coherence.mjs` — and nothing in the repo took one out
 * again. On 2026-09-21 that was 45 foods sitting queued since the 2026-08-13
 * audit run while the agent had verified exactly one food, ever.
 *
 * This is the SCHEDULER side of that gap, not a second verifier: the machinery
 * (`verifyFood.ts`, `flagPolicy.ts`, `evidence.ts`, `escalateFlag.ts`) already
 * existed and is called, never restated. What was missing was something that
 * picks the next food, takes the claim, and hands it to `verifyFood`.
 *
 * FIVE RULES, and each one is a failure we can already name:
 *
 *  1. BOUNDED. Every food costs a grounded web search, which is the metered
 *     cost in this pipeline (see flagPolicy.ts). One run may take a few tens of
 *     foods and no more, and it stops claiming when the wall clock says it is
 *     out of time, so a backlog of ten thousand cannot become one invoice.
 *  2. CLAIM BEFORE WORK. The claim is the same compare-and-swap the flag route
 *     takes, over the same `claimedAt` TTL, so two runners — a schedule
 *     overlapping itself, or a cron racing a member's flag — never verify the
 *     same food twice.
 *  3. THE TTL IS A TTL. A claim older than `CLAIM_TTL_MS` is presumed leaked
 *     and may be taken. That covers the run that dies mid-flight, which is why
 *     a food in `running` with a stale claim is a candidate here too: nothing
 *     else in the codebase would ever free it.
 *  4. A RECHECK IS HONOURED ONCE. Never a loop — see `requeueUpdate` below.
 *  5. IT WRITES ONLY THE QUEUE. The claim, the release and the re-queue touch
 *     `verification.{state,claimedAt,runId,recheckRequested,lastOutcome}` and
 *     nothing else. `verifyFood` owns the outcome (and is the only writer of
 *     the evidence array); `isVerified`, `needsReview` and `reviewFlag` are not
 *     this job's to move — a manual review decision in particular must survive
 *     every automatic writer that passes over the row.
 *
 * Shaped like `lib/billing/tierResweep.ts` on purpose: the collection and the
 * verifier are injected, so the batch rule, the claim race and the dry run are
 * unit-testable without a database and without spending a penny on an agent.
 */

import { CLAIM_TTL_MS, canClaim } from './flagPolicy'

/** Foods one run may take. A few tens: see rule 1. */
export const DEFAULT_QUEUE_BATCH = 20
export const MAX_QUEUE_BATCH = 40

/**
 * How many verifications run at once. `verifyFood` is mostly waiting on a
 * search and a review (up to ~5 minutes in the worst case), so a little
 * parallelism is what keeps a batch inside one HTTP request — but every lane is
 * also a concurrent AI dispatch, so it stays small.
 */
export const DEFAULT_QUEUE_CONCURRENCY = 3
export const MAX_QUEUE_CONCURRENCY = 5

/**
 * Stop CLAIMING new foods after this long. Work already in flight is awaited:
 * abandoning it would leave claims behind to expire, which is exactly the
 * wedged-food failure the TTL exists to clean up after, not to cause.
 */
export const DEFAULT_QUEUE_DEADLINE_MS = 240_000

/** The projection the drain reads. Nothing here is member data. */
export interface QueuedFoodDoc {
  _id: unknown
  name?: string
  brand?: string
  updatedAt?: Date
  verification?: {
    state?: string
    claimedAt?: Date | null
    runId?: string
    recheckRequested?: boolean
  }
}

/**
 * The minimum of a MongoDB collection this needs — narrow on purpose, the same
 * way `ResweepUsersCollection` is: the route hands it `Food.collection`, and a
 * unit test hands it a fake that throws on any write it did not expect.
 */
export interface DrainFoodsCollection {
  countDocuments(filter: Record<string, unknown>): Promise<number>
  find(
    filter: Record<string, unknown>,
    options?: {
      projection?: Record<string, number>
      sort?: Record<string, 1 | -1>
      limit?: number
    },
  ): AsyncIterable<QueuedFoodDoc>
  findOneAndUpdate(
    filter: Record<string, unknown>,
    update: Record<string, unknown>,
    options?: Record<string, unknown>,
  ): Promise<QueuedFoodDoc | null>
  updateOne(
    filter: Record<string, unknown>,
    update: Record<string, unknown>,
  ): Promise<{ matchedCount?: number; modifiedCount?: number }>
}

/**
 * What the drain needs back from a verification. Structurally a subset of
 * `VerificationOutcome`, declared here so this module — and its tests — never
 * import the AI pipeline.
 */
export interface QueueVerifyOutcome {
  verdict: 'confirmed' | 'corrected' | 'insufficient' | 'conflicted' | 'skipped'
  /** True only when the shared record actually changed. */
  written: boolean
  reason?: string
  problem?: string
  confidence?: number
}

/** One food, and what this run did with it. Ids and verdicts only. */
export interface DrainFoodReport {
  foodId: string
  name?: string
  /** 'planned' on a dry run; 'lost-claim' when another runner holds it. */
  outcome: QueueVerifyOutcome['verdict'] | 'planned' | 'lost-claim' | 'error'
  written: boolean
  reason?: string
  problem?: string
  confidence?: number
  /** A recheck request this run consumed when it took the claim. */
  recheckConsumed: boolean
  /** A recheck request that arrived DURING the run, honoured once. */
  requeued: boolean
}

export interface DrainResult {
  ranAt: string
  durationMs: number
  /** false when asked for a dry run: the plan is computed, nothing is written. */
  apply: boolean
  /** Queue depth when the run started — the whole backlog, not just the batch. */
  waiting: number
  /** The batch bound this run used. */
  limit: number
  /** Foods this run looked at: the oldest `limit` of `waiting`. */
  selected: number
  /** Of those, the ones this run actually took the claim on. */
  claimed: number
  /** Claims lost to another runner, or rows that stopped being candidates. */
  lostClaim: number
  confirmed: number
  corrected: number
  insufficient: number
  conflicted: number
  /** `verifyFood` declined to reach a verdict (no basis, review unavailable). */
  skipped: number
  /** Verifications that threw. The claim is released on every one of them. */
  failed: number
  /** Shared catalogue records this run actually changed. */
  written: number
  /** Pending recheck requests consumed by a claim (rule 4). */
  rechecksHonoured: number
  /** Requests that arrived mid-run and bought exactly one more pass (rule 4). */
  requeued: number
  /** True when the run stopped claiming because it ran out of wall clock. */
  deadlineHit: boolean
  /** Still queued after this run: `waiting` minus what this run claimed. */
  leftAlone: number
  /**
   * Whether this run issued ANY write command. False on every dry run and on
   * every run that found the queue empty, by construction.
   */
  wrote: boolean
  runId: string
  foods: DrainFoodReport[]
}

export interface DrainOptions {
  foods: DrainFoodsCollection
  /** The real `verifyFood`. Injected so a test never dispatches an agent. */
  verify: (foodId: string) => Promise<QueueVerifyOutcome>
  /** false = dry run: plan the batch, write nothing, claim nothing. */
  apply: boolean
  limit?: number
  concurrency?: number
  deadlineMs?: number
  /** Stamped onto each claim so a flag arriving mid-run can attach to it. */
  runId?: string
  /** Injected so a test can move the clock. Milliseconds, like Date.now. */
  clock?: () => number
}

/**
 * Rows this run may claim: IN THE QUEUE, and not already held by a live claim.
 * Which is `canClaim()` from flagPolicy.ts, spelled as a query — one rule, not
 * two (`claimableByPolicy` at the bottom of this file pins them together).
 *
 *  - `queued` with no claim, or a claim past the TTL — the ordinary case, a
 *    food put in the queue by a flag route or by the coherence audit.
 *  - `running` with no claim, or a claim past the TTL — a run that DIED
 *    mid-flight. Nothing else in the codebase ever frees one of these, so
 *    leaving it out would wedge the food as unverifiable forever, which is the
 *    exact failure the TTL was introduced to prevent.
 *
 * A food that is `verified`, `insufficient` or `unverified` is NOT in the queue
 * and is never picked up here: re-verifying one of those on suspicion alone is
 * flagPolicy's decision to make, not this job's.
 */
export function queueSelector(now: Date): Record<string, unknown> {
  const staleBefore = new Date(now.getTime() - CLAIM_TTL_MS)
  return {
    'verification.state': { $in: ['queued', 'running'] },
    $or: [
      { 'verification.claimedAt': { $exists: false } },
      { 'verification.claimedAt': null },
      // `$lte`, not `$lt`: `isClaimLive` is `now - claimedAt < CLAIM_TTL_MS`,
      // so a claim exactly one TTL old is already dead. One millisecond is
      // nothing in practice — but a query that disagrees with the predicate by
      // a tick is a bug waiting for the test that finds it.
      { 'verification.claimedAt': { $lte: staleBefore } },
    ],
  }
}

/**
 * Oldest first. There is no `queuedAt` field, and adding one would need a
 * backfill for every row already waiting — but `updatedAt` IS when a queued row
 * was enqueued, because being enqueued is the last thing that happened to it.
 * `_id` breaks ties so the order is total and two runners walk the same list.
 *
 * The claim deliberately goes through the RAW collection (`Food.collection`),
 * which does not touch mongoose's `updatedAt`, so claiming and releasing a food
 * cannot reshuffle the queue underneath the next run.
 */
export const QUEUE_SORT: Record<string, 1 | -1> = { updatedAt: 1, _id: 1 }

/**
 * The compare-and-swap. Re-asserts the WHOLE candidate rule for this row, so a
 * food that was claimed, verified or flagged between the read and the write is
 * left alone and the loser of the race simply moves on.
 *
 * `_id` is the RAW value off the document, never `String(_id)`: the driver does
 * no casting, so a stringified ObjectId matches no row and every claim would
 * silently succeed at nothing.
 */
export function claimFilter(id: unknown, now: Date): Record<string, unknown> {
  return { _id: id, $and: [queueSelector(now)] }
}

/**
 * Take the claim.
 *
 * `recheckRequested` is CONSUMED here, in the same atomic write: the run this
 * claim starts IS the recheck that was asked for, so leaving the flag set would
 * buy a second run for a request that has already been answered. That is half
 * of rule 4; `requeueUpdate` is the other half.
 */
export function claimUpdate(now: Date, runId: string): Record<string, unknown> {
  return {
    $set: {
      'verification.state': 'running',
      'verification.claimedAt': now,
      'verification.runId': runId,
    },
    $unset: { 'verification.recheckRequested': '' },
  }
}

/**
 * Honour a recheck that arrived WHILE this food was being verified.
 *
 * The filter requires the flag to still be set, so the clear and the re-queue
 * are one atomic step: two runners cannot both honour the same request, and the
 * extra pass starts with the flag already down. Which is what makes it ONCE and
 * not a loop — the next run can only be bought by a NEW request from outside,
 * and raising one of those is itself rate-limited by flagPolicy.
 *
 * It re-queues rather than re-running inline, so the extra pass is still
 * subject to the batch bound. One run cannot be talked into spending twice.
 */
export function requeueUpdate(): Record<string, unknown> {
  return {
    $set: { 'verification.state': 'queued' },
    $unset: {
      'verification.recheckRequested': '',
      'verification.claimedAt': '',
    },
  }
}

/**
 * Give the claim back. Only reached when `verify` THREW — `verifyFood` releases
 * its own claim on every exit it controls, so this is the belt to its braces.
 * State goes to `unverified`, exactly as `verifyFood`'s own release does: a
 * food that just failed must leave the queue, or every run would spend its
 * budget on the same broken row forever.
 */
export function releaseUpdate(outcome: string): Record<string, unknown> {
  return {
    $set: { 'verification.state': 'unverified', 'verification.lastOutcome': outcome },
    $unset: { 'verification.claimedAt': '' },
  }
}

const PROJECTION = { name: 1, brand: 1, updatedAt: 1, verification: 1 }

function clamp(value: number | undefined, fallback: number, max: number): number {
  // Below one is not a smaller batch, it is a typo — fall back rather than
  // quietly turn a scheduled run into a no-op.
  if (value == null || !Number.isFinite(value) || value < 1) return fallback
  return Math.min(Math.floor(value), max)
}

/**
 * The claimed document, whichever shape the driver hands back.
 *
 * `findOneAndUpdate` returns the document itself on the modern driver, but
 * `{ value, ok }` when `includeResultMetadata` is on — and that wrapper is
 * TRUTHY even when nothing matched, which would turn every lost race into a
 * claim and verify the same food twice. Unwrapped here rather than trusted.
 */
function unwrap(result: QueuedFoodDoc | null): QueuedFoodDoc | null {
  if (!result || typeof result !== 'object') return null
  if ('_id' in result) return result
  const wrapped = result as { value?: QueuedFoodDoc | null }
  return 'value' in wrapped ? (wrapped.value ?? null) : null
}

/**
 * Drain the queue: read the oldest waiting foods, claim them one at a time, and
 * hand each claimed one to `verifyFood`.
 *
 * Safe to run twice at once and safe to run on a schedule: every food is behind
 * a compare-and-swap, and a run with an empty queue issues no write at all.
 */
export async function runVerificationQueueDrain(opts: DrainOptions): Promise<DrainResult> {
  const clock = opts.clock ?? Date.now
  const startedAt = clock()
  const now = new Date(startedAt)
  const limit = clamp(opts.limit, DEFAULT_QUEUE_BATCH, MAX_QUEUE_BATCH)
  const concurrency = clamp(opts.concurrency, DEFAULT_QUEUE_CONCURRENCY, MAX_QUEUE_CONCURRENCY)
  const deadlineMs = opts.deadlineMs ?? DEFAULT_QUEUE_DEADLINE_MS
  const runId = opts.runId ?? `verify-queue-${now.toISOString()}`

  const selector = queueSelector(now)

  // Reads only. The depth of the whole backlog, so the response can say what it
  // LEFT ALONE and not merely what it touched.
  const waiting = await opts.foods.countDocuments(selector)

  const candidates: QueuedFoodDoc[] = []
  const cursor = opts.foods.find(selector, {
    projection: PROJECTION,
    sort: QUEUE_SORT,
    limit,
  })
  for await (const doc of cursor) candidates.push(doc)

  const reports: DrainFoodReport[] = []
  let claimed = 0
  let lostClaim = 0
  let failed = 0
  let rechecksHonoured = 0
  let requeued = 0
  let wrote = false
  let deadlineHit = false

  // A DRY RUN STOPS HERE, before the first write. No claim, no release, no
  // re-queue — and no verification either, because a verification is a write in
  // the only currency that matters here.
  if (!opts.apply) {
    for (const doc of candidates) {
      reports.push({
        foodId: String(doc._id),
        name: doc.name,
        outcome: 'planned',
        written: false,
        recheckConsumed: doc.verification?.recheckRequested === true,
        requeued: false,
      })
    }
  } else {
    let next = 0
    const lane = async (): Promise<void> => {
      for (;;) {
        if (clock() - startedAt >= deadlineMs) {
          // Out of time. Stop CLAIMING; whatever is already in flight is still
          // awaited below, so no claim is left behind to expire.
          if (next < candidates.length) deadlineHit = true
          return
        }
        const doc = candidates[next++]
        if (!doc) return

        const at = new Date(clock())
        const before = unwrap(
          await opts.foods.findOneAndUpdate(
            claimFilter(doc._id, at),
            claimUpdate(at, runId),
            { returnDocument: 'before', projection: PROJECTION },
          ),
        )
        wrote = true
        if (!before) {
          // Another runner got there first, or the row stopped being a
          // candidate. Both mean: not ours to verify.
          lostClaim++
          reports.push({
            foodId: String(doc._id),
            name: doc.name,
            outcome: 'lost-claim',
            written: false,
            reason: 'claimed_elsewhere',
            recheckConsumed: false,
            requeued: false,
          })
          continue
        }

        claimed++
        const recheckConsumed = before.verification?.recheckRequested === true
        if (recheckConsumed) rechecksHonoured++

        const foodId = String(doc._id)
        let outcome: QueueVerifyOutcome | null = null
        try {
          outcome = await opts.verify(foodId)
        } catch (error) {
          // verifyFood is documented never to throw; if it ever does, the claim
          // must still come back or the food is wedged until the TTL.
          console.error(`[verify-queue] ${foodId} threw:`, error)
          await opts.foods
            .updateOne({ _id: doc._id }, releaseUpdate('drain_error'))
            .catch(() => {})
          failed++
          reports.push({
            foodId,
            name: doc.name,
            outcome: 'error',
            written: false,
            reason: 'error',
            recheckConsumed,
            requeued: false,
          })
          continue
        }

        // Rule 4, second half: a request that landed mid-run buys exactly one
        // more pass. Only attempted when a verdict was actually reached — a run
        // that reached none has not answered anything, and the request is left
        // standing for the next claim to consume.
        let madeRequeue = false
        if (outcome.verdict !== 'skipped') {
          const pending = await opts.foods
            .findOneAndUpdate(
              { _id: doc._id, 'verification.recheckRequested': true },
              requeueUpdate(),
              { returnDocument: 'before', projection: PROJECTION },
            )
            .catch(() => null)
          if (pending) {
            madeRequeue = true
            requeued++
          }
        }

        reports.push({
          foodId,
          name: doc.name,
          outcome: outcome.verdict,
          written: outcome.written === true,
          reason: outcome.reason,
          problem: outcome.problem,
          confidence: outcome.confidence,
          recheckConsumed,
          requeued: madeRequeue,
        })
      }
    }

    await Promise.all(
      Array.from({ length: Math.min(concurrency, candidates.length) }, () => lane()),
    )
  }

  const count = (v: DrainFoodReport['outcome']) => reports.filter((r) => r.outcome === v).length

  return {
    ranAt: now.toISOString(),
    durationMs: clock() - startedAt,
    apply: opts.apply,
    waiting,
    limit,
    selected: candidates.length,
    claimed,
    lostClaim,
    confirmed: count('confirmed'),
    corrected: count('corrected'),
    insufficient: count('insufficient'),
    conflicted: count('conflicted'),
    skipped: count('skipped'),
    failed,
    written: reports.filter((r) => r.written).length,
    rechecksHonoured,
    requeued,
    deadlineHit,
    leftAlone: Math.max(0, waiting - claimed),
    wrote,
    runId,
    foods: reports,
  }
}

/**
 * Restates nothing: the selector above is checked against flagPolicy's own
 * `canClaim` so the two can never drift. Exported for the test that pins it.
 */
export function claimableByPolicy(
  state: 'unverified' | 'queued' | 'running' | 'verified' | 'insufficient',
  claimedAt: number | undefined,
  now: number,
): boolean {
  // In the queue at all, and flagPolicy agrees the claim is free.
  const inQueue = state === 'queued' || state === 'running'
  return inQueue && canClaim({ now, foodState: state, claimedAt })
}

export {
  canEnqueue,
  canEnqueueForVerification,
  shouldEnqueueForVerification,
  shouldEnqueue,
  DEFAULT_SEARCH_ENQUEUE_LIMIT,
  SEARCH_ENQUEUE_LIMIT,
  enqueueFilter,
  enqueueUpdate,
} from './flagPolicy'

