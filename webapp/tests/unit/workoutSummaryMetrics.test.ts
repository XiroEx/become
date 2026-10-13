// Run with: npm run test:file tests/unit/workoutSummaryMetrics.test.ts
//
// Card: "Exercise that have other metrics to track are not shown properly on
// the summary workout screen. There are multiple metrics and way to track an
// exercise and that needs to be accounted for and displayed properly on the
// summary workout." — and from the thread: "Again proper metrics need to be
// shown on the summary page. And it should also show what was a circuit and
// what was a super set".
//
// The summary read every set as reps × weight. So a treadmill logged 12 min /
// 2000 m rendered `0×0`, a plank rendered `0 reps`, the volume tile multiplied
// minutes by meters, timed work could never set a record, and a circuit was
// indistinguishable from four exercises done one after the other.
//
// lib/workout/summaryMetrics.ts is the one place that now answers those
// questions, and it answers them from the exercise's TRACKING TYPE. This file
// pins the rules; tests/unit/workoutSummaryScreen.test.tsx pins the screen
// that renders them and the three callers that feed it.

import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import {
  computeSummaryPRs,
  formatDistance,
  formatDurationSec,
  formatSummarySet,
  isActiveSummarySet,
  measuresOf,
  summaryGroupBlocks,
  summaryGroupLabel,
  summaryMetricTiles,
  summarySetsFromLiveInputs,
  summaryTotals,
  type SummaryExercise,
  type SummarySet,
} from '@/lib/workout/summaryMetrics'

// ─── Fixtures ───────────────────────────────────────────────────────────────

const BENCH: SummaryExercise = { name: 'Bench Press', trackingType: 'reps_weight' }
const PUSHUP: SummaryExercise = { name: 'Push-up', trackingType: 'reps_bodyweight' }
const PLANK: SummaryExercise = { name: 'Plank', trackingType: 'time' }
const TREADMILL: SummaryExercise = { name: 'Treadmill', trackingType: 'time_distance' }
const STAIRS: SummaryExercise = { name: 'Stairmaster', trackingType: 'time_distance' }
const HIIT: SummaryExercise = { name: 'Bike Sprints', trackingType: 'intervals' }
const STRETCH: SummaryExercise = { name: 'Hip Opener', trackingType: 'none' }

const set = (s: Partial<SummarySet>): SummarySet => ({ completed: true, ...s })

// ─── One set's chip ─────────────────────────────────────────────────────────

describe('formatSummarySet', () => {
  it('reads loaded work as weight×reps, exactly as before', () => {
    assert.equal(formatSummarySet(set({ reps: 5, weight: 135 }), 'reps_weight'), '135×5')
    assert.equal(formatSummarySet(set({ reps: '8', weight: '52.5' }), 'reps_weight'), '52.5×8')
  })

  it('reads counted bodyweight work as reps', () => {
    assert.equal(formatSummarySet(set({ reps: 12, weight: 0 }), 'reps_bodyweight'), '12 reps')
    assert.equal(formatSummarySet(set({ reps: 20 }), 'reps_only'), '20 reps')
  })

  it('reads timed work as its duration — never 0×0 (the bug)', () => {
    assert.equal(formatSummarySet(set({ duration: 45 }), 'time'), '45s')
    assert.equal(formatSummarySet(set({ duration: 600 }), 'time'), '10:00')
    assert.doesNotMatch(formatSummarySet(set({ duration: 45 }), 'time'), /0×0|reps/)
  })

  it('reads time+distance work as duration, distance and speed', () => {
    assert.equal(
      formatSummarySet(set({ duration: 600, distance: 2000, speed: 3.5 }), 'time_distance', 'Treadmill'),
      '10:00 · 2000 m · 3.5 mph',
    )
    assert.equal(formatSummarySet(set({ duration: 300, distance: 0 }), 'time_distance', 'Treadmill'), '5:00')
  })

  it('measures a stair machine in floors, not meters', () => {
    assert.equal(
      formatSummarySet(set({ duration: 600, distance: 48 }), 'time_distance', 'Stairmaster'),
      '10:00 · 48 floors',
    )
  })

  it('says "Done" when the tracking type asks for nothing typeable', () => {
    assert.equal(formatSummarySet(set({}), 'intervals'), 'Done')
    assert.equal(formatSummarySet(set({}), 'none'), 'Done')
  })

  it('ignores the reps/weight a timed set happens to carry — duration is the metric', () => {
    // A log rebuilt from a save path that zero-filled reps/weight.
    assert.equal(formatSummarySet(set({ reps: 0, weight: 0, duration: 90 }), 'time'), '1:30')
  })
})

