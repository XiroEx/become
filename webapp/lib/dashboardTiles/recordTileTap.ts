// Pure reducer for recording a smart-tile tap into a user's engagement list.
// Node-safe (no I/O); the route persists the result. Keeps the list bounded so
// it can't grow unbounded, and increments+restamps an existing key in place.

import type { TileEngagement } from './smartRotation'

// Cap distinct tracked keys (there are only ~8 stats + a handful of metrics;
// this is a safety bound). When over cap, drop the least-recently-tapped.
const MAX_KEYS = 40

const KEY_RE = /^(stat|metric):[a-zA-Z0-9._-]+$/

/** True for a well-formed rotation item key. */
export function isValidTileKey(key: unknown): key is string {
  return typeof key === 'string' && KEY_RE.test(key)
}

export interface RecordTapResult {
  next: TileEngagement[]
  changed: boolean
}

/**
 * Record one tap on `key` at time `at`. Increments taps + updates lastTapAt for
 * an existing key, else appends a new row. Returns a new array (no mutation).
 */
export function recordTileTap(
  list: TileEngagement[] | undefined,
  key: string,
  at: Date,
): RecordTapResult {
  if (!isValidTileKey(key)) return { next: list ?? [], changed: false }
  const atIso = at.toISOString()
  const src = list ?? []
  const idx = src.findIndex((r) => r.key === key)

  let next: TileEngagement[]
  if (idx >= 0) {
    next = src.slice()
    next[idx] = { key, taps: (next[idx].taps ?? 0) + 1, lastTapAt: atIso }
  } else {
    next = [...src, { key, taps: 1, lastTapAt: atIso }]
  }

  // Bound the list: keep the most-recently-tapped MAX_KEYS.
  if (next.length > MAX_KEYS) {
    next = next
      .slice()
      .sort((a, b) => new Date(b.lastTapAt ?? 0).getTime() - new Date(a.lastTapAt ?? 0).getTime())
      .slice(0, MAX_KEYS)
  }

  return { next, changed: true }
}
