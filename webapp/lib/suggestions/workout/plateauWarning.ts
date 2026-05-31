// Plateau-warning suggestion source.
//
// For a tracked lift, fire a warning when BOTH:
//   - neither maxWeight nor maxE1RM has improved in ≥ 28 days (the PR is stale)
//   - the lift was trained ≥ 4 times inside that stale window
// The session-count gate matters: a lift you haven't touched isn't plateaued,
// it's just untrained. A real plateau is "working hard, not moving."
//
// "Date of the PR" is the most recent of the maxWeight / maxE1RM dimension
// dates — i.e. the last time the bar actually moved up. A tied PR (same value
// re-hit on a later date) advances that date, so re-touching your max resets
// the staleness clock.
//
// Pure + injectable: an evaluator over already-shaped inputs, a Source with
// id/title/eligible/render backed by an injectable loader, and an engine
// wrapper registered under its own key.

import { registerSource, listSources } from '../registry'
import type { Suggestion, SuggestionSourceFn } from '../types'
import type { IExercisePR } from '../../exercisePRs'

const MS_PER_DAY = 24 * 60 * 60 * 1000
const STALE_DAYS = 28
const MIN_SESSIONS = 4

// ── Public types ────────────────────────────────────────────────────────────

export interface PlateauInput {
  pr: IExercisePR
  /** Count of completed sessions of this lift inside the stale window. */
  sessionsInWindow: number
  /** Evaluation clock. */
  now: Date
}

export interface PlateauResult {
  exerciseSlug: string
  exerciseName: string
  /** Days since the PR last advanced. */
  daysStale: number
  sessionsInWindow: number
  /** The stale value being plateaued at (max weight). */
  lastWeight: number
}

export type LoadPlateauInputs = (
  userId: string,
  now: Date,
) => Promise<PlateauInput[]>

// ── Helpers ─────────────────────────────────────────────────────────────────

/**
 * The date the PR last advanced = the most recent of the maxWeight / maxE1RM
 * dimension dates. (maxReps is excluded — bodyweight rep PRs aren't "the bar
 * moving up" for a tracked barbell lift.) Returns null when neither exists.
 */
export function prAdvanceDate(pr: IExercisePR): Date | null {
  const dates: number[] = []
  if (pr.maxWeight) dates.push(new Date(pr.maxWeight.date).getTime())
  if (pr.maxE1RM) dates.push(new Date(pr.maxE1RM.date).getTime())
  if (dates.length === 0) return null
  return new Date(Math.max(...dates))
}

export function daysBetween(a: Date, b: Date): number {
  return Math.floor((a.getTime() - b.getTime()) / MS_PER_DAY)
}

// ── Pure evaluator ──────────────────────────────────────────────────────────

/**
 * Returns a plateau result when the PR is stale (≥ 28d) AND the lift has been
 * trained ≥ 4 times in that window; otherwise null.
 */
export function evaluatePlateau(input: PlateauInput): PlateauResult | null {
  const { pr, sessionsInWindow, now } = input
  const advanced = prAdvanceDate(pr)
  if (!advanced) return null

  const daysStale = daysBetween(now, advanced)
  if (daysStale < STALE_DAYS) return null      // fresh PR — no warning
  if (sessionsInWindow < MIN_SESSIONS) return null // not enough volume to call it a plateau

  return {
    exerciseSlug: pr.exerciseSlug,
    exerciseName: pr.exerciseName,
    daysStale,
    sessionsInWindow,
    lastWeight: pr.maxWeight?.weight ?? 0,
  }
}

// ── Suggestion shaping ──────────────────────────────────────────────────────

export function plateauToSuggestion(r: PlateauResult): Suggestion {
  return {
    id: `workout.plateau-warning.${r.exerciseSlug}`,
    severity: 'warning',
    title: `${r.exerciseName} has stalled`,
    body:
      `Your ${r.exerciseName} max hasn't moved in ${r.daysStale} days across ` +
      `${r.sessionsInWindow} sessions. Consider a deload, a rep-range change, or ` +
      `a technique reset to break the plateau.`,
    primaryAction: {
      label: 'Review PRs',
      href: '/dashboard/progress#records',
    },
    dismissible: true,
    cooldownDays: 7,
    source: 'workout',
    sourceData: {
      exerciseSlug: r.exerciseSlug,
      daysStale: r.daysStale,
      sessionsInWindow: r.sessionsInWindow,
      lastWeight: r.lastWeight,
    },
  }
}

