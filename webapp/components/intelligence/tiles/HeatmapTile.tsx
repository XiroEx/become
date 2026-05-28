// GitHub-style activity grid. Async server component.
// Data: DataPoint[] keyed by day. The grid covers the [window.start, window.end)
// span as 7 rows (Sun..Sat) × N columns (weeks). Cells without a matching
// data point render as 0-intensity. Per-cell aria-label gives the date + value.

import { useMetricData } from '@/lib/metrics/useMetricData'
import type { DataPoint, MetricWindow } from '@/lib/metrics/types'
import { cn } from '@/lib/cn'
import { TileShell, TileShellError } from './TileShell'

export interface HeatmapTileProps {
  metricId: string
  window: MetricWindow
  className?: string
}

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MS_PER_DAY = 24 * 60 * 60 * 1000

function dayKey(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`
}

function startOfDayUTC(d: Date): Date {
  return new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()),
  )
}

function startOfWeekUTC(d: Date): Date {
  const day = d.getUTCDay() // 0=Sun
  const start = startOfDayUTC(d)
  return new Date(start.getTime() - day * MS_PER_DAY)
}

export interface HeatmapCell {
  date: Date
  value: number
  intensity: number // normalized 0..1
}

export function buildHeatmapGrid(
  data: DataPoint[],
  window: MetricWindow,
): HeatmapCell[][] {
  const byDay = new Map<string, number>()
  for (const p of data) byDay.set(dayKey(p.t), p.value)

  const maxV = data.reduce((acc, p) => (p.value > acc ? p.value : acc), 0)

  const firstCellDate = startOfWeekUTC(window.start)
  const lastCellDate = startOfDayUTC(window.end)
  const totalDays =
    Math.floor((lastCellDate.getTime() - firstCellDate.getTime()) / MS_PER_DAY) +
    1
  const totalWeeks = Math.max(1, Math.ceil(totalDays / 7))

  // 7 rows (Sun..Sat) × N cols
  const grid: HeatmapCell[][] = []
  for (let row = 0; row < 7; row++) {
    const weekRow: HeatmapCell[] = []
    for (let col = 0; col < totalWeeks; col++) {
      const cellDate = new Date(
        firstCellDate.getTime() + (col * 7 + row) * MS_PER_DAY,
      )
      const v = byDay.get(dayKey(cellDate)) ?? 0
      const intensity = maxV > 0 ? Math.max(0, Math.min(1, v / maxV)) : 0
      weekRow.push({ date: cellDate, value: v, intensity })
    }
    grid.push(weekRow)
  }
  return grid
}

function cellClass(intensity: number): string {
  if (intensity === 0) return 'bg-zinc-800/70'
  if (intensity < 0.25) return 'bg-emerald-900'
  if (intensity < 0.5) return 'bg-emerald-700'
  if (intensity < 0.75) return 'bg-emerald-500'
  return 'bg-emerald-300'
}

export async function HeatmapTile({
  metricId,
  window,
  className,
}: HeatmapTileProps) {
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
  const grid = buildHeatmapGrid(r.data, window)
  const totalActive = r.data.filter((p) => p.value > 0).length
  return (
    <TileShell
      metric={r.metric}
      latest={r.latest}
      trend={r.trend}
      className={className}
    >
      <div
        data-testid="heatmap-tile-grid"
        data-active-days={totalActive}
        role="grid"
        aria-rowcount={7}
        aria-colcount={grid[0].length}
        className="grid grid-rows-7 gap-[3px]"
        style={{ gridTemplateRows: 'repeat(7, minmax(0, 1fr))' }}
      >
        {grid.map((row, rowIdx) => (
          <div
            key={rowIdx}
            role="row"
            aria-label={DAY_LABELS[rowIdx]}
            className="flex gap-[3px]"
          >
            {row.map((cell, colIdx) => (
              <div
                key={colIdx}
                role="gridcell"
                data-day={dayKey(cell.date)}
                data-value={cell.value}
                aria-label={`${dayKey(cell.date)}: ${cell.value} ${r.metric.unit}`}
                className={cn('h-3 w-3 rounded-[2px]', cellClass(cell.intensity))}
              />
            ))}
          </div>
        ))}
      </div>
    </TileShell>
  )
}
