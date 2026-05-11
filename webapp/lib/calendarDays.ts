// ---------------------------------------------------------------------------
// Shared calendar grid helpers. Mirrors the canonical pattern in
// CalendarClient.tsx (workouts calendar) — same shape, same TZ semantics.
//
// These are LOCAL-time helpers. Pass them local Dates (not UTC instants) and
// you get a local-time grid back. Used by:
//   - workouts CalendarClient (legacy duplicate)
//   - timeline MonthView (new)
//
// To keep the workouts calendar regression-free, this PR does NOT migrate
// CalendarClient.tsx onto these helpers (the existing duplicate stays). v2.
// ---------------------------------------------------------------------------

export const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

export const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

/**
 * Return a Sun-Sat padded grid of Dates for the given month. The grid is
 * always full weeks: 5 or 6 rows × 7 cols. Padding cells belong to the
 * previous or next month and have their own .getMonth() values.
 */
export function getMonthDays(year: number, month: number): Date[] {
  const firstDay = new Date(year, month, 1)
  const lastDay = new Date(year, month + 1, 0)

  // Pad to start on Sunday
  const startPad = firstDay.getDay()
  const days: Date[] = []

  for (let i = startPad; i > 0; i--) {
    days.push(new Date(year, month, 1 - i))
  }

  for (let i = 1; i <= lastDay.getDate(); i++) {
    days.push(new Date(year, month, i))
  }

  // Pad to complete the last week
  const remaining = 7 - (days.length % 7)
  if (remaining < 7) {
    for (let i = 1; i <= remaining; i++) {
      days.push(new Date(year, month + 1, i))
    }
  }

  return days
}

/**
 * Format a LOCAL Date as YYYY-MM-DD using local calendar components.
 * This is the canonical "date key" string for grid bucketing.
 */
export function toDateKey(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function isSameLocalDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear()
    && a.getMonth() === b.getMonth()
    && a.getDate() === b.getDate()
}
