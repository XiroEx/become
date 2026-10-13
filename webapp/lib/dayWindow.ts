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

/**
 * Does `d` fall on the caller's LOCAL calendar day, right now? Unlike
 * isWithinInProgressWindow (a rolling 24h window), this is the actual
 * caller-local calendar day boundary — used to find a quick session PLANNED
 * for today (Calendar/"Plan it", see resolvePerformedAt) that has not been
 * started (no startedAt) so it can be offered honestly as "today's workout"
 * instead of disappearing entirely once it stops qualifying as in-progress.
 */
export function isOnLocalToday(d: Date | string, tzOffsetMinutes: number, now: Date = new Date()): boolean {
  const at = new Date(d)
  if (Number.isNaN(at.getTime())) return false
  return dateKey(at, tzOffsetMinutes) === localDateKey(null, tzOffsetMinutes, now)
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
 * Read `tz` from a JSON body, falling back to a numeric `tzOffset`. Clamped to
 * ±14h, 0 (= UTC) when neither is a finite number.
 *
 * `tz` is the only spelling this app sends and the only one a new client may
 * use — see readTzOffsetFromBody. The fallback exists for one narrow reason:
 * a client still running an OLD BUNDLE that spells it `tzOffset`, whose
 * request would otherwise be silently dated at UTC. PUT /api/mind/session is
 * the case that made it matter — `MindJourney.begin` sent `tzOffset`, the
 * route read `tz`, and the session a member began at 9pm in New York was
 * stamped with tomorrow's UTC day, so the very next GET called it `new_day`
 * and threw it away.
 *
 * Use this ONLY where an old bundle is genuinely in the field. Everywhere else
 * `readTzOffsetFromBody` is the contract: one spelling, documented in AGENTS.md.
 */
export function readTzOffsetFromBodyCompat(body: unknown): number {
  if (!body || typeof body !== 'object') return 0
  const rec = body as Record<string, unknown>
  const raw = typeof rec.tz === 'number' && Number.isFinite(rec.tz) ? rec.tz : rec.tzOffset
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
 * How far back a day-keyed write may be BACK-DATED by default.
 *
 * Sized for the native offline queue: a member logs a weigh-in on a plane, the
 * queue holds it until the phone reconnects, and the replay must land on the
 * day it was made on rather than the day it was delivered. A week is the
 * outer edge of "this is the same trip"; anything older is a data import, not
 * a delayed write, and those routes pass their own `maxBackdateDays` (see
 * NP-184 for Health imports).
 */
export const BACKDATE_WINDOW_DAYS = 7

export type ResolvedEntryDay =
  | {
      ok: true
      /** The LOCAL day (YYYY-MM-DD) the entry belongs to. */
      dayKey: string
      /** `dayKey` as the 00:00Z day marker rows are stored under. */
      date: Date
      /** When the member actually made the entry (an INSTANT). */
      loggedAt: Date
      /** True when `dayKey` is earlier than the caller's local today. */
      backdated: boolean
    }
  | { ok: false; error: string }

/**
 * Which local day a write belongs to, from an optional `date` (YYYY-MM-DD) and
 * `loggedAt` (ISO instant) on the request body.
 *
 * Without `date` this is exactly today in the caller's offset — the behaviour
 * every existing client gets, unchanged. With one, the client is telling us the
 * day it was made on, which is the only way an offline replay sent after
 * midnight can land on the day before it.
 *
 * Refused, all with a 400 rather than a silent fallback to today (a write
 * quietly filed on the wrong day is the bug this exists to stop):
 *   - a malformed key, or one that is not a real calendar day (2026-02-31)
 *   - a day in the FUTURE of the caller's own today
 *   - a day older than `maxBackdateDays` before it
 *
 * `loggedAt` orders replays of the SAME day against each other (see
 * isStaleReplay). It defaults to now, and a value in the future is clamped to
 * now: a client whose clock runs fast must not be able to pin a day's value
 * against every later write.
 */
export function resolveEntryDay(
  body: unknown,
  tzOffsetMinutes: number,
  opts: { now?: Date; maxBackdateDays?: number } = {}
): ResolvedEntryDay {
  const now = opts.now ?? new Date()
  const maxBackdateDays = opts.maxBackdateDays ?? BACKDATE_WINDOW_DAYS
  const rec = body && typeof body === 'object' ? (body as Record<string, unknown>) : {}

  let loggedAt = now
  const rawLoggedAt = rec.loggedAt
  if (rawLoggedAt != null && rawLoggedAt !== '') {
    if (typeof rawLoggedAt !== 'string' && typeof rawLoggedAt !== 'number') {
      return { ok: false, error: 'Invalid loggedAt' }
    }
    const at = new Date(rawLoggedAt)
    if (Number.isNaN(at.getTime())) return { ok: false, error: 'Invalid loggedAt' }
    loggedAt = at.getTime() > now.getTime() ? now : at
  }

  const todayKey = localDateKey(null, tzOffsetMinutes, now)
  const rawDate = rec.date

  if (rawDate == null || rawDate === '') {
    return { ok: true, dayKey: todayKey, date: utcMidnightDateKey(todayKey), loggedAt, backdated: false }
  }

  if (typeof rawDate !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(rawDate)) {
    return { ok: false, error: 'Invalid date: expected YYYY-MM-DD' }
  }

  const marker = utcMidnightDateKey(rawDate)
  // `Date.UTC(2026, 1, 31)` happily rolls over into March, so a well-formed key
  // is not yet a real day. Round-tripping it is what says so.
  if (Number.isNaN(marker.getTime()) || dateKey(marker, 0) !== rawDate) {
    return { ok: false, error: 'Invalid date: not a calendar day' }
  }

  const daysBack = Math.round(
    (utcMidnightDateKey(todayKey).getTime() - marker.getTime()) / 86_400_000
  )
  if (daysBack < 0) {
    return { ok: false, error: 'date is in the future' }
  }
  if (daysBack > maxBackdateDays) {
    return { ok: false, error: `date is more than ${maxBackdateDays} days old` }
  }

  return { ok: true, dayKey: rawDate, date: marker, loggedAt, backdated: daysBack > 0 }
}

/**
 * Is an incoming write for a day OLDER than the one already stored for it?
 *
 * The offline queue can deliver the same day twice — once from the phone that
 * was offline, once from the device that was online — and the last delivery is
 * not necessarily the last thing the member did. Rows written before entries
 * carried a `loggedAt` (and requests that send none, which are stamped `now`)
 * lose to the incoming write, which is the last-write-wins behaviour every
 * client has today.
 */
export function isStaleReplay(
  storedLoggedAt: Date | string | null | undefined,
  incomingLoggedAt: Date
): boolean {
  if (!storedLoggedAt) return false
  const stored = new Date(storedLoggedAt)
  if (Number.isNaN(stored.getTime())) return false
  return stored.getTime() > incomingLoggedAt.getTime()
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
