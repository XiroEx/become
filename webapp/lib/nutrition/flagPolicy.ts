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

/** Maximum unverified foods queued per single search response. */
export const DEFAULT_SEARCH_ENQUEUE_LIMIT = 5
export const SEARCH_ENQUEUE_LIMIT = DEFAULT_SEARCH_ENQUEUE_LIMIT

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

/**
 * Only a path this shape counts as a photo — exactly what our own upload route
 * hands back, owned by the caller.
 *
 * Two things break if the submitted string is trusted as-is. `hasPhoto`
 * overrides the re-verify cooldown, so any non-empty string would buy an
 * unlimited supply of runs on already-verified foods: the one bypass this whole
 * module exists to prevent. And the URL is later FETCHED to read the label, so
 * an attacker-chosen one turns the verification agent into a request forwarder
 * against whatever it can reach. Relative paths only — an absolute URL, however
 * plausible its host, is rejected outright.
 */
const FLAG_PHOTO_PATH = /^\/api\/blob\/food-flags\/([a-f\d]{24})\/[\w.-]+\.(?:jpg|png|webp)$/

export function ownFlagPhotoUrl(value: unknown, userId: string): string | undefined {
  if (typeof value !== 'string') return undefined
  const match = FLAG_PHOTO_PATH.exec(value)
  // The owner segment must be the caller: otherwise one account could cite
  // another's upload, and the photo would no longer be evidence THEY hold.
  return match && match[1] === userId ? value : undefined
}

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

export interface CanEnqueueCandidate {
  _id?: unknown
  foodState?: 'unverified' | 'queued' | 'running' | 'verified' | 'insufficient' | string
  state?: 'unverified' | 'queued' | 'running' | 'verified' | 'insufficient' | string
  isVerified?: boolean
  verification?: {
    state?: 'unverified' | 'queued' | 'running' | 'verified' | 'insufficient' | string
    expiresAt?: Date | number | string | null
    claimedAt?: Date | number | string | null
    [key: string]: unknown
  } | null
  expiresAt?: Date | number | string | null
  claimedAt?: Date | number | string | null
  now?: number
  [key: string]: unknown
}

/**
 * Enqueue predicate: decides whether a food returned by search should be enqueued.
 *
 * Rules:
 *  - Unverified food -> enqueue (true)
 *  - Already queued -> do not enqueue (false, idempotent / no-op)
 *  - Running -> do not enqueue (false)
 *  - Insufficient -> do not enqueue (false)
 *  - Verified with future/missing expiresAt -> do not enqueue (false, still valid)
 *  - Verified with expired expiresAt (<= now) -> enqueue (true, expired verification)
 *  - Active claim held -> do not enqueue (false)
 */
export function canEnqueue(
  candidate: CanEnqueueCandidate | null | undefined,
  nowArg?: number,
): boolean {
  if (!candidate) return false

  const now =
    nowArg ??
    ('now' in candidate && typeof candidate.now === 'number'
      ? candidate.now
      : Date.now())

  const v =
    'verification' in candidate && candidate.verification
      ? candidate.verification
      : null

  const rawState =
    candidate.foodState ??
    candidate.state ??
    v?.state ??
    (candidate.isVerified ? 'verified' : 'unverified')

  const state = rawState ?? 'unverified'

  // Never re-enqueue work already queued or actively in flight
  if (state === 'queued' || state === 'running') {
    return false
  }

  // Insufficient evidence does not get auto-queued by search alone
  if (state === 'insufficient') {
    return false
  }

  // If a live claim is held on this food, do not race it
  const rawClaimedAt = candidate.claimedAt ?? v?.claimedAt
  const claimedAtMs =
    rawClaimedAt instanceof Date
      ? rawClaimedAt.getTime()
      : typeof rawClaimedAt === 'number'
      ? rawClaimedAt
      : typeof rawClaimedAt === 'string'
      ? new Date(rawClaimedAt).getTime()
      : undefined

  if (claimedAtMs && isClaimLive({ now, claimedAt: claimedAtMs })) {
    return false
  }

  const rawExpiresAt = candidate.expiresAt ?? v?.expiresAt
  const expiresAtMs =
    rawExpiresAt instanceof Date
      ? rawExpiresAt.getTime()
      : typeof rawExpiresAt === 'number'
      ? rawExpiresAt
      : typeof rawExpiresAt === 'string'
      ? new Date(rawExpiresAt).getTime()
      : undefined

  // Verified: only re-queue when verification has expired
  if (state === 'verified') {
    if (expiresAtMs != null && !Number.isNaN(expiresAtMs)) {
      return expiresAtMs <= now
    }
    return false
  }

  if (state === 'unverified') {
    // If an unverified food has a future expiration date, respect it
    if (expiresAtMs != null && !Number.isNaN(expiresAtMs) && expiresAtMs > now) {
      return false
    }
    return true
  }

  return false
}

