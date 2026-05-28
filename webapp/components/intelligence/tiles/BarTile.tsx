// Bar chart tile. Async server component; client body in BarTileChart.

import { useMetricData } from '@/lib/metrics/useMetricData'
import type { MetricWindow } from '@/lib/metrics/types'
import { TileShell, TileShellError } from './TileShell'
import { BarTileChart } from './BarTileChart'

export interface BarTileProps {
  metricId: string
  window: MetricWindow
  className?: string
}

export async function BarTile({ metricId, window, className }: BarTileProps) {
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
  return (
    <TileShell
      metric={r.metric}
      latest={r.latest}
      trend={r.trend}
      className={className}
    >
      <BarTileChart data={r.data} />
    </TileShell>
  )
}
