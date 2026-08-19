/**
 * Cadence for the "notifications are blocked" in-app reminder.
 *
 * Browsers give JS no way to re-open the native permission dialog once a
 * user has denied it — calling requestPermission() again just resolves to
 * 'denied' with no UI. So the only lever left is a periodic in-app nudge
 * pointing the user at their browser/OS settings: first 7 days after the
 * initial denial, then once a month for as long as permission stays denied.
 */

export const DENIAL_REPROMPT_DELAY_MS = 7 * 24 * 60 * 60 * 1000 // 7 days
export const DENIAL_REPROMPT_INTERVAL_MS = 30 * 24 * 60 * 60 * 1000 // ~1 month

export const DENIED_AT_KEY = 'notification_denied_at'
export const REPROMPT_SHOWN_AT_KEY = 'notification_reprompt_shown_at'

/**
 * Parse a localStorage timestamp, treating anything that isn't a positive
 * finite number as absent rather than trusting garbage.
 */
export function parseStoredTimestamp(value: string | null): number | null {
  if (!value) return null
  const parsed = Number(value)
  if (!Number.isFinite(parsed) || parsed <= 0) return null
  return parsed
}

/**
 * The denial timestamp to persist. Idempotent: the FIRST observed denial
 * wins, so the 7-day/monthly cadence anchors to when the user actually said
 * no rather than resetting on every later page load where permission is
 * still 'denied'.
 */
export function resolveDeniedAt(stored: string | null, now: number): number {
  return parseStoredTimestamp(stored) ?? now
}

/**
 * Whether the denied-permission reminder should show right now.
 *
 * `lastShownAt` is null when the reminder has never been shown. A missing or
 * unparseable value is treated as "never shown" — same reasoning as
 * shouldResync in ensureSubscription.ts: failing open is what keeps the
 * reminder from wedging off forever, not the reverse.
 */
export function shouldShowDeniedReprompt(
  deniedAt: number,
  lastShownAt: number | null,
  now: number,
): boolean {
  if (!Number.isFinite(deniedAt) || deniedAt <= 0) return false
  if (now - deniedAt < DENIAL_REPROMPT_DELAY_MS) return false
  if (lastShownAt === null) return true
  // A clock that jumped backwards shouldn't wedge the reminder off forever.
  if (lastShownAt > now) return true
  return now - lastShownAt >= DENIAL_REPROMPT_INTERVAL_MS
}
