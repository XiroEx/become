// Builds the pure inputs for pickTopNTiles from a user's UserProgress doc
// and the registered metric / suggestion sources. Extracted from the route
// so the dashboard wiring can be unit-tested without MongoDB.

import { listAllMetrics } from '../metrics/registry'
import { runSuggestions } from '../suggestions/engine'
import type {
  AvailableTile,
  ActiveSuggestion,
  PickTopNInput,
} from './rotator'
import type { ITileLastShown, IUserProgress } from '../../models/UserProgress'
import type { Metric } from '../metrics/types'
import type {
  RecentActivity,
  Suggestion,
} from '../suggestions/types'

const MS_PER_DAY = 24 * 60 * 60 * 1000

/**
 * Translate the IUserProgress fields the rotator cares about into the
 * inputs pickTopNTiles wants. Pure — no DB, no clock other than `now`.
 */
export function lastShownMapFromProgress(
  entries: ITileLastShown[] | undefined,
): Record<string, Date | undefined> {
  const out: Record<string, Date | undefined> = {}
  if (!entries) return out
  for (const e of entries) {
    out[e.id] = new Date(e.at)
  }
  return out
}

/**
 * Default available-tile builder. For each registered Metric, emits one
 * AvailableTile with freshness inferred from how recent the metric's data
 * appears to be (defaults to 1 when compute() isn't called here) and a
 * configurable baseline signalStrength. Real callers may override.
 */
export function metricsToAvailableTiles(
  metrics: Metric[],
  opts: { defaultFreshness?: number; defaultSignalStrength?: number } = {},
): AvailableTile[] {
  const freshness = opts.defaultFreshness ?? 1
  const signalStrength = opts.defaultSignalStrength ?? 0.7
  return metrics.map((m) => ({
    tileId: m.id,
    freshness,
    signalStrength,
    // Tag with domain so goal weighting can apply.
    tags: [m.domain],
  }))
}

export function suggestionsToActive(
  suggestions: Suggestion[],
  opts: { defaultFreshness?: number } = {},
): ActiveSuggestion[] {
  const freshness = opts.defaultFreshness ?? 1
  return suggestions.map((s) => ({
    suggestionId: s.id,
    severity: s.severity,
    freshness,
    tags: [s.source],
  }))
}

/**
 * Updates the tileLastShownAt array for the ids we just served. Pure —
 * returns the next array. Caller persists it.
 */
export function updateLastShown(
  existing: ITileLastShown[] | undefined,
  servedIds: string[],
  now: Date,
): ITileLastShown[] {
  const byId = new Map<string, Date>()
  for (const e of existing ?? []) byId.set(e.id, new Date(e.at))
  for (const id of servedIds) byId.set(id, now)
  return Array.from(byId.entries()).map(([id, at]) => ({ id, at }))
}

export interface BuildRotatorInputOptions {
  /** Inject for testing — defaults to listAllMetrics() from the registry. */
  metrics?: Metric[]
  suggestions?: Suggestion[]
  defaultFreshness?: number
  defaultSignalStrength?: number
}

/**
 * Single-call helper that produces the PickTopNInput from a UserProgress doc
 * + already-resolved suggestions. Useful for the API route to keep its body
 * short.
 */
export function buildRotatorInputFromProgress(
  progress: Pick<
    IUserProgress,
    'pinnedTiles' | 'tileLastShownAt'
  > | null,
  suggestions: Suggestion[],
  userGoal: string | undefined,
  now: Date,
  opts: BuildRotatorInputOptions = {},
): PickTopNInput {
  const metrics = opts.metrics ?? listAllMetrics()
  return {
    availableTiles: metricsToAvailableTiles(metrics, opts),
    activeSuggestions: suggestionsToActive(suggestions, opts),
    userGoal,
    lastShownMap: lastShownMapFromProgress(progress?.tileLastShownAt),
    pinnedIds: progress?.pinnedTiles ?? [],
    n: 5,
    now,
  }
}

/** Recent activity sniffing — used by the route to feed the suggestion engine. */
export function recentActivityFromProgress(
  progress: IUserProgress | null,
  now: Date,
): RecentActivity {
  if (!progress) return {}
  const cutoff = now.getTime() - 30 * MS_PER_DAY
  const weightHistory = (progress.weightHistory ?? [])
    .filter((w) => new Date(w.date).getTime() >= cutoff)
    .map((w) => ({ date: new Date(w.date), value: w.weight }))
  const moodHistory = (progress.moodHistory ?? [])
    .filter((m) => new Date(m.date).getTime() >= cutoff)
    .map((m) => ({ date: new Date(m.date), value: m.mood }))
  const workoutLogs = (progress.workoutLogs ?? [])
    .filter((l) => new Date(l.date).getTime() >= cutoff)
    .map((l) => ({
      date: new Date(l.date),
      programId: l.programId,
      exerciseSlugs: l.exercises
        .map((e) => e.exerciseSlug)
        .filter((s): s is string => !!s),
    }))
  return {
    weightHistory,
    moodHistory,
    workoutLogs,
    streak: {
      count: progress.streakDays ?? 0,
      lastLogDate: progress.lastActivityDate
        ? new Date(progress.lastActivityDate)
        : null,
    },
  }
}

// Re-export the engine entrypoint as a convenience for callers that import
// just from this module.
export { runSuggestions }
