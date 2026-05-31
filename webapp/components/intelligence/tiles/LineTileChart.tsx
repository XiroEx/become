'use client'

import { LineChart, Line, XAxis, YAxis, Tooltip } from 'recharts'
import type { DataPoint } from '@/lib/metrics/types'

export interface LineTileChartProps {
  data: DataPoint[]
  width?: number
  height?: number
  color?: string
}

export function LineTileChart({
  data,
  width = 280,
  height = 96,
  color = '#22d3ee',
}: LineTileChartProps) {
  // `t` is typed Date but arrives as an ISO string over JSON (from
  // /api/dashboard/tiles), so coerce defensively. Drop any unparseable points.
  const rows = data
    .map((p) => {
      const ms = p.t instanceof Date ? p.t.getTime() : new Date(p.t as unknown as string).getTime()
      return { x: ms, y: p.value, label: p.label }
    })
    .filter((r) => Number.isFinite(r.x) && Number.isFinite(r.y))
  return (
    <div data-testid="line-tile-chart" className="overflow-hidden">
      <LineChart
        width={width}
        height={height}
        data={rows}
        margin={{ top: 4, right: 4, left: 4, bottom: 4 }}
      >
        <XAxis dataKey="x" hide />
        <YAxis hide domain={['auto', 'auto']} />
        <Tooltip cursor={false} contentStyle={{ display: 'none' }} />
        <Line
          type="monotone"
          dataKey="y"
          stroke={color}
          strokeWidth={2}
          dot={false}
          isAnimationActive={false}
        />
      </LineChart>
    </div>
  )
}
