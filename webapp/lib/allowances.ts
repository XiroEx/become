import dbConnect from '@/lib/mongodb'
import ProgramModel from '@/models/Program'
import Exercise from '@/models/Exercise'
import Meal from '@/models/Meal'
import Food from '@/models/Food'
import UserProgress from '@/models/UserProgress'
import MindProgress from '@/models/MindProgress'
import { localDateKey, localDayWindowForKey, utcMidnightDateKey } from '@/lib/dayWindow'
import { FREE_LIMITS, type Feature, type FreeLimit } from '@/lib/entitlements'

/**
 * ─── Free-tier allowance accounting ──────────────────────────────────────────
 *
 * Three kinds, because "3 of these" means three different things:
 *
 *   'inventory' — a LIVE count of rows the member owns (3 custom exercises).
 *                 Nothing is written; DELETING ONE FREES A SLOT. That is the
 *                 escape hatch that keeps a capped member from being locked
 *                 out of their own data.
 *   'milestone' — a monotonic progress number already stored elsewhere
 *                 (MindProgress.mainSessionCount). Read-only, idempotent.
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
  /** Minutes WEST of UTC (browser `getTimezoneOffset()` semantics). Day and
   *  week keys are the CALLER'S LOCAL ones. */
  tzOffset?: number
}

export interface ConsumeOptions {
  /** false (shadow mode) never denies, but still records usage. */
  enforce?: boolean
  /** Collapses repeat consumes into one unit — e.g. the AI route and its
   *  deterministic fallback are one generation, not two. Stage 4. */
  dedupeKey?: string
  dedupeWindowMs?: number
}

export interface ConsumeResult {
  allowed: boolean
  state: AllowanceState
  /** Present only for 'window' consumes that actually recorded a unit; pass to
   *  refundAllowance() when the work it paid for never started. */
  ticketId?: string
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

  'custom-foods': (userId) => Food.countDocuments({ source: 'manual', createdBy: userId }),

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
  'mind-sessions': async (userId) => {
    const prog = await MindProgress.findOne({ userId })
      .select('mainSessionCount')
      .lean<{ mainSessionCount?: number } | null>()
    return prog?.mainSessionCount ?? 0
  },
}

function stateFor(
  feature: Feature,
  used: number,
  resetsAt: string | null
): AllowanceState {
  const spec = FREE_LIMITS[feature]
  return {
    feature,
    limit: spec.limit,
    used,
    remaining: Math.max(0, spec.limit - used),
    resetsAt,
    window: spec.window,
    kind: spec.kind,
  }
}

async function usedFor(feature: Feature, ctx: AllowanceCtx): Promise<number> {
  const spec = FREE_LIMITS[feature]

  if (spec.kind === 'window') {
    // ── STAGE 4 SEAM ────────────────────────────────────────────────────────
    // The windowed counters (1 AI food estimate/day, 3 workout
    // generations/week) need their own persisted ledger keyed on
    // (userId, feature, windowBucket().key) plus the dedupe + refund machinery
    // that ConsumeOptions/refundAllowance() describe. Until that lands this
    // reports 0 used, so a windowed feature reads as fully available and
    // NOTHING is gated on it — the same safe failure as the kill-switch being
    // off. No route calls requireQuota() on a windowed feature yet.
    return 0
  }

  const counter =
    spec.kind === 'inventory' ? INVENTORY_COUNTS[feature] : MILESTONE_COUNTS[feature]

  // Features with limit 0 (vision, share-programs) are binary, not counted —
  // featureAccess() already resolves them to 'none', so there is nothing to
  // count and no counter registered.
  if (!counter) return 0

  await dbConnect()
  try {
    return await counter(ctx.userId)
  } catch (err) {
    // An infra blip must not block a member from creating something. The gate
    // is a product boundary, not a security one — fail open and say so.
    console.error(`[allowances] count failed for ${feature}:`, err)
    return 0
  }
}

/** Read-only. Never mutates. Used by GET /api/me/entitlements and soft peeks. */
export async function peekAllowance(
  feature: Feature,
  ctx: AllowanceCtx
): Promise<AllowanceState> {
  const spec = FREE_LIMITS[feature]
  const { resetsAt } = windowBucket(spec.window, ctx.tzOffset)
  return stateFor(feature, await usedFor(feature, ctx), resetsAt)
}

/**
 * Reserve one unit.
 *   'inventory' → a live count; nothing is written.
 *   'milestone' → reads the existing progress number; nothing is written.
 *   'window'    → increments the (userId, feature, bucketKey) counter (stage 4).
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
  const state = await peekAllowance(feature, ctx)
  const withinLimit = state.used < state.limit
  return {
    allowed: opts.enforce ? withinLimit : true,
    state,
  }
}

/**
 * Give back a unit consumed for work that never started (e.g. the AI run failed
 * to dispatch). No-op for inventory/milestone, which write nothing. Idempotent
 * by ticketId.
 *
 * STAGE 4 SEAM — becomes real alongside the windowed ledger. Present now so the
 * call sites that need it can be written against a stable name.
 */
export async function refundAllowance(ticketId: string): Promise<void> {
  void ticketId
}
