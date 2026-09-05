import dbConnect from '@/lib/mongodb'
import ProgramModel from '@/models/Program'
import Exercise from '@/models/Exercise'
import Meal from '@/models/Meal'
import Food from '@/models/Food'
import UserProgress from '@/models/UserProgress'
import MindProgress from '@/models/MindProgress'
import { localDateKey, localDayWindowForKey, utcMidnightDateKey } from '@/lib/dayWindow'
import { FREE_LIMITS, type Feature, type FreeLimit } from '@/lib/entitlements'
import {
  mongoAllowanceLedger,
  type AllowanceLedger,
  type LedgerCounts,
  type WindowAnchor,
} from '@/lib/allowanceLedger'
import {
  mongoInventoryClaims,
  type InventoryClaimStore,
  type OpenClaim,
} from '@/lib/inventoryClaims'
import { afterResponse } from '@/lib/afterResponse'

/**
 * ─── Free-tier allowance accounting ──────────────────────────────────────────
 *
 * Three kinds, because "3 of these" means three different things:
 *
 *   'inventory' — a LIVE count of rows the member owns (3 custom exercises).
 *                 Nothing durable is written; DELETING ONE FREES A SLOT. That
 *                 is the escape hatch that keeps a capped member from being
 *                 locked out of their own data. A count is a READ, so a create
 *                 also takes a short-lived claim (lib/inventoryClaims.ts) that
 *                 orders concurrent creates — see consumeInventory().
 *   'milestone' — a monotonic progress number already stored elsewhere
 *                 (MindProgress.completedMainSessions). Read-only, idempotent.
 *   'window'    — a counter inside a local day / ISO week bucket
 *                 (1 AI food estimate/day, 3 generations/week). This is the
 *                 only kind that needs its own persisted ledger.
 *
 * Day and week buckets are LOCAL-KEY STRINGS, never Dates — see the day-marker
 * trap documented in lib/dayWindow.ts#entryDayKeys.
 */

export interface AllowanceState {
  feature: Feature
  limit: number
  used: number
  /** max(0, limit - used). */
  remaining: number
  /** ISO string for 'day'/'week' windows; null for inventory/milestone. */
  resetsAt: string | null
  window: FreeLimit['window']
  kind: FreeLimit['kind']
}

export interface AllowanceCtx {
  userId: string
  /**
   * Minutes WEST of UTC (browser `getTimezoneOffset()` semantics).
   *
   * IGNORED for 'window' features — those resolve the offset from the member's
   * persisted UserProgress.timezoneOffset instead. A client-supplied offset is
   * a window-minting oracle: send a different `tz` on every request and each
   * call lands in a fresh bucket with a fresh allowance. It also has to match
   * what GET /api/me/entitlements reports, and that endpoint takes `tz` from
   * the query string, so two sources would let a member read 1/1 remaining
   * while the gate reads 0/1.
   */
  tzOffset?: number
  /** @internal Test seam. Production always uses the Mongo ledger. */
  ledger?: AllowanceLedger
  /** @internal Test seam. Production always uses the Mongo claim store. */
  claims?: InventoryClaimStore
  /**
   * @internal Test seam. Production always counts the member's real rows
   * through INVENTORY_COUNTS / MILESTONE_COUNTS.
   */
  countRows?: (feature: Feature, userId: string) => Promise<number>
}

export interface ConsumeOptions {
  /** false (shadow mode) never denies, but still records usage. */
  enforce?: boolean
  /**
   * Collapses repeat consumes into one unit — e.g. the AI route and its
   * deterministic fallback are one generation, not two. SERVER-MINTED ONLY:
   * a client-supplied key would buy unlimited free units.
   */
  dedupeKey?: string
  /**
   * Accepted for the callers that already pass it, and deliberately unused: a
   * dedupe key lives on the window's own row, so it expires exactly when the
   * window does. A second, shorter expiry would create a gap in which the same
   * outcome could be charged twice inside one window — which is the only thing
   * dedupeKey exists to prevent.
   */
  dedupeWindowMs?: number
  /** @internal Tests only — pins the instant the window is derived from. */
  now?: Date
}

