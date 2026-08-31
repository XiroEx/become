/**
 * Timezone-aware day-window helpers.
 *
 * The browser sends its tz offset (minutes WEST of UTC, matching
 * `Date.getTimezoneOffset()` semantics) as the `tz` query/body param.
 * Server endpoints use these helpers to interpret YYYY-MM-DD as the
 * CALLER'S LOCAL day rather than the (often wrong) UTC day.
 *
 * Pattern shipped in PR #244 (meal-logs) and PR #246 (nutrition/log).
 */

const TZ_CLAMP_MIN = -840 // ±14h
const TZ_CLAMP_MAX = 840

/**
 * How long an incomplete workout log stays "in progress" (the dashboard's
 * pulsing Resume pill, and the live view's silent same-session resume) rather
 * than falling back to the separate stale-workout prompt.
 *
 * Deliberately a ROLLING window, not a calendar-day one: a workout started at
 * 11:58pm and still open at 12:10am is two minutes old, not "yesterday's."
 * Scoping resumability to the caller's local calendar day discarded a log the
 * instant midnight passed, even though nothing about it had gone stale — the
 * member saw the pill vanish and the workout looked lost.
 */
export const IN_PROGRESS_WINDOW_MS = 24 * 60 * 60 * 1000

/**
 * Does `d` count as "in progress right now"? Bounded on BOTH sides of `now`:
 * not so old it's gone stale (the rolling IN_PROGRESS_WINDOW_MS), and not
 * dated in the future.
 *
 * The upper bound matters because a quick session PLANNED for a future date
 * (Calendar → "Plan it") writes an incomplete workout-log row immediately,
 * dated on that future day — a lower-bound-only check (`d >= cutoff`) is
 * satisfied by any future date, which surfaced a session the member had only
 * scheduled as if they were mid-workout in it right now.
 */
export function isWithinInProgressWindow(d: Date | string, now: Date = new Date()): boolean {
  const at = new Date(d)
  if (Number.isNaN(at.getTime())) return false
  const cutoff = now.getTime() - IN_PROGRESS_WINDOW_MS
  return at.getTime() >= cutoff && at.getTime() <= now.getTime()
}

/** Read `tz` from URL search params, clamped to ±14h. Defaults to 0 (UTC). */
export function readTzOffset(searchParams: URLSearchParams): number {
  const raw = searchParams.get('tz')
  if (raw == null) return 0
  const n = Number(raw)
  if (!Number.isFinite(n)) return 0
  return Math.max(TZ_CLAMP_MIN, Math.min(TZ_CLAMP_MAX, n))
}

/** Read `tz` from a JSON body, clamped to ±14h. Defaults to 0 (UTC). */
export function readTzOffsetFromBody(body: unknown): number {
  if (!body || typeof body !== 'object') return 0
  const raw = (body as Record<string, unknown>).tz
  if (typeof raw !== 'number' || !Number.isFinite(raw)) return 0
  return Math.max(TZ_CLAMP_MIN, Math.min(TZ_CLAMP_MAX, raw))
}

/**
 * Read `tz` from a JSON body, returning `null` when it is ABSENT or not a
 * finite number (rather than defaulting to 0 = UTC). Use this — never
 * `readTzOffsetFromBody` — when the value is going to be PERSISTED as the
 * user's timezone (see captureUserTimezone). Defaulting a missing `tz` to 0
 * silently marks the user as UTC, which made the cron fire the workout
 * reminder in the small hours of their real local morning (a US/Eastern user
 * stored as offset 0 got the 7am-UTC nudge at ~3am local). A genuinely
 * reported UTC user still sends `tz: 0`, which is a real number and preserved.
 * Clamped to ±14h.
 */
/**
 * The caller's IANA zone, when they sent one. Unvalidated here on purpose —
 * captureUserTimezone rejects anything Intl cannot parse, so validation lives
 * at the write rather than being duplicated at every read.
 */
export function readZoneFromBody(body: unknown): string | undefined {
  const z = (body as { tzZone?: unknown; timezone?: unknown })?.tzZone
    ?? (body as { timezone?: unknown })?.timezone
  return typeof z === 'string' && z.length > 0 && z.length <= 64 ? z : undefined
}

export function readOptionalTzOffsetFromBody(body: unknown): number | null {
  if (!body || typeof body !== 'object') return null
  const raw = (body as Record<string, unknown>).tz
  if (typeof raw !== 'number' || !Number.isFinite(raw)) return null
  return Math.max(TZ_CLAMP_MIN, Math.min(TZ_CLAMP_MAX, raw))
}

/**
 * Resolve a YYYY-MM-DD calendar-day key for a caller in `tzOffsetMinutes`
 * (browser-style: positive WEST of UTC). When `dateStr` is provided and
 * well-formed, returns it verbatim (the caller's intended local day).
 * Otherwise derives "today" in the caller's local zone from `now`.
 */
