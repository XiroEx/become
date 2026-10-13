/**
 * Bridge between stored progress documents and the pure target model.
 *
 * `lib/strength/targets.ts` deliberately knows nothing about Mongo shapes. This
 * is the one place that reads a UserProgress document and produces the inputs
 * that model wants, so the goals API and the Becoming screen cannot drift into
 * suggesting different targets for the same member — which they would, because
 * they used to call two different code paths.
 */

import { aggregateStrengthCurve, type RawSet, type RawWorkoutLog } from '@/lib/metrics/workout/strengthCurve'
import { topLifts, type PRSnapshot } from '@/lib/goals/training'
import { buildStrengthTarget, type LiftHistoryPoint, type StrengthTarget } from '@/lib/strength/targets'

export interface ProgressLogShape {
  date: Date | string
  completed?: boolean
  exercises?: Array<{ exerciseSlug?: string | null; sets?: RawSet[] | null }> | null
}

/** Normalize stored logs into the shape `aggregateStrengthCurve` expects. */
export function toCurveLogs(logs: ProgressLogShape[] | undefined | null): RawWorkoutLog[] {
  return (logs ?? []).map(l => ({
    date: new Date(l.date),
    completed: l.completed,
    exercises: (l.exercises ?? []).map(e => ({
      exerciseSlug: e.exerciseSlug,
      sets: e.sets ?? [],
    })),
  }))
}

/**
 * Best-set-per-session history for each requested slug.
 *
 * One pass per slug. That is fine at the sizes involved (a handful of lifts on
 * screen against one member's logs) and keeps this readable; if it ever needs
 * to cover the whole catalogue at once, invert it into a single pass.
 */
export function buildLiftHistories(
  logs: ProgressLogShape[] | undefined | null,
  slugs: Iterable<string>,
): Map<string, LiftHistoryPoint[]> {
  const curveLogs = toCurveLogs(logs)
  const out = new Map<string, LiftHistoryPoint[]>()
  for (const slug of slugs) {
    if (!slug) continue
    if (out.has(slug)) continue
    out.set(slug, aggregateStrengthCurve(curveLogs, slug).map(p => ({ t: p.t, e1RM: p.e1RM })))
  }
  return out
}

export interface SuggestFromProgressArgs {
  prs: PRSnapshot[]
  logs: ProgressLogShape[] | undefined | null
  unit: 'lbs' | 'kg'
  now?: Date
  n?: number
}

/**
 * The suggestion path used by both the goals API and the Becoming screen:
 * take the member's strongest lifts, read each one's own history, and build a
 * target whose rate matches how that lift is actually moving.
 */
export function suggestTargetsFromProgress(args: SuggestFromProgressArgs): StrengthTarget[] {
  const { prs, logs, unit, now = new Date(), n = 3 } = args
  const top = topLifts(prs, n)
  const histories = buildLiftHistories(logs, top.map(t => t.slug))
  return top
    .map(p =>
      buildStrengthTarget({
        slug: p.slug,
        name: p.name,
        currentE1RM: p.e1RM,
        history: histories.get(p.slug) ?? [],
        unit,
        now,
      })
    )
    .filter((t): t is StrengthTarget => t !== null)
}

/** The four fields the Goal document stores. Drops the reasoning metadata. */
export function toStoredLift(t: StrengthTarget): { slug: string; name: string; baselineE1RM: number; targetE1RM: number } {
  return { slug: t.slug, name: t.name, baselineE1RM: t.baselineE1RM, targetE1RM: t.targetE1RM }
}
