// Stat-tile vocabulary + the default dashboard layout.
//
// Pure + node-safe (no React/DOM/Mongoose) so it is importable from API routes
// and the node test runner. The 8 stat ids mirror ALL_TILE_IDS in
// lib/dashboardTiles.tsx; duplicated here to avoid pulling the React render
// registry into server code. Phase p09 (tiles-default-layout) supersedes
// defaultLayout() with the richer mixed-kind default.

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

/** A fresh default layout — new array of new tile objects each call. */
export function defaultLayout(): DashboardLayout {
  return DEFAULT_STAT_TILE_IDS.map((id) => ({ id, kind: 'stat' as const, size: DEFAULT_SIZE }))
}
