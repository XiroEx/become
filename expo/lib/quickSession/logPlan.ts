// Which actions make sense for a quick session dated `dateStr` relative to
// `todayStr` (both local YYYY-MM-DD strings, lexicographically comparable):
//   - a past date can only be LOGGED (you already did it, or didn't),
//   - a future date can only be PLANNED (you haven't gotten there yet),
//   - today allows both — you might log something already done, or plan one
//     for later today.
//
// Native port of `webapp/lib/quickSession/logPlanDate.ts` (NP-227). The web
// module also exports `localDateStr`; native already has that exact helper in
// `@become/core` (copied from `webapp/lib/quickSession/log.ts`) and in
// `@/lib/time/localDay` (`localDateKey`), so this file carries ONLY the
// availability rule — one name, one import, no second copy of the date key.

export interface LogPlanAvailability {
  canLog: boolean;
  canPlan: boolean;
}

export function logPlanAvailability(
  dateStr: string,
  todayStr: string,
): LogPlanAvailability {
  return {
    canLog: dateStr <= todayStr,
    canPlan: dateStr >= todayStr,
  };
}

/** YYYY-MM-DD only — guards against a malformed/garbage `date` query param
 *  silently becoming the pre-filled log date (web `DATE_RE`). */
export const QUICK_SESSION_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
