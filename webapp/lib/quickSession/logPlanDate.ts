// Which actions make sense for a quick session dated `dateStr` relative to
// `todayStr` (both local YYYY-MM-DD strings, lexicographically comparable):
//   - a past date can only be LOGGED (you already did it, or didn't),
//   - a future date can only be PLANNED (you haven't gotten there yet),
//   - today allows both — you might log something already done, or plan one
//     for later today.

export interface LogPlanAvailability {
  canLog: boolean
  canPlan: boolean
}

export function logPlanAvailability(dateStr: string, todayStr: string): LogPlanAvailability {
  return {
    canLog: dateStr <= todayStr,
    canPlan: dateStr >= todayStr,
  }
}

/** Today (or any Date) as a local YYYY-MM-DD string — not UTC, so it matches
 *  the user's actual calendar day regardless of timezone. */
export function localDateStr(d: Date = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
