'use client'

import { useEffect, useState } from 'react'
import { LineTile } from './tiles/LineTile'
import { BarTile } from './tiles/BarTile'
import { NumberTile } from './tiles/NumberTile'
import { HeatmapTile } from './tiles/HeatmapTile'
import { MuscleMapTile } from './tiles/MuscleMapTile'
import { SuggestionCard } from './SuggestionCard'
import { resolveMetric } from '@/lib/metrics/registry'
import type { TileCandidate } from '@/lib/dashboardTiles/rotator'
import type { Suggestion } from '@/lib/suggestions/types'
import type { DataPoint, MetricDomain, MetricTrendDirection } from '@/lib/metrics/types'

export interface RotatorResponse {
  tiles: TileCandidate[]
  metrics?: Array<{
    id: string
    label: string
    unit: string
    domain: MetricDomain
    trendDirection: MetricTrendDirection
    latest: DataPoint | null
    data: DataPoint[]
    error?: string
  }>
  suggestions?: Suggestion[]
  now: string
}

const RECENT_WINDOW_DAYS = 28
const MS_PER_DAY = 24 * 60 * 60 * 1000

// Picks a tile component by metric.domain or by metric.id heuristics. Falls
// back to NumberTile so unknown metrics still render something.
function tileComponentFor(metricId: string) {
  if (metricId.includes('heatmap')) return HeatmapTile
  if (metricId.includes('muscle')) return MuscleMapTile
  if (metricId.includes('bar') || metricId.includes('volume')) return BarTile
  if (metricId.includes('line') || metricId.includes('series')) return LineTile
  return NumberTile
}

function formatValue(value: number): string {
  if (Number.isInteger(value)) return String(value)
  return value.toFixed(1).replace(/\.0$/, '')
}

export interface IntelligenceRotatorProps {
  /** Inject for testing — bypasses the network fetch. */
  initialResponse?: RotatorResponse
  /** Inject for testing — bypasses suggestion lookup via API. */
  resolveSuggestion?: (suggestionId: string) => Suggestion | undefined
  className?: string
}

export function IntelligenceRotator({
  initialResponse,
  resolveSuggestion,
  className,
}: IntelligenceRotatorProps) {
  const [data, setData] = useState<RotatorResponse | null>(initialResponse ?? null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(!initialResponse)

  useEffect(() => {
    if (initialResponse) return
    let cancelled = false
    async function load() {
      try {
        const token =
          typeof window !== 'undefined'
            ? window.localStorage?.getItem('token')
            : null
        const res = await fetch('/api/dashboard/tiles', {
          headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        })
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const json = (await res.json()) as RotatorResponse
        if (!cancelled) {
          setData(json)
          setLoading(false)
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : String(err))
          setLoading(false)
        }
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [initialResponse])

  if (loading) {
    return (
      <div
        data-testid="rotator-loading"
        className={className}
        aria-busy="true"
      >
        Loading…
      </div>
    )
  }
  if (error) {
    return (
      <div data-testid="rotator-error" role="alert" className={className}>
        Could not load dashboard tiles: {error}
      </div>
    )
  }
  if (!data || data.tiles.length === 0) {
    return (
      <div
        data-testid="rotator-empty"
        className={className}
      >
        No intelligence tiles yet — keep logging activity and they’ll appear.
      </div>
    )
  }

  const now = new Date(data.now)
  const suggestionsById = new Map(
    (data.suggestions ?? []).map((suggestion) => [suggestion.id, suggestion]),
  )
  const metricsById = new Map(
    (data.metrics ?? []).map((metric) => [metric.id, metric]),
  )
  const windowProp = {
    start: new Date(now.getTime() - RECENT_WINDOW_DAYS * MS_PER_DAY),
    end: now,
  }

  return (
    <div
      data-testid="rotator-grid"
      className={className}
    >
      {data.tiles.map((c) => {
        if (c.kind === 'metric') {
          const metric = resolveMetric(c.tileId)
          if (!metric) {
            const summary = metricsById.get(c.tileId)
            if (summary) {
              return (
                <div
                  key={`m-${c.tileId}`}
                  data-testid="rotator-metric-summary"
                  data-tile-id={c.tileId}
                  className="rounded-xl bg-zinc-900/60 p-3 text-zinc-100 ring-1 ring-white/10"
                >
                  <div className="text-[11px] uppercase tracking-wide text-zinc-500">
                    {summary.label}
                  </div>
                  <div className="mt-0.5 text-2xl font-semibold leading-tight">
                    {summary.latest
                      ? `${formatValue(summary.latest.value)} ${summary.unit}`.trim()
                      : 'No data yet'}
                  </div>
                  {summary.error ? (
                    <div className="mt-2 text-xs text-amber-300">
                      Data temporarily unavailable.
                    </div>
                  ) : null}
                </div>
              )
            }
            return (
              <div
                key={`m-${c.tileId}`}
                data-testid="rotator-missing-metric"
                data-tile-id={c.tileId}
                className="rounded-xl bg-zinc-900/60 p-3 text-xs text-zinc-500"
              >
                Tile {c.tileId} unavailable.
              </div>
            )
          }
          const Comp = tileComponentFor(c.tileId)
          return (
            <Comp
              key={`m-${c.tileId}`}
              metricId={c.tileId}
              window={windowProp}
            />
          )
        }
        const sug =
          resolveSuggestion?.(c.suggestionId) ?? suggestionsById.get(c.suggestionId)
        if (!sug) {
          return (
            <div
              key={`s-${c.suggestionId}`}
              data-testid="rotator-missing-suggestion"
              data-suggestion-id={c.suggestionId}
              className="rounded-xl bg-zinc-900/60 p-3 text-xs text-zinc-500"
            >
              Suggestion {c.suggestionId} unavailable.
            </div>
          )
        }
        return <SuggestionCard key={`s-${sug.id}`} suggestion={sug} />
      })}
    </div>
  )
}
