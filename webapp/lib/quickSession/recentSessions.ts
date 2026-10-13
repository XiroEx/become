// How many logged quick sessions the "Workout Now" sheet's My Sessions list
// shows before "See all" takes over. Kept as a named constant + pure function
// so the cap has one source of truth and is unit-testable without rendering
// QuickSessionModal.

export const RECENT_QUICK_SESSIONS_LIMIT = 3

/** Filter to kind:'quick' logs and cap to the sheet's display limit. */
export function pickRecentQuickSessions<T extends { kind: string }>(logs: T[]): T[] {
  return logs.filter((l) => l.kind === 'quick').slice(0, RECENT_QUICK_SESSIONS_LIMIT)
}
