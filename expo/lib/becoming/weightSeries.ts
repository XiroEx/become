/**
 * The weight chart on the Becoming's Fuel screen — pure logic ported for native.
 */

export type WeightView = 'week' | 'all'
export interface WeighIn { day: string; value: number }

export interface ChartPoint {
  x: number
  y: number
  value: number
  day: string
  label: string
  longLabel: string
}

export interface AxisTick { x?: number; y?: number; label: string }

export interface WeightSeries {
  view: WeightView
  points: ChartPoint[]
  gaps: { x: number; label: string; day: string }[]
  min: number
  max: number
  yTicks: AxisTick[]
  xTicks: AxisTick[]
  first: ChartPoint | null
  last: ChartPoint | null
  delta: number | null
  target: number | null
  targetY: number | null
}

const DAY_MS = 86_400_000
const PAD = 0.18

function parseKey(key: string): number {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key)
  return m ? Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : NaN
}
function toKey(ms: number): string {
  const d = new Date(ms)
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`
}
const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

export function dayOfWeekLabel(key: string): string {
  return DOW[new Date(parseKey(key)).getUTCDay()] ?? ''
}
export function monthDayLabel(key: string): string {
  const d = new Date(parseKey(key))
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })
}
export function longDayLabel(key: string): string {
  const d = new Date(parseKey(key))
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' })
}

export function yTicksFor(min: number, max: number, count = 3): number[] {
  const span = max - min
  if (!(span > 0)) return [Math.round(max)]
  const mag = Math.pow(10, Math.floor(Math.log10(span / Math.max(1, count - 1))))
  const shape = mag >= 1 ? [1, 2, 5, 10, 20] : [0.5, 1, 2, 2.5, 5]
  const candidates = shape.map(m => m * mag).filter(v => v > 0)
  let best: { step: number; ticks: number[] } | null = null
  for (const step of candidates) {
    const ticks: number[] = []
    for (let v = Math.ceil(min / step) * step; v <= max + 1e-9; v += step) ticks.push(Math.round(v * 10) / 10)
    if (ticks.length < 2 || ticks.length > 5) continue
    const score = Math.abs(ticks.length - count)
    const bestScore = best ? Math.abs(best.ticks.length - count) : Infinity
    if (score < bestScore || (score === bestScore && best && step > best.step)) best = { step, ticks }
  }
  return best?.ticks ?? [Math.round(min), Math.round(max)]
}

export function buildWeightSeries(
  weighIns: WeighIn[],
  view: WeightView,
  target: number | null,
  todayKey: string,
): WeightSeries {
  const byDay = new Map(weighIns.filter(w => Number.isFinite(w.value) && w.value > 0).map(w => [w.day, w.value]))

  let slots: { day: string; label: string; longLabel: string }[]
  if (view === 'week') {
    const t = parseKey(todayKey)
    const sunday = t - (new Date(t).getUTCDay() || 0) * DAY_MS
    slots = Array.from({ length: 7 }, (_, i) => {
      const day = toKey(sunday + i * DAY_MS)
      return { day, label: dayOfWeekLabel(day), longLabel: longDayLabel(day) }
    })
  } else {
    slots = [...byDay.keys()].sort().map(day => ({ day, label: monthDayLabel(day), longLabel: longDayLabel(day) }))
  }

  const empty: WeightSeries = { view, points: [], gaps: [], min: 0, max: 0, yTicks: [], xTicks: [], first: null, last: null, delta: null, target, targetY: null }
  if (slots.length === 0) return empty

  const values = slots.map(s => byDay.get(s.day)).filter((v): v is number => v != null)
  if (values.length === 0) {
    return { ...empty, gaps: slots.map((s, i) => ({ x: slots.length === 1 ? 0.5 : i / (slots.length - 1), label: s.label, day: s.day })), xTicks: slots.map((s, i) => ({ x: slots.length === 1 ? 0.5 : i / (slots.length - 1), label: s.label })) }
  }

  let lo = Math.min(...values), hi = Math.max(...values)
  if (target != null && Number.isFinite(target)) { lo = Math.min(lo, target); hi = Math.max(hi, target) }
  const span = hi - lo
  const pad = span > 0 ? span * PAD : Math.max(1, hi * 0.01)
  const min = lo - pad, max = hi + pad
  const range = Math.max(0.0001, max - min)
  const n = Math.max(1, slots.length - 1)
  const xOf = (i: number) => (slots.length === 1 ? 0.5 : i / n)
  const yOf = (v: number) => 1 - (v - min) / range

  const points: ChartPoint[] = []
  const gaps: WeightSeries['gaps'] = []
  slots.forEach((s, i) => {
    const v = byDay.get(s.day)
    if (v == null) gaps.push({ x: xOf(i), label: s.label, day: s.day })
    else points.push({ x: xOf(i), y: yOf(v), value: v, day: s.day, label: s.label, longLabel: s.longLabel })
  })

  let xTicks: AxisTick[]
  if (view === 'week') {
    xTicks = slots.map((s, i) => ({ x: xOf(i), label: s.label }))
  } else {
    xTicks = []
    let lastMonth = ''
    slots.forEach((s, i) => {
      const m = s.day.slice(0, 7)
      if (m !== lastMonth) {
        lastMonth = m
        const d = new Date(parseKey(s.day))
        xTicks.push({ x: xOf(i), label: d.toLocaleDateString('en-US', { month: 'short', timeZone: 'UTC' }) })
      }
    })
    const maxTicks = 6
    if (xTicks.length > maxTicks) {
      const stride = Math.ceil(xTicks.length / maxTicks)
      const last = xTicks[xTicks.length - 1]!
      xTicks = xTicks.filter((_, i) => i % stride === 0)
      const tail = xTicks[xTicks.length - 1]
      if (last && tail && tail !== last && (last.x ?? 1) - (tail.x ?? 0) > 0.12) xTicks.push(last)
    }
  }

  const lastPoint = points.length > 0 ? (points[points.length - 1] ?? null) : null
  const firstPoint = points.length > 0 ? (points[0] ?? null) : null

  return {
    view,
    points,
    gaps,
    min, max,
    yTicks: yTicksFor(min, max).map(v => ({ y: yOf(v), label: v % 1 === 0 ? String(v) : v.toFixed(1) })),
    xTicks,
    first: firstPoint,
    last: lastPoint,
    delta: points.length > 1 && firstPoint && lastPoint ? Math.round((lastPoint.value - firstPoint.value) * 10) / 10 : 0,
    target: target ?? null,
    targetY: target != null && target >= min && target <= max ? yOf(target) : null,
  }
}

export function weightCaption(s: WeightSeries, unit: 'lbs' | 'kg'): string {
  if (!s.first || !s.last) return s.view === 'week' ? 'No weigh-ins this week' : 'No weigh-ins yet'
  if (s.delta == null || Math.abs(s.delta) < 0.1) return `Steady at ${Math.round(s.last.value)} ${unit}`
  const dir = s.delta < 0 ? 'down' : 'up'
  const span = s.view === 'week' ? 'this week' : `since ${monthDayLabel(s.first.day)}`
  return `${dir} ${Math.abs(s.delta).toFixed(1)} ${unit} ${span}`
}
