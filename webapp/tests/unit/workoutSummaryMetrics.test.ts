// Run with: npm run test:file tests/unit/workoutSummaryMetrics.test.ts
//
// Card: "Exercise that have other metrics to track are not shown properly on
// the summary workout screen. There are multiple metrics and way to track an
// exercise and that needs to be accounted for and displayed properly on the
// summary workout." — and from the thread: "Again proper metrics need to be
// shown on the summary page. And it should also show what was a circuit and
// what was a super set".
//
// The summary had ONE vocabulary (`weight × reps`) and three callers feeding it
// three different shapes:
//
//   * Live view — types a timed set's SECONDS into its reps box and its
//     DISTANCE into its weight box, so a 10-minute / 2000 m treadmill rendered
//     "2000×600" and put 1,200,000 lbs into Volume;
//   * Track view — keeps duration/distance/speed in their own fields and
//     leaves reps/weight empty, so the same treadmill rendered " reps";
//   * calendar — hands over a saved log, where an unmeasured field is `null`,
//     and `String(null)` is "null", so a past cardio session read "null reps".
//
// And nothing anywhere said which exercises ran as one block.
//
// These are the rules, pinned against the three shapes verbatim.

import test from 'node:test'
import assert from 'node:assert/strict'
import {
  computeSummaryPRs,
  distanceUnitLabel,
  formatDurationSec,
  formatSummarySet,
  isActiveSummarySet,
  isSkippedSummarySet,
  setMetrics,
  summaryGroupLabel,
  summaryGroups,
  summaryRoundsLabel,
  summarySetCountLabel,
  summaryStatTiles,
  summaryTotals,
  type SummaryExerciseInput,
  type SummarySetInput,
} from '@/lib/workout/summaryMetrics'

// ── The three caller shapes, for one 10-minute / 2000 m treadmill set ────────

/** What the Live view holds: seconds in `reps`, distance in `weight`. */
const LIVE_CARDIO_RAW = { reps: '600', weight: '2000', speed: '', completed: true }

/** The translation the Live view now hands the summary. */
const liveTranslated = (s: typeof LIVE_CARDIO_RAW): SummarySetInput => ({
  reps: '',
  weight: '',
  duration: s.reps,
  distance: s.weight,
  speed: s.speed,
  completed: s.completed,
})

/** What the Track view holds. */
const TRACK_CARDIO: SummarySetInput = {
  reps: '',
  weight: '',
  duration: '600',
  distance: '2000',
  speed: '',
  completed: true,
}

/** What a saved log holds: numbers, and `null` for anything unmeasured. */
const LOGGED_CARDIO: SummarySetInput = {
  reps: null,
  weight: null,
  duration: 600,
  distance: 2000,
  speed: null,
  completed: true,
}

const TREADMILL: SummaryExerciseInput = { name: 'Treadmill Walk', trackingType: 'time_distance' }
const BENCH: SummaryExerciseInput = { name: 'Bench Press', trackingType: 'reps_weight' }

// ── One set, read by tracking type ──────────────────────────────────────────

test('a cardio set reads its own metrics, never weight × reps — all three shapes agree', () => {
  for (const [label, set] of [
    ['live', liveTranslated(LIVE_CARDIO_RAW)],
    ['track', TRACK_CARDIO],
    ['saved log', LOGGED_CARDIO],
  ] as const) {
    const out = formatSummarySet(set, TREADMILL.trackingType, TREADMILL.name)
    assert.equal(out, '10:00 · 2000 m', `${label} shape rendered "${out}"`)
    assert.ok(!out.includes('×'), `${label} shape still multiplied two unrelated numbers`)
  }
})

test('the exact strings the card reported are gone', () => {
  const live = formatSummarySet(liveTranslated(LIVE_CARDIO_RAW), 'time_distance', 'Treadmill Walk')
  assert.notEqual(live, '2000×600')
  const logged = formatSummarySet(LOGGED_CARDIO, 'time_distance', 'Treadmill Walk')
  assert.ok(!logged.includes('null'), `saved log rendered "${logged}"`)
  // A log with no tracking type at all still must not say "null".
  const bare = formatSummarySet({ reps: null, weight: null, completed: true })
  assert.equal(bare, 'Done')
})

