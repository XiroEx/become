export const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export const WEEK_SHORT_HEADERS = ["S", "M", "T", "W", "T", "F", "S"];

export const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

/**
 * Return a Sun-Sat padded grid of Dates for the given month. The grid is
 * always full weeks: 5 or 6 rows × 7 cols. Padding cells belong to the
 * previous or next month and have their own .getMonth() values.
 */
export function getMonthDays(year: number, month: number): Date[] {
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);

  // Pad to start on Sunday
  const startPad = firstDay.getDay();
  const days: Date[] = [];

  for (let i = startPad; i > 0; i--) {
    days.push(new Date(year, month, 1 - i));
  }

  for (let i = 1; i <= lastDay.getDate(); i++) {
    days.push(new Date(year, month, i));
  }

  // Pad to complete the last week
  const remaining = 7 - (days.length % 7);
  if (remaining < 7) {
    for (let i = 1; i <= remaining; i++) {
      days.push(new Date(year, month + 1, i));
    }
  }

  return days;
}

/**
 * Format a LOCAL Date as YYYY-MM-DD using local calendar components.
 * This is the canonical "date key" string for grid bucketing.
 */
export function toDateKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function parseDateKey(s: string): Date {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y ?? 2026, (m ?? 1) - 1, d ?? 1);
}

export function isSameLocalDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

/**
 * Calculate the Sun -> Sat calendar week containing `referenceDate`.
 */
export function getWeekDaysRange(referenceDate: Date): {
  from: Date;
  to: Date;
  fromStr: string;
  toStr: string;
  days: Date[];
} {
  const from = new Date(referenceDate);
  from.setDate(from.getDate() - from.getDay());
  const to = new Date(from);
  to.setDate(from.getDate() + 6);

  const days: Date[] = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(from);
    d.setDate(from.getDate() + i);
    days.push(d);
  }

  return {
    from,
    to,
    fromStr: toDateKey(from),
    toStr: toDateKey(to),
    days,
  };
}
