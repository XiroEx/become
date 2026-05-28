// Line chart tile. Async server component: resolves the metric server-side
// via the registry, then delegates rendering to the client-only LineTileChart.

import { useMetricData } from '@/lib/metrics/useMetricData'
import type { MetricWindow } from '@/lib/metrics/types'
import { TileShell, TileShellError } from './TileShell'
import { LineTileChart } from './LineTileChart'

export interface LineTileProps {
  metricId: string
  window: MetricWindow
  className?: string
}

export async function LineTile({ metricId, window, className }: LineTileProps) {
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
      <LineTileChart data={r.data} />
    </TileShell>
  )
}