// ── WorkoutSuggestionSource (id / title / eligible / render) ─────────────────

export interface PlateauSourceArgs {
  userId: string
  now?: Date
}

export interface PlateauWarningSource {
  id: string
  title: string
  eligible(args: PlateauSourceArgs): Promise<boolean>
  render(args: PlateauSourceArgs): Promise<Suggestion | null>
}

/**
 * Build a plateau-warning Source. eligible() reports whether ANY tracked lift
 * is plateaued; render() returns the suggestion for the most-stale one.
 */
export function makePlateauWarningSource(
  loadInputs: LoadPlateauInputs,
): PlateauWarningSource {
  return {
    id: 'workout.plateau-warning',
    title: 'Plateau warning',
    async eligible({ userId, now }) {
      const clock = now ?? new Date()
      const inputs = await loadInputs(userId, clock)
      return inputs.some(i => evaluatePlateau(i) != null)
    },
    async render({ userId, now }) {
      const clock = now ?? new Date()
      const inputs = await loadInputs(userId, clock)
      const results = inputs
        .map(evaluatePlateau)
        .filter((r): r is PlateauResult => r != null)
      if (results.length === 0) return null
      // Most-stale lift first.
      results.sort((a, b) => b.daysStale - a.daysStale)
      return plateauToSuggestion(results[0])
    },
  }
}

// ── Default Mongoose loader ──────────────────────────────────────────────────

/**
 * Default loader: every persisted PR plus a count of completed sessions of
 * that lift within the stale window.
 */
export const defaultLoadPlateauInputs: LoadPlateauInputs = async (
  userId,
  now,
) => {
  const UserProgress = (await import('../../../models/UserProgress')).default
  const doc = await UserProgress
    .findOne({ userId }, { exercisePRs: 1, workoutLogs: 1 })
    .lean<{
      exercisePRs: IExercisePR[]
      workoutLogs: Array<{
        date: Date
        completed?: boolean
        exercises?: Array<{ exerciseSlug?: string }>
      }>
    } | null>()
  if (!doc) return []

  const windowStart = now.getTime() - STALE_DAYS * MS_PER_DAY
  const countSessions = (slug: string): number => {
    let n = 0
    for (const log of doc.workoutLogs || []) {
      if (log.completed === false) continue
      const t = new Date(log.date).getTime()
      if (t < windowStart || t > now.getTime()) continue
      if ((log.exercises || []).some(e => (e.exerciseSlug || '').toLowerCase() === slug.toLowerCase())) {
        n++
      }
    }
    return n
  }

  return (doc.exercisePRs || []).map(pr => ({
    pr,
    sessionsInWindow: countSessions(pr.exerciseSlug),
    now,
  }))
}

// ── Engine registration ──────────────────────────────────────────────────────

/**
 * Engine wrapper. Reads an optional `plateauInputs` extension off the activity
 * bundle; absent that it returns null (stays silent rather than firing an
 * extra DB read per dashboard request, symmetric with the progression-nudge
 * wrapper). The default Mongoose loader is still available via the Source for
 * a dedicated server path. Registered under a distinct key so it coexists with
 * the coarse activity-level plateau source (engine id-dedup keeps one per
 * exercise).
 */
export const plateauWarningEngineSource: SuggestionSourceFn = async (
  _userId,
  activity,
) => {
  const injected = (activity as { plateauInputs?: PlateauInput[] }).plateauInputs
  if (!injected) return null
  const results = injected
    .map(evaluatePlateau)
    .filter((r): r is PlateauResult => r != null)
  if (results.length === 0) return null
  results.sort((a, b) => b.daysStale - a.daysStale)
  return plateauToSuggestion(results[0])
}

const ENGINE_KEY = 'workout.plateau-warning-dp'

let registered = false
export function ensurePlateauWarningRegistered(): void {
  const existing = new Set(listSources().map(s => s.id))
  if (registered && existing.has(ENGINE_KEY)) return
  if (!existing.has(ENGINE_KEY)) {
    registerSource(ENGINE_KEY, 'workout', plateauWarningEngineSource)
  }
  registered = true
}

export function __resetPlateauWarningRegistrationForTest(): void {
  registered = false
}

/** Default-wired Source for app use. */
export const plateauWarningSource = makePlateauWarningSource(defaultLoadPlateauInputs)
