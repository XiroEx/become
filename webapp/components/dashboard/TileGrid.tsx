'use client'

// Unified dashboard tile grid — the single grid that renders every tile kind.
//
// Replaces the two previously-separate sections in DashboardClient (the
// StatTile 2x2/4-up grid AND the dark <IntelligenceRotator> block). Driven by
// the user's saved layout from GET /api/dashboard/layout (kind + size + lock +
// order), with metric data resolved from GET /api/dashboard/tiles.
//
// All tiles render through the SAME themed shell (bg-white dark:bg-zinc-900),
// fixing the hardcoded-dark styling of the old intelligence tiles. Tiles span
// 1x1 (square) or 2x1 (two columns) on the responsive 2-col (mobile) /
// 4-col (desktop) grid.
//
// Pure-client: the chart bodies reuse the existing LineTileChart / BarTileChart
// client components, fed by data the tiles API already resolves server-side —
// so there's no async-server-component-in-client-tree problem.

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Card } from '@/components/ui'
import { cn } from '@/lib/cn'
import { readCache, writeCache } from '@/lib/clientCache'
import {
  TILE_DEFS,
  type DashboardTileId,
  type DashboardTileContext,
} from '@/lib/dashboardTiles'
import type { DashboardTile, DashboardTileSize } from '@/lib/dashboardLayout/types'
import { LineTileChart } from '@/components/intelligence/tiles/LineTileChart'
import { BarTileChart } from '@/components/intelligence/tiles/BarTileChart'
import { SuggestionCard } from '@/components/intelligence/SuggestionCard'
import TileErrorBoundary from '@/components/dashboard/TileErrorBoundary'
import { SmartRotatingTile, buildRotationItems } from '@/components/dashboard/SmartRotatingTile'
import { DEFAULT_SMART_POOL } from '@/lib/dashboardLayout/defaults'
import type { DataPoint } from '@/lib/metrics/types'
import type { Suggestion } from '@/lib/suggestions/types'

// ── API payload shapes (mirror the route responses) ────────────────────────

interface MetricSummary {
  id: string
  label: string
  unit: string
  domain: 'workout' | 'nutrition' | 'mindset'
  trendDirection: 'up-good' | 'down-good' | 'neutral'
  latest: DataPoint | null
  data: DataPoint[]
  error?: string
}

interface TilesResponse {
  tiles: Array<
    | { kind: 'metric'; tileId: string }
    | { kind: 'suggestion'; suggestionId: string }
  >
  metrics: MetricSummary[]
  suggestions: Suggestion[]
  engagement?: Array<{ key: string; taps: number; lastTapAt: string | null }>
  now: string
}

export interface TileGridProps {
  /** Live stat-tile context (weight/mood/streak/etc.) built by DashboardClient. */
  statContext: DashboardTileContext
  /**
   * Controlled layout. When provided (incl. null while the parent is still
   * loading), the grid renders this layout and does NOT self-fetch
   * /api/dashboard/layout — so a save in the customizer reflects immediately
   * once the parent updates the prop. When omitted, the grid self-fetches the
   * layout (legacy/standalone behavior).
   */
  layout?: DashboardTile[] | null
  className?: string
}

const STAT_IDS = new Set<DashboardTileId>([
  'streak', 'mood', 'weekly', 'goal', 'calories', 'water', 'weight', 'workouts',
])

function isStatId(id: string): id is DashboardTileId {
  return STAT_IDS.has(id as DashboardTileId)
}

function token(): string | null {
  return typeof window !== 'undefined' ? window.localStorage?.getItem('token') : null
}

function authHeaders(): HeadersInit | undefined {
  const t = token()
  return t ? { Authorization: `Bearer ${t}` } : undefined
}

// Chart type from metric meta — bar for volume-ish, line for time series,
// number for single/empty. Avoids the old fragile id-substring heuristics by
// preferring data shape.
function chartKindFor(m: MetricSummary): 'bar' | 'line' | 'number' {
  if (m.data.length < 2) return 'number'
  if (m.id.includes('volume') || m.id.includes('bar')) return 'bar'
  return 'line'
}

function formatValue(value: number): string {
  if (Number.isInteger(value)) return String(value)
  return value.toFixed(2).replace(/\.?0+$/, '')
}

// ── Themed metric card (replaces the dark intelligence tiles) ───────────────

