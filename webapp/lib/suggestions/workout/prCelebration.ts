// PR-celebration suggestion source.
//
// Surfaces any personal record set within the last 7 days as a positive-tone
// card. Reads the already-persisted UserProgress.exercisePRs (PR #378). The
// platform stores a date per PR dimension (maxWeight / maxReps / maxE1RM)
// rather than a single `lastSetAt`, so a PR's "set at" date is the most recent
// of its dimension dates — the last time anything about that lift improved.
//
// Multiple fresh PRs are batched into one celebratory card so the dashboard
// shows a single "you crushed it" moment, not five.
//
// Pure + injectable: an evaluator over the persisted PRs, a Source with
// id/title/eligible/render backed by an injectable reader, and an engine
// wrapper registered under its own key.

import { registerSource, listSources } from '../registry'
import type { Suggestion, SuggestionSourceFn } from '../types'
import type { IExercisePR } from '../../exercisePRs'

const MS_PER_DAY = 24 * 60 * 60 * 1000
const FRESH_WINDOW_DAYS = 7

// ── Public types ────────────────────────────────────────────────────────────

export interface FreshPR {
  exerciseSlug: string
  exerciseName: string
  /** Most recent dimension date — when this lift last improved. */
  setAt: Date
  daysAgo: number
}

export interface PrCelebrationResult {
  /** Fresh PRs, most-recent first. */
  fresh: FreshPR[]
}

export type ExercisePRsReader = (userId: string) => Promise<IExercisePR[]>

// ── Helpers ─────────────────────────────────────────────────────────────────

export function daysBetween(a: Date, b: Date): number {
  return Math.floor((a.getTime() - b.getTime()) / MS_PER_DAY)
}

/**
 * The date a PR was last set = the most recent of its non-null dimension
 * dates. Returns null when the record has no dimensions.
 */
export function prSetAtDate(pr: IExercisePR): Date | null {
  const dates: number[] = []
  if (pr.maxWeight) dates.push(new Date(pr.maxWeight.date).getTime())
  if (pr.maxReps) dates.push(new Date(pr.maxReps.date).getTime())
  if (pr.maxE1RM) dates.push(new Date(pr.maxE1RM.date).getTime())
  if (dates.length === 0) return null
  return new Date(Math.max(...dates))
}

function titleizeSlug(slug: string): string {
  return slug
    .split(/[-_]/)
    .filter(Boolean)
    .map(p => p.charAt(0).toUpperCase() + p.slice(1))
    .join(' ')
}

// ── Pure evaluator ──────────────────────────────────────────────────────────

/**
 * Collect PRs set within the last 7 days. Returns null when there are none.
 */
export function evaluatePrCelebration(
  prs: IExercisePR[],
  now: Date,
): PrCelebrationResult | null {
  const fresh: FreshPR[] = []
  for (const pr of prs) {
    const setAt = prSetAtDate(pr)
    if (!setAt) continue
    const daysAgo = daysBetween(now, setAt)
    if (daysAgo < 0 || daysAgo > FRESH_WINDOW_DAYS) continue
    fresh.push({
      exerciseSlug: pr.exerciseSlug,
      exerciseName: pr.exerciseName || titleizeSlug(pr.exerciseSlug),
      setAt,
      daysAgo,
    })
  }
  if (fresh.length === 0) return null
  fresh.sort((a, b) => b.setAt.getTime() - a.setAt.getTime())
  return { fresh }
}

// ── Suggestion shaping ──────────────────────────────────────────────────────

export function celebrationToSuggestion(r: PrCelebrationResult): Suggestion {
  const names = r.fresh.map(f => f.exerciseName)
  const list =
    names.length === 1
      ? names[0]
      : names.length === 2
        ? `${names[0]} and ${names[1]}`
        : `${names.slice(0, -1).join(', ')}, and ${names[names.length - 1]}`
  const title =
    names.length === 1
      ? `New ${names[0]} PR! 🎉`
      : `${names.length} new PRs this week! 🎉`
  const body =
    names.length === 1
      ? `You set a new personal record on ${names[0]}. That's the work paying off — keep it rolling.`
      : `You set new personal records on ${list}. Huge week — momentum is on your side.`
  return {
    id: 'workout.pr-celebration',
    severity: 'celebration',
    title,
    body,
    primaryAction: {
      label: 'See your PRs',
      href: '/dashboard/progress#records',
    },
    dismissible: true,
    cooldownDays: 7,
    source: 'workout',
    sourceData: {
      exercises: r.fresh.map(f => f.exerciseSlug),
      count: r.fresh.length,
    },
  }
}

// ── WorkoutSuggestionSource (id / title / eligible / render) ─────────────────

export interface PrCelebrationSourceArgs {
  userId: string
  now?: Date
}

export interface PrCelebrationSource {
  id: string
  title: string
  eligible(args: PrCelebrationSourceArgs): Promise<boolean>
  render(args: PrCelebrationSourceArgs): Promise<Suggestion | null>
}

export function makePrCelebrationSource(
  readExercisePRs: ExercisePRsReader,
): PrCelebrationSource {
  return {
    id: 'workout.pr-celebration',
    title: 'PR celebration',
    async eligible({ userId, now }) {
      const clock = now ?? new Date()
      const prs = await readExercisePRs(userId)
      return evaluatePrCelebration(prs, clock) != null
    },
    async render({ userId, now }) {
      const clock = now ?? new Date()
      const prs = await readExercisePRs(userId)
      const result = evaluatePrCelebration(prs, clock)
      return result ? celebrationToSuggestion(result) : null
    },
  }
}

// ── Default Mongoose reader ───────────────────────────────────────────────────

export const defaultExercisePRsReader: ExercisePRsReader = async (userId) => {
  const UserProgress = (await import('../../../models/UserProgress')).default
  const doc = await UserProgress
    .findOne({ userId }, { exercisePRs: 1 })
    .lean<{ exercisePRs: IExercisePR[] } | null>()
  if (!doc) return []
  return doc.exercisePRs || []
}

// ── Engine registration ──────────────────────────────────────────────────────

/**
 * Engine wrapper. Reads an optional `exercisePRsForCelebration` extension off
 * the activity bundle; absent that it returns null (injected-data-only,
 * symmetric with the other precise wrappers — no extra DB read per request).
 * The default Mongoose reader is still available via the Source for a
 * dedicated server path. Registered under a distinct key.
 */
export const prCelebrationEngineSource: SuggestionSourceFn = async (
  _userId,
  activity,
) => {
  const injected = (activity as { exercisePRsForCelebration?: IExercisePR[] })
    .exercisePRsForCelebration
  if (!injected) return null
  const result = evaluatePrCelebration(injected, new Date())
  return result ? celebrationToSuggestion(result) : null
}

const ENGINE_KEY = 'workout.pr-celebration-dp'

let registered = false
export function ensurePrCelebrationRegistered(): void {
  const existing = new Set(listSources().map(s => s.id))
  if (registered && existing.has(ENGINE_KEY)) return
  if (!existing.has(ENGINE_KEY)) {
    registerSource(ENGINE_KEY, 'workout', prCelebrationEngineSource)
  }
  registered = true
}

export function __resetPrCelebrationRegistrationForTest(): void {
  registered = false
}

/** Default-wired Source for app use. */
export const prCelebrationSource = makePrCelebrationSource(defaultExercisePRsReader)
