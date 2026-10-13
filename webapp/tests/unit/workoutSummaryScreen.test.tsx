// Run with: npm run test:file tests/unit/workoutSummaryScreen.test.tsx
//
// The screen half of the card "Exercise that have other metrics to track are
// not shown properly on the summary workout screen" / "it should also show
// what was a circuit and what was a super set".
//
// tests/unit/workoutSummaryMetrics.test.ts pins the rules. This renders the
// actual finish screen over a session with one of everything in it (a lift, a
// treadmill, a bodyweight circuit, a plank) and asserts the member sees the
// metrics they logged and the shape they ran — then checks, at the source
// level, that all three callers hand the component what it needs. The Live
// view is the one that cannot just pass its state through: it types cardio
// into its reps/weight boxes, so it has to translate first.

import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import fs from 'node:fs'
import path from 'node:path'
import { renderToStaticMarkup } from 'react-dom/server'

import WorkoutSummary from '@/components/WorkoutSummary'
import type { SummaryExercise, SummaryHistoryEntry, SummarySet } from '@/lib/workout/summaryMetrics'

const ROOT = path.join(__dirname, '../..')
const readSource = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8')
const noop = () => {}
const mmss = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`

function render(
  exercises: SummaryExercise[],
  exerciseData: SummarySet[][],
  exerciseHistory: Record<string, SummaryHistoryEntry> = {},
): string {
  return renderToStaticMarkup(
    <WorkoutSummary
      programCompleted={false}
      completedProgramName=""
      workout={{ day: 'Day 1', title: 'Full Body' }}
      elapsedTime={1830}
      exerciseData={exerciseData}
      exercises={exercises}
      exerciseHistory={exerciseHistory}
      summaryStreak={null}
      summaryGoal={null}
      formatTime={mmss}
      onDone={noop}
    />,
  )
}

// A session with one of every tracking type, and a circuit in the middle of it.
const MIXED_EXERCISES: SummaryExercise[] = [
  { name: 'Bench Press', trackingType: 'reps_weight' },
  { name: 'Treadmill', trackingType: 'time_distance', groupId: 'g1', groupType: 'circuit', groupLabel: 'Circuit', groupRounds: 3 },
  { name: 'Burpees', trackingType: 'reps_only', groupId: 'g1', groupType: 'circuit', groupLabel: 'Circuit', groupRounds: 3 },
  { name: 'Plank', trackingType: 'time' },
]

const MIXED_SETS: SummarySet[][] = [
  [
    { reps: 5, weight: 135, completed: true },
    { reps: 5, weight: 135, completed: true },
  ],
  [{ duration: 600, distance: 2000, speed: 3.5, completed: true }],
  [{ reps: 12, completed: true }],
  [{ duration: 45, completed: true }],
]

describe('WorkoutSummary: metrics that are not reps × weight', () => {
  it('shows a treadmill round as its duration, distance and speed instead of 0×0', () => {
    const html = render(MIXED_EXERCISES, MIXED_SETS)
    assert.match(html, /10:00 · 2000 m · 3\.5 mph/)
    assert.doesNotMatch(html, /0×0/)
  })

  it('shows a held plank as a duration and a bodyweight set as reps', () => {
    const html = render(MIXED_EXERCISES, MIXED_SETS)
    assert.match(html, /45s/)
    assert.match(html, /12 reps/)
  })

  it('still shows loaded work exactly as it did', () => {
    const html = render(MIXED_EXERCISES, MIXED_SETS)
    assert.match(html, /135×5/)
  })

  it('counts volume over the loaded work only, and shows the time spent on timed work', () => {
    const html = render(MIXED_EXERCISES, MIXED_SETS)
    // 135 × 5 × 2 = 1,350. The treadmill's 600 s × 2000 m is not volume.
    assert.match(html, /1,350<\/p>/)
    assert.match(html, /Volume lbs/)
    // 600 s + 45 s of logged work.
    assert.match(html, /10:45<\/p>/)
    assert.match(html, /Work time/)
  })

  it('a cardio-only session is given Rounds, Work time and Distance — never an empty volume tile', () => {
    const html = render(
      [
        { name: 'Treadmill', trackingType: 'time_distance' },
        { name: 'Rower', trackingType: 'time' },
      ],
      [[{ duration: 600, distance: 2000, completed: true }], [{ duration: 300, completed: true }]],
    )
    assert.match(html, /Rounds/)
    assert.match(html, /Work time/)
    assert.match(html, /Distance m/)
    assert.doesNotMatch(html, /Volume lbs/)
    assert.doesNotMatch(html, /0×0/)
  })

  it('counts a timed exercise in rounds, not sets', () => {
    const html = render([{ name: 'Plank', trackingType: 'time' }], [[{ duration: 45, completed: true }]])
    assert.match(html, /1\/1 round/)
    assert.doesNotMatch(html, /1\/1 set/)
  })

  it('does not call a ticked interval round a skipped set', () => {
    const html = render(
      [{ name: 'Bike Sprints', trackingType: 'intervals' }],
      [[{ completed: true }, { completed: true }]],
    )
    assert.match(html, /2\/2 rounds/)
    assert.doesNotMatch(html, /skipped/)
  })

  it('still marks a 0×0 set on loaded work as skipped', () => {
    const html = render(
      [{ name: 'Bench Press', trackingType: 'reps_weight' }],
      [[{ reps: 5, weight: 135, completed: true }, { reps: 0, weight: 0, completed: true }]],
    )
    assert.match(html, /1\/2 sets \(1 skipped\)/)
  })

  it('awards a record for a longer hold, with the previous duration beside it', () => {
    const html = render(
      [{ name: 'Plank', trackingType: 'time' }],
      [[{ duration: 60, completed: true }]],
      { Plank: { weight: 0, reps: 0, duration: 45, date: '2026-10-01' } },
    )
    assert.match(html, /New Personal Records/)
    assert.match(html, /1:00/)
    assert.match(html, /prev 45s/)
    assert.match(html, /1 new personal record/)
  })
})

describe('WorkoutSummary: circuits and supersets', () => {
  it('badges the circuit, with its rounds and its size', () => {
    const html = render(MIXED_EXERCISES, MIXED_SETS)
    assert.match(html, /data-testid="summary-group-circuit"/)
    assert.match(html, /Circuit/)
    assert.match(html, /3 rounds · 2 exercises/)
  })

  it('badges a superset as a superset', () => {
    const pair: SummaryExercise[] = [
      { name: 'Curl', trackingType: 'reps_weight', groupId: 'g2', groupType: 'superset' },
      { name: 'Skull Crusher', trackingType: 'reps_weight', groupId: 'g2', groupType: 'superset' },
    ]
    const html = render(pair, [[{ reps: 10, weight: 30, completed: true }], [{ reps: 10, weight: 40, completed: true }]])
    assert.match(html, /data-testid="summary-group-superset"/)
    assert.match(html, /Superset/)
    assert.match(html, /1 round · 2 exercises/)
  })

  it('leaves an ungrouped session with no group badge at all', () => {
    const html = render([{ name: 'Bench Press', trackingType: 'reps_weight' }], [[{ reps: 5, weight: 135, completed: true }]])
    assert.doesNotMatch(html, /data-testid="summary-group-/)
    assert.doesNotMatch(html, /Superset|Circuit/)
  })

  it('renders every exercise exactly once, grouped or not', () => {
    const html = render(MIXED_EXERCISES, MIXED_SETS)
    for (const name of ['Bench Press', 'Treadmill', 'Burpees', 'Plank']) {
      assert.equal(html.split(name).length - 1, 1, `${name} should appear once in the breakdown`)
    }
    for (let i = 0; i < MIXED_EXERCISES.length; i++) {
      assert.match(html, new RegExp(`data-testid="summary-exercise-${i}"`))
    }
  })
})

// ─── The callers ────────────────────────────────────────────────────────────

describe('REGRESSION: the three callers feed the summary real metrics', () => {
  const LIVE = 'app/dashboard/workout/[programId]/workout/live/LiveWorkoutClient.tsx'
  const TRACK = 'app/dashboard/workout/[programId]/workout/WorkoutFormClient.tsx'
  const CALENDAR = 'app/dashboard/calendar/CalendarClient.tsx'

  it('the Live view translates its reps/weight boxes before handing them over', () => {
    const src = readSource(LIVE)
    assert.match(src, /summarySetsFromLiveInputs/)
    assert.match(src, /exerciseData=\{summarySetsFromLiveInputs\(exercises, exerciseData\)\}/)
  })

  it('the Live view hands over the exercises themselves, tracking type and groups included', () => {
    assert.match(readSource(LIVE), /exercises=\{exercises\}/)
  })

  it('the Track view passes its own duration/distance/speed fields straight through', () => {
    const src = readSource(TRACK)
    // Its SetData is already canonical — it has the three cardio fields.
    assert.match(src, /interface SetData \{[^}]*duration: string;[^}]*distance: string;[^}]*speed: string;/)
    assert.match(src, /exercises=\{workout\.exercises\}/)
  })

  it('the calendar reads the log s own metrics, tracking type and group fields', () => {
    const src = readSource(CALENDAR)
    assert.match(src, /duration: s\.duration \?\? 0/)
    assert.match(src, /distance: s\.distance \?\? 0/)
    assert.match(src, /speed: s\.speed \?\? 0/)
    assert.match(src, /trackingType: ex\.prescription\?\.trackingType \?\? inferTracking\(/)
    assert.match(src, /groupType: ex\.groupType/)
    assert.match(src, /groupRounds: ex\.groupRounds/)
  })

  it('nothing reads a set as weight × reps inside the summary any more', () => {
    const src = readSource('components/WorkoutSummary.tsx')
    assert.doesNotMatch(src, /parseFloat\(s\.weight\)/)
    assert.doesNotMatch(src, /parseInt\(s\.reps\)/)
    assert.match(src, /from '@\/lib\/workout\/summaryMetrics'/)
  })
})