export interface ConsumeResult {
  allowed: boolean
  state: AllowanceState
  /** Present only for 'window' consumes that actually recorded a unit; pass to
   *  refundAllowance() when the work it paid for never started. */
  ticketId?: string
  /** True when the ledger itself failed and the consume failed OPEN. */
  degraded?: boolean
  /** Why a consume was refused. 'limit' for a tier cap, 'follow-up' for the
   *  bounded correction allowance riding an already-charged outcome. */
  reason?: 'limit' | 'follow-up'
  /**
   * @internal The in-flight claim an 'inventory' consume took, released
   * AUTOMATICALLY after the response (lib/afterResponse.ts).
   *
   * Exposed for tests, which have no response to run after. A ROUTE MUST NOT
   * CALL IT: releasing before the row is committed reopens the read-then-write
   * race the claim exists to close.
   */
  releaseClaim?: () => Promise<void>
}

// ─── Window buckets ──────────────────────────────────────────────────────────

/**
 * The local-day / local-ISO-week bucket a consume lands in, plus when that
 * bucket rolls over. Week is anchored to the member's LOCAL Monday 00:00 so
 * `resetsAt` is a stable, explainable "Monday" rather than a rolling 7 days.
 *
 * Exported because stage 4's counter store and GET /api/me/entitlements must
 * agree on the bucket exactly — two definitions of "this week" would let a
 * member see 3/3 while the gate thinks 0/3.
 */
export function windowBucket(
  window: FreeLimit['window'],
  tzOffset = 0,
  now: Date = new Date()
): { key: string | null; resetsAt: string | null } {
  if (window === 'lifetime') return { key: null, resetsAt: null }

  const todayKey = localDateKey(null, tzOffset, now)

  if (window === 'day') {
    const next = new Date(utcMidnightDateKey(todayKey).getTime() + 86_400_000)
    const nextKey = next.toISOString().slice(0, 10)
    return {
      key: todayKey,
      resetsAt: localDayWindowForKey(nextKey, tzOffset).start.toISOString(),
    }
  }

  // week — back up to the local Monday, forward to the next one.
  const todayMs = utcMidnightDateKey(todayKey).getTime()
  const dow = new Date(todayMs).getUTCDay() // 0 = Sunday
  const sinceMonday = (dow + 6) % 7
  const mondayKey = new Date(todayMs - sinceMonday * 86_400_000).toISOString().slice(0, 10)
  const nextMondayKey = new Date(todayMs + (7 - sinceMonday) * 86_400_000)
    .toISOString()
    .slice(0, 10)
  return {
    key: `W${mondayKey}`,
    resetsAt: localDayWindowForKey(nextMondayKey, tzOffset).start.toISOString(),
  }
}

// ─── Whose day is it? ────────────────────────────────────────────────────────

const TZ_CLAMP = 840 // ±14h, matching lib/dayWindow.ts
const tzCache = new Map<string, { tz: number; at: number }>()
const TZ_TTL_MS = 60_000

/**
 * The offset a windowed bucket is keyed on, read from the member's own record.
 *
 * Deliberately NOT taken from the request. `UserProgress.timezoneOffset` is
 * populated opportunistically by lib/captureUserTimezone.ts from genuinely
 * reported offsets on other routes, so by the time someone reaches an AI
 * feature it is almost always set. Missing reads as 0 (UTC), which is what
 * every other reader in the app defaults to.
 *
 * Memoised for 60s because it is stable and stale-safe — the cost of being one
 * minute behind a member who just crossed a timezone is that their boundary
 * moves once. Tier and role are deliberately NOT cached anywhere: a billing
 * upgrade has to take effect on the very next request.
 */
