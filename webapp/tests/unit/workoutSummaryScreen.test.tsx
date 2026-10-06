// Run with: npm run test:file tests/unit/workoutSummaryScreen.test.tsx
//
// Card: "Exercise that have other metrics to track are not shown properly on
// the summary workout screen." — thread: "Again proper metrics need to be shown
// on the summary page. And it should also show what was a circuit and what was
// a super set".
//
// The rules live in tests/unit/workoutSummaryMetrics.test.ts. This pins the
// WIRING, which is where the bug actually was: the summary screen itself, and
// the three callers that feed it. The component renders server-side (it uses no
// router hooks); the callers are checked at the source level, the same way
// tests/unit/circuitBuilder.test.tsx checks SessionBuilder.

import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { renderToStaticMarkup } from 'react-dom/server'
import WorkoutSummary, { type SummaryProps } from '@/components/WorkoutSummary'

const ROOT = path.join(__dirname, '../..')
const readSource = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8')

const LIVE = 'app/dashboard/workout/[programId]/workout/live/LiveWorkoutClient.tsx'
const TRACK = 'app/dashboard/workout/[programId]/workout/WorkoutFormClient.tsx'
const CALENDAR = 'app/dashboard/calendar/CalendarClient.tsx'

const base: SummaryProps = {
  programCompleted: false,
  completedProgramName: '',
  workout: { day: 'Day 1', title: 'Conditioning' },
  elapsedTime: 1800,
  exerciseData: [],
  exercises: [],
  exerciseHistory: {},
  summaryStreak: null,
  summaryGoal: null,
  formatTime: (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`,
  onDone: () => {},
}

const render = (props: Partial<SummaryProps>) =>
  renderToStaticMarkup(<WorkoutSummary {...base} {...props} />)

// ── Metrics on screen ───────────────────────────────────────────────────────

test('a cardio exercise shows its duration and distance, not weight × reps', () => {
  const html = render({
    exercises: [{ name: 'Treadmill Walk', trackingType: 'time_distance' }],
    exerciseData: [[{ duration: 600, distance: 2000, completed: true }]],
  })
  assert.ok(html.includes('10:00 · 2000 m'), 'the set chip should read its own metrics')
  assert.ok(!html.includes('2000×600'), 'the two numbers must never be multiplied together')
  assert.ok(!html.includes('null'), 'an unmeasured field must never reach the screen')
})

test('a cardio-only session reports distance and work time instead of 0 Volume lbs', () => {
  const html = render({
    exercises: [{ name: 'Treadmill Walk', trackingType: 'time_distance' }],
    exerciseData: [[{ duration: 600, distance: 2000, completed: true }]],
  })
  assert.ok(html.includes('Distance m'), 'the distance tile should be there')
  assert.ok(html.includes('Work time'), 'the logged-work tile should be there')
  assert.ok(!html.includes('Volume lbs'), 'an empty volume tile is the reported bug')
})

test('a lifting session is untouched: Volume lbs, weight×reps chips', () => {
  const html = render({
    exercises: [{ name: 'Bench Press', trackingType: 'reps_weight' }],
    exerciseData: [[
      { reps: '5', weight: '135', completed: true },
      { reps: '5', weight: '145', completed: true },
    ]],
  })
  assert.ok(html.includes('Volume lbs'))
  assert.ok(html.includes('1,400'), '135×5 + 145×5 = 1400')
  assert.ok(html.includes('135×5'))
  assert.ok(html.includes('145×5'))
})

test('a timed exercise counts rounds, a loaded one counts sets', () => {
  const html = render({
    exercises: [
      { name: 'Plank', trackingType: 'time' },
      { name: 'Bench Press', trackingType: 'reps_weight' },
    ],
    exerciseData: [
      [{ duration: 45, completed: true }, { duration: 40, completed: true }],
      [{ reps: '5', weight: '135', completed: true }],
    ],
  })
  assert.ok(html.includes('2/2 rounds'), 'timed work is rounds')
  assert.ok(html.includes('1/1 set'), 'loaded work is sets')
  assert.ok(html.includes('45s'))
})

// ── Circuits and supersets on screen ────────────────────────────────────────

test('a circuit is drawn as one labelled block, and so is a superset', () => {
  const html = render({
    exercises: [
      { name: 'Air Squat', trackingType: 'reps_only', groupId: 'g1', groupType: 'circuit', groupRounds: 4 },
      { name: 'Push-up', trackingType: 'reps_only', groupId: 'g1', groupType: 'circuit', groupRounds: 4 },
      { name: 'Mountain Climber', trackingType: 'reps_only', groupId: 'g1', groupType: 'circuit', groupRounds: 4 },
      { name: 'Curl', trackingType: 'reps_weight', groupId: 'g2', groupType: 'superset' },
      { name: 'Skull Crusher', trackingType: 'reps_weight', groupId: 'g2', groupType: 'superset' },
      { name: 'Bench Press', trackingType: 'reps_weight' },
    ],
    exerciseData: [
      [{ reps: '15', completed: true }],
      [{ reps: '10', completed: true }],
      [{ reps: '20', completed: true }],
      [{ reps: '12', weight: '30', completed: true }],
      [{ reps: '12', weight: '40', completed: true }],
      [{ reps: '5', weight: '135', completed: true }],
    ],
  })
  assert.ok(html.includes('Circuit'), 'the circuit must say it is a circuit')
  assert.ok(html.includes('Superset'), 'the superset must say it is a superset')
  assert.ok(html.includes('4 rounds · 3 exercises'), 'the circuit quotes its shape')
  assert.ok(html.includes('2 exercises'), 'the superset quotes its shape')
  // Colour-coded the way the Track view already colours these blocks.
  assert.ok(html.includes('bg-orange-50/60'), 'circuit chrome')
  assert.ok(html.includes('bg-purple-50/60'), 'superset chrome')
})

test('an ungrouped session gets no block chrome at all', () => {
  const html = render({
    exercises: [{ name: 'Bench Press', trackingType: 'reps_weight' }],
    exerciseData: [[{ reps: '5', weight: '135', completed: true }]],
  })
  assert.ok(!html.includes('Circuit'))
  assert.ok(!html.includes('Superset'))
})

// ── The three callers ───────────────────────────────────────────────────────

test('the Live view translates its reps/weight boxes into duration/distance', () => {
  const src = readSource(LIVE)
  const call = src.slice(src.indexOf('<WorkoutSummary'))
  assert.match(call, /duration: timed \? s\.reps : ''/, 'seconds live in the reps box on that screen')
  assert.match(call, /distance: isTD \? s\.weight : ''/, 'distance lives in the weight box')
  assert.match(call, /speed: s\.speed/)
})

test('the Track view hands its own duration/distance/speed fields straight over', () => {
  const src = readSource(TRACK)
  // Its SetData already carries every metric, so nothing is dropped on the way.
  assert.match(src, /interface SetData \{[^}]*duration: string;[^}]*distance: string;/s)
  assert.ok(src.includes('<WorkoutSummary'))
})

test('the calendar reads a saved log\'s metrics, tracking type and group fields', () => {
  const src = readSource(CALENDAR)
  const call = src.slice(src.indexOf('<WorkoutSummary'))
  assert.match(call, /duration: s\.duration/)
  assert.match(call, /distance: s\.distance/)
  assert.match(call, /trackingType: ex\.prescription\?\.trackingType \?\? inferTracking\(ex\.sets\)/)
  assert.match(call, /groupType: ex\.groupType/)
  assert.ok(!/String\(s\.reps\)/.test(call), 'String(null) is "null" — that was the bug')
})

test('every caller passes exercises with their tracking type attached', () => {
  for (const rel of [LIVE, TRACK, CALENDAR]) {
    const src = readSource(rel)
    const call = src.slice(src.indexOf('<WorkoutSummary'))
    assert.match(call, /exercises=\{/, `${rel} must pass exercises`)
  }
  // Live and Track pass their hydrated exercise objects, which carry
  // trackingType and the group fields; the calendar builds them explicitly
  // (asserted above).
  for (const rel of [LIVE, TRACK]) {
    const src = readSource(rel)
    assert.match(src, /trackingType\?: string;/, `${rel}'s exercise type carries trackingType`)
    assert.match(src, /groupType\?: string;/, `${rel}'s exercise type carries groupType`)
  }
})
