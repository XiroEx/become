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
  const rows = data.map((p) => ({ x: p.t.getTime(), y: p.value, label: p.label }))
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
