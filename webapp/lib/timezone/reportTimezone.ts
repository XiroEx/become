// ─── Telling the server where the member is, once a day, on app open ─────────
//
// The notify cron skips every member with no stored timezone, and until now the
// only route that stored one was POST /api/workouts. A member who logs food or
// runs Mind sessions and never saves a workout therefore received NO reminders
// at all, and their windowed AI allowances were bucketed on UTC.
//
// So the app reports it when it opens. The gate is deliberately boring:
//
//   • at most ONE request per LOCAL calendar day, stamped in localStorage, so
//     reloading the dashboard twenty times costs one small write;
//   • the stamp is only written when the server actually accepted the report,
//     so an offline open or a 500 retries on the next open rather than burning
//     the day;
//   • nothing is ever sent as a stand-in. `getTimezoneOffset()` is read from
//     the device clock per call (DST moves it) and the IANA zone travels
//     beside it as `tzZone`, which is the half the server can verify.
//
// Pure-ish and dependency-injected so the whole rule is unit-testable without a
// browser: see tests/unit/timezone/reportTimezone.test.ts.

import { getToken } from '@/lib/clientAuth'

/** localStorage key holding the LOCAL day key we last reported on. */
export const TZ_REPORT_STAMP_KEY = 'become.timezoneReportedOn'

/** The smallest slice of localStorage this needs — and all a test must fake. */
export interface StampStore {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
}

export interface ReportTimezoneDeps {
  /** Bearer token. No token = signed out = nothing to attribute the report to. */
  token?: string | null
  storage?: StampStore | null
  fetchImpl?: typeof fetch
  now?: Date
  /** Minutes WEST of UTC. Defaults to the device clock. */
  tzOffsetMinutes?: number
  /** IANA zone. Defaults to the device zone. */
  tzZone?: string | undefined
}

export type ReportTimezoneResult = 'reported' | 'already-today' | 'signed-out' | 'failed'

/**
 * The member's own calendar day, in their own zone — the unit "once a day"
 * is counted in. Derived from the offset rather than `toLocaleDateString` so
 * an injected offset in a test means what it says.
 */
export function localDayStamp(now: Date, tzOffsetMinutes: number): string {
  const shifted = new Date(now.getTime() - tzOffsetMinutes * 60_000)
  const y = shifted.getUTCFullYear()
  const m = String(shifted.getUTCMonth() + 1).padStart(2, '0')
  const d = String(shifted.getUTCDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

/** Have we already reported on this local day? A missing/unreadable stamp = no. */
export function alreadyReportedToday(
  storage: StampStore | null | undefined,
  now: Date,
  tzOffsetMinutes: number,
): boolean {
  if (!storage) return false
  try {
    return storage.getItem(TZ_REPORT_STAMP_KEY) === localDayStamp(now, tzOffsetMinutes)
  } catch {
    // Safari private mode has historically thrown on storage access. One extra
    // request a day is a far better failure than never reporting at all.
    return false
  }
}

function browserStorage(): StampStore | null {
  try {
    if (typeof window === 'undefined') return null
    return window.localStorage ?? null
  } catch {
    return null
  }
}

function deviceZone(): string | undefined {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || undefined
  } catch {
    return undefined
  }
}

/**
 * Report this device's timezone, at most once per local day. Never throws and
 * never blocks anything the member can see — the caller fires it and forgets.
 */
export async function reportTimezoneOnce(
  deps: ReportTimezoneDeps = {},
): Promise<ReportTimezoneResult> {
  const now = deps.now ?? new Date()
  const tz = deps.tzOffsetMinutes ?? now.getTimezoneOffset()
  if (!Number.isFinite(tz)) return 'failed'

  const storage = deps.storage === undefined ? browserStorage() : deps.storage
  if (alreadyReportedToday(storage, now, tz)) return 'already-today'

  const token = deps.token === undefined ? getToken() : deps.token
  if (!token) return 'signed-out'

  const tzZone = deps.tzZone === undefined ? deviceZone() : deps.tzZone
  // Wrapped rather than passed by reference: a detached `fetch` is a receiver
  // question this module has no reason to have an opinion about.
  const doFetch: typeof fetch | undefined = deps.fetchImpl
    ?? (typeof fetch === 'function' ? ((url, init) => fetch(url, init)) : undefined)
  if (!doFetch) return 'failed'

  try {
    const res = await doFetch('/api/me/timezone', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      // `tz` is the number; the zone travels only as `tzZone`. Never a
      // fabricated 0 — the offset above always comes from a real clock.
      body: JSON.stringify({ tz, ...(tzZone ? { tzZone } : {}) }),
    })
    if (!res.ok) return 'failed'
  } catch {
    return 'failed'
  }

  try {
    storage?.setItem(TZ_REPORT_STAMP_KEY, localDayStamp(now, tz))
  } catch {
    // Unstampable: we simply ask again on the next open.
  }
  return 'reported'
}
