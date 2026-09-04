import UserProgress from '@/models/UserProgress'

/**
 * ─── Recording the member's timezone, safely ─────────────────────────────────
 *
 * This value is not cosmetic. It keys two things:
 *
 *   • the LOCAL hour the notification cron treats as "morning", and
 *   • the local day/week BUCKET every windowed allowance is charged in
 *     (lib/allowances.ts#windowTzOffset reads exactly this field).
 *
 * The second one makes it a paywall input written by the client. A direct `tz`
 * on an AI call is already ignored for that reason, but POST /api/workouts
 * accepts one and persists it here — so "move your clock, get a fresh daily
 * allowance" ran straight through this module. Two halves of the answer:
 *
 *   1. HERE — only a value that could be a real timezone is ever stored, and a
 *      reported IANA zone (which the server can verify) outranks the number
 *      beside it.
 *   2. lib/allowances.ts — the allowance bucket is ANCHORED to the window the
 *      member is already in, so changing this field cannot open a new one. That
 *      is the load-bearing half: validation alone still leaves ~26 hours of
 *      legitimate offsets to pick a favourable local date from.
 */

// Process-local cache so we don't hammer Mongo with redundant writes when the
// same user makes many tz-aware requests in a single container's lifetime.
const recentlyCaptured = new Map<string, string>()

/**
 * Real-world UTC offsets, in `Date.getTimezoneOffset()` units (minutes WEST of
 * UTC): UTC+14 (Kiribati) is -840, UTC-12 is +720. Everything in between is a
 * whole number of quarter hours — no inhabited zone has ever used a finer one.
 */
const MIN_OFFSET = -840
const MAX_OFFSET = 720
const OFFSET_STEP = 15

/** Reject junk before it reaches the DB: Intl throws on an unknown zone. */
function isValidZone(zone: string | undefined): zone is string {
  if (!zone || typeof zone !== 'string' || zone.length > 64) return false
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: zone })
    return true
  } catch {
    return false
  }
}

/**
 * The offset a zone is ACTUALLY on right now, in getTimezoneOffset() units.
 *
 * A zone name is checkable and a number is not, so when a caller sends both we
 * keep the zone's own answer. It also survives a DST transition the client
 * computed on a stale clock.
 */
export function zoneOffsetMinutes(zone: string, now: Date = new Date()): number | null {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: zone,
      hour12: false,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    }).formatToParts(now)
    const get = (t: string) => Number(parts.find((p) => p.type === t)?.value)
    const asUtc = Date.UTC(
      get('year'),
      get('month') - 1,
      get('day'),
      get('hour') % 24,
      get('minute'),
      get('second')
    )
    if (!Number.isFinite(asUtc)) return null
    // Positive = west of UTC, matching the browser.
    return Math.round((now.getTime() - asUtc) / 60_000)
  } catch {
    return null
  }
}

export interface CapturedTimezone {
  timezoneOffset: number
  timezone?: string
}

/**
 * What (if anything) is worth persisting for this report. Pure — the whole
 * validation rule in one testable function.
 *
 * Returns null when the report cannot describe a real place, in which case
 * NOTHING is written: an offset we refuse to store is better than one that
 * quietly re-keys the member's day.
 */
export function resolveCapturedTimezone(
  tzOffsetMinutes: number,
  ianaZone?: string,
  now: Date = new Date()
): CapturedTimezone | null {
  const zone = isValidZone(ianaZone) ? ianaZone : undefined

  // The zone wins when it is real: it is the half of the report the server can
  // check for itself.
  const zoneOffset = zone ? zoneOffsetMinutes(zone, now) : null
  const offset = zoneOffset ?? tzOffsetMinutes

  if (!Number.isFinite(offset)) return null
  if (offset < MIN_OFFSET || offset > MAX_OFFSET) return null
  if (offset % OFFSET_STEP !== 0) return null

  return { timezoneOffset: offset, ...(zone ? { timezone: zone } : {}) }
}

export type TimezoneWriteResult = 'written' | 'missing'
export type TimezoneWriter = (userId: string, patch: CapturedTimezone) => Promise<TimezoneWriteResult>

function isDuplicateKey(err: unknown): boolean {
  return !!err && typeof err === 'object' && (err as { code?: number }).code === 11000
}

/**
 * UPSERT, not update.
 *
 * On POST /api/workouts this runs BEFORE the route creates the member's
 * UserProgress, so a plain updateOne matched nothing and the FIRST offset a new
 * member ever reported was dropped on the floor — while the cache below happily
 * recorded it as done for an hour. New members therefore keyed their allowance
 * day (and their morning reminder) to UTC.
 *
 * The insert can lose a race against the route's own upsert on the unique
 * userId index; E11000 then means the document exists NOW, so a plain update
 * finishes the job. Never let that surface: this is fire-and-forget beside a
 * request that must still succeed.
 */
const mongoWriter: TimezoneWriter = async (userId, patch) => {
  try {
    const res = await UserProgress.updateOne({ userId }, { $set: patch }, { upsert: true })
    return res.matchedCount > 0 || res.upsertedCount > 0 ? 'written' : 'missing'
  } catch (err) {
    if (!isDuplicateKey(err)) throw err
    const res = await UserProgress.updateOne({ userId }, { $set: patch })
    return res.matchedCount > 0 ? 'written' : 'missing'
  }
}

/**
 * Opportunistically record the caller's timezone (offset in minutes, matching
 * Date.getTimezoneOffset(), plus the IANA zone when they sent one) on their
 * UserProgress doc. Fire-and-forget.
 *
 * IMPORTANT: pass only a GENUINELY-reported offset. Callers must gate on
 * `readOptionalTzOffsetFromBody(body) !== null` — never feed the 0-default of
 * `readTzOffsetFromBody`, because persisting a fabricated 0 marks the user as
 * UTC and makes the cron fire their morning reminder at ~3am local.
 *
 * Skipped when the report cannot describe a real place, or when this process
 * already stored the same thing for this user in the last hour.
 */
export function captureUserTimezone(
  userId: string,
  tzOffsetMinutes: number,
  ianaZone?: string,
  deps: { write?: TimezoneWriter; now?: Date } = {}
): void {
  if (!userId || !Number.isFinite(tzOffsetMinutes)) return

  const patch = resolveCapturedTimezone(tzOffsetMinutes, ianaZone, deps.now ?? new Date())
  if (!patch) return

  // A zone name is worth writing even when the offset has not moved, so the
  // cache key carries both. Otherwise the first member to be seen before this
  // feature existed would keep their offset and never gain a zone.
  const key = `${patch.timezoneOffset}|${patch.timezone ?? ''}`
  if (recentlyCaptured.get(userId) === key) return

  recentlyCaptured.set(userId, key)
  // Trim so it doesn't grow unbounded across many users. The entries are cheap
  // and a dropped one only costs a redundant write, so clearing wholesale is
  // fine and avoids tracking an age per key.
  if (recentlyCaptured.size > 5000) recentlyCaptured.clear()

  const write = deps.write ?? mongoWriter
  void write(userId, patch)
    .then((res) => {
      // A write that landed nowhere must NOT be remembered as done — that is
      // how the first report used to be lost for an hour rather than for one
      // request.
      if (res !== 'written') recentlyCaptured.delete(userId)
    })
    .catch(() => {
      recentlyCaptured.delete(userId)
    })
}

/** @internal Tests only — the cache would otherwise leak between cases. */
export function __clearTimezoneCache(): void {
  recentlyCaptured.clear()
}
