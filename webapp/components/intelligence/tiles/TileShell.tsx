// Shared chrome for chart tiles: link wrap to /dashboard/insights/[metricId],
// a11y label derived from metric + latest + trend, plus skeleton + error
// variants. No Recharts — concrete chart tiles (LineTile / BarTile / etc.)
// supply the body via children.

import Link from 'next/link'
import type { ReactNode } from 'react'
import { cn } from '@/lib/cn'
import type { Metric } from '@/lib/metrics/types'
import type { DataPoint } from '@/lib/metrics/types'
import {
  ariaLabelForMetric,
  tileHref,
  type TrendArrow,
} from '@/lib/metrics/useMetricData'

export interface TileShellProps {
  metric: Metric
  latest: DataPoint | null
  trend: TrendArrow
  children: ReactNode
  className?: string
}

export function TileShell({
  metric,
  latest,
  trend,
  children,
  className,
}: TileShellProps) {
  const label = ariaLabelForMetric(metric, latest, trend)
  return (
    <Link
      href={tileHref(metric.id)}
      aria-label={label}
      role="img"
      data-metric-id={metric.id}
      data-trend={trend}
      className={cn(
        'block rounded-xl bg-zinc-900/60 ring-1 ring-white/5 p-3 hover:ring-white/15 transition',
        className,
      )}
    >
      <div className="mb-1 flex items-baseline justify-between">
        <span className="text-xs uppercase tracking-wide text-zinc-400">
          {metric.label}
        </span>
        {metric.goalValue != null && (
          <span className="text-[10px] text-zinc-500">
            goal {metric.goalValue} {metric.unit}
          </span>
        )}
      </div>
      {children}
    </Link>
  )
}

export interface TileShellSkeletonProps {
  className?: string
}

export function TileShellSkeleton({ className }: TileShellSkeletonProps) {
  return (
    <div
      role="status"
      aria-busy="true"
      aria-label="Loading tile"
      className={cn(
        'block rounded-xl bg-zinc-900/60 ring-1 ring-white/5 p-3 animate-pulse',
        className,
      )}
    >
      <div className="mb-2 h-3 w-24 rounded bg-zinc-700/60" />
      <div className="h-16 w-full rounded bg-zinc-800/60" />
    </div>
  )
}

export interface TileShellErrorProps {
  message: string
  metricId?: string
  className?: string
}

export function TileShellError({
  message,
  metricId,
  className,
}: TileShellErrorProps) {
  return (
    <div
      role="alert"
      data-metric-id={metricId}
      className={cn(
        'block rounded-xl bg-rose-950/40 ring-1 ring-rose-500/30 p-3 text-rose-200',
        className,
      )}
    >
      <div className="text-xs uppercase tracking-wide text-rose-300/80">
        Tile error
      </div>
      <div className="mt-1 text-sm">{message}</div>
    </div>
  )
}
