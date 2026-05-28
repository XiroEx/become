// Metric data resolver — used by chart tiles.
//
// Despite the `use` prefix (kept to match the platform's documented surface),
// this is a plain async function, NOT a React hook. It runs server-side:
// resolves a registered Metric by id, calls metric.compute(), and returns a
// status-tagged result the tile shell can render directly. Pure helpers
// (deriveLatest / deriveTrend / ariaLabelForMetric / tileHref) are exported
// for reuse and unit testing.

import { resolveMetric } from './registry'
import type { DataPoint, Metric, MetricWindow } from './types'

export type TrendArrow = 'up' | 'down' | 'flat'

export type MetricDataResult =
  | {
      status: 'ok'
      metric: Metric
      data: DataPoint[]
      latest: DataPoint | null
      trend: TrendArrow
    }
  | {
      status: 'error'
      metricId: string
      error: string
      metric: Metric | null
    }

export function deriveLatest(data: DataPoint[]): DataPoint | null {
  if (data.length === 0) return null
  return data[data.length - 1]
}

export function deriveTrend(data: DataPoint[]): TrendArrow {
  if (data.length < 2) return 'flat'
  const last = data[data.length - 1].value
  const prev = data[data.length - 2].value
  if (last > prev) return 'up'
  if (last < prev) return 'down'
  return 'flat'
}

function describeTrend(trend: TrendArrow, direction: Metric['trendDirection']): string {
  if (trend === 'flat') return 'trending flat'
  if (direction === 'neutral') {
    return trend === 'up' ? 'trending up' : 'trending down'
  }
  const good =
    (trend === 'up' && direction === 'up-good') ||
    (trend === 'down' && direction === 'down-good')
  const movement = trend === 'up' ? 'up' : 'down'
  return `trending ${movement} (${good ? 'good' : 'bad'})`
}

export function ariaLabelForMetric(
  metric: Metric,
  latest: DataPoint | null,
  trend: TrendArrow,
): string {
  const value =
    latest == null
      ? 'no data yet'
      : `${formatValue(latest.value)} ${metric.unit}`.trim()
  return `${metric.label}: ${value} — ${describeTrend(trend, metric.trendDirection)}`
}

function formatValue(value: number): string {
  if (Number.isInteger(value)) return String(value)
  return value.toFixed(2).replace(/\.?0+$/, '')
}

export function tileHref(metricId: string): string {
  return `/dashboard/insights/${encodeURIComponent(metricId)}`
}

export async function useMetricData(
  metricId: string,
  window: MetricWindow,
): Promise<MetricDataResult> {
  const metric = resolveMetric(metricId)
  if (!metric) {
    return {
      status: 'error',
      metricId,
      error: `Unknown metric "${metricId}"`,
      metric: null,
    }
  }
  try {
    const data = await metric.compute('', window) // placeholder; real userId passed by caller
    return {
      status: 'ok',
      metric,
      data,
      latest: deriveLatest(data),
      trend: deriveTrend(data),
    }
  } catch (err) {
    return {
      status: 'error',
      metricId,
      error: err instanceof Error ? err.message : String(err),
      metric,
    }
  }
}

// Overload with userId — preferred when caller has auth context.
export async function fetchMetricData(
  metricId: string,
  userId: string,
  window: MetricWindow,
): Promise<MetricDataResult> {
  const metric = resolveMetric(metricId)
  if (!metric) {
    return {
      status: 'error',
      metricId,
      error: `Unknown metric "${metricId}"`,
      metric: null,
    }
  }
  try {
    const data = await metric.compute(userId, window)
    return {
      status: 'ok',
      metric,
      data,
      latest: deriveLatest(data),
      trend: deriveTrend(data),
    }
  } catch (err) {
    return {
      status: 'error',
      metricId,
      error: err instanceof Error ? err.message : String(err),
      metric,
    }
  }
}
