/**
 * What the dashboard's Goal tile says.
 *
 * Pure so it can be tested. The tile used to show `currentWeek / totalWeeks`
 * of the current program under the caption "Annual goal" — a real number
 * wearing the wrong name, and the same 25% the Current Program card already
 * showed. Members set a goal, a target weight and a starting weight at
 * onboarding; this reads those and says something true:
 *
 *   • target weight + a logged weight → "3 lbs to go", bar from start → target
 *   • at target                        → "On target"
 *   • no target, but a program         → program completion, named as such
 *   • nothing at all                   → "Set a goal", linking to Settings
 */

import type { FitnessGoal } from '@/models/User'

export type WeightUnit = 'lbs' | 'kg'
export type NutritionDirection = 'lose' | 'maintain' | 'gain'

export interface GoalTileInputs {
  fitnessGoal?: FitnessGoal | string | null
  nutritionDirection?: NutritionDirection | string | null
  targetWeightKg?: number | null
  /** Weight recorded at onboarding — the "where you started" end of the bar. */
  startWeightKg?: number | null
  /** Latest logged weight, ALREADY in `weightUnit`. */
  latestWeight?: number | null
  /** Oldest logged weight in the chart window, in `weightUnit` (start fallback). */
  earliestWeight?: number | null
  weightUnit: WeightUnit
  /** The plan behind the goal (lib/goals): chosen pace and where you stand against it. */
  pace?: { status: string; eta: string; behindByKg: number } | null
  program?: {
    name: string
    completedWorkouts?: number | null
    totalWorkouts?: number | null
    currentWeek: number
    totalWeeks: number
    programId: string
  } | null
}

export interface GoalTileView {
  kind: 'weight' | 'program' | 'unset'
  /** Small caption above the value, e.g. "Goal · Build muscle". */
  label: string
  /** The big number/phrase, e.g. "3 lbs to go". */
  value: string
  /** Caption under the bar, e.g. "208 → 205 lbs". */
  footer: string
  /** 0–100 for the bar. */
  pct: number
  /** Where tapping the tile goes. */
  href: string
  /** Direction the weight needs to move to reach the target. */
  direction: 'down' | 'up' | 'hold' | null
  /** True when the member is within the hold band of their target. */
  atTarget: boolean
}

const KG_PER_LB = 0.45359237

export const GOAL_LABELS: Record<string, string> = {
  lose_weight: 'Lose weight',
  gain_muscle: 'Build muscle',
  maintain: 'Maintain',
  improve_performance: 'Perform',
  general_health: 'General health',
}

export function goalLabel(goal: string | null | undefined): string | null {
  if (!goal) return null
  return GOAL_LABELS[goal] ?? null
}

export function kgToUnit(kg: number, unit: WeightUnit): number {
  return unit === 'kg' ? kg : kg / KG_PER_LB
}

/** "3 lbs", "0.6 kg", "12 lbs" — one decimal only when it carries meaning. */
export function formatWeightDelta(amount: number, unit: WeightUnit): string {
  const abs = Math.abs(amount)
  const text = abs < 10 && Math.round(abs * 10) % 10 !== 0 ? abs.toFixed(1) : String(Math.round(abs))
  return `${text} ${unit}`
}

/** Whole numbers for lbs, one decimal for kg (matches how members read them). */
export function formatWeight(amount: number, unit: WeightUnit): string {
  return unit === 'kg' ? (Math.round(amount * 10) / 10).toString() : String(Math.round(amount))
}

/**
 * How close is "at target": 2 lbs / 1 kg. Below that we say "On target"
 * rather than "0.6 lbs to go", which is noise, not a goal.
 */
export function holdBand(unit: WeightUnit): number {
  return unit === 'kg' ? 1 : 2
}

