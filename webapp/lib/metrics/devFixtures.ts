// Dev-only fixture metrics used by /dashboard/_dev/tile-gallery to preview
// each tile variant against deterministic data. Idempotent registration —
// safe to call on every render or import.

import { registerMetric, resolveMetric } from './registry'
import { aggregateStrengthCurve, type RawWorkoutLog } from './workout/strengthCurve'
import {
  aggregateWeeklyVolumeByMuscle,
  bucketsToDataPoints,
  lastNWeekStarts,
  type ExerciseMuscles,
} from './workout/weeklyVolumeByMuscle'
import {
  buildPrsTimeline,
  eventsToDataPoints,
} from './workout/prsTimeline'
import { epley1RM, type IExercisePR } from '../exercisePRs'
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

// Deterministic fixture: 8 weekly bench-press sessions, gentle progression.
const DEV_STRENGTH_CURVE_LOGS: RawWorkoutLog[] = Array.from({ length: 8 }, (_, i) => ({
  date: new Date(Date.UTC(2026, 2, 1) + i * 7 * MS_PER_DAY),
  completed: true,
  exercises: [
    {
      exerciseSlug: 'bench-press',
      sets: [
        { weight: 135 + i * 5, reps: 5, completed: true },
        { weight: 145 + i * 5, reps: 3, completed: true },
      ],
    },
  ],
}))

// Deterministic fixture: 4 weekly mixed push/pull/leg sessions.
const DEV_WEEKLY_VOLUME_ANCHOR = new Date(Date.UTC(2026, 4, 25)) // Mon 2026-05-25
const DEV_WEEKLY_VOLUME_LOGS: RawWorkoutLog[] = (() => {
  const logs: RawWorkoutLog[] = []
  for (let week = 0; week < 4; week++) {
    const monday = new Date(DEV_WEEKLY_VOLUME_ANCHOR.getTime() - (3 - week) * 7 * MS_PER_DAY)
    // Push day (Mon)
    logs.push({
      date: new Date(monday.getTime() + 0 * MS_PER_DAY),
      completed: true,
      exercises: [
        { exerciseSlug: 'bench-press', sets: [
          { weight: 135 + week * 5, reps: 5, completed: true },
          { weight: 145 + week * 5, reps: 3, completed: true },
        ]},
      ],
    })
    // Pull day (Wed)
    logs.push({
      date: new Date(monday.getTime() + 2 * MS_PER_DAY),
      completed: true,
      exercises: [
        { exerciseSlug: 'lat-pulldown', sets: [
          { weight: 100 + week * 5, reps: 8, completed: true },
        ]},
      ],
    })
    // Leg day (Fri)
    logs.push({
      date: new Date(monday.getTime() + 4 * MS_PER_DAY),
      completed: true,
      exercises: [
        { exerciseSlug: 'back-squat', sets: [
          { weight: 185 + week * 5, reps: 5, completed: true },
          { weight: 200 + week * 5, reps: 3, completed: true },
        ]},
      ],
    })
  }
  return logs
})()

const DEV_VOLUME_MUSCLE_MAP = new Map<string, ExerciseMuscles>([
  ['bench-press',  { primary: ['chest'], secondary: ['triceps', 'front_delts'] }],
  ['lat-pulldown', { primary: ['lats'],  secondary: ['biceps', 'mid_back', 'rhomboids'] }],
  ['back-squat',   { primary: ['quads', 'glutes'], secondary: ['hamstrings', 'adductors', 'erector_spinae'] }],
])

// Deterministic PR records used by the PRs-timeline fixture.
const DEV_PRS_TIMELINE_RECORDS: IExercisePR[] = [
  {
    exerciseSlug: 'bench-press',
    exerciseName: 'Bench Press',
    maxWeight: { weight: 225, reps: 1, e1rm: 232.5, date: new Date(Date.UTC(2026, 4, 20)) },
    maxReps:   { weight: 135, reps: 12, e1rm: 189,  date: new Date(Date.UTC(2026, 4, 6))  },
    maxE1RM:   { weight: 225, reps: 1, e1rm: 232.5, date: new Date(Date.UTC(2026, 4, 20)) },
  },
  {
    exerciseSlug: 'back-squat',
    exerciseName: 'Back Squat',
    maxWeight: { weight: 315, reps: 1, e1rm: 325.5, date: new Date(Date.UTC(2026, 4, 22)) },
    maxReps:   { weight: 225, reps: 10, e1rm: 300, date: new Date(Date.UTC(2026, 3, 28)) },
    maxE1RM:   { weight: 315, reps: 1, e1rm: 325.5, date: new Date(Date.UTC(2026, 4, 22)) },
  },
]

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
    id: '_dev_line_strength_curve',
    label: 'Strength curve — Bench Press (dev)',
    unit: 'lb',
    domain: 'workout',
    trendDirection: 'up-good',
    compute: async () => {
      const points = aggregateStrengthCurve(DEV_STRENGTH_CURVE_LOGS, 'bench-press')
      return points.map(p => ({
        t: p.t,
        value: Math.round(p.e1RM * 10) / 10,
        label: `${p.weight}×${p.reps} (e1RM ${Math.round(epley1RM(p.weight, p.reps))})`,
      }))
    },
  },
  {
    id: '_dev_bar_volume_by_muscle',
    label: 'Weekly volume by muscle (dev)',
    unit: 'lb',
    domain: 'workout',
    trendDirection: 'up-good',
    compute: async () => {
      const weekStarts = lastNWeekStarts(DEV_WEEKLY_VOLUME_ANCHOR, 4)
      const buckets = aggregateWeeklyVolumeByMuscle(
        DEV_WEEKLY_VOLUME_LOGS,
        DEV_VOLUME_MUSCLE_MAP,
        weekStarts,
      )
      return bucketsToDataPoints(buckets)
    },
  },
  {
    id: '_dev_line_prs_timeline',
    label: 'PRs timeline (dev)',
    unit: 'lb',
    domain: 'workout',
    trendDirection: 'up-good',
    compute: async () => {
      const events = buildPrsTimeline(DEV_PRS_TIMELINE_RECORDS)
      return eventsToDataPoints(events)
    },
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