export async function windowTzOffset(userId: string): Promise<number> {
  const hit = tzCache.get(userId)
  if (hit && Date.now() - hit.at < TZ_TTL_MS) return hit.tz
  let tz = 0
  try {
    await dbConnect()
    const doc = await UserProgress.findOne({ userId })
      .select('timezoneOffset')
      .lean<{ timezoneOffset?: number } | null>()
    const raw = doc?.timezoneOffset
    if (typeof raw === 'number' && Number.isFinite(raw)) {
      tz = Math.max(-TZ_CLAMP, Math.min(TZ_CLAMP, raw))
    }
  } catch {
    // An infra blip must not stop a member using a feature they are entitled
    // to. UTC is the same default every other reader falls back to.
    tz = 0
  }
  if (tzCache.size > 5000) tzCache.clear()
  tzCache.set(userId, { tz, at: Date.now() })
  return tz
}

/** @internal Tests only — the memo would otherwise leak between cases. */
export function __clearTzCache(): void {
  tzCache.clear()
}

/** @internal Tests only — seeds the memo so no database read is attempted. */
export function __primeTzCache(userId: string, tz: number): void {
  tzCache.set(userId, { tz, at: Date.now() })
}

/**
 * How many bounded FOLLOW-UPS a windowed outcome may carry.
 *
 * A follow-up is a second dispatch that refines the SAME outcome — correcting
 * "6 tacos" on an estimate the member already spent their allowance on. It
 * increments a separate counter, never `used`.
 *
 * Without this a free member gets one estimate a day and no way to fix it,
 * which is a broken product rather than a paywall: the correction is how the
 * feature works. Bounded because "refine it again" is still a vision call.
 */
export const FOLLOW_UP_LIMITS: Partial<Record<Feature, number>> = {
  'ai-food-estimate': 6,
}

// ─── Inventory counts ────────────────────────────────────────────────────────

/**
 * One count function per inventory feature.
 *
 * Filters are passed as PLAIN STRINGS and left to Mongoose to cast, on purpose.
 * `Exercise.createdBy` is a String path while every other model's is an
 * ObjectId (models/Exercise.ts) — a copy-pasted `new ObjectId(userId)` there
 * matches nothing, silently reporting 0 and handing out an unlimited
 * allowance. Letting the schema do the casting removes the trap entirely.
 */
const INVENTORY_COUNTS: Partial<Record<Feature, (userId: string) => Promise<number>>> = {
  'custom-programs': (userId) =>
    ProgramModel.countDocuments({ isCustom: true, createdBy: userId }),

  'custom-exercises': (userId) =>
    Exercise.countDocuments({ isCustom: true, createdBy: userId }),

  'custom-meals': (userId) => Meal.countDocuments({ createdBy: userId }),

  // `authoredBy`, NOT `{ source: 'manual', createdBy }`. importManualFood
  // hardcodes source:'manual' and attributes createdBy to the caller, and two
  // deliberately UNGATED routes go through it — POST /api/nutrition/foods/import
  // (which accepts source:'manual' outright, and is FoodSearchModal's routine
  // fallback when a USDA/OFF hit can't be re-fetched) and the barcode
  // scanner's live-OpenFoodFacts materialisation. Counting those rows made the
  // cap fail open (create a 4th food via /foods/import) and closed at the same
  // time (ordinary logging ate all 3 slots with rows the member never
  // knowingly created, so they could not delete one to free a slot). Only the
  // three gated create surfaces stamp authoredBy. See models/Food.ts.
  'custom-foods': (userId) => Food.countDocuments({ authoredBy: userId }),

  // A "custom session" is a STARRED quick session: the SessionBuilder's output
  // only becomes a durable, reusable artifact when the member stars it. The
  // workout log itself is history and is never capped.
  //
  // Projected + counted in JS rather than aggregated: $match in an aggregate
  // does no schema casting, so the userId string would have to be hand-cast to
  // an ObjectId. The projection is a few bytes per log and cast-safe.
  'custom-sessions': async (userId) => {
    const doc = await UserProgress.findOne({ userId })
      .select('workoutLogs.kind workoutLogs.favorite')
      .lean<{ workoutLogs?: { kind?: string; favorite?: boolean }[] } | null>()
    return (doc?.workoutLogs ?? []).filter((l) => l.kind === 'quick' && l.favorite === true).length
  },
}