export function localDateKey(
  dateStr: string | null | undefined,
  tzOffsetMinutes: number,
  now: Date = new Date()
): string {
  if (dateStr && /^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return dateStr
  const shifted = new Date(now.getTime() - tzOffsetMinutes * 60_000)
  const y = shifted.getUTCFullYear()
  const m = String(shifted.getUTCMonth() + 1).padStart(2, '0')
  const d = String(shifted.getUTCDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

/**
 * Returns the UTC window [start, end] that corresponds to the LOCAL calendar
 * day identified by `dateKey` (YYYY-MM-DD) for a caller in `tzOffsetMinutes`.
 * Used to filter rows by a Date field so events that happened during the
 * user's local evening — which spill into the next UTC day in zones west
 * of UTC — are still included.
 */
export function localDayWindowForKey(
  dateKey: string,
  tzOffsetMinutes: number
): { start: Date; end: Date } {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateKey)
  if (!m) {
    const fb = new Date(dateKey + 'T00:00:00.000Z')
    return { start: fb, end: new Date(fb.getTime() + 86_400_000 - 1) }
  }
  const utcMidnight = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
  const start = new Date(utcMidnight + tzOffsetMinutes * 60_000)
  const end = new Date(start.getTime() + 86_400_000 - 1)
  return { start, end }
}

/**
 * Render the YYYY-MM-DD of the LOCAL calendar day for a caller in
 * `tzOffsetMinutes`. When offset is 0, returns the UTC day — matches legacy
 * behavior for clients that don't send `tz`.
 */
export function dateKey(d: Date, tzOffsetMinutes = 0): string {
  const shifted = new Date(d.getTime() - tzOffsetMinutes * 60_000)
  const y = shifted.getUTCFullYear()
  const m = String(shifted.getUTCMonth() + 1).padStart(2, '0')
  const day = String(shifted.getUTCDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/**
 * Returns a Date pegged to UTC midnight of the supplied YYYY-MM-DD. Used as
 * the storage key for row-keyed models (NutritionLog.date, DailyWin.date,
 * DisciplineChallenge.date, DailyContentLog.date, Schedule slot dates),
 * preserving backwards compatibility with rows previously written by code
 * paths that did `new Date(dateStr + 'T00:00:00.000Z')`.
 */
export function utcMidnightDateKey(dateKey: string): Date {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateKey)
  if (!m) return new Date(dateKey + 'T00:00:00.000Z')
  return new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])))
}

/**
 * Which calendar day a DAY-KEYED row belongs to.
 *
 * Mood entries, weight entries and weightSkipTracking dates are WRITTEN with
 * utcMidnightDateKey(), so they sit at UTC midnight and denote a calendar day
 * rather than an instant. Reading one back through the local-instant machinery
 * — `localDayWindowForKey()` or `dateKey(d, tzOffset)` — shifts it a day
 * backwards for anyone WEST of UTC: an Eastern member's 2026-08-05 begins at
 * 05:00Z, so the marker 2026-08-05T00:00Z falls outside their own day.
 *
 * The member-visible result was that logging your mood and weight read back
 * immediately as "1 day since last log", `todaysMood` came back null, and the
 * daily check-in never registered as done — so it kept reappearing. It was
 * correct at UTC and east of it, which is why it went unnoticed.
 *
 * Rows written before this convention hold a real timestamp, so both readings
 * are accepted and the nearer one wins.
 */
export function entryDayKeys(d: Date | string, tzOffsetMinutes: number): string[] {
  const date = new Date(d)
  if (Number.isNaN(date.getTime())) return []
  const asMarker = dateKey(date, 0)
  const asInstant = dateKey(date, tzOffsetMinutes)
  return asMarker === asInstant ? [asMarker] : [asMarker, asInstant]
}

/** Did this day-keyed row land on `dayKey` for a caller in `tzOffsetMinutes`? */
export function isEntryOnDay(
  d: Date | string,
  dayKey: string,
  tzOffsetMinutes: number
): boolean {
  return entryDayKeys(d, tzOffsetMinutes).includes(dayKey)
}

/** Whole calendar days between a day-keyed row and `todayKey`. Never negative. */
export function daysSinceEntry(
  d: Date | string,
  todayKey: string,
  tzOffsetMinutes: number
): number | null {
  const keys = entryDayKeys(d, tzOffsetMinutes)
  if (keys.length === 0) return null
  const todayMs = utcMidnightDateKey(todayKey).getTime()
  let best = Infinity
  for (const k of keys) {
    const diff = Math.floor((todayMs - utcMidnightDateKey(k).getTime()) / 86_400_000)
    if (diff < best) best = diff
  }
  return Math.max(0, best)
}
