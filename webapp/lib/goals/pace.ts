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
export const DAY_MS = 86_400_000
export const WEEK_MS = 7 * DAY_MS

/** The three pace choices, in the member's unit. */
export const PACE_OPTIONS_LB = [0.5, 1, 1.5]
export const PACE_OPTIONS_KG = [0.25, 0.5, 0.75]

/** How far from the target still reads as "on target" (maintain band + weight goal finish line). */
export const HOLD_BAND_KG = 0.9 // ≈ 2 lb

/** How far behind the plan reads as "behind" rather than noise. */
export const PACE_TOLERANCE_KG = 0.45 // ≈ 1 lb

/**
 * How far PAST the finish band a weigh-in has to land before a goal that was
 * already marked achieved counts as drifted back out of it.
 *
 * Reaching the target used to be a one-way door: the first week inside the
 * band flipped the goal to 'achieved' and nothing ever flipped it back, so a
 * member who hit 205 and then logged 209 still read "Reached ✓" everywhere.
 * The gap between the band and this line is hysteresis — without it a scale
 * wobbling either side of the band edge would flip the goal open and shut day
 * to day, which is its own kind of wrong.
 */
export const REOPEN_MARGIN_KG = 0.45 // ≈ 1 lb, so ≈ 3 lb outside a 2 lb band

/** How many days back the hold is judged over. Whole days — see utcDayIndex. */
export const HOLD_WINDOW_DAYS = 7

/**
 * Which UTC day a date falls on, as a whole number of days since the epoch.
 *
 * The goal state machine compares weigh-ins against stamps, and the two are
 * NOT the same kind of date. A weigh-in row is DAY-KEYED: `/api/weight` writes
 * `utcMidnightDateKey(localToday)`, so the row sits at 00:00Z of the member's
 * local calendar day and denotes a DAY, not an instant (lib/dayWindow.ts says
 * this out loud, and the same file documents what happens when day-keyed rows
 * are read back through instant machinery: they shift a day). `achievedAt` and
 * `now`, by contrast, are real instants — whatever moment ensureGoals happened
 * to run.
 *
 * Comparing the two directly is the day-shift bug in a new place. A member in
 * the US logging at 8pm local produces an instant on the NEXT UTC day while
 * their row is stamped on the current one, so `row > stamp` is false for a
 * weigh-in that plainly came after, and `row >= now - 7d` drops a weigh-in
 * that is plainly inside the week. Bucketing both sides to a UTC day first
 * makes the comparison the one that was always meant: which calendar day did
 * this weigh-in land on, relative to this one.
 */
export function utcDayIndex(d: Date): number {
  return Math.floor(d.getTime() / DAY_MS)
}

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

/**
 * The opposite door: a weigh-in far enough OUTSIDE the band that an achieved
 * goal should re-open. Deliberately not `!isAchieved()` — see REOPEN_MARGIN_KG.
 */
export function hasDriftedOut(latestKg: number, targetKg: number, bandKg = HOLD_BAND_KG): boolean {
  return Math.abs(latestKg - targetKg) > bandKg + REOPEN_MARGIN_KG
}

/**
 * The week-long confirmation that turns a weigh-in inside the band into an
 * achieved goal: every weigh-in in the last 7 days inside the band, and at
 * least two of them, so one fluke reading can't retire a goal early.
 *
 * The window is counted in whole UTC days back from the day `now` falls on,
 * not as an instant minus 7×24h. Weigh-ins are day-keyed (see utcDayIndex), so
 * a rolling instant window quietly changes size with the member's timezone and
 * the hour they happen to open the app: for anyone west of UTC logging in the
 * evening the stamp lands on the next UTC day and their weigh-in from six days
 * ago falls out of "the last seven", leaving one reading where there were two
 * and a goal that never confirms. Whole days, inclusive at both ends.
 */
export function holdConfirmed(
  series: Array<{ kg: number; date: Date }>,
  targetKg: number,
  bandKg: number,
  now: Date,
): boolean {
  const firstDay = utcDayIndex(now) - HOLD_WINDOW_DAYS
  const recent = series.filter(p => utcDayIndex(p.date) >= firstDay)
  return recent.length >= 2 && recent.every(p => isAchieved(p.kg, targetKg, bandKg))
}

/**
 * Has the hold been broken since the goal was marked achieved? Judged over
 * every weigh-in logged AFTER `achievedAt`, not just the most recent one: a
 * member who logs 209 and then 206 against a 205 target is not holding their
 * goal, and reading only the last number would call it held. `achievedAt` of
 * null means "judge the whole series" (a legacy goal with no stamp).
 *
 * "After" is a CALENDAR DAY comparison, not an instant one (see utcDayIndex).
 * `achievedAt` is the moment ensureGoals ran; a weigh-in is a day-keyed row at
 * 00:00Z of the member's local day. Compared as instants, a member west of UTC
 * whose goal was confirmed on a Monday evening — stamp on Tuesday in UTC — has
 * Tuesday's 209 sort BEFORE their own achievement and vanish from this check
 * for good, which is exactly the "it still says reached" this whole rule
 * exists to stop. Weigh-ins from the achievement's own day are included, and
 * that is safe in the direction that matters: holdConfirmed only stamps a goal
 * when every weigh-in in the preceding week was inside the band, so a same-day
 * reading can only re-open the goal if it was later corrected out of it — in
 * which case re-opening is the right answer.
 */
export function driftedSinceAchieved(
  series: Array<{ kg: number; date: Date }>,
  targetKg: number,
  bandKg: number,
  achievedAt: Date | null,
): boolean {
  const sinceDay = achievedAt ? utcDayIndex(achievedAt) : -Infinity
  return series.some(p => utcDayIndex(p.date) >= sinceDay && hasDriftedOut(p.kg, targetKg, bandKg))
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