const MILESTONE_COUNTS: Partial<Record<Feature, (userId: string) => Promise<number>>> = {
  // `completedMainSessions`, NEVER `mainSessionCount`.
  //
  // mainSessionCount is CHAPTER PROGRESS measured in sessions, and it carries a
  // head start nobody sat through: the Mind intake maps 'building' to chapter 2
  // and 'leveling_up' to chapter 3, POST /api/mind/progress/levelup advances a
  // chapter on a self-declaration, an admin can set one outright — and
  // /api/mind/progress then PERSISTS max(count, (chapter - 1) * 10) so the
  // chapter survives the round trip. Reading it here meant a brand-new free
  // member was 10/10 (or 20/10) before their first session and was refused it
  // with "You've finished your first 10 Mind sessions", and a self-declared
  // level-up burned 9 more phantom sessions on top. Both reproduced on
  // production against fresh accounts.
  //
  // completedMainSessions is only ever incremented by a counted completion in
  // POST /api/mind/session, so it counts sessions that actually happened —
  // whatever the member answered at intake. See models/MindProgress.ts.
  //
  // Absent on documents written before it existed, where it reads as 0: nobody
  // is ever locked out by the migration, and a long-standing member simply gets
  // their 10 free sessions counted from here. scripts/backfill-mind-session-count.mjs
  // restores the real number for those rows and is a pre-deploy step.
  'mind-sessions': async (userId) => {
    const prog = await MindProgress.findOne({ userId })
      .select('completedMainSessions')
      .lean<{ completedMainSessions?: number } | null>()
    return prog?.completedMainSessions ?? 0
  },
}

function stateFor(
  feature: Feature,
  used: number,
  resetsAt: string | null
): AllowanceState {
  const spec = FREE_LIMITS[feature]
  // A 'milestone' allowance reads a monotonic number someone else owns, so it
  // runs far past the limit in normal use — a member with 20 completed Mind
  // sessions reported `used: 20, limit: 10`, and a meter rendering used/limit
  // draws that at 200%. Clamp what is REPORTED; the DECISION is unchanged,
  // because every reader compares `used < limit` and min(used, limit) < limit
  // is false exactly when used >= limit.
  //
  // Deliberately NOT applied to 'window': there `used` counts attempts once
  // enforcement is on, and the overshoot is a free abuse signal.
  const reported = spec.kind === 'milestone' ? Math.min(used, spec.limit) : used
  return {
    feature,
    limit: spec.limit,
    used: reported,
    remaining: Math.max(0, spec.limit - reported),
    resetsAt,
    window: spec.window,
    kind: spec.kind,
  }
}

async function usedFor(feature: Feature, ctx: AllowanceCtx, now?: Date): Promise<number> {
  const spec = FREE_LIMITS[feature]

  if (spec.kind === 'window') {
    // Read-only: never upserts, so opening the dashboard cannot open a window
    // or burn a unit. `used` is already net of refunds (a refund decrements it
    // and increments `refunds` separately), so it is reported as-is.
    const { key } = await windowFor(feature, ctx, now)
    if (!key) return 0
    try {
      const row = await ledgerFor(ctx).read({ userId: ctx.userId, feature, bucketKey: key })
      return row?.used ?? 0
    } catch (err) {
      console.error(`[allowances] ledger read failed for ${feature}:`, err)
      return 0
    }
  }

  const counter = ctx.countRows
    ? (userId: string) => ctx.countRows!(feature, userId)
    : spec.kind === 'inventory'
      ? INVENTORY_COUNTS[feature]
      : MILESTONE_COUNTS[feature]

  // Features with limit 0 (vision) are binary, not counted —
  // featureAccess() already resolves them to 'none', so there is nothing to
  // count and no counter registered.
  if (!counter) return 0

  if (!ctx.countRows) await dbConnect()
  try {
    return await counter(ctx.userId)
  } catch (err) {
    // An infra blip must not block a member from creating something. The gate
    // is a product boundary, not a security one — fail open and say so.
    console.error(`[allowances] count failed for ${feature}:`, err)
    return 0
  }
}

