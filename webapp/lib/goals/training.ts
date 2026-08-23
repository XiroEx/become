/**
 * Training progress: consistency (days per week actual vs target) and strength
 * (PR baseline at goal start vs now, optional targets). Pure.
 */

import { weekKeyOf, shiftDay } from '@/lib/streaks/pillars'
import {
  PLAUSIBLE_E1RM_MAX,
  buildStrengthTarget,
  isTargetReached,
  type LiftHistoryPoint,
  type StrengthTarget,
} from '@/lib/strength/targets'

export interface PRSnapshot { slug: string; name: string; e1RM: number; weight?: number; reps?: number }

export interface LiftProgress {
  slug: string
  name: string
  then: number
  now: number
  delta: number
  pct: number
  target?: number
  /** 0–100 toward target from baseline; null without a target. */
  toTargetPct: number | null
  remaining?: number
  /**
   * True once `now` has caught the target. Previously there was no such flag,
   * so a beaten target kept rendering as though it were still ahead — a member
   * whose leg press had gone 547 → 1020 was still shown "→ 575".
   */
  reached?: boolean
}

/** Average completed workouts per week over the last N COMPLETE weeks (this week excluded). */
export function avgWorkoutsPerWeek(workoutDays: Iterable<string>, todayKey: string, weeks = 4): { avg: number; weeks: number; counts: number[] } {
  const counts = new Map<string, number>()
  for (const k of workoutDays) { const wk = weekKeyOf(k); counts.set(wk, (counts.get(wk) ?? 0) + 1) }
  const thisWeek = weekKeyOf(todayKey)
  const out: number[] = []
  for (let i = 1; i <= weeks; i++) out.push(counts.get(shiftDay(thisWeek, -7 * i)) ?? 0)
  const avg = out.length ? out.reduce((s, n) => s + n, 0) / out.length : 0
  return { avg: Math.round(avg * 10) / 10, weeks: out.length, counts: out }
}

/**
 * Re-exported from the strength-target model, which owns it. Kept exported
 * here because callers across the goal layer already import it from this path.
 */
export { PLAUSIBLE_E1RM_MAX }

/** Top N lifts by e1RM from a PR list (implausible entries excluded). */
export function topLifts(prs: PRSnapshot[], n = 3): PRSnapshot[] {
  return [...prs].filter(p => p.e1RM > 0 && p.e1RM <= PLAUSIBLE_E1RM_MAX).sort((a, b) => b.e1RM - a.e1RM).slice(0, n)
}

export interface SuggestLiftTargetsOptions {
  /** Per-lift session history, keyed by slug — drives the per-lift gain rate. */
  historyBySlug?: Map<string, LiftHistoryPoint[]>
  unit?: 'lbs' | 'kg'
  now?: Date
  n?: number
}

/**
 * Suggested strength targets.
 *
 * Was a flat +5% on the top three lifts. That treated a four-week-old bench
 * and a decade-old deadlift as the same problem, and — because it was computed
 * from a baseline captured when the goal was created and then frozen — it
 * routinely displayed targets the member had already beaten. Both are fixed in
 * `lib/strength/targets`: the rate now comes from each lift's own logged
 * history, and the number is always built from where the member is today.
 *
 * Without history this still works; it just assumes the early fast-gain phase
 * and says so in the explanation.
 */
export function suggestLiftTargets(
  prs: PRSnapshot[],
  opts: SuggestLiftTargetsOptions = {},
): StrengthTarget[] {
  const { historyBySlug, unit = 'lbs', now = new Date(), n = 3 } = opts
  return topLifts(prs, n)
    .map(p =>
      buildStrengthTarget({
        slug: p.slug,
        name: p.name,
        currentE1RM: p.e1RM,
        history: historyBySlug?.get(p.slug) ?? [],
        unit,
        now,
      })
    )
    .filter((t): t is StrengthTarget => t !== null)
}

/**
 * Compare a baseline PR snapshot to the current PRs. Lifts with a target come
 * first, then the biggest movers.
 */
export function liftProgress(
  baseline: PRSnapshot[],
  current: PRSnapshot[],
  targets: Array<{ slug: string; baselineE1RM: number; targetE1RM: number }> = [],
  limit = 5,
): LiftProgress[] {
  const nowBy = new Map(current.map(p => [p.slug, p]))
  const tBy = new Map(targets.map(t => [t.slug, t]))
  const rows: LiftProgress[] = []
  const seen = new Set<string>()
  const push = (slug: string, name: string, then: number) => {
    if (seen.has(slug)) return
    seen.add(slug)
    const now = nowBy.get(slug)?.e1RM ?? then
    const t = tBy.get(slug)
    const delta = now - then
    const pct = then > 0 ? Math.round((delta / then) * 100) : 0
    let toTargetPct: number | null = null
    let remaining: number | undefined
    if (t) {
      const span = t.targetE1RM - t.baselineE1RM
      toTargetPct = span > 0 ? Math.max(0, Math.min(100, Math.round(((now - t.baselineE1RM) / span) * 100))) : 100
      remaining = Math.max(0, Math.round(t.targetE1RM - now))
    }
    rows.push({
      slug,
      name,
      then: Math.round(then),
      now: Math.round(now),
      delta: Math.round(delta),
      pct,
      target: t?.targetE1RM,
      toTargetPct,
      remaining,
      reached: t ? isTargetReached(now, t.targetE1RM) : undefined,
    })
  }
  for (const t of targets) {
    const b = baseline.find(p => p.slug === t.slug) ?? current.find(p => p.slug === t.slug)
    push(t.slug, b?.name ?? nowBy.get(t.slug)?.name ?? t.slug, t.baselineE1RM)
  }
  const movers = baseline
    .map(b => ({ b, now: nowBy.get(b.slug)?.e1RM ?? b.e1RM }))
    .sort((x, y) => (y.now - y.b.e1RM) - (x.now - x.b.e1RM))
  for (const { b } of movers) { if (rows.length >= limit) break; push(b.slug, b.name, b.e1RM) }
  return rows.slice(0, limit)
}