function MetricTileCard({ metric, size }: { metric: MetricSummary; size: DashboardTileSize }) {
  const kind = chartKindFor(metric)
  const latestText =
    metric.latest == null ? '—' : `${formatValue(metric.latest.value)} ${metric.unit}`.trim()
  // Charts render in the wide (2x1) slot, filling the remaining height
  // responsively so they never overflow + get clipped. Square (1x1) is number-
  // only so its height/weight matches the stat tiles in the uniform grid.
  const showChart = size === '2x1' && !metric.error && kind !== 'number'

  if (metric.error) {
    return (
      <Card variant="compact" className="h-full overflow-hidden">
        <div className="flex h-full flex-col justify-center gap-1">
          <div className="truncate text-xs uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
            {metric.label}
          </div>
          <div className="text-sm text-amber-600 dark:text-amber-400">
            Data temporarily unavailable.
          </div>
        </div>
      </Card>
    )
  }

  if (showChart) {
    // Wide: compact label + value on ONE row, chart fills the rest. Putting the
    // header inline frees vertical room so the responsive chart has real height.
    return (
      <Card variant="compact" className="h-full overflow-hidden">
        <div className="flex h-full flex-col gap-1">
          <div className="flex items-baseline justify-between gap-2">
            <span className="truncate text-xs uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
              {metric.label}
            </span>
            <span className="shrink-0 text-base font-bold leading-none text-zinc-900 dark:text-white">
              {latestText}
            </span>
          </div>
          <div className="-mx-1 min-h-0 flex-1">
            {kind === 'bar' ? (
              <BarTileChart data={metric.data} />
            ) : (
              <LineTileChart data={metric.data} />
            )}
          </div>
        </div>
      </Card>
    )
  }

  // Square: centered number, matches a stat tile's visual weight.
  return (
    <Card variant="compact" className="h-full overflow-hidden">
      <div className="flex h-full flex-col justify-center gap-1">
        <div className="truncate text-xs uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
          {metric.label}
        </div>
        <div className="text-2xl font-extrabold tracking-tight leading-none text-zinc-900 dark:text-white">
          {latestText}
        </div>
      </div>
    </Card>
  )
}

function MissingTileCard({ label }: { label: string }) {
  return (
    <Card variant="compact" className="h-full overflow-hidden">
      <div className="flex h-full items-center text-xs text-zinc-400 dark:text-zinc-500">
        {label}
      </div>
    </Card>
  )
}

// Shimmer placeholder for a metric / smart tile while /api/dashboard/tiles is
// still loading for the first time. Matches MetricTileCard's label-over-value
// shape at the same height so there's no layout shift when real data lands.
function TileSkeletonCard(): React.ReactNode {
  return (
    <Card variant="compact" className="h-full overflow-hidden" aria-hidden="true">
      <div className="flex h-full flex-col justify-center gap-2">
        <div className="h-3 w-2/3 animate-pulse rounded bg-zinc-100 dark:bg-zinc-800" />
        <div className="h-6 w-1/2 animate-pulse rounded bg-zinc-100 dark:bg-zinc-800" />
      </div>
    </Card>
  )
}

// ── Grid ────────────────────────────────────────────────────────────────────

// Cache keys for the SWR-style instant repaint on reopen.
const TILES_CACHE_KEY = 'dashboard.tiles'
const LAYOUT_CACHE_KEY = 'dashboard.layout'

