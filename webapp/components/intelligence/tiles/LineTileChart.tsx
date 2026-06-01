'use client'

import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip } from 'recharts'
import type { DataPoint } from '@/lib/metrics/types'

export interface LineTileChartProps {
  data: DataPoint[]
  /** Optional fixed height. When omitted the chart fills its parent (responsive),
   *  so it never overflows the tile and gets clipped. */
  height?: number
  color?: string
}

export function LineTileChart({ data, height, color = '#22d3ee' }: LineTileChartProps) {
  // `t` is typed Date but arrives as an ISO string over JSON (from
  // /api/dashboard/tiles), so coerce defensively. Drop any unparseable points.
  const rows = data
    .map((p) => {
      const ms = p.t instanceof Date ? p.t.getTime() : new Date(p.t as unknown as string).getTime()
      return { x: ms, y: p.value, label: p.label }
    })
    .filter((r) => Number.isFinite(r.x) && Number.isFinite(r.y))

  return (
    // Fill the parent both ways so the chart fits the available tile space
    // instead of overflowing a fixed pixel box (which the card then clipped).
    <div data-testid="line-tile-chart" className="h-full w-full overflow-hidden">
      <ResponsiveContainer width="100%" height={height ?? '100%'}>
        <LineChart data={rows} margin={{ top: 4, right: 4, left: 4, bottom: 2 }}>
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
      </ResponsiveContainer>
    </div>
  )
}