test('loaded work still reads exactly as it always did', () => {
  assert.equal(formatSummarySet({ reps: '5', weight: '135', completed: true }, 'reps_weight'), '135×5')
  assert.equal(formatSummarySet({ reps: 12, weight: 0, completed: true }, 'reps_bodyweight'), '12 reps')
  assert.equal(formatSummarySet({ reps: '12', weight: '', completed: true }, 'reps_only'), '12 reps')
})

test('time-only work reads a duration; intervals read duration and speed', () => {
  assert.equal(formatSummarySet({ duration: '45', completed: true }, 'time'), '45s')
  assert.equal(formatSummarySet({ duration: 90, completed: true }, 'time'), '1:30')
  assert.equal(
    formatSummarySet({ duration: '120', speed: '6.5', completed: true }, 'intervals'),
    '2:00 · 6.5 mph',
  )
  // An intervals round the member just ticked off is still a round.
  assert.equal(formatSummarySet({ completed: true }, 'intervals'), 'Done')
})

test('a stair machine counts floors, not meters', () => {
  assert.equal(distanceUnitLabel('Stairmaster'), 'floors')
  assert.equal(distanceUnitLabel('Treadmill Walk'), 'm')
  assert.equal(
    formatSummarySet({ duration: 600, distance: 40, completed: true }, 'time_distance', 'Stairmaster'),
    '10:00 · 40 floors',
  )
})

test('durations format by magnitude: seconds, m:ss, h:mm:ss', () => {
  assert.equal(formatDurationSec(0), '0s')
  assert.equal(formatDurationSec(59), '59s')
  assert.equal(formatDurationSec(60), '1:00')
  assert.equal(formatDurationSec(605), '10:05')
  assert.equal(formatDurationSec(3661), '1:01:01')
})

test('setMetrics never yields NaN, whatever arrives', () => {
  assert.deepEqual(setMetrics({ reps: null, weight: undefined, completed: true }), {
    reps: 0, weight: 0, duration: 0, distance: 0, speed: 0,
  })
  assert.deepEqual(setMetrics({ reps: '', weight: 'abc', duration: '600', completed: true }), {
    reps: 0, weight: 0, duration: 600, distance: 0, speed: 0,
  })
})

// ── Active vs skipped ───────────────────────────────────────────────────────

test('the skip marker stays a skip, and a logged cardio set stays work', () => {
  // What skipSet / skipExercise write, in the Live view's own fields.
  const liveSkip = liveTranslated({ reps: '0', weight: '0', speed: '', completed: true })
  assert.equal(isActiveSummarySet(liveSkip, 'time_distance'), false)
  assert.equal(isSkippedSummarySet(liveSkip, 'time_distance'), true)

  assert.equal(isActiveSummarySet(TRACK_CARDIO, 'time_distance'), true)
  assert.equal(isActiveSummarySet(LOGGED_CARDIO, 'time_distance'), true)
  // Not completed is never work.
  assert.equal(isActiveSummarySet({ duration: 600, completed: false }, 'time'), false)
  // An intervals round asks for no input, so Done IS the measurement — same
  // rule as the native summary's isActiveSummarySet.
  assert.equal(isActiveSummarySet({ completed: true }, 'intervals'), true)
})

// ── Session aggregates ──────────────────────────────────────────────────────

test('volume counts loaded work only — a treadmill no longer adds 1,200,000 lbs', () => {
  const exercises = [BENCH, TREADMILL]
  const sets: SummarySetInput[][] = [
    [
      { reps: '5', weight: '135', completed: true },
      { reps: '5', weight: '145', completed: true },
    ],
    [liveTranslated(LIVE_CARDIO_RAW)],
  ]
  const totals = summaryTotals(exercises, sets)
  assert.equal(totals.totalVolume, 135 * 5 + 145 * 5)
  assert.equal(totals.totalSets, 3)
  assert.equal(totals.totalWorkSeconds, 600)
  assert.equal(totals.totalDistance, 2000)
  assert.equal(totals.distanceInFloors, false)
})

test('totals count every completed set, skips included — the Sets tile is unchanged', () => {
  const totals = summaryTotals([BENCH], [[
    { reps: '5', weight: '135', completed: true },
    { reps: '0', weight: '0', completed: true },
    { reps: '', weight: '', completed: false },
  ]])
  assert.equal(totals.totalSets, 2)
  assert.equal(totals.totalVolume, 675)
})