export function TileGrid({ statContext, layout: layoutProp, className }: TileGridProps) {
  const controlled = layoutProp !== undefined
  // Seed both layout and tiles synchronously from cache so a reopen paints the
  // last-known grid instantly (no skeleton) and only revalidates in the
  // background. A true cold first-ever load has no cache → skeletons show.
  const [fetchedLayout, setFetchedLayout] = useState<DashboardTile[] | null>(
    () => (controlled ? null : readCache<DashboardTile[]>(LAYOUT_CACHE_KEY)),
  )
  const [tilesData, setTilesData] = useState<TilesResponse | null>(
    () => readCache<TilesResponse>(TILES_CACHE_KEY),
  )
  const [errored, setErrored] = useState(false)

  const layout = controlled ? layoutProp : fetchedLayout
  // Metric/smart tiles skeleton until tiles data has arrived at least once
  // (from cache or network). Once we have any tilesData, real cards render.
  const tilesLoading = tilesData === null

  // Record a smart-tile card tap: optimistically bump the in-memory engagement
  // so the boost applies immediately, and persist server-side (fire-and-forget).
  const recordTileTap = useCallback((tappedKey: string) => {
    const nowIso = new Date().toISOString()
    setTilesData((prev) => {
      if (!prev) return prev
      const list = prev.engagement ? [...prev.engagement] : []
      const i = list.findIndex((e) => e.key === tappedKey)
      if (i >= 0) list[i] = { ...list[i], taps: list[i].taps + 1, lastTapAt: nowIso }
      else list.push({ key: tappedKey, taps: 1, lastTapAt: nowIso })
      return { ...prev, engagement: list }
    })
    try {
      void fetch('/api/dashboard/tile-tap', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(authHeaders() ?? {}) },
        body: JSON.stringify({ key: tappedKey }),
      })
    } catch {
      // non-critical — the optimistic bump still tunes this session
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    async function load() {
      // Metric/suggestion data — non-fatal: if this fails, metric and
      // smart-rotating tiles degrade to their placeholders while stat tiles
      // (which render from statContext) keep working.
      try {
        const tilesRes = await fetch('/api/dashboard/tiles', { headers: authHeaders() })
        if (tilesRes.ok && !cancelled) {
          const fresh = (await tilesRes.json()) as TilesResponse
          setTilesData(fresh)
          writeCache(TILES_CACHE_KEY, fresh)
        }
      } catch {
        // ignore — metric tiles show placeholders
      }

      // In controlled mode the parent owns the layout — don't self-fetch.
      if (controlled) return

      try {
        const statPref = (() => {
          try {
            const raw = window.localStorage?.getItem('dashboard.tiles.v1')
            if (!raw) return ''
            const arr = JSON.parse(raw)
            return Array.isArray(arr) ? arr.join(',') : ''
          } catch {
            return ''
          }
        })()
        const layoutRes = await fetch(
          `/api/dashboard/layout${statPref ? `?statPref=${encodeURIComponent(statPref)}` : ''}`,
          { headers: authHeaders() },
        )
        if (!layoutRes.ok) throw new Error(`layout ${layoutRes.status}`)
        const layoutJson = (await layoutRes.json()) as { layout: DashboardTile[] }
        if (!cancelled) {
          const nextLayout = layoutJson.layout ?? []
          setFetchedLayout(nextLayout)
          writeCache(LAYOUT_CACHE_KEY, nextLayout)
        }
      } catch {
        if (!cancelled) setErrored(true)
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [controlled])

  const metricsById = useMemo(() => {
    const m = new Map<string, MetricSummary>()
    for (const s of tilesData?.metrics ?? []) m.set(s.id, s)
    return m
  }, [tilesData])

  const rotationMetricIds = useMemo(
    () => (tilesData?.metrics ?? []).map((m) => m.id),
    [tilesData],
  )

  if (errored) {
    // Fail soft: render nothing rather than a broken dashboard. The rest of the
    // page (next workout, progress chart, etc.) still renders.
    return null
  }
  if (!layout) {
    return (
      <div
        data-testid="tilegrid-loading"
        className={cn('grid grid-cols-2 gap-2 sm:grid-cols-4 sm:gap-3', className)}
        aria-busy="true"
      >
        {Array.from({ length: 4 }).map((_, i) => (
          <Card key={i} variant="compact" className="h-20 animate-pulse" />
        ))}
      </div>
    )
  }

  // Smart-rotating tiles cycle through card types the user hasn't already
  // pinned — surfacing what's NOT on the grid rather than repeating it. Build
  // the exclude-set from the current layout's stat + metric tiles (keyed the
  // same way buildRotationItems keys its items). Reusing the standard renderers
  // keeps a rotated card visually identical to a pinned one.
  const pinnedKeys = new Set<string>()
  for (const t of layout) {
    if (t.kind === 'stat') pinnedKeys.add(`stat:${t.id}`)
    else if (t.kind === 'metric') pinnedKeys.add(`metric:${t.id}`)
  }
  // Adaptive signal: per-key tap history boosts cards the user actually opens.
  const engagement = (tilesData?.engagement ?? []).map((e) => ({
    key: e.key,
    taps: e.taps,
    lastTapAt: e.lastTapAt,
  }))
  const rotationNow = tilesData?.now ? new Date(tilesData.now) : undefined
  const renderRotationMetric = (id: string, size: DashboardTileSize) => {
    const metric = metricsById.get(id)
    return metric ? <MetricTileCard metric={metric} size={size} /> : <MissingTileCard label={id} />
  }
  // Build a smart tile's rotation pool, honoring its per-tile settings.pool
  // (defaults to the original stat cards — no workout metrics).
  const buildSmartItems = (tile: DashboardTile) => {
    const poolList = tile.settings?.pool ?? DEFAULT_SMART_POOL
    return buildRotationItems(statContext, rotationMetricIds, renderRotationMetric, {
      excludeKeys: pinnedKeys,
      engagement,
      now: rotationNow,
      poolKeys: new Set(poolList),
    })
  }

  const dashboardSuggestions = (tilesData?.suggestions ?? []).filter(
    // Only show suggestions explicitly targeted at the dashboard surface. When
    // a suggestion has no context (legacy), default to showing it so nothing
    // silently disappears before the alert-routing task lands.
    (s) => {
      const ctx = (s as Suggestion & { context?: { surface?: string } }).context
      return !ctx?.surface || ctx.surface === 'dashboard'
    },
  )

  // Ordinal of each smart-rotating tile among smart tiles only, so adjacent
  // smart tiles can stagger their start (and thus never show the same card).
  const smartOrdinal = new Map<number, number>()
  {
    let n = 0
    layout.forEach((t, i) => {
      if (t.kind === 'smart-rotating') smartOrdinal.set(i, n++)
    })
  }

  return (
    <>
      {/* Fixed-height square cells so every tile is the SAME size. A 1x1 tile is
          one cell; a 2x1 tile spans two columns but the same single row height —
          so square and wide are the only two footprints and heights always
          match. */}
      <div
        data-testid="tilegrid"
        data-tour="tile-grid"
        className={cn(
          'grid grid-cols-2 gap-2 auto-rows-[6rem] sm:grid-cols-4 sm:gap-3 sm:auto-rows-[6.25rem]',
          className,
        )}
      >
        {layout.map((tile, idx) => {
          const span = tile.size === '2x1' ? 'col-span-2' : 'col-span-1'
          // Cell is a flex column with a definite (grid-row) height, and its
          // single child (the Card, whatever tile kind) is forced to fill both
          // dimensions. This is what makes every tile render at EXACTLY the row
          // height — a plain block grid-item doesn't give % heights a definite
          // parent, so cards collapsed to their content height before.
          const cellClass = cn(
            span,
            'flex min-w-0 flex-col overflow-hidden [&>*]:h-full [&>*]:w-full',
          )
          const key = `${tile.kind}-${tile.id}-${idx}`

          if (tile.kind === 'stat') {
            if (!isStatId(tile.id)) return null
            return (
              // data-tour anchors the onboarding tour to specific stat tiles
              // (e.g. tile-streak, tile-mood) wherever the user has placed them.
              <div key={key} className={cellClass} data-tour={`tile-${tile.id}`}>
                <TileErrorBoundary label={TILE_DEFS[tile.id].label}>
                  {TILE_DEFS[tile.id].render(statContext, tile.size)}
                </TileErrorBoundary>
              </div>
            )
          }

          if (tile.kind === 'metric') {
            // While tiles data is still loading for the first time, show a
            // skeleton rather than the "missing" placeholder — the metric isn't
            // missing, it just hasn't arrived yet.
            if (tilesLoading) {
              return (
                <div key={key} className={cellClass}>
                  <TileSkeletonCard />
                </div>
              )
            }
            const metric = metricsById.get(tile.id)
            return (
              <div key={key} className={cellClass}>
                <TileErrorBoundary label={metric?.label ?? tile.id}>
                  {metric ? (
                    <MetricTileCard metric={metric} size={tile.size} />
                  ) : (
                    <MissingTileCard label={tile.id} />
                  )}
                </TileErrorBoundary>
              </div>
            )
          }

          // smart-rotating — skeleton until tiles data lands (the rotation pool
          // is built from metric data we don't have yet on a cold load).
          if (tilesLoading) {
            return (
              <div key={key} className={cellClass}>
                <TileSkeletonCard />
              </div>
            )
          }

          // Per-tile pool (honors settings.pool) + relevance order; stagger by
          // ordinal so two side-by-side smart tiles start on different cards.
          const smartItems = buildSmartItems(tile)
          const ordinal = smartOrdinal.get(idx) ?? 0
          const startIndex =
            smartItems.length > 0
              ? Math.round((ordinal * smartItems.length) / Math.max(1, smartOrdinal.size)) %
                smartItems.length
              : 0
          return (
            <div key={key} className={cellClass}>
              <TileErrorBoundary label="Smart tile">
                <SmartRotatingTile
                  items={smartItems}
                  size={tile.size}
                  startIndex={startIndex}
                  intervalMs={tile.settings?.intervalMs}
                  onTap={recordTileTap}
                />
              </TileErrorBoundary>
            </div>
          )
        })}
      </div>

      {/* Suggestion banners live OUTSIDE the fixed-row grid so their natural
          height isn't clipped to a tile cell. */}
      {dashboardSuggestions.length > 0 && (
        <div className="mt-2 space-y-2" data-tour="nudge-card">
          {dashboardSuggestions.map((s) => (
            <SuggestionCard key={`sug-${s.id}`} suggestion={s} />
          ))}
        </div>
      )}
    </>
  )
}

export default TileGrid
