/**
 * Training progress: consistency (days per week actual vs target) and strength
 * (PR baseline at goal start vs now, optional targets). Pure.
 */

import { weekKeyOf, shiftDay } from '@/lib/streaks/pillars'

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

/** Anything above this is a typo (a 1,939 lb leg extension), not a lift. Kept in history, never suggested. */
export const PLAUSIBLE_E1RM_MAX = 1200

/** Top N lifts by e1RM from a PR list (implausible entries excluded). */
export function topLifts(prs: PRSnapshot[], n = 3): PRSnapshot[] {
  return [...prs].filter(p => p.e1RM > 0 && p.e1RM <= PLAUSIBLE_E1RM_MAX).sort((a, b) => b.e1RM - a.e1RM).slice(0, n)
}

/** Suggested targets: +5% e1RM on the top lifts (rounded to 5). */
export function suggestLiftTargets(prs: PRSnapshot[], pct = 0.05, n = 3): Array<{ slug: string; name: string; baselineE1RM: number; targetE1RM: number }> {
  return topLifts(prs, n).map(p => ({
    slug: p.slug,
    name: p.name,
    baselineE1RM: Math.round(p.e1RM),
    targetE1RM: Math.max(Math.round(p.e1RM) + 5, Math.round((p.e1RM * (1 + pct)) / 5) * 5),
  }))
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
    rows.push({ slug, name, then: Math.round(then), now: Math.round(now), delta: Math.round(delta), pct, target: t?.targetE1RM, toTargetPct, remaining })
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
