// One-time migration + GET-resolution for the unified dashboard tile model.
//
// Pure + node-safe: no React/DOM/Mongoose deps. The stat vocabulary + default
// layout live in ./defaults (single source of truth); this module synthesizes
// a layout from legacy persistence and decides what GET should return.

import {
  type DashboardTile,
  type DashboardLayout,
  type DashboardTileKind,
  MAX_DASHBOARD_TILES,
} from './types'
import { isStatTileId, defaultLayout } from './defaults'

// Single import surface for migration concerns.
export { defaultLayout, STAT_TILE_IDS, DEFAULT_STAT_TILE_IDS } from './defaults'

/** A legacy pin/stat id maps to a stat tile if it's a known stat id, else metric. */
function kindForLegacyId(id: string): DashboardTileKind {
  return isStatTileId(id) ? 'stat' : 'metric'
}

/**
 * Synthesize a unified layout from legacy inputs:
 *  - `statPref`: client localStorage stat-tile preference (ordered).
 *  - `pinnedTiles`: server-side legacy rotator pins (stat or metric ids).
 *
 * Stat-pref tiles come first, then any legacy pins not already present. Deduped
 * by (kind, id), capped at the layout max. Returns [] when there's nothing to
 * migrate (caller falls back to the default layout).
 */
export function synthesizeLayout(
  pinnedTiles: string[] = [],
  statPref: string[] = []
): DashboardLayout {
  const out: DashboardTile[] = []
  const seen = new Set<string>()

  const add = (rawId: string, kind: DashboardTileKind) => {
    const id = rawId.trim()
    if (!id) return
    const key = `${kind}:${id}`
    if (seen.has(key)) return
    if (out.length >= MAX_DASHBOARD_TILES) return
    seen.add(key)
    out.push({ id, kind, size: '1x1' })
  }

  for (const id of statPref) {
    if (typeof id === 'string' && isStatTileId(id.trim())) add(id, 'stat')
  }
  for (const id of pinnedTiles) {
    if (typeof id === 'string') add(id, kindForLegacyId(id.trim()))
  }

  return out
}

export interface ResolveLayoutArgs {
  /** The user's already-persisted layout (empty/absent → needs migration). */
  existingLayout?: DashboardTile[] | null
  /** Legacy server-side rotator pins. */
  pinnedTiles?: string[]
  /** Client-supplied localStorage stat preference. */
  statPref?: string[]
}

export interface ResolveLayoutResult {
  layout: DashboardLayout
  /** True when the layout was freshly synthesized and should be persisted. */
  migrated: boolean
}

/**
 * Decide what GET /api/dashboard/layout returns and whether to persist.
 *  - non-empty persisted layout → return as-is, migrated=false (second GET stable)
 *  - else synthesize from legacy (or default), migrated=true (persist once)
 * Pure: persistence is the route's responsibility.
 */
export function resolveLayoutForGet(args: ResolveLayoutArgs): ResolveLayoutResult {
  const existing = args.existingLayout ?? []
  if (existing.length > 0) {
    return { layout: existing, migrated: false }
  }
  const synth = synthesizeLayout(args.pinnedTiles ?? [], args.statPref ?? [])
  const layout = synth.length > 0 ? synth : defaultLayout()
  return { layout, migrated: true }
}

/** Parse a comma-separated `?statPref=` query value into an id list. */
export function parseStatPrefParam(value: string | null | undefined): string[] {
  if (!value) return []
  return value
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
}