describe('formatDurationSec / formatDistance', () => {
  it('shows seconds under a minute and m:ss above it', () => {
    assert.equal(formatDurationSec(0), '0s')
    assert.equal(formatDurationSec(59), '59s')
    assert.equal(formatDurationSec(60), '1:00')
    assert.equal(formatDurationSec(645), '10:45')
    assert.equal(formatDurationSec(3661), '61:01')
  })

  it('names the distance unit by exercise', () => {
    assert.equal(formatDistance(2000, 'Treadmill'), '2000 m')
    assert.equal(formatDistance(48, 'Stairmaster'), '48 floors')
  })
})

describe('measuresOf', () => {
  it('reads numbers and input strings the same way, and never NaN', () => {
    assert.deepEqual(measuresOf(set({ reps: '5', weight: '135', duration: '', distance: null, speed: undefined })), {
      reps: 5, weight: 135, duration: 0, distance: 0, speed: 0,
    })
    assert.deepEqual(measuresOf(undefined), { reps: 0, weight: 0, duration: 0, distance: 0, speed: 0 })
  })
})

// ─── Did the set happen? ────────────────────────────────────────────────────

describe('isActiveSummarySet', () => {
  it('counts a completed set with work in it', () => {
    assert.equal(isActiveSummarySet(set({ reps: 5, weight: 135 }), 'reps_weight'), true)
    assert.equal(isActiveSummarySet(set({ duration: 45 }), 'time'), true)
    assert.equal(isActiveSummarySet(set({ distance: 2000 }), 'time_distance'), true)
  })

  it('treats the 0×0 skip marker as a skip, not as work', () => {
    assert.equal(isActiveSummarySet(set({ reps: 0, weight: 0 }), 'reps_weight'), false)
  })

  it('never counts an unfinished set', () => {
    assert.equal(isActiveSummarySet({ reps: 5, weight: 135, completed: false }, 'reps_weight'), false)
  })

  it('counts a ticked round of work that is never given an input', () => {
    // intervals and `none` are finished by tapping Done — judging them on
    // reps/weight marked every round of a HIIT block as skipped.
    assert.equal(isActiveSummarySet(set({}), 'intervals'), true)
    assert.equal(isActiveSummarySet(set({}), 'none'), true)
  })
})

// ─── Session totals ─────────────────────────────────────────────────────────

describe('summaryTotals', () => {
  it('counts volume over loaded work ONLY — cardio minutes are not pounds', () => {
    const t = summaryTotals(
      [BENCH, TREADMILL],
      [
        [set({ reps: 5, weight: 135 }), set({ reps: 5, weight: 135 })],
        [set({ duration: 600, distance: 2000, speed: 3.5 })],
      ],
    )
    assert.equal(t.totalVolume, 1350)
    assert.equal(t.totalSets, 3)
    assert.equal(t.totalWorkSeconds, 600)
    assert.equal(t.totalMeters, 2000)
    assert.equal(t.hasLoadedWork, true)
    assert.equal(t.hasTimedWork, true)
  })

  it('still counts a skipped set as a set, and adds no volume for it', () => {
    const t = summaryTotals([BENCH], [[set({ reps: 5, weight: 100 }), set({ reps: 0, weight: 0 }), { reps: 5, weight: 100, completed: false }]])
    assert.equal(t.totalSets, 2)
    assert.equal(t.totalVolume, 500)
  })

  it('says "Rounds" when every worked exercise is timed, "Sets" otherwise', () => {
    assert.equal(summaryTotals([PLANK, TREADMILL], [[set({ duration: 45 })], [set({ duration: 600 })]]).countLabel, 'Rounds')
    assert.equal(summaryTotals([BENCH, PLANK], [[set({ reps: 5, weight: 135 })], [set({ duration: 45 })]]).countLabel, 'Sets')
    assert.equal(summaryTotals([], []).countLabel, 'Sets')
  })

  it('keeps floors out of the meters total', () => {
    const t = summaryTotals([STAIRS], [[set({ duration: 600, distance: 48 })]])
    assert.equal(t.totalFloors, 48)
    assert.equal(t.totalMeters, 0)
  })

  it('reports no loaded work for a bodyweight-only session', () => {
    const t = summaryTotals([PUSHUP], [[set({ reps: 20, weight: 0 })]])
    assert.equal(t.hasLoadedWork, false)
    assert.equal(t.totalVolume, 0)
  })
})

// ─── Stat tiles ─────────────────────────────────────────────────────────────

