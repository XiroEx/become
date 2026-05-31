// Stat-tile vocabulary + the default dashboard layout.
//
// Pure + node-safe (no React/DOM/Mongoose) so it is importable from API routes
// and the node test runner. The 8 stat ids mirror ALL_TILE_IDS in
// lib/dashboardTiles.tsx; duplicated here to avoid pulling the React render
// registry into server code. `richDefaultLayout()` is the real first-run
// default (all 8 stat tiles + size variety + a smart-rotating tile);
// `defaultLayout()` is the minimal legacy default kept for back-compat + the
// stale-layout healing signature.

import type { DashboardLayout, DashboardTileSize } from './types'

export const STAT_TILE_IDS = [
  'streak',
  'mood',
  'weekly',
  'goal',
  'calories',
  'water',
  'weight',
  'workouts',
] as const

export type StatTileId = (typeof STAT_TILE_IDS)[number]

export function isStatTileId(v: unknown): v is StatTileId {
  return typeof v === 'string' && (STAT_TILE_IDS as readonly string[]).includes(v)
}

/** Minimal placeholder default (mirror of legacy DEFAULT_TILE_IDS). */
export const DEFAULT_STAT_TILE_IDS = ['streak', 'mood', 'weekly', 'goal'] as const

const DEFAULT_SIZE: DashboardTileSize = '1x1'

/**
 * Minimal legacy default — new array of new tile objects each call. This is the
 * exact shape early users had persisted (4 stat tiles, all 1x1). Kept so
 * {@link isLegacyDefaultLayout} can recognize and heal it; new users now get
 * {@link richDefaultLayout} instead.
 */
export function defaultLayout(): DashboardLayout {
  return DEFAULT_STAT_TILE_IDS.map((id) => ({ id, kind: 'stat' as const, size: DEFAULT_SIZE }))
}

/** The single id used for the default smart-rotating tile. */
export const SMART_ROTATING_TILE_ID = 'smart'

/**
 * The rich first-run default: all eight stat tiles with size variety (mood +
 * weight render well as wide 2x1 cards), plus one smart-rotating tile so the
 * intelligence surface is visible by default. New array of new objects each
 * call so callers can freely mutate the result.
 */
export function richDefaultLayout(): DashboardLayout {
  return [
    { id: 'streak', kind: 'stat', size: '1x1' },
    { id: 'mood', kind: 'stat', size: '2x1' },
    { id: 'weekly', kind: 'stat', size: '1x1' },
    { id: 'goal', kind: 'stat', size: '1x1' },
    { id: 'calories', kind: 'stat', size: '1x1' },
    { id: 'water', kind: 'stat', size: '1x1' },
    { id: 'weight', kind: 'stat', size: '2x1' },
    { id: 'workouts', kind: 'stat', size: '1x1' },
    { id: SMART_ROTATING_TILE_ID, kind: 'smart-rotating', size: '2x1', locked: null },
  ]
}

/**
 * True only for the EXACT legacy 4-stat default signature (ids in order, all
 * stat/1x1, length 4). Used to heal users stuck on the impoverished default
 * without clobbering anyone who has intentionally customized their layout.
 */
export function isLegacyDefaultLayout(layout: DashboardLayout): boolean {
  if (layout.length !== DEFAULT_STAT_TILE_IDS.length) return false
  return layout.every(
    (t, i) =>
      t.kind === 'stat' &&
      t.size === '1x1' &&
      t.id === DEFAULT_STAT_TILE_IDS[i] &&
      (t.locked == null),
  )
}