export function describeGoal(input: GoalTileInputs): GoalTileView {
  const unit = input.weightUnit
  const name = goalLabel(input.fitnessGoal)
  const label = name ? `Goal · ${name}` : 'Goal'
  const target = input.targetWeightKg && input.targetWeightKg > 0 ? kgToUnit(input.targetWeightKg, unit) : null
  const latest = input.latestWeight != null && input.latestWeight > 0 ? input.latestWeight : null

  if (target != null && latest != null) {
    const diff = latest - target // +ve = above target
    const band = holdBand(unit)
    const atTarget = Math.abs(diff) <= band

    // Which way the weight needs to move. Read from the numbers, not the goal
    // name: "build muscle" with a target BELOW today's weight is a recomp, and
    // the honest instruction is still "down".
    const direction: GoalTileView['direction'] = atTarget ? 'hold' : diff > 0 ? 'down' : 'up'

    // Bar: how far from the starting weight to the target. Start is the weight
    // recorded at onboarding when we have it, else the oldest weigh-in in the
    // window. If the "start" is already on the target side of today's weight
    // (they drifted the wrong way), the bar honestly reads 0.
    const startCandidate = input.startWeightKg && input.startWeightKg > 0
      ? kgToUnit(input.startWeightKg, unit)
      : input.earliestWeight ?? null
    let pct = 0
    if (atTarget) pct = 100
    else if (startCandidate != null) {
      const total = startCandidate - target
      const done = startCandidate - latest
      pct = total !== 0 && Math.sign(total) === Math.sign(done)
        ? Math.max(0, Math.min(100, Math.round((done / total) * 100)))
        : 0
    }

    // Footer: the target, and where you stand against the plan when we know it —
    // "→ 205 lbs · ~3 wks" / "→ 205 lbs · 1.5 lbs behind". Without a pace read,
    // the plain "208 → 205 lbs".
    const p = input.pace
    let footer: string
    if (atTarget) footer = `Holding ${formatWeight(target, unit)} ${unit}`
    else if (p && p.status === 'behind' && p.behindByKg > 0) footer = `→ ${formatWeight(target, unit)} ${unit} · ${formatWeightDelta(kgToUnit(p.behindByKg, unit), unit)} behind`
    else if (p && (p.status === 'on' || p.status === 'ahead') && p.eta) footer = `→ ${formatWeight(target, unit)} ${unit} · ${p.eta}${p.status === 'ahead' ? ' · ahead' : ''}`
    else footer = `${formatWeight(latest, unit)} → ${formatWeight(target, unit)} ${unit}`
    return {
      kind: 'weight',
      label,
      value: atTarget ? 'On target' : `${formatWeightDelta(diff, unit)} to go`,
      footer,
      pct,
      // The plan behind the goal: target weight, pace and ETA live here.
      href: '/dashboard/nutrition/goals',
      direction,
      atTarget,
    }
  }

  if (target != null && latest == null) {
    // A target but no weigh-in yet — the tile can still say what the goal IS.
    return {
      kind: 'weight',
      label,
      value: `${formatWeight(target, unit)} ${unit}`,
      footer: 'Log a weigh-in to track it',
      pct: 0,
      href: '/dashboard/progress',  // no weigh-in yet → go and log one
      direction: null,
      atTarget: false,
    }
  }

  const p = input.program
  if (p) {
    const pct = p.totalWorkouts && p.totalWorkouts > 0 && p.completedWorkouts != null
      ? Math.min(100, Math.round((p.completedWorkouts / p.totalWorkouts) * 100))
      : Math.min(100, Math.round((p.currentWeek / (p.totalWeeks || 1)) * 100))
    return {
      kind: 'program',
      label,
      value: `${pct}%`,
      footer: p.name,
      pct,
      href: `/dashboard/workout/${p.programId}`,
      direction: null,
      atTarget: false,
    }
  }

  return {
    kind: 'unset',
    label,
    value: 'Set a goal',
    footer: 'Add a target weight in Settings',
    pct: 0,
    href: '/dashboard/settings',
    direction: null,
    atTarget: false,
  }
}