export const canEnqueueForVerification = canEnqueue
export const shouldEnqueueForVerification = canEnqueue
export const shouldEnqueue = canEnqueue

/**
 * Atomic query filter for enqueueing a food from search.
 *
 * Protects against races: matches only foods that are unverified, or whose
 * verification has expired, and whose claim (if any) is not live.
 */
export function enqueueFilter(id: unknown, now: Date = new Date()): Record<string, unknown> {
  const staleBefore = new Date(now.getTime() - CLAIM_TTL_MS)
  return {
    _id: id,
    $and: [
      {
        $or: [
          { 'verification.state': 'unverified' },
          { 'verification.state': { $exists: false } },
          { 'verification.state': null },
          {
            'verification.state': 'verified',
            'verification.expiresAt': { $lte: now },
          },
        ],
      },
      {
        $or: [
          { 'verification.claimedAt': { $exists: false } },
          { 'verification.claimedAt': null },
          { 'verification.claimedAt': { $lte: staleBefore } },
        ],
      },
    ],
  }
}

/**
 * Atomic update document for enqueueing a food from search.
 * Sets verification.state to 'queued' and clears any claimedAt / recheckRequested.
 */
export function enqueueUpdate(): Record<string, unknown> {
  return {
    $set: {
      'verification.state': 'queued',
    },
    $unset: {
      'verification.claimedAt': '',
      'verification.recheckRequested': '',
    },
  }
}

// ─── Relaunch budget ─────────────────────────────────────────────────────────

/**
 * How many verification rounds one report may ever trigger: the first run plus
 * two re-runs with better photos.
 *
 * Before this existed the loop was UNBOUNDED. `POST /flags/[id]/evidence`
 * incremented `rounds` with no ceiling anywhere in the codebase, cleared the
 * re-verify cooldown, skipped decideFlag() entirely and never took the atomic
 * claim — while `/flags/mine` advertised "Still wrong? Send better photos"
 * forever. Report → settled → resend → settled → resend spent up to three
 * dispatches a turn, including the grounded web search, with none of the limits
 * this module exists to enforce. Hitting the ceiling now escalates to a human,
 * which is the outcome the member actually wanted.
 */
export const MAX_VERIFICATION_ROUNDS = 3

export interface VerificationBudget {
  /** May this round read the reporter's panel photo? (one vision dispatch) */
  allowLabelRead: boolean
  /** May this round fire the GROUNDED SEARCH — the expensive dispatch? */
  allowSearch: boolean
  /** The reviewer always runs; it is what produces the verdict. */
  allowReview: true
  /** Hard ceiling on graph dispatches, so a fourth one added later cannot escape. */
  maxDispatches: number
}

/**
 * What round N of a report is allowed to spend.
 *
 * Round 1 gets everything. A RELAUNCH drops the search and keeps the photo
 * read, because the member's new photo is the only genuinely new information
 * in the system — the web has not changed in the minutes since the last search,
 * and gatherEvidence() (OpenFoodFacts, USDA, the photo; deterministic, zero AI
 * cost) still runs in full. So a relaunch keeps its value and sheds the
 * order-of-magnitude cost.
 */
export function verificationBudgetFor(round: number): VerificationBudget {
  const first = !Number.isFinite(round) || round <= 1
  return {
    allowLabelRead: true,
    allowSearch: first,
    allowReview: true,
    maxDispatches: first ? 3 : 2,
  }
}

/** Has this report used every automatic round it is going to get? */
export function roundsExhausted(rounds: number | undefined): boolean {
  return (rounds ?? 1) >= MAX_VERIFICATION_ROUNDS
}