function ledgerFor(ctx: AllowanceCtx): AllowanceLedger {
  return ctx.ledger ?? mongoAllowanceLedger
}

function claimsFor(ctx: AllowanceCtx): InventoryClaimStore {
  return ctx.claims ?? mongoInventoryClaims
}

export interface Bucket {
  key: string | null
  resetsAt: string | null
}

/**
 * ─── The clock-change rule ───────────────────────────────────────────────────
 *
 * ONE WINDOW PER ELAPSED WINDOW, however the member's clock moves.
 *
 * windowTzOffset() deliberately ignores a request's `tz`, but the offset it
 * reads is itself client-written (POST /api/workouts → lib/captureUserTimezone),
 * and the offset picks the local DATE the bucket is keyed on. Legitimate
 * offsets span 26 hours, so a member sitting on a spent allowance could report
 * a zone far enough east to land on tomorrow's date and mint a second window —
 * proven live, repeatable, and immune to validating the offset (every value
 * used was a real one).
 *
 * So the offset no longer decides alone. The member's own ledger says which
 * window they are in and when it ends, and:
 *
 *   • while that window is still open in REAL time, a clock change cannot
 *     leave it early — this is the whole exploit, closed;
 *   • once it has elapsed, a clock change cannot walk BACK into it — moving
 *     west must not re-charge a bucket that is already spent, or hand a
 *     follow-up ticket a bucketKey that no longer matches.
 *
 * Neither direction costs an honest traveller anything: they keep exactly one
 * window per window, their in-flight correction ticket stays valid across the
 * change (so one outcome is never charged twice), and their boundary follows
 * their new zone from the next window on.
 *
 * `resetsAt` is reported as the instant a NEW window can actually open, which
 * is the honest answer in both branches and is what the client counts down to.
 */
export function anchorBucket(base: Bucket, anchor: WindowAnchor | null, now: Date): Bucket {
  if (!anchor || !base.key || !base.resetsAt) return base

  const anchorResetsAt = anchor.resetsAt.toISOString()

  // (1) The window they are in has not ended yet — they stay in it, whatever
  //     their clock now says.
  if (now.getTime() < anchor.resetsAt.getTime()) {
    return { key: anchor.bucketKey, resetsAt: anchorResetsAt }
  }

  // (2) It has ended, but the offset points at that same window or an older
  //     one (they moved west). Hold them there until the clock genuinely rolls
  //     them forward — `base.resetsAt` is that instant, and it is later than
  //     the anchor's by construction.
  //     Day keys ('2026-09-03') and week keys ('W2026-08-31') both sort
  //     lexicographically within their own window kind, which is the only
  //     comparison ever made here.
  if (base.key <= anchor.bucketKey) {
    return { key: anchor.bucketKey, resetsAt: base.resetsAt }
  }

  return base
}

/**
 * The bucket a windowed feature lands in for this member, right now.
 *
 * Resolves the offset from the member's record for 'window' features (see
 * AllowanceCtx.tzOffset) and from the caller's hint otherwise — inventory and
 * milestone allowances have a 'lifetime' window, where the offset is unused.
 *
 * For windowed features the offset-derived bucket is then ANCHORED to the
 * window the member is already in (see anchorBucket). peekAllowance() goes
 * through here too, so GET /api/me/entitlements and the gate can never disagree
 * about which window it is.
 */
