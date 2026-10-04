import type { MealPlan } from "@/lib/nutrition/mealPlans";
import type { CellTint } from "@/lib/nutrition/timelinePlanning";

/**
 * ─── Meal-plan week helpers (NP-231) ─────────────────────────────────────────
 *
 * The pure port of `webapp/app/dashboard/meal-plan/page.tsx` (lines 24-48,
 * 96-101, 125-142, 245-248). The route
 * `app/(app)/(tabs)/nutrition/meal-plan.tsx` renders these; this module owns
 * the calendar math, the day grouping, the grocery aggregation and the slot
 * ordering so the acceptance test can pin them without rendering.
 *
 * - `startOfWeek` pins to Sunday (`getDay() === 0`), exactly like the web.
 * - `ymd` formats from LOCAL calendar fields — the same way the web builds
 *   its `from`/`to` keys (`formatDateParam` on the nutrition page).
 * - `dayCalories` sums `expectedNutrition.calories` per day (web lines
 *   123-124); the tint comes from `tintForCalories` in `timelinePlanning`.
 * - `aggregateGrocery` groups by `name|unit` (lower-cased), sums `servings`,
 *   sorts by name (web lines 129-142).
 * - `orderSlots` puts the standard meals first in meal-time order, then any
 *   custom tag alphabetically, de-duped (web lines 24-31).
 */

export const SLOT_ORDER = ["breakfast", "lunch", "dinner", "snack"] as const;

export const DEFAULT_SLOTS: readonly string[] = [
  "breakfast",
  "lunch",
  "dinner",
  "snack",
];

/** Order meal tags: the standard meals first (in meal-time order), then any
 *  custom tags alphabetically. De-dupes. */
export function orderSlots(tags: string[]): string[] {
  return Array.from(new Set(tags.map((t) => t.toLowerCase()))).sort((a, b) => {
    const ia = SLOT_ORDER.indexOf(a as (typeof SLOT_ORDER)[number]);
    const ib = SLOT_ORDER.indexOf(b as (typeof SLOT_ORDER)[number]);
    if (ia !== -1 || ib !== -1)
      return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
    return a.localeCompare(b);
  });
}

/** `YYYY-MM-DD` from LOCAL calendar fields. */
export function ymd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Sunday-start week containing `d`, at local midnight. */
export function startOfWeek(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  x.setDate(x.getDate() - x.getDay()); // Sunday start
  return x;
}

/** Fresh Date `n` calendar days after `d`. */
export function addDays(d: Date, n: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

/** The seven local-midnight days of the week starting at `weekStart`. */
export function weekDays(weekStart: Date): Date[] {
  return Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
}

/** The `from`/`to` keys the web reads: `GET /api/meal-plans?from=<sun>&to=<sat>`. */
export function weekRangeKeys(weekStart: Date): { from: string; to: string } {
  const days = weekDays(weekStart);
  const first = days[0] ?? weekStart;
  const last = days[6] ?? weekStart;
  return { from: ymd(first), to: ymd(last) };
}

/** `MMM d - MMM d` label for the week nav (web line 192). */
export function weekLabel(weekStart: Date): string {
  const days = weekDays(weekStart);
  const first = days[0] ?? weekStart;
  const last = days[6] ?? weekStart;
  const fmt = (d: Date) =>
    d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  return `${fmt(first)} - ${fmt(last)}`;
}

/** Keep only `status === 'active'` plans (web lines 84-85). */
export function activePlans(plans: readonly MealPlan[]): MealPlan[] {
  return plans.filter((p) => p.status === "active");
}

/** Group plans by `plannedDateKey`. */
export function groupPlansByDay(
  plans: readonly MealPlan[],
): Map<string, MealPlan[]> {
  const m = new Map<string, MealPlan[]>();
  for (const p of plans) {
    const key = p.plannedDateKey ?? "";
    const arr = m.get(key);
    if (arr) arr.push(p);
    else m.set(key, [p]);
  }
  return m;
}

/** Day calories = sum of `expectedNutrition.calories` (web lines 123-124). */
export function dayCalories(plans: readonly MealPlan[] | undefined): number {
  return (plans ?? []).reduce(
    (s, p) => s + (p.expectedNutrition?.calories ?? 0),
    0,
  );
}

/** One grocery line: aggregated servings of a `name|unit` pair. */
export interface GroceryLine {
  key: string;
  name: string;
  unit: string;
  qty: number;
}

/**
 * Grocery list — aggregate every planned item across the week by name + unit,
 * summing quantities (web lines 129-142). The plan's items are already
 * flattened foods (saved meals/recipes expand into items at plan time), so
 * this is the shopping list.
 */
export function aggregateGrocery(plans: readonly MealPlan[]): GroceryLine[] {
  const map = new Map<string, GroceryLine>();
  for (const p of plans) {
    for (const it of p.items ?? []) {
      const name = (it.name ?? "").trim();
      if (!name) continue;
      const unit = it.servingUnit ?? "";
      const key = `${name.toLowerCase()}|${unit.toLowerCase()}`;
      const qty = it.servings ?? 1;
      const cur = map.get(key);
      if (cur) cur.qty += qty;
      else map.set(key, { key, name, unit, qty });
    }
  }
  return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
}

/** `1` -> `"1"`, `2.5` -> `"2.5"` (web line 149). */
export function formatGroceryQty(n: number): string {
  return (Math.round(n * 100) / 100).toString();
}

/**
 * Slots shown for a day: breakfast + tags with plans + revealed extras, in
 * meal order (web line 245).
 */
export function slotsForDay(
  dayPlans: readonly MealPlan[],
  extraSlots: readonly string[] = [],
): string[] {
  const tagsWithPlans = dayPlans.map((p) => p.tag.toLowerCase());
  return orderSlots(["breakfast", ...tagsWithPlans, ...extraSlots]);
}

/**
 * Tags the `+ Add meal` control can still reveal: every known tag not already
 * shown for the day (web lines 248-249). Falls back to the standard four when
 * the server sent no defaults.
 */
export function addableTags(
  slotList: readonly string[],
  defaults: readonly string[],
  userTags: readonly string[],
): string[] {
  const allTags = orderSlots([
    ...(defaults.length > 0 ? defaults : [...DEFAULT_SLOTS]),
    ...userTags,
  ]);
  return allTags.filter((t) => !slotList.includes(t));
}

/** Title-case a meal tag for display (web lines 50-52). */
export function titleCaseSlot(s: string): string {
  return s
    .split(/[-_\s]+/)
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1).toLowerCase())
    .join("-");
}

export type { CellTint };
