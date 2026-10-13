/**
 * Current-program week/phase math for the Home dashboard card
 * (DashboardClient.tsx) and, through the API, the native equivalent
 * (expo/components/dashboard/CurrentProgramCard.tsx).
 *
 * NP-377: GET /api/progress built `currentWeek` from the schedule (or,
 * lacking one, from `completedWorkouts / 4`) completely independently of
 * `totalWeeks` (the program's `duration_weeks`) and `currentPhase` (a
 * separately-stored counter that can fall behind). Nothing clamped the week
 * to the program's length or re-derived the phase from it, so a member who
 * logged a few extra sessions read "Phase 1 • Week 5 of 4" — a week number
 * past the program's own total, under a phase that disagreed with it.
 *
 * Pure so the four shapes (mid-phase, phase boundary, last week, past the
 * end) are cheap to test without a database. Web is the source of truth;
 * native renders the same numbers the API returns, so fixing them here fixes
 * both surfaces.
 */

/** A program phase's own week span, e.g. `{ weeks: '1-4' }` or `{ weeks: '5' }`. */
export interface ProgramPhaseWeeksLike {
  weeks?: string
}

/** Parse a phase's `weeks` range ("1-4") into how many weeks it spans. Mirrors
 *  lib/schedule.ts's parsePhaseWeeks (kept local so this module has no
 *  dependency beyond its own inputs). */
export function parsePhaseWeekSpan(weeksStr: string | undefined): number {
  const str = weeksStr || '1'
  const range = str.match(/(\d+)\s*[-–]\s*(\d+)/)
  if (range) return Math.max(1, parseInt(range[2], 10) - parseInt(range[1], 10) + 1)
  return 1
}

export interface ResolveRawCurrentWeekInput {
  /** Reconciled from the Schedule doc (completed sessions ÷ program days/week) — the richer, preferred signal. */
  scheduleCurrentWeek?: number | null
  /** Legacy fallback when there is no schedule: the activePrograms completedWorkouts counter, assuming 4 sessions/week. */
  completedWorkouts?: number | null
}

/**
 * The program week BEFORE clamping to the program's length — from the
 * schedule when one exists, else the coarser completedWorkouts/4 guess.
 * Kept separate from `alignProgramWeek` so "schedule-derived" and
 * "completion-derived" inputs are each a one-line test.
 */
export function resolveRawCurrentWeek(input: ResolveRawCurrentWeekInput): number {
  if (input.scheduleCurrentWeek != null) return Math.max(1, Math.floor(input.scheduleCurrentWeek))
  if (input.completedWorkouts) return Math.max(1, Math.ceil(input.completedWorkouts / 4))
  return 1
}

export interface AlignProgramWeekInput {
  /** The not-yet-clamped week-in-program number (see resolveRawCurrentWeek). */
  rawWeek: number
  /** The program's total length in weeks (duration_weeks). Undefined when the program record is unavailable. */
  totalWeeks?: number | null
  /** The program's phases, in order — each phase's `weeks` range decides which phase a given week falls in. */
  phases?: ProgramPhaseWeeksLike[] | null
  /** Used only when `phases` is unavailable (phase can't be derived from the week). */
  fallbackPhase?: number | null
}

export interface AlignedProgramWeek {
  /** Never exceeds totalWeeks when totalWeeks is known. */
  currentWeek: number
  /** The phase currentWeek falls in, per the program's own phase/week ranges — always agrees with currentWeek. */
  currentPhase: number
  /** True when the raw (pre-clamp) week ran past the program's last week. */
  isPastEnd: boolean
}

/**
 * Clamp the raw week to the program's length and derive the phase that
 * clamped week actually falls in, so "Phase N" and "Week W of T" can never
 * disagree, and a program run past its last week reads as its LAST week
 * ("Week T of T") rather than counting past the end.
 */
export function alignProgramWeek(input: AlignProgramWeekInput): AlignedProgramWeek {
  const rawWeek = Math.max(1, Math.floor(input.rawWeek) || 1)
  const totalWeeks = input.totalWeeks && input.totalWeeks > 0 ? input.totalWeeks : undefined
  const isPastEnd = totalWeeks != null && rawWeek > totalWeeks
  const currentWeek = totalWeeks != null ? Math.min(rawWeek, totalWeeks) : rawWeek

  let currentPhase = input.fallbackPhase && input.fallbackPhase > 0 ? input.fallbackPhase : 1
  if (input.phases && input.phases.length > 0) {
    let cursor = 0
    let matched = false
    for (let i = 0; i < input.phases.length; i++) {
      cursor += parsePhaseWeekSpan(input.phases[i].weeks)
      if (currentWeek <= cursor) {
        currentPhase = i + 1
        matched = true
        break
      }
    }
    // currentWeek ran past every phase's own span (phase weeks don't add up to
    // totalWeeks, or totalWeeks is unknown) — the last phase is still the most
    // honest answer.
    if (!matched) currentPhase = input.phases.length
  }

  return { currentWeek, currentPhase, isPastEnd }
}
