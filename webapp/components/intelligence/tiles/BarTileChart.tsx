'use client'

import { BarChart, Bar, XAxis, YAxis, Tooltip } from 'recharts'
import type { DataPoint } from '@/lib/metrics/types'

export interface BarTileChartProps {
  data: DataPoint[]
  width?: number
  height?: number
  color?: string
}

export function BarTileChart({
  data,
  width = 280,
  height = 96,
  color = '#a855f7',
}: BarTileChartProps) {
  const rows = data.map((p) => ({ x: p.t.getTime(), y: p.value, label: p.label }))
  return (
    <div data-testid="bar-tile-chart" className="overflow-hidden">
      <BarChart
        width={width}
        height={height}
        data={rows}
        margin={{ top: 4, right: 4, left: 4, bottom: 4 }}
      >
        <XAxis dataKey="x" hide />
        <YAxis hide domain={['auto', 'auto']} />
        <Tooltip cursor={false} contentStyle={{ display: 'none' }} />
        <Bar dataKey="y" fill={color} isAnimationActive={false} radius={[2, 2, 0, 0]} />
      </BarChart>
    </div>
  )
}
