// ---------------------------------------------------------------------------
// Timeline planning client-side types + fetchers. Keeps the page.tsx file
// focused on day/week rendering; planning state lives here so it can be
// imported by MonthView and the planning UI in PR 3a/3b/4/5.
// ---------------------------------------------------------------------------

import type { IMealItem, IMealNutrition } from '@/models/Meal'

export type MealPlanStatus = 'active' | 'promoted' | 'skipped' | 'superseded'

export interface MealPlan {
  _id: string
  plannedDate: string         // ISO UTC midnight (server canonical form)
  plannedDateKey: string      // YYYY-MM-DD (pre-extracted by the server)
  tag: string
  items: (IMealItem & { _id?: string })[]
  mealId?: string
  mealName?: string
  notes?: string
  expectedNutrition: IMealNutrition
  status: MealPlanStatus
  logId?: string
  promotedAt?: string
  seriesId?: string
  createdAt?: string
  updatedAt?: string
}

export interface PlanDayBucket {
  date: string                // YYYY-MM-DD
  plans: MealPlan[]
  expectedTotals: IMealNutrition
}

export interface PlansResponse {
  plans: MealPlan[]
  days: PlanDayBucket[]
}

/**
 * Fetch plans for a YYYY-MM-DD range. Returns an empty response on any
 * failure — the timeline page degrades gracefully if the plans endpoint
 * is unavailable (PR 1 might not be deployed yet during transition).
 */
export async function fetchPlansInRange(
  from: string,
  to: string,
  headers: HeadersInit,
): Promise<PlansResponse> {
  try {
    const res = await fetch(`/api/meal-plans?from=${from}&to=${to}`, { headers })
    if (!res.ok) return { plans: [], days: [] }
    const data = await res.json() as PlansResponse
    return {
      plans: data.plans ?? [],
      days: data.days ?? [],
    }
  } catch {
    return { plans: [], days: [] }
  }
}

// ---------------------------------------------------------------------------
// Tag dot colors. Used by MonthView dots.
// ---------------------------------------------------------------------------

interface TagDotColors {
  solid: string   // tailwind bg- for a logged dot
  ring: string    // tailwind border- for a planned hollow ring
}

const TAG_DOT_COLORS: Record<string, TagDotColors> = {
  breakfast: { solid: 'bg-amber-500', ring: 'border-amber-500' },
  lunch:     { solid: 'bg-orange-500', ring: 'border-orange-500' },
  dinner:    { solid: 'bg-indigo-500', ring: 'border-indigo-500' },
  snack:     { solid: 'bg-emerald-500', ring: 'border-emerald-500' },
}

const DEFAULT_TAG_DOT: TagDotColors = {
  solid: 'bg-zinc-400 dark:bg-zinc-500',
  ring: 'border-zinc-400 dark:border-zinc-500',
}

export function tagDotColors(tag: string): TagDotColors {
  return TAG_DOT_COLORS[tag.toLowerCase()] ?? DEFAULT_TAG_DOT
}

// ---------------------------------------------------------------------------
// Calorie-goal tint thresholds (plan §8.1).
// ---------------------------------------------------------------------------

export type CellTint = 'none' | 'under' | 'on' | 'over'

export function tintForCalories(cals: number, goal: number): CellTint {
  if (cals === 0) return 'none'
  if (goal <= 0) return 'none'
  const pct = cals / goal
  if (pct < 0.80) return 'under'
  if (pct <= 1.10) return 'on'
  return 'over'
}

export const TINT_CLASSES: Record<CellTint, string> = {
  none: '',
  under: 'bg-amber-50/60 dark:bg-amber-950/20',
  on: 'bg-emerald-50/60 dark:bg-emerald-950/20',
  over: 'bg-red-50/60 dark:bg-red-950/20',
}
