/**
 * The weight chart on the Becoming's Fuel screen — pure.
 *
 * Two views of the same journey:
 *   'all'   every weigh-in from the first one to today
 *   'weeks' one point per week (the week's last weigh-in, carried forward
 *           through weeks with no weigh-in so the line never breaks)
 *
 * Returns points in chart space plus the numbers the caption needs.
 */

/** A weigh-in as /api/progress returns it: `date` is a display label ("Aug 17"). */
export interface WeightPoint { date?: string; label?: string; value: number }
export interface WeekWeight { weekKey: string; label: string; end: number | null; start: number | null }

export type WeightView = 'all' | 'weeks'

export interface WeightSeries {
  view: WeightView
  points: Array<{ x: number; y: number; value: number; label: string }>
  min: number
  max: number
  first: { value: number; label: string } | null
  last: { value: number; label: string } | null
  /** Signed change across the window (last − first). */
  delta: number | null
  target: number | null
  /** Where the target sits in chart space (0–1 of the y range), when in range. */
  targetY: number | null
}

const PAD = 0.06 // headroom above and below the line, as a fraction of the range

export function buildWeightSeries(
  history: WeightPoint[],
  weeks: WeekWeight[],
  view: WeightView,
  target: number | null,
): WeightSeries {
  const raw: Array<{ value: number; label: string }> = []
  if (view === 'all') {
    for (const p of history) if (Number.isFinite(p.value) && p.value > 0) raw.push({ value: p.value, label: p.label ?? p.date ?? '' })
  } else {
    let carried: number | null = null
    for (const w of weeks) {
      const v = w.end ?? w.start ?? null
      if (v != null && v > 0) carried = v
      if (carried != null) raw.push({ value: carried, label: w.label })
    }
  }

  const empty: WeightSeries = { view, points: [], min: 0, max: 0, first: null, last: null, delta: null, target, targetY: null }
  if (raw.length === 0) return empty

  const values = raw.map(r => r.value)
  let lo = Math.min(...values), hi = Math.max(...values)
  if (target != null && Number.isFinite(target)) { lo = Math.min(lo, target); hi = Math.max(hi, target) }
  const span = hi - lo
  const pad = span > 0 ? span * PAD : Math.max(1, hi * 0.01)
  const min = lo - pad, max = hi + pad
  const range = Math.max(0.0001, max - min)
  const n = Math.max(1, raw.length - 1)

  return {
    view,
    points: raw.map((r, i) => ({ x: raw.length === 1 ? 0.5 : i / n, y: 1 - (r.value - min) / range, value: r.value, label: r.label })),
    min, max,
    first: { value: raw[0].value, label: raw[0].label },
    last: { value: raw[raw.length - 1].value, label: raw[raw.length - 1].label },
    delta: raw.length > 1 ? Math.round((raw[raw.length - 1].value - raw[0].value) * 10) / 10 : 0,
    target: target ?? null,
    targetY: target != null && target >= min && target <= max ? 1 - (target - min) / range : null,
  }
}

/** "down 3.0 lbs since Jan 18" / "up 1.2 lbs over 12 weeks" / "steady". */
export function weightCaption(s: WeightSeries, unit: 'lbs' | 'kg'): string {
  if (!s.first || !s.last) return 'No weigh-ins yet'
  if (s.delta == null || Math.abs(s.delta) < 0.1) return `Steady at ${Math.round(s.last.value)} ${unit}`
  const dir = s.delta < 0 ? 'down' : 'up'
  const span = s.view === 'all'
    ? (s.first.label ? `since ${s.first.label}` : '')
    : `over ${s.points.length} weeks`
  return `${dir} ${Math.abs(s.delta).toFixed(1)} ${unit}${span ? ` ${span}` : ''}`
}
