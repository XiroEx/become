// Dev-only fixture metrics used by /dashboard/_dev/tile-gallery to preview
// each tile variant against deterministic data. Idempotent registration —
// safe to call on every render or import.

import { registerMetric, resolveMetric } from './registry'
import type { DataPoint, Metric } from './types'

const MS_PER_DAY = 24 * 60 * 60 * 1000

function dailySeries(
  count: number,
  generator: (i: number) => number,
): DataPoint[] {
  const out: DataPoint[] = []
  for (let i = 0; i < count; i++) {
    out.push({
      t: new Date(Date.UTC(2026, 4, 1) + i * MS_PER_DAY),
      value: generator(i),
    })
  }
  return out
}

export const DEV_FIXTURE_METRICS: Metric[] = [
  {
    id: '_dev_line_workouts',
    label: 'Workouts (dev)',
    unit: 'workouts',
    domain: 'workout',
    trendDirection: 'up-good',
    goalValue: 5,
    compute: async () => dailySeries(14, (i) => 1 + (i % 3)),
  },
  {
    id: '_dev_bar_volume',
    label: 'Weekly volume (dev)',
    unit: 'kg',
    domain: 'workout',
    trendDirection: 'up-good',
    compute: async () =>
      dailySeries(7, (i) => 1000 + i * 250 + (i % 2 === 0 ? 100 : 0)),
  },
  {
    id: '_dev_number_streak',
    label: 'Streak (dev)',
    unit: 'days',
    domain: 'mindset',
    trendDirection: 'up-good',
    compute: async () => dailySeries(2, (i) => (i === 0 ? 11 : 12)),
  },
  {
    id: '_dev_heatmap_activity',
    label: 'Daily activity (dev)',
    unit: 'sessions',
    domain: 'workout',
    trendDirection: 'up-good',
    compute: async () => dailySeries(28, (i) => (i % 4 === 0 ? 0 : 1 + (i % 3))),
  },
  {
    id: '_dev_muscle_intensity',
    label: 'Muscle intensity (dev)',
    unit: 'intensity',
    domain: 'workout',
    trendDirection: 'up-good',
    compute: async () => [
      { t: new Date('2026-05-25T00:00:00Z'), value: 1.0, label: 'chest' },
      { t: new Date('2026-05-25T00:00:00Z'), value: 0.7, label: 'lats' },
      { t: new Date('2026-05-25T00:00:00Z'), value: 0.4, label: 'quads-l' },
      { t: new Date('2026-05-25T00:00:00Z'), value: 0.4, label: 'quads-r' },
      { t: new Date('2026-05-25T00:00:00Z'), value: 0.2, label: 'biceps-l' },
      { t: new Date('2026-05-25T00:00:00Z'), value: 0.2, label: 'biceps-r' },
    ],
  },
]

export function ensureDevFixturesRegistered(): void {
  for (const m of DEV_FIXTURE_METRICS) {
    if (!resolveMetric(m.id)) registerMetric(m)
  }
}
