// PRs timeline metric.
//
// Reads the already-persisted UserProgress.exercisePRs (PR #378) and emits a
// chronological list of PR events. One event per non-null (slug, dimension)
// pair. Sorted descending by date so a "what did I just beat?" feed renders
// most-recent-first.
//
// `prevValue` is intentionally null in this pure-from-exercisePRs path:
// exercisePRs only stores the CURRENT max per dimension, not its history,
// so the previous value isn't recoverable without replaying workoutLogs.
// Keeping the field in the public shape leaves the door open for a future
// implementation that does the replay, without breaking consumers.
//
// Pure + injectable: the reader is passed in. The default queries
// UserProgress.exercisePRs via Mongoose. Tests inject a fixture array.

import { registerMetric, resolveMetric } from '../registry'
import type { DataPoint, Metric } from '../types'
import type { IExercisePR, IPRDimension, PRDimensionName } from '../../exercisePRs'

// ── Public types ────────────────────────────────────────────────────────────

export interface PrsTimelineEvent {
  date: Date
  exerciseSlug: string
  exerciseName: string
  type: PRDimensionName // 'maxWeight' | 'maxReps' | 'maxE1RM'
  value: number
  /** Always null when sourced from the persisted exercisePRs alone (no
   *  history is stored there). Field kept for forward compatibility with
   *  a log-replay implementation. */
  prevValue: number | null
}

export type ExercisePRsReader = (userId: string) => Promise<IExercisePR[]>

export interface ComputePrsTimelineArgs {
  userId: string
  limit?: number
  readExercisePRs?: ExercisePRsReader
}

// ── Pure aggregator ─────────────────────────────────────────────────────────

const DIMENSIONS: PRDimensionName[] = ['maxWeight', 'maxReps', 'maxE1RM']

/**
 * Pull the dimension-specific scalar value out of an IPRDimension. For
 * maxE1RM, we prefer the persisted `e1rm` field but fall back to a derived
 * weight × (1 + reps/30) so older records without the field still render.
 */
export function valueForDimension(dim: IPRDimension, type: PRDimensionName): number {
  if (type === 'maxWeight') return dim.weight
  if (type === 'maxReps') return dim.reps
  // maxE1RM
  if (typeof dim.e1rm === 'number' && Number.isFinite(dim.e1rm)) return dim.e1rm
  return dim.weight * (1 + dim.reps / 30)
}

/**
 * Flatten a list of IExercisePR records into PRs timeline events. One event
 * per non-null dimension. Sorted descending by date (most recent first).
 * Stable tie-break: same date → ordered by exerciseSlug then by dimension
 * order [maxWeight, maxReps, maxE1RM].
 */
export function buildPrsTimeline(
  prs: IExercisePR[],
  limit?: number,
): PrsTimelineEvent[] {
  const events: PrsTimelineEvent[] = []
  for (const pr of prs) {
    for (const type of DIMENSIONS) {
      const dim = pr[type] as IPRDimension | null
      if (!dim) continue
      events.push({
        date: new Date(dim.date),
        exerciseSlug: pr.exerciseSlug,
        exerciseName: pr.exerciseName,
        type,
        value: valueForDimension(dim, type),
        prevValue: null,
      })
    }
  }

  events.sort((a, b) => {
    const dt = b.date.getTime() - a.date.getTime()
    if (dt !== 0) return dt
    if (a.exerciseSlug !== b.exerciseSlug) {
      return a.exerciseSlug < b.exerciseSlug ? -1 : 1
    }
    return DIMENSIONS.indexOf(a.type) - DIMENSIONS.indexOf(b.type)
  })

  if (typeof limit === 'number' && limit >= 0) return events.slice(0, limit)
  return events
}

// ── Default reader (Mongoose) ───────────────────────────────────────────────

export const defaultExercisePRsReader: ExercisePRsReader = async (userId) => {
  const UserProgress = (await import('../../../models/UserProgress')).default
  const doc = await UserProgress
    .findOne({ userId }, { exercisePRs: 1 })
    .lean<{ exercisePRs: IExercisePR[] } | null>()
  if (!doc) return []
  return doc.exercisePRs || []
}

// ── Rich public compute ─────────────────────────────────────────────────────

export async function computePrsTimeline(
  args: ComputePrsTimelineArgs,
): Promise<PrsTimelineEvent[]> {
  const reader = args.readExercisePRs ?? defaultExercisePRsReader
  const prs = await reader(args.userId)
  return buildPrsTimeline(prs, args.limit)
}

// ── Platform-shape Metric adapter ───────────────────────────────────────────

/**
 * Adapter. The platform Metric.compute returns DataPoint[]; for a timeline
 * we emit one point per event — t=date, value=value (the dimension scalar),
 * label="{exerciseSlug}:{type}". Tile renderers can group / decorate by the
 * label to produce the event timeline UI.
 */
export const PRS_TIMELINE_METRIC: Metric = {
  id: 'workout.prs-timeline',
  label: 'PRs timeline',
  unit: '',
  domain: 'workout',
  trendDirection: 'up-good',
  compute: async (userId): Promise<DataPoint[]> => {
    if (!userId) return []
    const events = await computePrsTimeline({ userId, limit: 20 })
    return eventsToDataPoints(events)
  },
}

let registered = false
export function ensurePrsTimelineRegistered(): void {
  if (registered && resolveMetric(PRS_TIMELINE_METRIC.id)) return
  if (resolveMetric(PRS_TIMELINE_METRIC.id)) {
    registered = true
    return
  }
  registerMetric(PRS_TIMELINE_METRIC)
  registered = true
}

export function __resetPrsTimelineRegistrationForTest(): void {
  registered = false
}

/** Flatten timeline events to platform DataPoints (for fixtures + future
 *  drilldown tiles). One point per event. */
export function eventsToDataPoints(events: PrsTimelineEvent[]): DataPoint[] {
  return events.map(e => ({
    t: new Date(e.date),
    value: e.value,
    label: `${e.exerciseSlug}:${e.type}`,
  }))
}
