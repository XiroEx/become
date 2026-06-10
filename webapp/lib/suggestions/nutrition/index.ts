// Nutrition suggestion sources — dashboard-placed nudges driven by the user's
// recent MealLog activity. Deliberately only TWO (simplicity-first): a lapsed-
// logging nudge and a protein-trending-low nudge. Both read a pre-aggregated
// `nutritionDays` extension on RecentActivity (the tiles route populates it),
// so sources stay pure and testable.

import { listSources, registerSource } from '../registry'
import type { RecentActivity, SuggestionSourceFn } from '../types'

const MS_PER_DAY = 24 * 60 * 60 * 1000

/** Per-local-day rollup of the user's meal logs (last ~14 days). */
export interface NutritionDay {
  date: Date
  calories: number
  protein: number
  logCount: number
}

interface NutritionActivity extends RecentActivity {
  nutritionDays?: NutritionDay[]
  proteinGoal?: number | null
}

export const nutritionLogGapSource: SuggestionSourceFn = async (
  _userId,
  activity,
) => {
  const days = (activity as NutritionActivity).nutritionDays ?? []
  if (days.length < 3) return null // not a nutrition user yet — stay silent
  const now = days.reduce((max, d) => Math.max(max, d.date.getTime()), 0)
  const recent = days.filter((d) => Date.now() - d.date.getTime() <= 14 * MS_PER_DAY)
  if (recent.length < 3) return null
  // Gap: nothing logged in the last 2 full days.
  const daysSinceLast = Math.floor((Date.now() - now) / MS_PER_DAY)
  if (daysSinceLast < 2) return null
  return {
    id: 'nutrition.log-gap',
    severity: 'nudge',
    title: 'Keep the food log going',
    body: `You've been consistent with logging — but nothing in the last ${daysSinceLast} days. One quick log gets the picture back.`,
    placement: 'dashboard',
    primaryAction: { label: 'Log food', href: '/dashboard/nutrition' },
    dismissible: true,
    cooldownDays: 3,
    source: 'nutrition',
    sourceData: { daysSinceLast },
  }
}

const PROTEIN_LOW_RATIO = 0.65

export const proteinLowSource: SuggestionSourceFn = async (
  _userId,
  activity,
) => {
  const a = activity as NutritionActivity
  const goal = a.proteinGoal
  if (!goal || goal <= 0) return null
  const days = (a.nutritionDays ?? []).filter(
    (d) => d.logCount > 0 && Date.now() - d.date.getTime() <= 7 * MS_PER_DAY,
  )
  if (days.length < 3) return null
  const avg = days.reduce((s, d) => s + d.protein, 0) / days.length
  if (avg >= goal * PROTEIN_LOW_RATIO) return null
  return {
    id: 'nutrition.protein-low',
    severity: 'nudge',
    title: 'Protein is trending low',
    body: `You're averaging ${Math.round(avg)}g against a ${Math.round(goal)}g goal this week. One protein-forward meal a day closes most of that gap.`,
    placement: 'dashboard',
    primaryAction: { label: 'Open nutrition', href: '/dashboard/nutrition' },
    dismissible: true,
    cooldownDays: 5,
    source: 'nutrition',
    sourceData: { avgProtein: Math.round(avg), proteinGoal: goal },
  }
}

let initialized = false

export function ensureNutritionSuggestionsRegistered(): void {
  const existing = new Set(listSources().map((s) => s.id))
  if (initialized && existing.has('nutrition.log-gap')) return
  if (!existing.has('nutrition.log-gap')) {
    registerSource('nutrition.log-gap', 'nutrition', nutritionLogGapSource)
  }
  if (!existing.has('nutrition.protein-low')) {
    registerSource('nutrition.protein-low', 'nutrition', proteinLowSource)
  }
  initialized = true
}
