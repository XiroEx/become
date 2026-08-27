// A logged duration is always stored (and sent to the API) in seconds — that
// contract runs deep, through saveWorkout, exercise history, and PRs. But
// typing "900" for a 15-minute treadmill walk is the kind of thing that makes
// a member distrust the whole log. This module is the one place that
// converts between the canonical seconds value and whatever unit the member
// is currently viewing it in, so the two logging surfaces (Live workout,
// Track view) can offer a sec/min toggle without either of them growing its
// own rounding rules.

import { normalizeTracking } from './tracking'

export type DurationUnit = 'sec' | 'min'

/**
 * The unit a duration input should open in, based on how the exercise is
 * tracked. Cardio machines logged as time + distance are prescribed in
 * minutes almost everywhere else in the app (see quickSession/generate.ts —
 * "10 min", never "600 sec"), so defaulting those to minutes matches what a
 * member already expects; a held stretch or a HIIT interval is short enough
 * that seconds stays the sane default.
 */
export function defaultDurationUnit(trackingType?: string | null): DurationUnit {
  return normalizeTracking(trackingType) === 'time_distance' ? 'min' : 'sec'
}

/** Round to 2 decimal places and drop a trailing ".00"/".50" → "0"/"0.5". */
function trimNumber(n: number): string {
  return Number(n.toFixed(2)).toString()
}

/** Canonical seconds (string, as stored) → a display string in `unit`. */
export function secondsToUnitDisplay(seconds: string | number | null | undefined, unit: DurationUnit): string {
  if (seconds === '' || seconds === null || seconds === undefined) return ''
  const n = typeof seconds === 'number' ? seconds : parseFloat(seconds)
  if (!Number.isFinite(n)) return ''
  return unit === 'sec' ? trimNumber(n) : trimNumber(n / 60)
}

/** A value typed in `unit` → canonical seconds (string, ready to store). */
export function unitDisplayToSeconds(value: string, unit: DurationUnit): string {
  if (value.trim() === '') return ''
  const n = parseFloat(value)
  if (!Number.isFinite(n)) return ''
  return unit === 'sec' ? trimNumber(n) : trimNumber(n * 60)
}

/**
 * Stairmaster/stair-climber machines measure floors climbed, not meters
 * travelled — "Distance (m)" on a member's own "Stairmaster" custom exercise
 * (created as time_distance, same as a treadmill) reads as nonsense. There's
 * no equipment tag reliably set on member-created exercises (the create
 * sheets never ask for one), so the name is the only signal every surface
 * already has in hand.
 */
export function isFloorsExercise(name?: string | null): boolean {
  return !!name && /stair/i.test(name)
}