async function windowFor(
  feature: Feature,
  ctx: AllowanceCtx,
  now: Date = new Date()
): Promise<Bucket> {
  const spec = FREE_LIMITS[feature]
  if (spec.kind !== 'window') return windowBucket(spec.window, ctx.tzOffset ?? 0, now)

  const base = windowBucket(spec.window, await windowTzOffset(ctx.userId), now)
  return anchorBucket(base, await latestWindow(feature, ctx), now)
}

/** The member's newest window for this feature, or null when the ledger cannot
 *  say. Fails OPEN like every other read in this module: no anchor means the
 *  offset decides, exactly as it did before the anchor existed. */
async function latestWindow(feature: Feature, ctx: AllowanceCtx): Promise<WindowAnchor | null> {
  const ledger = ledgerFor(ctx)
  if (!ledger.latest) return null
  try {
    return await ledger.latest({ userId: ctx.userId, feature })
  } catch (err) {
    console.error(`[allowances] window anchor read failed for ${feature}:`, err)
    return null
  }
}

/**
 * The bucket a WINDOWED feature is currently charged in for this member —
 * anchored exactly as a consume would be.
 *
 * Exported for the follow-up ticket (lib/ai/allowance.ts), which names the
 * window its parent unit was charged in: minting that from the raw offset
 * instead would hand out a key the ledger never used the moment the anchor and
 * the clock disagree. Null for inventory/milestone features, which have no
 * window.
 *
 * `now` defaults to the real clock. It is an argument so a caller that pins
 * the instant of a consume can pin the read of the same window too — otherwise
 * the two halves of "which window is this" disagree by however far the wall
 * clock has moved, which is not something a test can wait out.
 */
export async function currentWindowKey(
  feature: Feature,
  ctx: AllowanceCtx,
  now?: Date
): Promise<string | null> {
  if (FREE_LIMITS[feature].kind !== 'window') return null
  return (await windowFor(feature, ctx, now)).key
}

/** Read-only. Never mutates. Used by GET /api/me/entitlements and soft peeks.
 *  `now` defaults to the real clock — see currentWindowKey for why it exists. */
export async function peekAllowance(
  feature: Feature,
  ctx: AllowanceCtx,
  now?: Date
): Promise<AllowanceState> {
  const { resetsAt } = await windowFor(feature, ctx, now)
  return stateFor(feature, await usedFor(feature, ctx, now), resetsAt)
}

/**
 * Reserve one unit.
 *   'inventory' → takes an in-flight claim, THEN counts the member's rows, and
 *                 decides from both. Nothing durable is written.
 *   'milestone' → reads the existing progress number; nothing is written.
 *   'window'    → atomically increments the (userId, feature, bucketKey) row in
 *                 models/AllowanceUsage.ts and decides from what came back.
 *
 * `enforce: false` NEVER denies but still records usage (shadow mode), which is
 * what makes launch day safe: the numbers accrue with zero visible change.
 *
 * The count runs in shadow mode too, even though inventory/milestone counts are
 * derived and there is nothing to record. That is deliberate: flipping the
 * switch then changes only the ANSWER, never the query pattern, so the counts
 * are not being exercised in production for the first time on the day they
 * start refusing people.
 */
export async function consumeAllowance(
  feature: Feature,
  ctx: AllowanceCtx,
  opts: ConsumeOptions = {}
): Promise<ConsumeResult> {
  const kind = FREE_LIMITS[feature].kind
  if (kind === 'inventory') return consumeInventory(feature, ctx, opts)

  if (kind !== 'window') {
    // 'milestone' — a number someone else already wrote (MindProgress). There
    // is no create for two requests to race, so a read is the whole decision.
    const state = await peekAllowance(feature, ctx, opts.now)
    const withinLimit = state.used < state.limit
    return {
      allowed: opts.enforce ? withinLimit : true,
      state,
      ...(withinLimit ? {} : { reason: 'limit' as const }),
    }
  }
  return consumeWindow(feature, ctx, opts, 'used')
}

