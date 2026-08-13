// ---------------------------------------------------------------------------
// Meal plan timezone helpers — mirrors the workouts pattern in
// CalendarClient.tsx's `localDateFromScheduledIso`. A plan's `plannedDate`
// is stored as a Date pinned at UTC midnight where the YYYY-MM-DD portion
// is the user's intended LOCAL date. These helpers are the ONLY place
// allowed to call `new Date('YYYY-MM-DD')` semantics — every other module
// must route through them.
// ---------------------------------------------------------------------------

const YYYY_MM_DD = /^(\d{4})-(\d{2})-(\d{2})$/

/**
 * Parse a YYYY-MM-DD string into a Date pinned at UTC midnight of that
 * calendar day. Canonical STORAGE form: the YYYY-MM-DD portion is the
 * user's intended LOCAL date, but we store at UTC midnight so the date
 * string in the database is unambiguous.
 *
 * USE this on the SERVER when accepting a plannedDate from the request.
 * Throws if `s` doesn't match `YYYY-MM-DD`.
 */
export function parsePlannedDateToUtcMidnight(s: string): Date {
  const m = YYYY_MM_DD.exec(s)
  if (!m) throw new Error(`Invalid plannedDate: ${s} (expected YYYY-MM-DD)`)
  const y = Number(m[1])
  const mo = Number(m[2])
  const d = Number(m[3])
  if (!Number.isFinite(y) || !Number.isFinite(mo) || !Number.isFinite(d)) {
    throw new Error(`Invalid plannedDate: ${s}`)
  }
  const date = new Date(Date.UTC(y, mo - 1, d))
  if (Number.isNaN(date.getTime())) {
    throw new Error(`Invalid plannedDate: ${s}`)
  }
  return date
}

/**
 * Extract the YYYY-MM-DD portion from a stored UTC-midnight Date. Server-
 * side use only — the stored Date IS UTC midnight by construction.
 */
export function plannedDateKey(d: Date): string {
  const y = d.getUTCFullYear()
  const mo = String(d.getUTCMonth() + 1).padStart(2, '0')
  const day = String(d.getUTCDate()).padStart(2, '0')
  return `${y}-${mo}-${day}`
}

/**
 * Convert a stored plannedDate ISO ("2026-05-15T00:00:00.000Z") into a Date
 * at LOCAL midnight of the same calendar day. Required CLIENT-SIDE so day
 * comparisons against local "today" work in non-UTC zones.
 */
export function localDateFromPlannedIso(iso: string): Date {
  const datePart = typeof iso === 'string'
    ? iso.split('T')[0]
    : new Date(iso).toISOString().split('T')[0]
  const m = YYYY_MM_DD.exec(datePart)
  if (!m) {
    // Fall back to a permissive parse — should never happen with server-shaped responses.
    const fallback = new Date(datePart)
    return new Date(fallback.getFullYear(), fallback.getMonth(), fallback.getDate())
  }
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
}

/**
 * Add N calendar days to a local-midnight Date and return a fresh local-
 * midnight Date. Avoids DST cliffs that `setDate(getDate() + n)` can hit
 * when the source Date is anchored to UTC.
 */
export function addLocalDays(localMidnight: Date, n: number): Date {
  return new Date(
    localMidnight.getFullYear(),
    localMidnight.getMonth(),
    localMidnight.getDate() + n,
  )
}

/**
 * Add N days to a YYYY-MM-DD key string using local-calendar arithmetic.
 * Returns the new YYYY-MM-DD string. Use this for server-side recurrence
 * expansion where we only have the date key, not a Date instance.
 */
export function addDaysToKey(key: string, n: number): string {
  const m = YYYY_MM_DD.exec(key)
  if (!m) throw new Error(`Invalid date key: ${key}`)
  // Use UTC math because the key is a pure calendar date — no TZ surprises.
  const base = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])))
  base.setUTCDate(base.getUTCDate() + n)
  return plannedDateKey(base)
}

/**
 * Compare two YYYY-MM-DD keys. Returns negative if a < b, positive if a > b, 0 if equal.
 * Lexicographic comparison works because the format is zero-padded and stable.
 */
