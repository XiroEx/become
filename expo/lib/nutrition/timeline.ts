import { localDateKey } from "@/lib/time/localDay";

export const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

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

/** Parse YYYY-MM-DD into a device-local midnight Date */
export function parseDateKey(dateKey: string): Date {
  const parts = dateKey.split("-");
  const y = Number(parts[0]) || 2026;
  const m = Number(parts[1]) || 1;
  const d = Number(parts[2]) || 1;
  return new Date(y, m - 1, d);
}

/** Format a Date as YYYY-MM-DD in local time */
export function formatDateKey(date: Date): string {
  return localDateKey(date);
}

/** Return the calendar-aligned Sun -> Sat week containing anchorDateKey */
export function getWeekRange(anchorDateKey: string): {
  from: string;
  to: string;
  days: string[];
} {
  const d = parseDateKey(anchorDateKey);
  const sunday = new Date(d.getFullYear(), d.getMonth(), d.getDate() - d.getDay());
  const days: string[] = [];
  for (let i = 0; i < 7; i++) {
    const cur = new Date(sunday.getFullYear(), sunday.getMonth(), sunday.getDate() + i);
    days.push(formatDateKey(cur));
  }
  return {
    from: days[0] ?? anchorDateKey,
    to: days[6] ?? anchorDateKey,
    days,
  };
}

/**
 * Return a Sun-Sat padded grid of Dates for the given month. The grid is
 * always full weeks: 5 or 6 rows × 7 cols.
 */
export function getMonthDays(year: number, month: number): Date[] {
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);

  const startPad = firstDay.getDay();
  const days: Date[] = [];

  for (let i = startPad; i > 0; i--) {
    days.push(new Date(year, month, 1 - i));
  }

  for (let i = 1; i <= lastDay.getDate(); i++) {
    days.push(new Date(year, month, i));
  }

  const remaining = 7 - (days.length % 7);
  if (remaining < 7) {
    for (let i = 1; i <= remaining; i++) {
      days.push(new Date(year, month + 1, i));
    }
  }

  return days;
}

/**
 * Bar height for one day of the Timeline week view's "Calories per day" chart.
 * Mirrors webapp/lib/nutrition/weekChart.ts.
 */
export function weeklyChartBarHeightPct(calories: number, maxCalories: number): number {
  const pct = maxCalories > 0 ? (calories / maxCalories) * 100 : 0;
  const floored = Math.max(pct, calories > 0 ? 4 : 0);
  return Math.min(floored, 100);
}

export type CellTint = "none" | "under" | "on" | "over";

/**
 * Goal comparison tint for a calorie amount.
 * < 80% is under, 80-110% is on, > 110% is over.
 */
export function tintForCalories(cals: number, goal: number): CellTint {
  if (cals === 0 || goal <= 0) return "none";
  const pct = cals / goal;
  if (pct < 0.8) return "under";
  if (pct <= 1.1) return "on";
  return "over";
}

export interface TagDotClasses {
  solidClass: string;
  ringClass: string;
}

const TAG_DOT_CLASSES: Record<string, TagDotClasses> = {
  breakfast: { solidClass: "bg-amber-500", ringClass: "border-amber-500" },
  lunch: { solidClass: "bg-orange-500", ringClass: "border-orange-500" },
  dinner: { solidClass: "bg-indigo-500", ringClass: "border-indigo-500" },
  snack: { solidClass: "bg-emerald-500", ringClass: "border-emerald-500" },
};

const DEFAULT_TAG_DOT: TagDotClasses = {
  solidClass: "bg-zinc-400 dark:bg-zinc-500",
  ringClass: "border-zinc-400 dark:border-zinc-500",
};

export function tagDotClasses(tag: string): TagDotClasses {
  return TAG_DOT_CLASSES[tag.toLowerCase()] ?? DEFAULT_TAG_DOT;
}

export interface WeekSummary {
  total: number;
  avg: number;
  max: number;
  daysLogged: number;
}

export function computeWeekSummary(
  days: { date: string; logs?: unknown[]; dailyTotals?: { calories?: number } }[],
): WeekSummary {
  const totalCals = days.reduce((s, d) => s + (d.dailyTotals?.calories || 0), 0);
  const daysWithFood = days.filter(
    (d) => (d.logs?.length ?? 0) > 0 || (d.dailyTotals?.calories ?? 0) > 0,
  ).length;
  const avg = daysWithFood > 0 ? totalCals / daysWithFood : 0;
  const maxCals = Math.max(0, ...days.map((d) => d.dailyTotals?.calories || 0));

  return {
    total: Math.round(totalCals),
    avg: Math.round(avg),
    max: Math.round(maxCals),
    daysLogged: daysWithFood,
  };
}