test('a floors-only session says Floors, a mixed one says Distance m', () => {
  const stair: SummaryExerciseInput = { name: 'Stairmaster', trackingType: 'time_distance' }
  const floors = summaryTotals([stair], [[{ duration: 600, distance: 40, completed: true }]])
  assert.equal(floors.distanceInFloors, true)
  assert.equal(summaryStatTiles(floors).find(t => t.key === 'distance')?.label, 'Floors')

  const mixed = summaryTotals([stair, TREADMILL], [
    [{ duration: 600, distance: 40, completed: true }],
    [{ duration: 600, distance: 2000, completed: true }],
  ])
  assert.equal(mixed.distanceInFloors, false)
  assert.equal(summaryStatTiles(mixed).find(t => t.key === 'distance')?.label, 'Distance m')
})

test('a cardio-only session shows its own aggregates instead of "0 Volume lbs"', () => {
  const totals = summaryTotals([TREADMILL], [[liveTranslated(LIVE_CARDIO_RAW)]])
  const tiles = summaryStatTiles(totals)
  assert.deepEqual(tiles.map(t => t.key), ['sets', 'distance', 'work'])
  assert.equal(tiles.find(t => t.key === 'work')?.value, '10:00')
  assert.equal(tiles.find(t => t.key === 'distance')?.value, '2,000')
  assert.ok(!tiles.some(t => t.key === 'volume'))
})

test('a lifting session still leads with Volume', () => {
  const totals = summaryTotals([BENCH], [[{ reps: '5', weight: '135', completed: true }]])
  const tiles = summaryStatTiles(totals)
  assert.deepEqual(tiles.map(t => t.key), ['sets', 'volume'])
  assert.equal(tiles.find(t => t.key === 'volume')?.value, '675')
})

test('the tile row never collapses: no aggregate at all still shows Volume 0', () => {
  const tiles = summaryStatTiles(summaryTotals([BENCH], [[{ reps: '0', weight: '0', completed: true }]]))
  assert.deepEqual(tiles.map(t => t.key), ['sets', 'volume'])
  assert.equal(tiles.find(t => t.key === 'volume')?.value, '0')
})

test('the tile row stays a 3- or 4-up grid: at most two aggregates', () => {
  const totals = summaryTotals([BENCH, TREADMILL], [
    [{ reps: '5', weight: '135', completed: true }],
    [{ duration: 600, distance: 2000, completed: true }],
  ])
  const tiles = summaryStatTiles(totals)
  assert.equal(tiles.length, 3, 'Sets + two aggregates, never more')
  assert.deepEqual(tiles.map(t => t.key), ['sets', 'volume', 'distance'])
})

// ── Records ─────────────────────────────────────────────────────────────────

test('a cardio record is beaten on duration, not on a weight that never existed', () => {
  const prs = computeSummaryPRs(
    [TREADMILL],
    [[liveTranslated(LIVE_CARDIO_RAW)]],
    { 'Treadmill Walk': { weight: 0, reps: 0, duration: 420, date: '2026-01-01' } },
  )
  assert.deepEqual(prs, [{ name: 'Treadmill Walk', bestLabel: '10:00 · 2000 m', prevLabel: '7:00' }])
})

test('a shorter cardio session is not a record', () => {
  const prs = computeSummaryPRs(
    [TREADMILL],
    [[{ duration: 300, distance: 1000, completed: true }]],
    { 'Treadmill Walk': { weight: 0, reps: 0, duration: 600, date: '2026-01-01' } },
  )
  assert.deepEqual(prs, [])
})

test('a loaded record is still weight then reps', () => {
  const prs = computeSummaryPRs(
    [BENCH],
    [[
      { reps: '5', weight: '135', completed: true },
      { reps: '3', weight: '155', completed: true },
    ]],
    { 'Bench Press': { weight: 145, reps: 5, date: '2026-01-01' } },
  )
  assert.deepEqual(prs, [{ name: 'Bench Press', bestLabel: '155 × 3', prevLabel: '145 × 5' }])
})

test('no history, and a session of pure skips, are never records', () => {
  assert.deepEqual(computeSummaryPRs([BENCH], [[{ reps: '5', weight: '999', completed: true }]], {}), [])
  assert.deepEqual(
    computeSummaryPRs([BENCH], [[{ reps: '0', weight: '0', completed: true }]], {
      'Bench Press': { weight: 1, reps: 1, date: '2026-01-01' },
    }),
    [],
  )
})