describe('summaryMetricTiles', () => {
  it('a lifting session gets Sets + Volume', () => {
    const tiles = summaryMetricTiles([BENCH], [[set({ reps: 5, weight: 135 })]])
    assert.deepEqual(tiles.map(t => t.label), ['Sets', 'Volume lbs'])
    assert.equal(tiles[1].value, '675')
  })

  it('a cardio session gets Rounds + Work time + Distance, and no empty volume tile', () => {
    const tiles = summaryMetricTiles([TREADMILL], [[set({ duration: 600, distance: 2000, speed: 3.5 })]])
    assert.deepEqual(tiles.map(t => t.label), ['Rounds', 'Work time', 'Distance m'])
    assert.deepEqual(tiles.map(t => t.value), ['1', '10:00', '2000'])
    assert.ok(!tiles.some(t => t.label === 'Volume lbs'))
  })

  it('a stair session measures floors', () => {
    const tiles = summaryMetricTiles([STAIRS], [[set({ duration: 600, distance: 48 })]])
    assert.deepEqual(tiles.map(t => t.label), ['Rounds', 'Work time', 'Floors'])
  })

  it('a mixed session keeps volume and shows the time it spent on timed work', () => {
    const tiles = summaryMetricTiles(
      [BENCH, PLANK],
      [[set({ reps: 5, weight: 135 })], [set({ duration: 45 }), set({ duration: 60 })]],
    )
    assert.deepEqual(tiles.map(t => t.label), ['Sets', 'Volume lbs', 'Work time'])
    assert.equal(tiles[2].value, '1:45')
  })

  it('never shows more than three tiles (the row is a phone-width grid)', () => {
    const tiles = summaryMetricTiles(
      [BENCH, TREADMILL],
      [[set({ reps: 5, weight: 135 })], [set({ duration: 600, distance: 2000 })]],
    )
    assert.equal(tiles.length, 3)
  })

  it('falls back to a volume tile when nothing measurable was logged', () => {
    const tiles = summaryMetricTiles([STRETCH], [[set({})]])
    assert.deepEqual(tiles.map(t => t.label), ['Sets', 'Volume lbs'])
    assert.equal(tiles[1].value, '0')
  })
})

// ─── Records ────────────────────────────────────────────────────────────────

describe('computeSummaryPRs', () => {
  it('compares loaded work on weight then reps', () => {
    const prs = computeSummaryPRs(
      [BENCH],
      [[set({ reps: 5, weight: 140 }), set({ reps: 5, weight: 135 })]],
      { 'Bench Press': { weight: 135, reps: 5, date: '2026-10-01' } },
    )
    assert.deepEqual(prs, [{ name: 'Bench Press', bestLabel: '140 × 5', prevLabel: '135 × 5' }])
  })

  it('compares TIMED work on duration — a longer plank is a record', () => {
    const prs = computeSummaryPRs(
      [PLANK],
      [[set({ duration: 45 }), set({ duration: 60 })]],
      { Plank: { weight: 0, reps: 0, duration: 45, date: '2026-10-01' } },
    )
    assert.deepEqual(prs, [{ name: 'Plank', bestLabel: '1:00', prevLabel: '45s' }])
  })

  it('does not call a shorter hold a record', () => {
    const prs = computeSummaryPRs(
      [PLANK],
      [[set({ duration: 30 })]],
      { Plank: { weight: 0, reps: 0, duration: 45, date: '2026-10-01' } },
    )
    assert.deepEqual(prs, [])
  })

  it('needs history and work — a first session is never a record', () => {
    assert.deepEqual(computeSummaryPRs([PLANK], [[set({ duration: 45 })]], {}), [])
    assert.deepEqual(
      computeSummaryPRs([BENCH], [[{ reps: 5, weight: 500, completed: false }]], {
        'Bench Press': { weight: 135, reps: 5, date: '2026-10-01' },
      }),
      [],
    )
  })

  it('ignores a skipped set when picking the best one', () => {
    const prs = computeSummaryPRs(
      [BENCH],
      [[set({ reps: 6, weight: 135 }), set({ reps: 0, weight: 0 })]],
      { 'Bench Press': { weight: 135, reps: 5, date: '2026-10-01' } },
    )
    assert.deepEqual(prs.map(p => p.bestLabel), ['135 × 6'])
  })
})

// ─── Circuits and supersets ─────────────────────────────────────────────────

describe('summaryGroupLabel', () => {
  it('names every group kind the app can write', () => {
    assert.equal(summaryGroupLabel('circuit'), 'Circuit')
    assert.equal(summaryGroupLabel('superset'), 'Superset')
    assert.equal(summaryGroupLabel('triset'), 'Triset')
    assert.equal(summaryGroupLabel('giant_set'), 'Giant set')
    assert.equal(summaryGroupLabel('emom'), 'EMOM')
    assert.equal(summaryGroupLabel('amrap'), 'AMRAP')
  })

  it("prefers the coach's own label, and defaults to Superset like every other surface", () => {
    assert.equal(summaryGroupLabel('circuit', 'Finisher'), 'Finisher')
    assert.equal(summaryGroupLabel(undefined), 'Superset')
    assert.equal(summaryGroupLabel(''), 'Superset')
    assert.equal(summaryGroupLabel('tabata'), 'Tabata')
  })
})

