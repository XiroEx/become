/**
 * Spatial layout for The Becoming — pure.
 *
 * Every week is a card in "world" space. x moves forward one column per
 * week; y is the altitude the path has reached (up = negative y, screen
 * convention). One step past the live week sits the Horizon — where this
 * week is trending, and who you said you are becoming. Zoomed out, the
 * cards trace the member's line.
 *
 * Card size follows the stage (a card is a "view", almost the screen), so
 * layout is computed per viewport.
 */

import type { WeekSnapshot } from '@/lib/becoming/weeks'

/** Overview zoom threshold — below this scale the stage is a graph. */
export const OVERVIEW_MAX_SCALE = 0.5
/** The farthest zoom. Below ~0.16 the tiles hand over to constant-size markers on the line, so this can go small. */
export const OVERVIEW_MIN_SCALE = 0.02
/** Tiles are fully faded (markers only) at or below this scale; fully visible above TILE_FULL_SCALE. */
export const TILE_FADE_SCALE = 0.12
export const TILE_FULL_SCALE = 0.2

export interface CardSize { w: number; h: number; col: number; row: number }
export interface CardPos { index: number; x: number; y: number; horizon?: boolean }
export interface Bounds { minX: number; maxX: number; minY: number; maxY: number; width: number; height: number }

/** A card is the stage inset (max 380 wide), 1.45:1, capped by the room between the top and bottom chrome. */
export function cardSize(vw: number, vh: number): CardSize {
  const w = Math.max(260, Math.min(380, vw - 40))
  const h = Math.max(380, Math.min(Math.round(w * 1.45), vh - 200))
  return { w, h, col: w + 64, row: Math.round(h * 0.72) }
}

/** Provisional altitude change the live week is trending toward — where the Horizon sits. */
export function horizonDelta(live: Pick<WeekSnapshot, 'step' | 'score' | 'daysElapsed'> | undefined): number {
  if (!live) return 0.25
  if (live.daysElapsed < 2) return 0.25
  return live.step === 'up' ? 1 : live.step === 'down' ? -0.35 : 0.25
}

/** Card CENTER positions in world space, plus the Horizon one step past the last week. */
export function layoutWeeks(weeks: Pick<WeekSnapshot, 'index' | 'altitude' | 'step' | 'score' | 'daysElapsed'>[], size: CardSize): CardPos[] {
  const pos: CardPos[] = weeks.map(w => ({ index: w.index, x: w.index * size.col, y: -w.altitude * size.row }))
  if (weeks.length) {
    const live = weeks[weeks.length - 1]
    const alt = Math.max(0, live.altitude + horizonDelta(live))
    pos.push({ index: weeks.length, x: weeks.length * size.col, y: -alt * size.row, horizon: true })
  }
  return pos
}

export function boundsOf(pos: CardPos[], size: CardSize, pad = 80): Bounds {
  if (!pos.length) return { minX: 0, maxX: 0, minY: 0, maxY: 0, width: 0, height: 0 }
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity
  for (const p of pos) {
    minX = Math.min(minX, p.x - size.w / 2); maxX = Math.max(maxX, p.x + size.w / 2)
    minY = Math.min(minY, p.y - size.h / 2); maxY = Math.max(maxY, p.y + size.h / 2)
  }
  return { minX: minX - pad, maxX: maxX + pad, minY: minY - pad, maxY: maxY + pad, width: maxX - minX + pad * 2, height: maxY - minY + pad * 2 }
}

export function fitScale(b: Bounds, vw: number, vh: number, min = OVERVIEW_MIN_SCALE, max = OVERVIEW_MAX_SCALE - 0.02): number {
  if (b.width <= 0 || b.height <= 0) return max
  return Math.max(min, Math.min(max, Math.min(vw / b.width, vh / b.height)))
}

export function boundsCenter(b: Bounds): { x: number; y: number } {
  return { x: (b.minX + b.maxX) / 2, y: (b.minY + b.maxY) / 2 }
}

/**
 * Where the camera sits in overview: the whole path centred when it fits;
 * when it is wider than the viewport, the live week sits about 65% across so
 * the line runs in from the left and the member can pan back.
 */
export function overviewCamera(b: Bounds, pos: CardPos[], vw: number, vh: number): { x: number; y: number; s: number } {
  const s = fitScale(b, vw, vh)
  const c = boundsCenter(b)
  const weeksOnly = pos.filter(p => !p.horizon)
  if (b.width * s <= vw || !weeksOnly.length) return { x: c.x, y: c.y, s }
  const last = weeksOnly[weeksOnly.length - 1]
  return { x: last.x - (0.15 * vw) / s, y: c.y, s }
}

export type Dir = 'left' | 'right' | 'up' | 'down'

/**
 * Where a swipe goes. Horizontal: left = forward, right = back. Vertical:
 * toward whichever neighbour is physically that way (up = the higher card,
 * down = the lower one); a tie goes forward on up, back on down. This is what
 * makes "swipe up" feel like climbing.
 */
export function neighbourFor(pos: CardPos[], current: number, dir: Dir): number | null {
  const prev = current > 0 ? current - 1 : null
  const next = current < pos.length - 1 ? current + 1 : null
  if (dir === 'left') return next
  if (dir === 'right') return prev
  const cy = pos[current]?.y ?? 0
  const py = prev != null ? pos[prev].y : null
  const ny = next != null ? pos[next].y : null
  if (dir === 'up') {
    if (ny != null && ny < cy - 1) return next
    if (py != null && py < cy - 1) return prev
    return next
  }
  if (ny != null && ny > cy + 1) return next
  if (py != null && py > cy + 1) return prev
  return prev
}