// ── Circuits and supersets ──────────────────────────────────────────────────

const grouped = (
  name: string,
  groupId: string,
  groupType: string,
  extra: Partial<SummaryExerciseInput> = {},
): SummaryExerciseInput => ({ name, trackingType: 'reps_weight', groupId, groupType, ...extra })

test('consecutive exercises sharing a groupId are drawn as ONE labelled block', () => {
  const blocks = summaryGroups([
    BENCH,
    grouped('Air Squat', 'g1', 'circuit', { groupRounds: 4 }),
    grouped('Push-up', 'g1', 'circuit', { groupRounds: 4 }),
    grouped('Row', 'g1', 'circuit', { groupRounds: 4 }),
    grouped('Curl', 'g2', 'superset'),
    grouped('Skull Crusher', 'g2', 'superset'),
  ])
  assert.deepEqual(
    blocks.map(b => [b.label, b.members.map(m => m.exercise.name)]),
    [
      [null, ['Bench Press']],
      ['Circuit', ['Air Squat', 'Push-up', 'Row']],
      ['Superset', ['Curl', 'Skull Crusher']],
    ],
  )
  // The indexes still point into the flat arrays the summary was handed.
  assert.deepEqual(blocks[1]!.members.map(m => m.index), [1, 2, 3])
  assert.equal(blocks[1]!.rounds, 4)
})

test('a circuit and a superset are told apart, and the coach\'s own label wins', () => {
  assert.equal(summaryGroupLabel({ name: 'a', groupType: 'circuit' }, 3), 'Circuit')
  assert.equal(summaryGroupLabel({ name: 'a', groupType: 'superset' }, 2), 'Superset')
  assert.equal(summaryGroupLabel({ name: 'a', groupType: 'triset' }, 3), 'Triset')
  assert.equal(summaryGroupLabel({ name: 'a', groupType: 'giant_set' }, 4), 'Giant set')
  assert.equal(summaryGroupLabel({ name: 'a', groupType: 'circuit', groupLabel: 'Finisher' }, 3), 'Finisher')
  // No groupType at all reads the way the live view already reads it.
  assert.equal(summaryGroupLabel({ name: 'a' }, 2), 'Superset')
})

test('grouping follows ADJACENCY, like buildWorkoutFlow — a split group is not a group', () => {
  const blocks = summaryGroups([
    grouped('Curl', 'g1', 'superset'),
    BENCH,
    grouped('Skull Crusher', 'g1', 'superset'),
  ])
  assert.deepEqual(blocks.map(b => b.label), [null, null, null])
})

test('a group with one member left in it is not a group', () => {
  const blocks = summaryGroups([grouped('Curl', 'g1', 'superset'), BENCH])
  assert.deepEqual(blocks.map(b => [b.label, b.groupId]), [[null, null], [null, null]])
})

test('a block quotes its rounds, in the right noun', () => {
  const circuit = summaryGroups([
    grouped('Air Squat', 'g1', 'circuit', { groupRounds: 4 }),
    grouped('Push-up', 'g1', 'circuit', { groupRounds: 4 }),
  ])
  const sets: SummarySetInput[][] = [
    [{ completed: true }, { completed: true }, { completed: true }, { completed: true }],
    [{ completed: true }, { completed: true }, { completed: true }, { completed: true }],
  ]
  assert.equal(summaryRoundsLabel(circuit[0]!, sets), '4 rounds')

  // A superset of loaded work counts sets; with no groupRounds it falls back to
  // the longest member.
  const superset = summaryGroups([
    grouped('Curl', 'g2', 'superset'),
    grouped('Skull Crusher', 'g2', 'superset'),
  ])
  assert.equal(
    summaryRoundsLabel(superset[0]!, [[{ completed: true }, { completed: true }, { completed: true }], [{ completed: true }]]),
    '3 sets',
  )
})

test('one exercise\'s line says sets or rounds, by how it is tracked', () => {
  assert.equal(summarySetCountLabel(BENCH, 3), 'sets')
  assert.equal(summarySetCountLabel(TREADMILL, 1), 'round')
  assert.equal(summarySetCountLabel({ name: 'HIIT', trackingType: 'intervals' }, 6), 'rounds')
})