export function compareDateKeys(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0
}

/**
 * Is `date` strictly after today, comparing on LOCAL calendar boundaries?
 * `date` may be at any time of day; only its YYYY-MM-DD portion is consulted.
 * Used by the nutrition page to switch the picker into plan mode + relabel
 * "Add food" → "Schedule food" when the user has scrolled to a future date.
 */
export function isFutureLocalDate(date: Date, now: Date = new Date()): boolean {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const target = new Date(date.getFullYear(), date.getMonth(), date.getDate())
  return target.getTime() > today.getTime()
}

/**
 * Today's date key in the SERVER's local zone (the deployed server is UTC).
 * Use sparingly — the canonical "today" decision is CLIENT-side. This helper
 * exists for permissive past-date rejection only (see Section 8.6 of the plan).
 */
export function todayUtcKey(now: Date = new Date()): string {
  return plannedDateKey(new Date(Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate(),
  )))
}

/**
 * Today's date key in the user's LOCAL timezone, as YYYY-MM-DD. Used by the
 * date-only picker to compute "today" highlights and to derive a sensible
 * default when the user hasn't picked a date.
 */
export function todayLocalKey(now: Date = new Date()): string {
  const y = now.getFullYear()
  const mo = String(now.getMonth() + 1).padStart(2, '0')
  const d = String(now.getDate()).padStart(2, '0')
  return `${y}-${mo}-${d}`
}

/**
 * Given a YYYY-MM-DD date string and the current moment, produce an ISO
 * timestamp at the picked date with the current wall-clock hour/minute/second
 * in the user's local timezone. Use this when a UI lets the user pick a date
 * for a log entry — the user didn't pick a time, so we preserve "now's clock"
 * on the chosen date as the most defensible default. Pass `now` explicitly
 * in tests to keep them deterministic.
 *
 *   combineDateWithNowTime('2026-05-11', new Date('2026-05-11T18:42:13Z'))
 *     // → '2026-05-11T...' with local 18:42 hours
 */
export function combineDateWithNowTime(dateKey: string, now: Date = new Date()): string {
  const m = YYYY_MM_DD.exec(dateKey)
  if (!m) throw new Error(`Invalid date key: ${dateKey} (expected YYYY-MM-DD)`)
  const y = Number(m[1])
  const mo = Number(m[2])
  const d = Number(m[3])
  // Build a Date at the picked YYYY-MM-DD in LOCAL time, then graft the
  // current wall-clock hour/minute/second/ms onto it. The resulting Date is
  // a local instant; .toISOString() normalizes to UTC for transport.
  const combined = new Date(
    y, mo - 1, d,
    now.getHours(), now.getMinutes(), now.getSeconds(), now.getMilliseconds(),
  )
  return combined.toISOString()
}

/**
 * Build the `loggedAt` for a manually-timed entry.
 *
 * `dateKey` null means today; `timeHHMM` null means the current wall clock (the
 * long-standing behaviour of combineDateWithNowTime). Supplying a time matters
 * now that the day view sorts by clock: three foods backdated to yesterday used
 * to all receive the same current minute, so they stacked in entry order rather
 * than in the order they were eaten.
 */
export function buildLoggedAt(
  dateKey: string | null,
  timeHHMM: string | null,
  fallbackDate?: Date,
  now: Date = new Date(),
): string {
  const base = dateKey ?? todayLocalKey(fallbackDate ?? now)
  if (!timeHHMM) return combineDateWithNowTime(base, now)
  const m = /^(\d{1,2}):(\d{2})$/.exec(timeHHMM.trim())
  if (!m) return combineDateWithNowTime(base, now)
  const dm = YYYY_MM_DD.exec(base)
  if (!dm) throw new Error(`Invalid date key: ${base} (expected YYYY-MM-DD)`)
  return new Date(
    Number(dm[1]), Number(dm[2]) - 1, Number(dm[3]),
    Number(m[1]), Number(m[2]), 0, 0,
  ).toISOString()
}
