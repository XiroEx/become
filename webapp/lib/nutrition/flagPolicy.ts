/**
 * Admission policy for food flags: who may fire a verification run, and when a
 * flag should instead attach to work already in flight.
 *
 * Pure functions so the tricky parts — the rate limits and the concurrency
 * decision — are testable without a database or an agent.
 *
 * Why any of this exists: a flag can trigger a grounded web search, and grounded
 * search is the metered cost in this pipeline, roughly an order of magnitude
 * above the tokens. So the thing to bound is HOW MANY SEARCHES GET FIRED, not
 * how many tokens get spent. Every rule below is about that.
 */

/** Flags one account may raise per rolling day before it stops firing runs. */
export const DAILY_FLAG_LIMIT = 10

/** Lower ceiling for accounts too new to have earned catalogue influence. */
export const NEW_ACCOUNT_DAILY_FLAG_LIMIT = 3
export const NEW_ACCOUNT_AGE_MS = 7 * 24 * 60 * 60 * 1000

/**
 * A food verified this recently is not re-run on suspicion alone. Photo
 * evidence overrides it — someone holding the package beats our last check.
 */
export const REVERIFY_COOLDOWN_MS = 30 * 24 * 60 * 60 * 1000

/**
 * A claim older than this is treated as leaked and may be reclaimed.
 *
 * Runs DO die mid-flight leaving state behind: an ssh_shell keepalive timeout
 * killed a run that the registry still reported as completed, and other runs sat
 * "running" for over an hour. Without an expiry a single dead run would wedge a
 * food as unverifiable forever.
 */
export const CLAIM_TTL_MS = 15 * 60 * 1000

export type FlagDecision =
  /** Record the flag and dispatch a verification run. */
  | { action: 'dispatch' }
  /** Record the flag against the in-flight run; do not dispatch another. */
  | { action: 'attach'; runId?: string }
  /** Record the flag, but queue it for the batch sweep instead of running now. */
  | { action: 'queue'; reason: string }
  /** Do not record. The user is over their limit or has already flagged this. */
  | { action: 'reject'; reason: string }

export interface FlagContext {
  now: number
  /** Flags this user raised in the last 24h. */
  userFlagsToday: number
  /** When the account was created. */
  userCreatedAt: number
  /** Has this user already flagged THIS food? */
  alreadyFlaggedByUser: boolean
  /** Verification state of the food right now. */
  foodState: 'unverified' | 'queued' | 'running' | 'verified' | 'insufficient'
  /** When the current claim was taken, if any. */
  claimedAt?: number
  /** The in-flight run, if any. */
  runId?: string
  /** When this food was last verified. */
  verifiedAt?: number
  /** Did the user attach a photo of the panel? */
  hasPhoto: boolean
}

/** A claim is live only while it is fresh; past the TTL it is presumed leaked. */
export function isClaimLive(ctx: Pick<FlagContext, 'now' | 'claimedAt'>): boolean {
  if (!ctx.claimedAt) return false
  return ctx.now - ctx.claimedAt < CLAIM_TTL_MS
}

export function decideFlag(ctx: FlagContext): FlagDecision {
  // 1. One flag per user per food, ever. Re-flagging is the cheapest way to
  //    burn our budget, and it makes "how many DIFFERENT people flagged this"
  //    a real corroboration signal instead of a spam count.
  if (ctx.alreadyFlaggedByUser) {
    return { action: 'reject', reason: 'You have already reported this food.' }
  }

  // 2. Daily cap, stricter for accounts young enough to be throwaways.
  const isNew = ctx.now - ctx.userCreatedAt < NEW_ACCOUNT_AGE_MS
  const limit = isNew ? NEW_ACCOUNT_DAILY_FLAG_LIMIT : DAILY_FLAG_LIMIT
  if (ctx.userFlagsToday >= limit) {
    // Recorded, not run. A genuine reporter having a thorough day still gets
    // their reports acted on, just by the sweep rather than immediately.
    return { action: 'queue', reason: 'Daily report limit reached; queued for review.' }
  }

  // 3. Work already in flight for this food — attach rather than duplicate.
  //    A stale claim does NOT count as in flight, or one dead run would wedge
  //    the food permanently.
  const inFlight =
    (ctx.foodState === 'running' || ctx.foodState === 'queued') && isClaimLive(ctx)
  if (inFlight) {
    return { action: 'attach', runId: ctx.runId }
  }

  // 4. Recently verified. Suspicion alone does not buy a re-run, but a photo
  //    does: the person holding the package outranks our last check.
  if (
    ctx.foodState === 'verified' &&
    ctx.verifiedAt != null &&
    ctx.now - ctx.verifiedAt < REVERIFY_COOLDOWN_MS &&
    !ctx.hasPhoto
  ) {
    return { action: 'queue', reason: 'Recently verified; queued for a batch re-check.' }
  }

  return { action: 'dispatch' }
}

/**
 * Whether a claim may be taken. Mirrors the atomic guard used in the database
 * update so the intent is stated once, in a form that can be unit-tested.
 */
export function canClaim(ctx: Pick<FlagContext, 'now' | 'foodState' | 'claimedAt'>): boolean {
  if (ctx.foodState !== 'running' && ctx.foodState !== 'queued') return true
  // Held, but only if the holder is still alive.
  return !isClaimLive(ctx)
}
