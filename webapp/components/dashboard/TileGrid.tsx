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
  // Charts only render in the wide (2x1) slot — a square tile shows the number
  // only so its height matches the stat tiles exactly (uniform grid).
  const showChart = size === '2x1' && !metric.error && kind !== 'number'
  return (
    <Card variant="compact" className="h-full overflow-hidden">
      {/* Number-only (square) centers vertically so it matches a stat tile's
          visual weight; the wide variant keeps label-top / chart-bottom. */}
      <div
        className={cn(
          'flex h-full flex-col gap-1',
          !showChart && 'justify-center',
        )}
      >
        <div className="truncate text-xs uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
          {metric.label}
        </div>
        {metric.error ? (
          <div className="text-sm text-amber-600 dark:text-amber-400">
            Data temporarily unavailable.
          </div>
        ) : (
          <>
            <div
              className={cn(
                'font-bold leading-none text-zinc-900 dark:text-white',
                showChart ? 'text-lg' : 'text-2xl font-extrabold tracking-tight',
              )}
            >
              {latestText}
            </div>
            {showChart && (
              <div className="-mx-1 mt-auto min-h-0 flex-1">
                {kind === 'bar' ? (
                  <BarTileChart data={metric.data} height={48} />
                ) : (
                  <LineTileChart data={metric.data} height={48} />
                )}
              </div>
            )}
          </>
        )}
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

// ── Grid ────────────────────────────────────────────────────────────────────

export function TileGrid({ statContext, layout: layoutProp, className }: TileGridProps) {
  const controlled = layoutProp !== undefined
  const [fetchedLayout, setFetchedLayout] = useState<DashboardTile[] | null>(null)
  const [tilesData, setTilesData] = useState<TilesResponse | null>(null)
  const [errored, setErrored] = useState(false)

  const layout = controlled ? layoutProp : fetchedLayout

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
          setTilesData((await tilesRes.json()) as TilesResponse)
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
        if (!cancelled) setFetchedLayout(layoutJson.layout ?? [])
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
  const rotationItems = buildRotationItems(
    statContext,
    rotationMetricIds,
    (id, size) => {
      const metric = metricsById.get(id)
      return metric ? <MetricTileCard metric={metric} size={size} /> : <MissingTileCard label={id} />
    },
    pinnedKeys,
    engagement,
    rotationNow,
  )

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
              <div key={key} className={cellClass}>
                <TileErrorBoundary label={TILE_DEFS[tile.id].label}>
                  {TILE_DEFS[tile.id].render(statContext)}
                </TileErrorBoundary>
              </div>
            )
          }

          if (tile.kind === 'metric') {
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

          // smart-rotating — relevance-ordered pool; stagger by ordinal so two
          // side-by-side smart tiles start on different cards instead of mirroring.
          const ordinal = smartOrdinal.get(idx) ?? 0
          const startIndex =
            rotationItems.length > 0
              ? Math.round((ordinal * rotationItems.length) / Math.max(1, smartOrdinal.size)) %
                rotationItems.length
              : 0
          return (
            <div key={key} className={cellClass}>
              <TileErrorBoundary label="Smart tile">
                <SmartRotatingTile
                  items={rotationItems}
                  size={tile.size}
                  startIndex={startIndex}
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
        <div className="mt-2 space-y-2">
          {dashboardSuggestions.map((s) => (
            <SuggestionCard key={`sug-${s.id}`} suggestion={s} />
          ))}
        </div>
      )}
    </>
  )
}

export default TileGrid