describe('summaryGroupBlocks', () => {
  const circuit = (name: string): SummaryExercise => ({
    name, trackingType: 'reps_only', groupId: 'g1', groupType: 'circuit', groupLabel: 'Circuit', groupRounds: 3,
  })
  const superset = (name: string): SummaryExercise => ({
    name, trackingType: 'reps_weight', groupId: 'g2', groupType: 'superset',
  })

  it('collapses consecutive exercises sharing a groupId, and keeps the rest standalone', () => {
    const blocks = summaryGroupBlocks([BENCH, circuit('Burpees'), circuit('Jump Rope'), PLANK])
    assert.equal(blocks.length, 3)
    assert.deepEqual(blocks.map(b => b.label), [null, 'Circuit', null])
    assert.deepEqual(blocks[1].members.map(m => m.exercise.name), ['Burpees', 'Jump Rope'])
    // Members keep their index into the flat exercises/sets arrays.
    assert.deepEqual(blocks[1].members.map(m => m.index), [1, 2])
    assert.equal(blocks[1].kind, 'circuit')
    assert.equal(blocks[1].rounds, 3)
  })

  it('tells a circuit from a superset', () => {
    const blocks = summaryGroupBlocks([circuit('Burpees'), circuit('Jump Rope'), superset('Curl'), superset('Skull Crusher')])
    assert.deepEqual(blocks.map(b => b.kind), ['circuit', 'superset'])
    assert.deepEqual(blocks.map(b => b.label), ['Circuit', 'Superset'])
  })

  it('counts rounds from the logged sets when the group never said', () => {
    const blocks = summaryGroupBlocks(
      [superset('Curl'), superset('Skull Crusher')],
      [[set({ reps: 10, weight: 30 }), set({ reps: 10, weight: 30 })], [set({ reps: 10, weight: 40 })]],
    )
    assert.equal(blocks[0].rounds, 2)
  })

  it('is not fooled by a group of one — an ungrouped leftover is not a superset', () => {
    const blocks = summaryGroupBlocks([superset('Curl'), PLANK])
    assert.deepEqual(blocks.map(b => b.label), [null, null])
  })

  it('splits a groupId that is no longer adjacent, like groupExercises does', () => {
    const blocks = summaryGroupBlocks([superset('A'), superset('B'), BENCH, superset('C'), superset('D')])
    assert.deepEqual(blocks.map(b => b.members.length), [2, 1, 2])
    assert.deepEqual(blocks.map(b => b.label), ['Superset', null, 'Superset'])
  })

  it('returns one standalone block per exercise when nothing is grouped', () => {
    const blocks = summaryGroupBlocks([BENCH, PLANK, HIIT])
    assert.deepEqual(blocks.map(b => b.members[0].exercise.name), ['Bench Press', 'Plank', 'Bike Sprints'])
    assert.ok(blocks.every(b => b.groupId === null && b.label === null))
  })
})

// ─── The Live view's input convention ───────────────────────────────────────

describe('summarySetsFromLiveInputs', () => {
  it('moves a timed exercise out of the reps/weight boxes, as saveWorkout does', () => {
    const out = summarySetsFromLiveInputs(
      [TREADMILL, PLANK, BENCH],
      [
        [{ reps: '600', weight: '2000', speed: '3.5', completed: true }],
        [{ reps: '45', weight: '', speed: '', completed: true }],
        [{ reps: '5', weight: '135', speed: '', completed: true }],
      ],
    )
    assert.equal(formatSummarySet(out[0][0], 'time_distance', 'Treadmill'), '10:00 · 2000 m · 3.5 mph')
    assert.equal(formatSummarySet(out[1][0], 'time'), '45s')
    assert.equal(formatSummarySet(out[2][0], 'reps_weight'), '135×5')
  })

  it('leaves no reps or weight behind on timed work, so volume cannot pick it up', () => {
    const out = summarySetsFromLiveInputs([TREADMILL], [[{ reps: '600', weight: '2000', completed: true }]])
    assert.equal(summaryTotals([TREADMILL], out).totalVolume, 0)
    assert.equal(summaryTotals([TREADMILL], out).totalMeters, 2000)
  })

  it('does not invent a distance for plain timed work', () => {
    const out = summarySetsFromLiveInputs([PLANK], [[{ reps: '45', weight: '99', completed: true }]])
    assert.equal(measuresOf(out[0][0]).distance, 0)
  })

  it('keeps the completed flag and the set count', () => {
    const out = summarySetsFromLiveInputs([HIIT], [[{ reps: '', weight: '', completed: true }, { reps: '', weight: '', completed: false }]])
    assert.deepEqual(out[0].map(s => s.completed), [true, false])
  })
})
