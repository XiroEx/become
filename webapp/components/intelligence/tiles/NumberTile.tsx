// Single big stat with trend arrow + delta vs prior point. No chart.

import { useMetricData } from '@/lib/metrics/useMetricData'
import type { DataPoint, MetricWindow } from '@/lib/metrics/types'
import { TileShell, TileShellError } from './TileShell'

export interface NumberTileProps {
  metricId: string
  window: MetricWindow
  className?: string
}

function formatValue(value: number): string {
  if (Number.isInteger(value)) return String(value)
  return value.toFixed(2).replace(/\.?0+$/, '')
}

function arrowFor(trend: 'up' | 'down' | 'flat'): string {
  if (trend === 'up') return '↑'
  if (trend === 'down') return '↓'
  return '→'
}

function computeDelta(data: DataPoint[]): number | null {
  if (data.length < 2) return null
  return data[data.length - 1].value - data[data.length - 2].value
}

export async function NumberTile({
  metricId,
  window,
  className,
}: NumberTileProps) {
  const r = await useMetricData(metricId, window)
  if (r.status === 'error') {
    return (
      <TileShellError
        message={r.error}
        metricId={metricId}
        className={className}
      />
    )
  }
  const { metric, data, latest, trend } = r
  const delta = computeDelta(data)
  const arrow = arrowFor(trend)
  return (
    <TileShell
      metric={metric}
      latest={latest}
      trend={trend}
      className={className}
    >
      <div className="flex items-baseline gap-2" data-testid="number-tile-body">
        <span className="text-3xl font-semibold text-zinc-100">
          {latest == null ? '—' : formatValue(latest.value)}
        </span>
        <span className="text-xs text-zinc-400">{metric.unit}</span>
      </div>
      <div className="mt-1 flex items-center gap-2 text-xs">
        <span
          data-testid="number-tile-arrow"
          aria-hidden="true"
          className={
            trend === 'up'
              ? 'text-emerald-400'
              : trend === 'down'
                ? 'text-rose-400'
                : 'text-zinc-500'
          }
        >
          {arrow}
        </span>
        <span className="text-zinc-400">
          {delta == null
            ? 'no prior value'
            : `${delta > 0 ? '+' : ''}${formatValue(delta)} vs prior`}
        </span>
      </div>
    </TileShell>
  )
}
