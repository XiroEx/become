/**
 * Pace, ETA and on-pace arithmetic for the nutrition weight goal. Pure.
 *
 * Everything is in kg internally; callers convert for display. "Pace" is a
 * CHOSEN rate (0.5 / 1 / 1.5 lb a week), not a computed one — a computed pace
 * from history reads as a verdict, and this is meant to be a plan.
 */

export type Direction = 'lose' | 'maintain' | 'gain'
export type PaceStatus = 'ahead' | 'on' | 'behind' | 'done' | 'na'

export const KG_PER_LB = 0.45359237
export const WEEK_MS = 7 * 86_400_000

/** The three pace choices, in the member's unit. */
export const PACE_OPTIONS_LB = [0.5, 1, 1.5]
export const PACE_OPTIONS_KG = [0.25, 0.5, 0.75]

/** How far from the target still reads as "on target" (maintain band + weight goal finish line). */
export const HOLD_BAND_KG = 0.9 // ≈ 2 lb

/** How far behind the plan reads as "behind" rather than noise. */
export const PACE_TOLERANCE_KG = 0.45 // ≈ 1 lb

export function defaultPaceKg(direction: Direction | null | undefined): number {
  if (direction === 'lose') return 1 * KG_PER_LB
  if (direction === 'gain') return 0.5 * KG_PER_LB
  return 0
}

/**
 * The direction a target weight implies, from where the member stands today.
 * The one place this comparison happens, so target weight and calorie
 * direction are read from the same two numbers everywhere they're compared —
 * onboarding's default, the reconciliation warning, and the Goal's own
 * fallback (lib/goals/ensure.ts) all call this instead of each rolling their
 * own band check.
 */
export function directionFromWeights(
  currentKg?: number | null,
  targetKg?: number | null,
): Direction | null {
  if (!currentKg || !targetKg) return null
  const diff = targetKg - currentKg
  if (Math.abs(diff) <= HOLD_BAND_KG) return 'maintain'
  return diff < 0 ? 'lose' : 'gain'
}

/** Clamp a chosen pace to something sane (0.1–1.5 kg/wk ≈ 0.2–3.3 lb/wk). */
export function clampPaceKg(pace: number): number {
  if (!Number.isFinite(pace) || pace <= 0) return 0
  return Math.max(0.1, Math.min(1.5, pace))
}

/** Weeks to reach the target at the chosen pace; null when there is no pace or already there. */
export function etaWeeks(latestKg: number, targetKg: number, paceKg: number): number | null {
  if (!(paceKg > 0)) return null
  const remaining = Math.abs(latestKg - targetKg)
  if (remaining <= HOLD_BAND_KG) return 0
  return remaining / paceKg
}

export function etaDate(now: Date, weeks: number): Date {
  return new Date(now.getTime() + weeks * WEEK_MS)
}

/** "~3 wks", "~5 days", "this week", "" */
export function formatEta(weeks: number | null): string {
  if (weeks == null) return ''
  if (weeks <= 0) return 'there'
  if (weeks < 1) {
    const days = Math.max(1, Math.round(weeks * 7))
    return days <= 2 ? 'this week' : `~${days} days`
  }
  const w = Math.round(weeks)
  return `~${w} wk${w === 1 ? '' : 's'}`
}

export interface PaceInput {
  baselineKg: number
  baselineDate: Date
  latestKg: number
  latestDate?: Date
  targetKg: number
  paceKg: number
  direction: Direction
  now: Date
}

export interface PaceRead {
  status: PaceStatus
  /** Where the plan says you should be today (kg). */
  expectedKg: number | null
  /** actual − expected, signed in the goal's direction: negative = behind. */
  aheadByKg: number
  /** Positive when behind. */
  behindByKg: number
  etaWeeks: number | null
  /** kg still to go (0 when inside the band). */
  remainingKg: number
}

/**
 * Compare today's weight to the plan line from baseline to target at the
 * chosen pace. Reads 'done' inside the finish band, 'ahead'/'on'/'behind'
 * otherwise, 'na' for maintain or when there is nothing to compare.
 */
export function paceRead(input: PaceInput): PaceRead {
  const { baselineKg, baselineDate, latestKg, targetKg, paceKg, direction, now } = input
  const remainingRaw = Math.abs(latestKg - targetKg)
  const remainingKg = remainingRaw <= HOLD_BAND_KG ? 0 : remainingRaw
  const eta = etaWeeks(latestKg, targetKg, paceKg)

  if (direction === 'maintain' || !(paceKg > 0)) {
    return { status: 'na', expectedKg: null, aheadByKg: 0, behindByKg: 0, etaWeeks: null, remainingKg }
  }
  if (remainingKg === 0) {
    return { status: 'done', expectedKg: targetKg, aheadByKg: 0, behindByKg: 0, etaWeeks: 0, remainingKg: 0 }
  }
  const sign = direction === 'lose' ? -1 : 1
  const weeks = Math.max(0, (now.getTime() - baselineDate.getTime()) / WEEK_MS)
  // The plan line, capped at the target.
  let expected = baselineKg + sign * paceKg * weeks
  if (sign < 0) expected = Math.max(expected, targetKg)
  else expected = Math.min(expected, targetKg)
  // Positive = ahead of plan in the goal's direction.
  const aheadBy = sign * (latestKg - expected)
  const status: PaceStatus = aheadBy >= PACE_TOLERANCE_KG ? 'ahead' : aheadBy <= -PACE_TOLERANCE_KG ? 'behind' : 'on'
  return {
    status,
    expectedKg: expected,
    aheadByKg: aheadBy,
    behindByKg: aheadBy < 0 ? -aheadBy : 0,
    etaWeeks: eta,
    remainingKg,
  }
}

/** Reached: inside the finish band (weight goal) or inside the hold band (maintain). */
export function isAchieved(latestKg: number, targetKg: number, bandKg = HOLD_BAND_KG): boolean {
  return Math.abs(latestKg - targetKg) <= bandKg
}

export function kgToUnit(kg: number, unit: 'lbs' | 'kg'): number {
  return unit === 'kg' ? kg : kg / KG_PER_LB
}
export function unitToKg(v: number, unit: 'lbs' | 'kg'): number {
  return unit === 'kg' ? v : v * KG_PER_LB
}
/** "1 lb", "0.5 kg" — pace and deltas, one decimal only when needed. */
export function fmtUnit(kg: number, unit: 'lbs' | 'kg'): string {
  const v = kgToUnit(kg, unit)
  const abs = Math.abs(v)
  const s = abs < 10 && Math.round(abs * 10) % 10 !== 0 ? abs.toFixed(1) : String(Math.round(abs))
  return `${s} ${unit === 'kg' ? 'kg' : (Number(s) === 1 ? 'lb' : 'lbs')}`
}