/**
 * The inventory consume: CLAIM FIRST, COUNT SECOND, DECIDE FROM BOTH.
 *
 * This used to be `peekAllowance()` — countDocuments, compare, return — and the
 * route created the row afterwards with nothing in between. Ten concurrent
 * POSTs from a free member at 0/3 therefore returned 201 ten times, on
 * production, from zero, on every counted cap; a delete-then-burst loop made it
 * unbounded. The count is not the bug (it is what makes deleting free a slot);
 * taking the DECISION from an unserialised read is.
 *
 * `rank` is this claim's position among the claims in flight, so
 * `live + rank - 1` is "rows that exist, or are being created ahead of me". Two
 * racers get ranks 1 and 2 and exactly one of them fits under the limit.
 * lib/inventoryClaims.ts carries the proof that the two reads jointly miss
 * nothing; the ordering here is the load-bearing half of it.
 *
 * FAILS OPEN, like every other counter in this module: if the claim store is
 * unreachable the consume behaves exactly as it did before this existed. The
 * gate is a product boundary, not a security one, and a metering outage must
 * not take a feature away from someone entitled to it.
 */
async function consumeInventory(
  feature: Feature,
  ctx: AllowanceCtx,
  opts: ConsumeOptions
): Promise<ConsumeResult> {
  const spec = FREE_LIMITS[feature]
  const enforce = opts.enforce === true

  // Binary features (limit 0: vision) count nothing and have no
  // create to serialise — featureAccess() has already resolved them to 'none'.
  if (!INVENTORY_COUNTS[feature] && !ctx.countRows) {
    return {
      allowed: enforce ? 0 < spec.limit : true,
      state: stateFor(feature, 0, null),
      ...(0 < spec.limit ? {} : { reason: 'limit' as const }),
    }
  }

  let claim: OpenClaim | null = null
  try {
    claim = await claimsFor(ctx).open(ctx.userId, feature, opts.now ?? new Date())
  } catch (err) {
    console.error(`[allowances] inventory claim failed for ${feature}:`, err)
  }

  // AFTER the claim, never before: a count taken first could miss a competing
  // create that had not committed yet AND rank behind nothing, which is exactly
  // the hole this closes.
  // No `now`: inventory allowances have a 'lifetime' window, so there is no
  // bucket for a clock to move. Also pinned by shape in
  // tests/unit/allowance/inventoryClaims.ts — claim first, count second.
  const live = await usedFor(feature, ctx)
  const used = live + (claim?.rank ?? 1) - 1
  const state = stateFor(feature, used, null)
  const withinLimit = used < spec.limit

  // Released once the response is out, so it outlives the create it guards and
  // no route has to remember anything. Where there is no request scope (a test,
  // a script) the claim goes stale on its own — see lib/inventoryClaims.ts.
  const release = claim ? () => claim!.release() : undefined
  if (release) afterResponse(release)

  return {
    allowed: enforce ? withinLimit : true,
    state,
    ...(withinLimit ? {} : { reason: 'limit' as const }),
    ...(release ? { releaseClaim: release } : { degraded: true }),
  }
}

/**
 * Spend one bounded FOLLOW-UP against an outcome already charged in this
 * window — the correction on an estimate, not a new estimate.
 *
 * Increments a separate counter, so `used` and therefore `remaining` are
 * untouched: the member's one scan for the day stays spent exactly once, no
 * matter how many times they refine it. The caller is responsible for proving
 * the follow-up really does belong to a charged outcome — that proof is the
 * signed ticket in lib/allowanceTicket.ts, never a client-supplied id.
 */
