/**
 * The denial-reminder cadence, ported 1:1 from `webapp/lib/push/reprompt.ts`.
 *
 * The OS gives no way to re-open its permission dialog once a member has
 * denied it, so the only lever left is a periodic in-app nudge toward
 * Settings: first 7 days after the initial denial, then once a month for as
 * long as permission stays denied.
 */

export const DENIAL_REPROMPT_DELAY_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
export const DENIAL_REPROMPT_INTERVAL_MS = 30 * 24 * 60 * 60 * 1000; // ~1 month

/**
 * Parse a stored timestamp, treating anything that isn't a positive finite
 * number as absent rather than trusting garbage.
 */
export function parseStoredTimestampSafe(value: string | null): number | null {
  if (!value) return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return parsed;
}

/**
 * Whether the denied-permission reminder should show right now.
 * Shared with `components/push/PushOptInCard.tsx` (which re-exports the
 * canonical copies); kept here so the cadence is testable without React.
 */
export function shouldShowDeniedRepromptAt(
  deniedAt: number,
  lastShownAt: number | null,
  now: number,
): boolean {
  if (!Number.isFinite(deniedAt) || deniedAt <= 0) return false;
  if (now - deniedAt < DENIAL_REPROMPT_DELAY_MS) return false;
  if (lastShownAt === null) return true;
  if (lastShownAt > now) return true;
  return now - lastShownAt >= DENIAL_REPROMPT_INTERVAL_MS;
}
