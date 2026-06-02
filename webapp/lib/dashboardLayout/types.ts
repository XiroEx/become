// Unified dashboard tile model — webapp-canonical (zod-free).
//
// The webapp has no `zod` dependency (only the shared `@become/api-client`
// package does, which the Expo app consumes). Following the existing webapp
// pattern (see lib/dashboardTiles/validatePinnedTiles.ts), this module hand-
// rolls the same shape + validators that `@become/api-client`'s
// `schemas/dashboard.ts` describes with zod. Keep the two in sync — they
// describe the same persisted/wire shape used by GET/PATCH /api/dashboard/layout
// and stored on UserProgress.dashboardLayout.
//
// No React/DOM/Mongoose deps — safe to import from API routes, the customizer,
// and unit tests alike.

export const TILE_KINDS = ['stat', 'metric', 'smart-rotating'] as const
export type DashboardTileKind = (typeof TILE_KINDS)[number]

export const TILE_SIZES = ['1x1', '2x1'] as const
export type DashboardTileSize = (typeof TILE_SIZES)[number]

/** Maximum number of tiles a single layout may contain. */
export const MAX_DASHBOARD_TILES = 20

/** Allowed rotation intervals (ms) for a smart tile's frequency setting. */
export const SMART_INTERVAL_OPTIONS_MS = [4000, 6000, 10000, 30000] as const
export const DEFAULT_SMART_INTERVAL_MS = 6000
/** A smart tile's pool may reference at most this many card keys. */
export const MAX_SMART_POOL = 20

/** A rotation-pool / engagement card key, e.g. `stat:streak` or `metric:foo`. */
const TILE_KEY_RE = /^(stat|metric):[a-zA-Z0-9._-]+$/

/**
 * Per-tile settings. Optional; most tiles have none. Currently only the
 * smart-rotating tile uses settings:
 *  - `pool`: the exact card keys (`stat:<id>` / `metric:<id>`) it rotates
 *    through. Absent ⇒ the default pool (original stat tiles only — no metrics).
 *  - `intervalMs`: rotation frequency.
 * Kept open-ended so other tile kinds can add settings later.
 */
export interface DashboardTileSettings {
  pool?: string[]
  intervalMs?: number
}

export interface DashboardTile {
  id: string
  kind: DashboardTileKind
  size: DashboardTileSize
  /** Pins a smart-rotating tile to one metric; null/absent = rotates. */
  locked?: string | null
  /** Optional per-tile settings (see {@link DashboardTileSettings}). */
  settings?: DashboardTileSettings
}

export type DashboardLayout = DashboardTile[]

export function isDashboardTileKind(v: unknown): v is DashboardTileKind {
  return typeof v === 'string' && (TILE_KINDS as readonly string[]).includes(v)
}

export function isDashboardTileSize(v: unknown): v is DashboardTileSize {
  return typeof v === 'string' && (TILE_SIZES as readonly string[]).includes(v)
}

/** Thrown when a tile/layout fails validation. */
export class DashboardLayoutError extends Error {}

function parseTileAt(input: unknown, index: number): DashboardTile {
  const where = `tile[${index}]`
  if (typeof input !== 'object' || input === null || Array.isArray(input)) {
    throw new DashboardLayoutError(`${where} must be an object`)
  }
  const t = input as Record<string, unknown>

  if (typeof t.id !== 'string' || t.id.length === 0) {
    throw new DashboardLayoutError(`${where}.id must be a non-empty string`)
  }
  if (!isDashboardTileKind(t.kind)) {
    throw new DashboardLayoutError(
      `${where}.kind must be one of ${TILE_KINDS.join(', ')}`
    )
  }
  if (!isDashboardTileSize(t.size)) {
    throw new DashboardLayoutError(
      `${where}.size must be one of ${TILE_SIZES.join(', ')}`
    )
  }

  let locked: string | null | undefined
  if (t.locked !== undefined && t.locked !== null) {
    if (typeof t.locked !== 'string' || t.locked.length === 0) {
      throw new DashboardLayoutError(
        `${where}.locked must be a non-empty string or null`
      )
    }
    locked = t.locked
  } else {
    locked = t.locked as null | undefined
  }

  if (locked != null && t.kind !== 'smart-rotating') {
    throw new DashboardLayoutError(
      `${where}.locked is only allowed on a 'smart-rotating' tile`
    )
  }

  // Optional per-tile settings.
  let settings: DashboardTileSettings | undefined
  if (t.settings !== undefined && t.settings !== null) {
    if (typeof t.settings !== 'object' || Array.isArray(t.settings)) {
      throw new DashboardLayoutError(`${where}.settings must be an object`)
    }
    const s = t.settings as Record<string, unknown>
    const parsed: DashboardTileSettings = {}

    if (s.pool !== undefined) {
      if (!Array.isArray(s.pool)) {
        throw new DashboardLayoutError(`${where}.settings.pool must be an array`)
      }
      if (s.pool.length > MAX_SMART_POOL) {
        throw new DashboardLayoutError(
          `${where}.settings.pool may contain at most ${MAX_SMART_POOL} keys`
        )
      }
      const pool: string[] = []
      const seen = new Set<string>()
      for (const k of s.pool) {
        if (typeof k !== 'string' || !TILE_KEY_RE.test(k)) {
          throw new DashboardLayoutError(
            `${where}.settings.pool entries must be 'stat:<id>' / 'metric:<id>' keys`
          )
        }
        if (!seen.has(k)) { seen.add(k); pool.push(k) }
      }
      parsed.pool = pool
    }

    if (s.intervalMs !== undefined) {
      if (typeof s.intervalMs !== 'number' || !Number.isFinite(s.intervalMs) || s.intervalMs <= 0) {
        throw new DashboardLayoutError(`${where}.settings.intervalMs must be a positive number`)
      }
      parsed.intervalMs = s.intervalMs
    }

    if (parsed.pool !== undefined || parsed.intervalMs !== undefined) settings = parsed
  }

  const tile: DashboardTile = { id: t.id, kind: t.kind, size: t.size }
  if (locked !== undefined) tile.locked = locked
  if (settings !== undefined) tile.settings = settings
  return tile
}

/**
 * Validate + normalize a single tile. Throws {@link DashboardLayoutError} on
 * any violation.
 */
export function parseDashboardTile(input: unknown): DashboardTile {
  return parseTileAt(input, 0)
}

/**
 * Validate + normalize a full layout (max {@link MAX_DASHBOARD_TILES} tiles).
 * Throws {@link DashboardLayoutError} on any violation. Used by the PATCH
 * /api/dashboard/layout route.
 */
export function parseDashboardLayout(input: unknown): DashboardLayout {
  if (!Array.isArray(input)) {
    throw new DashboardLayoutError('layout must be an array')
  }
  if (input.length > MAX_DASHBOARD_TILES) {
    throw new DashboardLayoutError(
      `A dashboard layout may contain at most ${MAX_DASHBOARD_TILES} tiles`
    )
  }
  return input.map((tile, i) => parseTileAt(tile, i))
}

export type SafeParseResult =
  | { ok: true; layout: DashboardLayout }
  | { ok: false; error: string }

/** Non-throwing variant of {@link parseDashboardLayout}. */
export function safeParseDashboardLayout(input: unknown): SafeParseResult {
  try {
    return { ok: true, layout: parseDashboardLayout(input) }
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'invalid layout',
    }
  }
}