export async function consumeFollowUp(
  feature: Feature,
  ctx: AllowanceCtx,
  opts: ConsumeOptions = {}
): Promise<ConsumeResult> {
  if (FREE_LIMITS[feature].kind !== 'window') {
    return { allowed: true, state: await peekAllowance(feature, ctx, opts.now) }
  }
  return consumeWindow(feature, ctx, opts, 'followUps')
}

/**
 * The atomic consume.
 *
 * ORDER IS THE WHOLE POINT: increment first, decide from what came back. A
 * peek-then-compare would let two requests arriving together against a limit of
 * 1 both read 0 and both spend — a double-tapped button is enough. Charging
 * first means the two racing calls see 1 and 2, and exactly one of them is
 * within the limit.
 *
 * A denied consume deliberately does NOT give its unit back. `used` therefore
 * counts ATTEMPTS once enforcement is on: `remaining` still clamps to 0, the
 * denial still stands, and an inflated count is a free abuse signal. Reversing
 * it would cost a second write and buy nothing.
 */
async function consumeWindow(
  feature: Feature,
  ctx: AllowanceCtx,
  opts: ConsumeOptions,
  field: 'used' | 'followUps'
): Promise<ConsumeResult> {
  const spec = FREE_LIMITS[feature]
  const { key, resetsAt } = await windowFor(feature, ctx, opts.now ?? new Date())
  const enforce = opts.enforce === true

  if (!key || !resetsAt) return { allowed: true, state: stateFor(feature, 0, resetsAt) }

  let counted: LedgerCounts
  let ticketId: string | undefined
  try {
    const res = await ledgerFor(ctx).charge({
      userId: ctx.userId,
      feature,
      bucketKey: key,
      resetsAt: new Date(resetsAt),
      shadow: !enforce,
      field,
      dedupeKey: opts.dedupeKey,
    })
    counted = res
    ticketId = res.ticketId
  } catch (err) {
    // FAIL OPEN. A metering outage must never take a feature away from someone
    // who is entitled to it — the gate is a product boundary, not a security
    // one. Same posture as every other counter in this module.
    console.error(`[allowances] ledger charge failed for ${feature}:`, err)
    return {
      allowed: true,
      degraded: true,
      state: stateFor(feature, 0, resetsAt),
    }
  }

  // The parent state is always reported from `used`: a follow-up must not make
  // the member's remaining scans look different from what they are.
  const state = stateFor(feature, counted.used, resetsAt)

  if (field === 'followUps') {
    const cap = FOLLOW_UP_LIMITS[feature] ?? 0
    const withinCap = counted.followUps <= cap
    return {
      allowed: enforce ? withinCap : true,
      state,
      ...(withinCap ? {} : { reason: 'follow-up' as const }),
      ...(ticketId ? { ticketId } : {}),
    }
  }

  const withinLimit = counted.used <= spec.limit
  return {
    allowed: enforce ? withinLimit : true,
    state,
    ...(withinLimit ? {} : { reason: 'limit' as const }),
    ...(ticketId ? { ticketId } : {}),
  }
}

/**
 * Give back a unit consumed for work that never started — the graph refused the
 * trigger, so nothing was queued and nothing was billed. Idempotent by
 * ticketId, and guarded so it can never drive a counter below zero.
 *
 * REFUND ONLY WHAT THE SERVER KNOWS DID NOT HAPPEN. A run that was queued and
 * then failed, timed out, or came back unusable is not refundable: the graph
 * ran and the money is gone, and those outcomes are only observable on the
 * client, where a "that didn't work" report is a forgeable free-refill button.
 * The remedy for a bad-but-billed result is the bounded follow-up, not a
 * refund.
 *
 * No-op for inventory/milestone, which write nothing.
 */
export async function refundAllowance(
  ticketId: string,
  ledger: AllowanceLedger = mongoAllowanceLedger
): Promise<void> {
  if (!ticketId) return
  await ledger.giveBack(ticketId)
}