/**
 * Scrub: project a drag onto the forward and backward segments and pick the
 * one the finger is moving along. Returns the target index and progress
 * 0..1 (negative/over-1 allowed for rubber-band; the caller clamps).
 * Camera-steer semantics: the world moves WITH the finger's intent, so a
 * drag toward the upper-right pulls a higher, later card in.
 */
export function scrubTarget(pos: CardPos[], current: number, dx: number, dy: number, scale: number): { target: number; progress: number } | null {
  const cur = pos[current]; if (!cur) return null
  const cands: Array<{ target: number; ux: number; uy: number; len: number }> = []
  for (const t of [current + 1, current - 1]) {
    const p = pos[t]; if (!p) continue
    const vx = p.x - cur.x, vy = p.y - cur.y
    const len = Math.hypot(vx, vy) || 1
    cands.push({ target: t, ux: vx / len, uy: vy / len, len })
  }
  if (!cands.length) return null
  // Finger drags the world: moving the finger left means the camera moves right (toward +x).
  const wx = -dx / scale, wy = -dy / scale
  let best: { target: number; progress: number; score: number } | null = null
  for (const c of cands) {
    const along = wx * c.ux + wy * c.uy
    if (!best || along > best.score) best = { target: c.target, progress: along / c.len, score: along }
  }
  return best && best.score > 0 ? best : null
}

/** Direction from a delta, or null when it is too small to be a swipe. */
export function swipeDirection(dx: number, dy: number, threshold = 36): Dir | null {
  const ax = Math.abs(dx), ay = Math.abs(dy)
  if (Math.max(ax, ay) < threshold) return null
  if (ax >= ay) return dx < 0 ? 'left' : 'right'
  return dy < 0 ? 'up' : 'down'
}

/** Nearest card to a world point. */
export function nearestCard(pos: CardPos[], x: number, y: number): number {
  let best = 0, bd = Infinity
  for (const p of pos) { const d = (p.x - x) ** 2 + (p.y - y) ** 2; if (d < bd) { bd = d; best = p.index } }
  return best
}

/**
 * Which edge of the current card faces the next one. A hold (+¼ row) is
 * "right", not "up": only a real climb/dip (≥ 0.4 row) reads vertically.
 */
export function exitEdge(pos: CardPos[], current: number, row = 366): 'up' | 'right' | 'down' | null {
  const a = pos[current], b = pos[current + 1]
  if (!a || !b) return null
  if (b.y < a.y - 0.4 * row) return 'up'
  if (b.y > a.y + 0.4 * row) return 'down'
  return 'right'
}

/** Indexes whose altitude is a new peak at that point (for the "NEW HIGH" chip / gold ring). */
export function peakIndexes(weeks: Array<{ index: number; altitude: number; isCurrent?: boolean }>): Set<number> {
  const out = new Set<number>()
  let peak = -Infinity
  for (const w of weeks) {
    if (w.isCurrent) continue
    if (w.altitude > peak + 1e-9) { peak = w.altitude; if (w.index > 0) out.add(w.index) }
  }
  return out
}

/** Month ticks for the graph: the first week whose Sunday falls in a new month. */
export function monthTicks(weeks: Array<{ index: number; weekKey: string }>): Array<{ index: number; label: string }> {
  const out: Array<{ index: number; label: string }> = []
  let lastMonth = ''
  for (const w of weeks) {
    const m = w.weekKey.slice(0, 7)
    if (m !== lastMonth) {
      const [y, mo] = m.split('-').map(Number)
      const d = new Date(Date.UTC(y, mo - 1, 1))
      out.push({ index: w.index, label: d.toLocaleDateString('en-US', { month: 'short', timeZone: 'UTC' }) + (mo === 1 || out.length === 0 ? ` ${y}` : '') })
      lastMonth = m
    }
  }
  return out
}

/** Aggregate line for the overview HUD. */
export function aggregate(weeks: WeekSnapshot[], unit: 'lbs' | 'kg'): string {
  if (!weeks.length) return ''
  const ups = weeks.filter(w => w.step === 'up').length
  const prs = weeks.reduce((n, w) => n + w.training.prCount, 0)
  const sessions = weeks.reduce((n, w) => n + w.mind.sessions, 0)
  const withWeight = weeks.filter(w => w.nutrition.weightStart != null || w.nutrition.weightEnd != null)
  const first = withWeight[0], last = withWeight[withWeight.length - 1]
  const w0 = first?.nutrition.weightStart ?? first?.nutrition.weightEnd ?? null
  const w1 = last?.nutrition.weightEnd ?? last?.nutrition.weightStart ?? null
  const bits = [`${weeks.length} week${weeks.length === 1 ? '' : 's'}`, `${ups} climb${ups === 1 ? '' : 's'}`]
  if (prs) bits.push(`${prs} PR${prs === 1 ? '' : 's'}`)
  if (w0 != null && w1 != null && Math.abs(w1 - w0) >= 0.5) bits.push(`${w1 < w0 ? '−' : '+'}${Math.abs(w1 - w0).toFixed(1)} ${unit}`)
  if (sessions) bits.push(`${sessions} mind session${sessions === 1 ? '' : 's'}`)
  return bits.join(' · ')
}
