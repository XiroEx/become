// Run with: npm run test:file tests/unit/nativeParity/trainingModules.test.ts
//
// ─── The training / streak / dashboard modules, run TWICE ────────────────────
//
// NP-058 applies NP-017: the logic that makes the training and dashboard
// screens correct is pure, so both apps run the SAME code rather than two
// implementations of it. The shared home is `@become/core`
// (shared/core/src/training/**), whose files are copies of the webapp modules
// imported here, at the same relative paths.
//
// The webapp still imports its OWN module: RedRun builds `webapp/` alone, and
// making webapp code import `../shared/*` broke every production build on
// 2026-09-30 between 07:09 and 11:35. So until `@become/core` is published and
// the webapp switches over, there are two files — and THIS test is what stops
// them from becoming two behaviours. It drives every exported function of both
// over one fixture table and fails the moment an answer differs.
//
// It lives in `verify`, the job that always runs, because that is where web
// changes are. When it fails, the fix is to RE-COPY the changed web file into
// shared/core/src/training/ (expo/README.md, "Re-copying a training module") —
// never to edit the copy into agreement, and never to relax a fixture.
//
// Three things it checks, in this order:
//
//   1. every runtime export of the web module exists on the copy, with the
//      same name, and every non-function export is deep-equal (so a changed
//      constant fails even when no function did);
//   2. every exported FUNCTION is exercised by at least one fixture — a
//      function nobody compared is not covered, and a new web export fails
//      this test until the table grows;
//   3. the comparator itself bites: a deliberately-wrong copy is caught.
//
// The two declared asymmetries are `workout/position.ts` (the web half is
// `localStorage`) and `quickSession/log.ts` (`logQuickSession` reads a token
// out of `localStorage` and POSTs a relative URL). Both are named below with
// their reason, and everything else must match exactly.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

// ── The web modules (canonical) ─────────────────────────────────────────────
import * as webWorkoutUtils from '../../../lib/workoutUtils'
import * as webTracking from '../../../lib/workout/tracking'
import * as webDurationUnit from '../../../lib/workout/durationUnit'
import * as webEquipmentVariant from '../../../lib/workout/equipmentVariant'
import * as webDumbbellWeight from '../../../lib/workout/dumbbellWeight'
import * as webBuildAsYouGo from '../../../lib/workout/buildAsYouGo'
import * as webPosition from '../../../lib/workout/position'
import * as webNaming from '../../../lib/quickSession/naming'
import * as webQuickLog from '../../../lib/quickSession/log'
import * as webPillars from '../../../lib/streaks/pillars'
import * as webTile from '../../../lib/streaks/tile'
import * as webGoalTile from '../../../lib/dashboard/goalTile'
import * as webLayoutTypes from '../../../lib/dashboardLayout/types'
import * as webLayoutDefaults from '../../../lib/dashboardLayout/defaults'
import * as webVideoTrim from '../../../lib/videoTrim'
import * as webVideoFraming from '../../../lib/videoFraming'

// ── The copies in @become/core, by relative path ────────────────────────────
// Imported the way tests/unit/contract/* import shared/api-client: by relative
// path, from a test, never from app code.
import * as coreWorkoutUtils from '../../../../shared/core/src/training/workoutUtils'
import * as coreTracking from '../../../../shared/core/src/training/workout/tracking'
import * as coreDurationUnit from '../../../../shared/core/src/training/workout/durationUnit'
import * as coreEquipmentVariant from '../../../../shared/core/src/training/workout/equipmentVariant'
import * as coreDumbbellWeight from '../../../../shared/core/src/training/workout/dumbbellWeight'
import * as coreBuildAsYouGo from '../../../../shared/core/src/training/workout/buildAsYouGo'
import * as corePosition from '../../../../shared/core/src/training/workout/position'
import * as coreNaming from '../../../../shared/core/src/training/quickSession/naming'
import * as coreQuickLog from '../../../../shared/core/src/training/quickSession/log'
import * as corePillars from '../../../../shared/core/src/training/streaks/pillars'
import * as coreTile from '../../../../shared/core/src/training/streaks/tile'
import * as coreGoalTile from '../../../../shared/core/src/training/dashboard/goalTile'
import * as coreLayoutTypes from '../../../../shared/core/src/training/dashboardLayout/types'
import * as coreLayoutDefaults from '../../../../shared/core/src/training/dashboardLayout/defaults'
import * as coreVideoTrim from '../../../../shared/core/src/training/videoTrim'
import * as coreVideoFraming from '../../../../shared/core/src/training/videoFraming'

// ───────────────────────────────────────────────────────────────────────────
// The harness
// ───────────────────────────────────────────────────────────────────────────

/** Every `module.export` a fixture has actually driven. */
const covered = new Set<string>()
let comparisons = 0

type Outcome = { ok: true; value: unknown } | { ok: false; threw: string }

function run(fn: (...args: never[]) => unknown, args: unknown[]): Outcome {
  try {
    return { ok: true, value: (fn as (...a: unknown[]) => unknown)(...args) }
  } catch (err) {
    // A thrower is compared too: `parseDashboardLayout` communicates by
    // throwing, and a copy that throws a different message has diverged.
    return { ok: false, threw: err instanceof Error ? `${err.name}: ${err.message}` : String(err) }
  }
}

function show(value: unknown): string {
  return JSON.stringify(value, (_k, v) => {
    if (v instanceof Set) return { '#set': [...v].sort() }
    if (v instanceof Map) return { '#map': [...v.entries()] }
    return v
  }) ?? String(value)
}

/** Compare one function across both modules over a list of argument tuples. */
function compare<F extends (...args: never[]) => unknown>(
  name: string,
  web: F,
  copy: F,
  cases: Array<Parameters<F>>,
): void {
  assert.equal(typeof web, 'function', `${name}: the web export is not a function`)
  assert.equal(typeof copy, 'function', `${name}: the copy is not a function`)
  for (const args of cases) {
    const w = run(web, args as unknown[])
    const c = run(copy, args as unknown[])
    assert.deepStrictEqual(
      c,
      w,
      `DRIFT in ${name}(${show(args)}):\n`
        + `  webapp/lib says   ${show(w)}\n`
        + `  @become/core says ${show(c)}\n`
        + `Re-copy the web file into shared/core/src/training/ — do not edit the copy.`,
    )
    comparisons += 1
  }
}

/** `compare`, and record that this export is covered. */
function same<F extends (...args: never[]) => unknown>(
  name: string,
  web: F,
  copy: F,
  cases: Array<Parameters<F>>,
): void {
  covered.add(name)
  compare(name, web, copy, cases)
}

interface ManifestOptions {
  /** Exports exercised indirectly, with the reason. */
  indirect?: Record<string, string>
  /** Web exports deliberately NOT copied, with the reason. */
  webOnly?: Record<string, string>
  /** Copy-only exports (the pure half of something the web keeps impure). */
  copyOnly?: Record<string, string>
}

/**
 * Assert the two modules export the same names, that every shared constant is
 * deep-equal, and that every exported function was driven by a fixture above.
 */
function manifest(
  id: string,
  web: Record<string, unknown>,
  copy: Record<string, unknown>,
  opts: ManifestOptions = {},
): void {
  const webOnly = new Set(Object.keys(opts.webOnly ?? {}))
  const copyOnly = new Set(Object.keys(opts.copyOnly ?? {}))
  const indirect = new Set(Object.keys(opts.indirect ?? {}))

  const expected = Object.keys(web).filter(k => !webOnly.has(k)).sort()
  const actual = Object.keys(copy).filter(k => !copyOnly.has(k)).sort()
  assert.deepStrictEqual(
    actual,
    expected,
    `${id}: the copy's exports do not match the web module's. `
      + `Missing: ${expected.filter(k => !actual.includes(k)).join(', ') || 'none'}; `
      + `extra: ${actual.filter(k => !expected.includes(k)).join(', ') || 'none'}.`,
  )

  for (const key of expected) {
    const w = web[key]
    if (typeof w === 'function') {
      // A class is a function; it is covered by whatever throws it.
      const isClass = /^class\s/.test(String(w))
      if (!isClass) {
        assert.ok(
          covered.has(`${id}.${key}`) || indirect.has(key),
          `${id}.${key} is exported but no fixture compares it. `
            + `Add a case to the table (or declare why it is covered indirectly).`,
        )
      }
      continue
    }
    assert.deepStrictEqual(copy[key], w, `${id}.${key}: the copied constant differs from the web's`)
  }
}

// ───────────────────────────────────────────────────────────────────────────
// 1. Flows: supersets and circuits
// ───────────────────────────────────────────────────────────────────────────

type WorkoutExercise = webWorkoutUtils.WorkoutExercise

const ex = (name: string, over: Partial<WorkoutExercise> = {}): WorkoutExercise => ({ name, ...over })

const FLOWS: WorkoutExercise[][] = [
  [],
  // Plain, sequential.
  [ex('Back Squat', { sets: 3 }), ex('Leg Curl', { sets: 2 })],
  // Sets missing → the default of 3.
  [ex('Plank')],
  // A superset of two, three rounds each.
  [
    ex('Bench Press', { sets: 3, groupId: 'g1', groupType: 'superset', groupLabel: 'Superset', groupRest: '90 sec' }),
    ex('Bent Row', { sets: 3, groupId: 'g1', groupType: 'superset', groupLabel: 'Superset' }),
  ],
  // A superset whose members disagree about set count — the flow runs to the max
  // and skips the exercise that has run out.
  [
    ex('Incline Press', { sets: 4, groupId: 'g2', groupType: 'superset' }),
    ex('Face Pull', { sets: 2, groupId: 'g2', groupType: 'superset' }),
  ],
  // A circuit of three with an explicit round count LOWER than the set counts.
  [
    ex('Air Squat', { sets: 5, groupId: 'c1', groupType: 'circuit', groupRounds: 2 }),
    ex('Push-up', { sets: 5, groupId: 'c1', groupType: 'circuit', groupRounds: 2 }),
    ex('Sit-up', { sets: 5, groupId: 'c1', groupType: 'circuit', groupRounds: 2 }),
  ],
  // A circuit whose groupRounds EXCEEDS every member's sets.
  [
    ex('Row Erg', { sets: 1, groupId: 'c2', groupType: 'circuit', groupRounds: 4 }),
    ex('Burpee', { sets: 2, groupId: 'c2', groupType: 'circuit', groupRounds: 4 }),
  ],
  // A "group" of one — treated as ungrouped by the flow builder.
  [ex('Deadlift', { sets: 2, groupId: 'solo' })],
  // Non-consecutive members of the same group: two separate groups, on purpose.
  [
    ex('A', { sets: 2, groupId: 'x' }),
    ex('B', { sets: 2 }),
    ex('C', { sets: 2, groupId: 'x' }),
  ],
  // Mixed: ungrouped, then a superset, then ungrouped.
  [
    ex('Warmup Bike', { sets: 1 }),
    ex('Curl', { sets: 3, groupId: 'g3' }),
    ex('Skull Crusher', { sets: 3, groupId: 'g3' }),
    ex('Finisher', { sets: 2 }),
  ],
]

test('workoutUtils: groupExercises and buildWorkoutFlow', () => {
  same('workoutUtils.groupExercises', webWorkoutUtils.groupExercises, coreWorkoutUtils.groupExercises,
    FLOWS.map(f => [f] as [WorkoutExercise[]]))
  same('workoutUtils.buildWorkoutFlow', webWorkoutUtils.buildWorkoutFlow, coreWorkoutUtils.buildWorkoutFlow,
    FLOWS.map(f => [f] as [WorkoutExercise[]]))

  manifest('workoutUtils', webWorkoutUtils, coreWorkoutUtils)
})

// ───────────────────────────────────────────────────────────────────────────
// 2. Every tracking type and every alias
// ───────────────────────────────────────────────────────────────────────────

/** The canonical seven, every alias the rebuild paths emit, and junk. */
const TRACKING_INPUTS: Array<string | null | undefined> = [
  'reps_weight', 'reps_bodyweight', 'reps_only', 'time', 'time_distance', 'intervals', 'none',
  'reps', 'weight', 'weights', 'repsweight', 'reps-weight', 'bodyweight', 'reps_body',
  'duration', 'timed', 'seconds', 'distance', 'interval', 'cardio',
  '  TIME_DISTANCE  ', 'Reps_Weight', 'REPS', 'mystery', '', null, undefined,
]

const TYPED_SETS: Array<webTracking.TypedSet> = [
  {},
  { reps: '10' },
  { reps: '0' },
  { reps: '10', weight: '135' },
  { reps: '10', weight: '0' },
  { reps: ' ', weight: '135' },
  { duration: '45' },
  { duration: '0' },
  { speed: '3.5' },
  { distance: '1500' },
  { duration: '600', distance: '1500', speed: '4' },
]

test('workout/tracking: every type, every alias, every filled-set rule', () => {
  const one = TRACKING_INPUTS.map(t => [t] as [string | null | undefined])

  same('workout/tracking.normalizeTracking', webTracking.normalizeTracking, coreTracking.normalizeTracking, one)
  same('workout/tracking.tracksWeight', webTracking.tracksWeight, coreTracking.tracksWeight, one)
  same('workout/tracking.tracksTime', webTracking.tracksTime, coreTracking.tracksTime, one)
  same('workout/tracking.tracksSpeed', webTracking.tracksSpeed, coreTracking.tracksSpeed, one)
  same('workout/tracking.categoryForTracking', webTracking.categoryForTracking, coreTracking.categoryForTracking, one)
  same('workout/tracking.blankSet', webTracking.blankSet, coreTracking.blankSet, [[]])

  same('workout/tracking.setUnitLabel', webTracking.setUnitLabel, coreTracking.setUnitLabel,
    TRACKING_INPUTS.flatMap(t => [0, 1, 2, 5].map(n => [t ?? null, n] as [string | null, number])))

  same('workout/tracking.isSetFilled', webTracking.isSetFilled, coreTracking.isSetFilled,
    TRACKING_INPUTS.flatMap(t => TYPED_SETS.map(s => [t, s] as [string | null | undefined, webTracking.TypedSet])))

  same('workout/tracking.inferTracking', webTracking.inferTracking, coreTracking.inferTracking, [
    [undefined, undefined],
    [[], undefined],
    [[{ reps: 10, weight: 135 }], null],
    [[{ reps: null, weight: null, duration: 45 }], null],
    [[{ reps: 12, weight: null, duration: 30 }], 'time'],
    [[{ reps: null, weight: 0, duration: 0 }], 'intervals'],
    [[{ reps: null, weight: 0, duration: 0 }], 'nonsense'],
    [[{ weight: 0 }, { weight: 50 }], null],
  ])

  const phantom: Array<webTracking.TypedSet & { completed: boolean }> = [
    { reps: '10', weight: '100', completed: false },
    { reps: '10', weight: '100', completed: false },
    { reps: '12', weight: '100', completed: false },
  ]
  same('workout/tracking.findPhantomPrefilledSets',
    webTracking.findPhantomPrefilledSets, coreTracking.findPhantomPrefilledSets, [
      ['reps_weight', []],
      ['reps_weight', phantom],
      ['reps_weight', [{ reps: '10', weight: '100', completed: true }, { reps: '10', weight: '100', completed: false }]],
      ['reps_weight', [{ reps: '10', weight: '100', completed: false }]],
      ['time', [{ duration: '60', completed: false }, { duration: '60', completed: false }]],
      ['none', phantom],
      [null, phantom],
    ])

  manifest('workout/tracking', webTracking, coreTracking)
})

// ───────────────────────────────────────────────────────────────────────────
// 3. Duration units and the floors rule
// ───────────────────────────────────────────────────────────────────────────

test('workout/durationUnit: sec/min conversion both ways', () => {
  same('workout/durationUnit.defaultDurationUnit',
    webDurationUnit.defaultDurationUnit, coreDurationUnit.defaultDurationUnit,
    TRACKING_INPUTS.map(t => [t] as [string | null | undefined]))

  const seconds: Array<string | number | null | undefined> = [
    0, 1, 30, 45, 59, 60, 90, 600, 900, 3599, '', '0', '45', '90.5', 'abc', null, undefined, -30, 0.5,
  ]
  same('workout/durationUnit.secondsToUnitDisplay',
    webDurationUnit.secondsToUnitDisplay, coreDurationUnit.secondsToUnitDisplay,
    seconds.flatMap(s => (['sec', 'min'] as const).map(u => [s, u] as [typeof s, 'sec' | 'min'])))

  const typed = ['', ' ', '0', '1', '15', '15.5', '0.25', 'abc', '-3', '1e3']
  same('workout/durationUnit.unitDisplayToSeconds',
    webDurationUnit.unitDisplayToSeconds, coreDurationUnit.unitDisplayToSeconds,
    typed.flatMap(v => (['sec', 'min'] as const).map(u => [v, u] as [string, 'sec' | 'min'])))

  same('workout/durationUnit.isFloorsExercise',
    webDurationUnit.isFloorsExercise, coreDurationUnit.isFloorsExercise,
    [['Stairmaster'], ['Stair Climber'], ['STAIRS'], ['Treadmill Walk'], ['Upstairs Carry'], [''], [null], [undefined]])

  manifest('workout/durationUnit', webDurationUnit, coreDurationUnit)
})

// ───────────────────────────────────────────────────────────────────────────
// 4. Dumbbells, kettlebells and what the app is assuming
// ───────────────────────────────────────────────────────────────────────────

interface BellCase {
  name?: string
  aliases?: string[]
  equipment?: string[]
  laterality?: string
  movementPatterns?: string[]
}

const BELLS: Array<BellCase | null | undefined> = [
  null,
  undefined,
  {},
  // Equipment says dumbbell and the name does not — the 2026-09-09 fix.
  { name: 'Chest-Supported Row', equipment: ['dumbbell', 'bench'] },
  // Equipment says barbell, an alias says "DB/bar" — must NOT be per-DB.
  { name: 'Barbell Bench Press', aliases: ['Bench Press (DB/bar)'], equipment: ['barbell', 'bench'] },
  { name: 'Barbell Back Squat', aliases: ['Barbell or Dumbbell Squat'], equipment: ['barbell'] },
  { name: 'Cable Woodchopper', aliases: ['DB Woodchoppers'], equipment: ['cable'] },
  { name: 'Crunch', aliases: ['DB Crunch × 20'], equipment: ['bodyweight'] },
  // Support-only equipment leaves the question open → the name answers it.
  { name: 'DB Curl', equipment: ['bench'] },
  { name: 'KB Snatch', equipment: ['mat'] },
  { name: 'Dumbbell Fly' },
  { name: 'Kettlebell Swing' },
  { name: 'Dumbbells Curl' },
  { name: 'Push-up' },
  { name: '' },
  // Kettlebell: one implement unless the name says two.
  { name: 'Goblet Squat', equipment: ['kettlebell'] },
  { name: 'Double Kettlebell Front Squat', equipment: ['kettlebell'] },
  { name: 'Paired Kettlebell Clean', equipment: ['kettlebell'] },
  { name: 'Turkish Get-Up', equipment: ['kettlebell'], laterality: 'unilateral' },
  // Dumbbell: a pair unless it is carried, goblet-held, or single-sided.
  { name: 'Single-Arm Dumbbell Row', equipment: ['dumbbell'], laterality: 'unilateral' },
  { name: 'Alternating Dumbbell Curl', equipment: ['dumbbell'], laterality: 'alternating' },
  { name: 'Farmer Carry', equipment: ['dumbbell'], movementPatterns: ['carry'] },
  { name: 'Goblet Dumbbell Squat', equipment: ['dumbbell'] },
  { name: 'Dumbbell Bench Press', equipment: ['dumbbell'], laterality: 'bilateral' },
  // Machines, cables, bands, bodyweight.
  { name: 'Rear Delt Fly', equipment: ['dumbbell'] },
  { name: 'Leg Press', equipment: ['leg_press'] },
  { name: 'Lat Pulldown', equipment: ['lat_pulldown'] },
  { name: 'Banded Abduction', equipment: ['resistance_band'] },
  { name: 'Pull-up', equipment: ['bodyweight'] },
  { name: 'Treadmill Run', equipment: ['treadmill'] },
]

test('workout/dumbbellWeight: per-implement labels, totals and quick picks', () => {
  same('workout/dumbbellWeight.getBellWeightInfo',
    webDumbbellWeight.getBellWeightInfo, coreDumbbellWeight.getBellWeightInfo,
    BELLS.map(b => [b] as [BellCase | null | undefined]))

  same('workout/dumbbellWeight.bellWeightLabel',
    webDumbbellWeight.bellWeightLabel, coreDumbbellWeight.bellWeightLabel,
    [['dumbbell'], ['kettlebell'], [null]])

  same('workout/dumbbellWeight.weightQuickPicks',
    webDumbbellWeight.weightQuickPicks, coreDumbbellWeight.weightQuickPicks,
    [['dumbbell'], ['kettlebell'], [null]])

  manifest('workout/dumbbellWeight', webDumbbellWeight, coreDumbbellWeight)
})

test('workout/equipmentVariant: what is being loaded, and whether the name says so', () => {
  const equipmentLists: Array<string[] | null | undefined> = [
    undefined, null, [], ['bench'], ['barbell'], ['barbell', 'bench'], ['dumbbell'], ['kettlebell'],
    ['cable'], ['leg_press'], ['smith_machine'], ['resistance_band'], ['bodyweight'],
    ['ez_bar'], ['trap_bar'], ['safety_squat_bar'], ['DUMBBELL'], ['treadmill'], ['mat', 'box'],
    ['bench', 'dumbbell'], ['rear_delt_machine', 'cable'],
  ]
  same('workout/equipmentVariant.loadStyleOf',
    webEquipmentVariant.loadStyleOf, coreEquipmentVariant.loadStyleOf,
    equipmentLists.map(e => [e] as [string[] | null | undefined]))
  same('workout/equipmentVariant.implementLabel',
    webEquipmentVariant.implementLabel, coreEquipmentVariant.implementLabel,
    equipmentLists.map(e => [e] as [string[] | null | undefined]))

  const names: Array<[string | null | undefined, string[] | undefined]> = [
    ['Dumbbell Bench Press', undefined],
    ['DB Row', undefined],
    ['Kettlebell Swing', undefined],
    ['KBs Clean', undefined],
    ['Barbell Back Squat', undefined],
    ['EZ-Bar Curl', undefined],
    ['Trap Bar Deadlift', undefined],
    ['Hex-Bar Deadlift', undefined],
    ['SSB Squat', undefined],
    ['Cable Crossover', undefined],
    ['Pulley Row', undefined],
    ['Smith Machine Squat', undefined],
    ['Pec Deck', undefined],
    ['Lat Pulldown', undefined],
    ['Hammer Strength Row', undefined],
    ['Banded Abduction', undefined],
    ['Bodyweight Squat', undefined],
    ['Body-Weight Row', undefined],
    ['Rear Delt Fly', undefined],
    ['Rear Delt Fly', ['Dumbbell Rear Delt Fly']],
    ['', undefined],
    ['   ', undefined],
    [null, undefined],
    [undefined, ['DB Fly']],
  ]
  same('workout/equipmentVariant.nameStatesLoadStyle',
    webEquipmentVariant.nameStatesLoadStyle, coreEquipmentVariant.nameStatesLoadStyle, names)

  same('workout/equipmentVariant.loadStyleLabel',
    webEquipmentVariant.loadStyleLabel, coreEquipmentVariant.loadStyleLabel,
    (['dumbbell', 'kettlebell', 'barbell', 'cable', 'machine', 'band', 'bodyweight'] as const)
      .map(s => [s] as [webEquipmentVariant.LoadStyle]))

  same('workout/equipmentVariant.equipmentAssumption',
    webEquipmentVariant.equipmentAssumption, coreEquipmentVariant.equipmentAssumption,
    BELLS.map(b => [b as webEquipmentVariant.EquipmentAssumptionInput | null | undefined]))

  manifest('workout/equipmentVariant', webEquipmentVariant, coreEquipmentVariant)
})

// ───────────────────────────────────────────────────────────────────────────
// 5. Build as you go
// ───────────────────────────────────────────────────────────────────────────

const LIST_A: WorkoutExercise[] = [
  ex('Squat', { sets: 3 }),
  ex('Row', { sets: 3 }),
  ex('Press', { sets: 3 }),
  ex('Curl', { sets: 3 }),
]
const LIST_GROUPED: WorkoutExercise[] = [
  ex('Bench', { sets: 3, groupId: 'adhoc-1', groupType: 'superset', groupLabel: 'Superset' }),
  ex('Row', { sets: 3, groupId: 'adhoc-1', groupType: 'superset', groupLabel: 'Superset' }),
  ex('Curl', { sets: 3 }),
]
const LIST_BROKEN: WorkoutExercise[] = [
  ex('A', { groupId: 'g' }),
  ex('B'),
  ex('C', { groupId: 'g' }),
  ex('D', { groupId: 'lonely' }),
]
const NEW_EX = ex('Lateral Raise', { sets: 3 })
// A circuit whose members disagree about how many rounds there are — the exact
// shape the field reported (3-set exercise dropped into a 5-set circuit).
const LIST_CIRCUIT: WorkoutExercise[] = [
  ex('Jump Rope', { sets: 5, groupId: 'adhoc-1', groupType: 'circuit', groupLabel: 'Circuit' }),
  ex('Goblet Squat', { sets: 3, groupId: 'adhoc-1', groupType: 'circuit', groupLabel: 'Circuit' }),
  ex('Curl', { sets: 2 }),
]

test('workout/buildAsYouGo: add, group, ungroup, move, remap', () => {
  const b = webBuildAsYouGo
  const c = coreBuildAsYouGo

  same('workout/buildAsYouGo.needsMoreExercises', b.needsMoreExercises, c.needsMoreExercises,
    [[0], [1], [3], [4], [9]])
  same('workout/buildAsYouGo.shouldWarnBeforeFinish', b.shouldWarnBeforeFinish, c.shouldWarnBeforeFinish, [
    [{ selfBuilt: true, exerciseCount: 2, alreadyAsked: false }],
    [{ selfBuilt: true, exerciseCount: 2, alreadyAsked: true }],
    [{ selfBuilt: false, exerciseCount: 2, alreadyAsked: false }],
    [{ selfBuilt: true, exerciseCount: 6, alreadyAsked: false }],
  ])
  same('workout/buildAsYouGo.groupLabelFor', b.groupLabelFor, c.groupLabelFor,
    (['superset', 'circuit', 'triset', 'giant_set'] as const).flatMap(k => [2, 3, 5].map(n => [k, n] as [typeof k, number])))
  same('workout/buildAsYouGo.naturalKindFor', b.naturalKindFor, c.naturalKindFor, [[1], [2], [3], [4], [7]])
  same('workout/buildAsYouGo.agreesOnSets', b.agreesOnSets, c.agreesOnSets,
    [['circuit'], ['superset'], ['triset'], ['giant_set'], [undefined], ['']])
  same('workout/buildAsYouGo.defaultSetsFor', b.defaultSetsFor, c.defaultSetsFor, [
    [[]], [LIST_A], [LIST_CIRCUIT], [[{ sets: 0 }]], [[{ sets: undefined }]], [[{ sets: 4.7 }]],
  ])
  same('workout/buildAsYouGo.alignCircuitSets', b.alignCircuitSets, c.alignCircuitSets,
    [[LIST_A], [LIST_GROUPED], [LIST_CIRCUIT], [LIST_BROKEN], [[]]])
  same('workout/buildAsYouGo.setSetsAt', b.setSetsAt, c.setSetsAt, [
    [LIST_A, 0, 5], [LIST_A, 99, 5], [LIST_GROUPED, 0, 4],
    [LIST_CIRCUIT, 1, 4], [LIST_CIRCUIT, 2, 4], [LIST_CIRCUIT, 0, 0],
  ])
  same('workout/buildAsYouGo.setGroupKindAt', b.setGroupKindAt, c.setGroupKindAt, [
    [LIST_GROUPED, 0, 'circuit'], [LIST_GROUPED, 1, 'circuit'], [LIST_GROUPED, 2, 'circuit'],
    [LIST_CIRCUIT, 0, 'superset'], [LIST_A, 0, 'circuit'],
  ])
  same('workout/buildAsYouGo.addNextIntoGroup', b.addNextIntoGroup, c.addNextIntoGroup, [
    [LIST_GROUPED, 0], [LIST_GROUPED, 1], [LIST_GROUPED, 2],
    [LIST_CIRCUIT, 0], [LIST_CIRCUIT, 1], [LIST_A, 0],
  ])
  same('workout/buildAsYouGo.newGroupId', b.newGroupId, c.newGroupId, [
    [[], undefined], [LIST_A, undefined], [LIST_GROUPED, 1], [LIST_GROUPED, 2], [LIST_GROUPED, 0],
  ])
  same('workout/buildAsYouGo.canRemoveExercise', b.canRemoveExercise, c.canRemoveExercise,
    [[[]], [[1]], [[1, 2]]])
  same('workout/buildAsYouGo.appendExercise', b.appendExercise, c.appendExercise,
    [[[], NEW_EX], [LIST_A, NEW_EX]])
  same('workout/buildAsYouGo.insertExerciseAfter', b.insertExerciseAfter, c.insertExerciseAfter,
    [-2, -1, 0, 1, 3, 9].map(i => [LIST_A, i, NEW_EX] as [WorkoutExercise[], number, WorkoutExercise]))
  same('workout/buildAsYouGo.addIntoGroup', b.addIntoGroup, c.addIntoGroup, [
    [LIST_A, 1, NEW_EX, 'superset'],
    [LIST_A, 1, NEW_EX, 'circuit'],
    [LIST_GROUPED, 0, NEW_EX, 'superset'],
    [LIST_GROUPED, 1, NEW_EX, 'superset'],
    [LIST_A, 99, NEW_EX, 'superset'],
  ])
  same('workout/buildAsYouGo.groupIndexes', b.groupIndexes, c.groupIndexes, [
    [LIST_A, [0, 1], 'superset', undefined],
    [LIST_A, [0, 2], 'superset', undefined],
    [LIST_A, [3, 1], 'circuit', { rounds: 4, rest: '60 sec' }],
    [LIST_A, [1, 2, 3], 'triset', { groupId: 'fixed' }],
    [LIST_A, [1], 'superset', undefined],
    [LIST_A, [], 'superset', undefined],
    [LIST_A, [0, 0, 1], 'superset', undefined],
    [LIST_A, [-1, 0, 1, 99], 'giant_set', undefined],
  ])
  same('workout/buildAsYouGo.ungroupAt', b.ungroupAt, c.ungroupAt,
    [0, 1, 2, 99].map(i => [LIST_GROUPED, i] as [WorkoutExercise[], number]))
  same('workout/buildAsYouGo.removeExercise', b.removeExercise, c.removeExercise,
    [-1, 0, 1, 2, 99].map(i => [LIST_GROUPED, i] as [WorkoutExercise[], number]))
  same('workout/buildAsYouGo.moveExercise', b.moveExercise, c.moveExercise, [
    [LIST_A, 0, 1], [LIST_A, 3, 0], [LIST_A, 1, 1], [LIST_A, -1, 2], [LIST_A, 0, 99],
    [LIST_GROUPED, 0, 2], [LIST_GROUPED, 2, 0],
  ])
  same('workout/buildAsYouGo.sanitizeGroups', b.sanitizeGroups, c.sanitizeGroups,
    [[LIST_A], [LIST_GROUPED], [LIST_BROKEN], [[]]])
  same('workout/buildAsYouGo.applyOrder', b.applyOrder, c.applyOrder, [
    [['a', 'b', 'c'], [2, 0, -1], (i: number) => `new-${i}`],
    [[], [-1, -1], (i: number) => `new-${i}`],
    [['a'], [0, 5], (i: number) => `new-${i}`],
  ])
  same('workout/buildAsYouGo.applyOrderToRecord', b.applyOrderToRecord, c.applyOrderToRecord, [
    [{ 0: 'x', 2: 'y' }, [2, 0, -1]],
    [{}, [0, 1]],
  ])
  same('workout/buildAsYouGo.remapIndex', b.remapIndex, c.remapIndex, [
    [[2, 0, 1], 0], [[2, 0, 1], 2], [[2, 0, 1], 9], [[], 3],
  ])
  same('workout/buildAsYouGo.exerciseFromLog', b.exerciseFromLog, c.exerciseFromLog, [
    [{ name: 'Curl', sets: [{ reps: 10, weight: 30, completed: true }] }],
    [{ name: 'Plank', sets: [{ duration: 45, completed: true }] }],
    [{ name: 'Plank', sets: [{ duration: 45, reps: 0 }] }],
    [{ name: 'Bike', sets: [], prescription: { sets: 2, reps: '20 cal', rest: '60 sec', trackingType: 'intervals' } }],
    [{ name: 'Row', exerciseSlug: 'row', groupId: 'g', groupType: 'superset', groupLabel: 'Superset', groupRounds: 3, addedAdHoc: true, sets: [{ reps: 8, weight: 100 }] }],
    [{ name: 'Nothing' }],
  ])
  same('workout/buildAsYouGo.mergeAdHocFromLog', b.mergeAdHocFromLog, c.mergeAdHocFromLog, [
    [LIST_A, undefined],
    [LIST_A, []],
    [LIST_A, [{ name: 'Squat' }, { name: 'Row' }, { name: 'Press' }, { name: 'Curl' }]],
    [LIST_A, [{ name: 'Squat' }, { name: 'Row' }, { name: 'Press' }, { name: 'Curl' }, { name: 'Extra', sets: [{ reps: 10 }] }]],
    [LIST_A.slice(0, 1), [{ name: 'Squat', addedAdHoc: true }]],
  ])
  same('workout/buildAsYouGo.prescriptionOf', b.prescriptionOf, c.prescriptionOf, [
    [ex('Squat', { sets: 3, reps: '8-12', rest: '90 sec', trackingType: 'reps_weight' })],
    [ex('Plank', { duration: '30 sec', trackingType: 'time' })],
    [ex('Bare')],
  ])

  manifest('workout/buildAsYouGo', webBuildAsYouGo, coreBuildAsYouGo)
})

// ───────────────────────────────────────────────────────────────────────────
// 6. Where you are in a workout
// ───────────────────────────────────────────────────────────────────────────

const FLOW = webWorkoutUtils.buildWorkoutFlow([ex('A', { sets: 2 }), ex('B', { sets: 2 })])
const DONE = [[{ completed: true }, { completed: true }], [{ completed: false }, { completed: false }]]
const ALL_DONE = [[{ completed: true }, { completed: true }], [{ completed: true }, { completed: true }]]

test('workout/position: the pure start-step and scope rules', () => {
  same('workout/position.quickScope', webPosition.quickScope, corePosition.quickScope, [['abc'], ['']])
  same('workout/position.programScope', webPosition.programScope, corePosition.programScope,
    [['p1', 'Day 1'], ['', '']])
  same('workout/position.resolveStartStep', webPosition.resolveStartStep, corePosition.resolveStartStep, [
    [[], [], null],
    [FLOW, DONE, null],
    [FLOW, ALL_DONE, null],
    [FLOW, DONE, { exerciseIndex: 1, setIndex: 1, at: 0 }],
    [FLOW, DONE, { exerciseIndex: 9, setIndex: 9, at: 0 }],
    [FLOW, [], { exerciseIndex: 0, setIndex: 1, at: 0 }],
    [FLOW, [], null],
    [FLOW, DONE, undefined],
  ])

  // The copy keeps only the pure half, so the age rule is compared THROUGH the
  // web's `localStorage` wrapper: one fake store, the web's own reader, and the
  // copy's `parsePosition` on the same bytes. If either drifts, these differ.
  const store = new Map<string, string>()
  const fake = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => { store.set(k, v) },
    removeItem: (k: string) => { store.delete(k) },
  }
  const g = globalThis as unknown as { window?: unknown; localStorage?: unknown }
  const hadWindow = 'window' in g
  g.window = g.window ?? {}
  g.localStorage = fake
  try {
    const now = 1_700_000_000_000
    const scope = webPosition.quickScope('s1')
    assert.equal(corePosition.positionKey(scope), 'workout_pos_quick:s1',
      'the storage key has to be the same one the web writes under')

    for (const [exI, setI, writtenAt] of [[1, 2, now], [0, 0, now - 1000], [3, 0, now - webPosition.POSITION_MAX_AGE_MS - 1]] as const) {
      store.clear()
      webPosition.writePosition(scope, exI, setI, writtenAt)
      const raw = store.get(corePosition.positionKey(scope))
      assert.deepStrictEqual(
        corePosition.parsePosition(raw ? JSON.parse(raw) : null, now),
        webPosition.readPosition(scope, now),
        `DRIFT: the copy's parsePosition disagrees with the web's readPosition for ${show([exI, setI, writtenAt])}`,
      )
      comparisons += 1
    }

    // Garbage in storage: both must answer "no opinion".
    for (const junk of ['{}', '{"exerciseIndex":1}', '{"exerciseIndex":1,"setIndex":2}', 'null', '"x"']) {
      store.clear()
      store.set(corePosition.positionKey(scope), junk)
      assert.deepStrictEqual(
        corePosition.parsePosition(JSON.parse(junk), now),
        webPosition.readPosition(scope, now),
        `DRIFT on stored junk ${junk}`,
      )
      comparisons += 1
    }

    // The write guard: the web refuses the same inputs the copy refuses.
    for (const [scopeIn, exI, setI] of [['', 0, 0], ['s', NaN, 0], ['s', 0, Infinity], ['s', 1, 1]] as const) {
      store.clear()
      webPosition.writePosition(scopeIn, exI, setI, now)
      assert.equal(
        store.size > 0,
        corePosition.isWritablePosition(scopeIn, exI, setI),
        `DRIFT: isWritablePosition disagrees with what the web actually writes for ${show([scopeIn, exI, setI])}`,
      )
      comparisons += 1
    }
    covered.add('workout/position.positionKey')
    covered.add('workout/position.parsePosition')
    covered.add('workout/position.isWritablePosition')
  } finally {
    delete g.localStorage
    if (!hadWindow) delete g.window
  }

  manifest('workout/position', webPosition, corePosition, {
    webOnly: {
      writePosition: 'localStorage — React Native has none; NP-081 brings the native store',
      readPosition: 'localStorage; its parsing rules are copied as parsePosition and compared above',
      clearPosition: 'localStorage',
    },
    copyOnly: {
      positionKey: 'the key the web wrapper builds inline, so both stores agree on it',
      parsePosition: 'the pure half of readPosition',
      isWritablePosition: 'the pure half of writePosition',
    },
  })
})

// ───────────────────────────────────────────────────────────────────────────
// 7. Quick sessions: naming and the log body
// ───────────────────────────────────────────────────────────────────────────

test('quickSession/naming: default names, prompts and the fallback day name', () => {
  same('quickSession/naming.isDefaultQuickSessionName',
    webNaming.isDefaultQuickSessionName, coreNaming.isDefaultQuickSessionName,
    [[''], ['  '], ['Quick Session'], ['quick session'], ['WORKOUT NOW'], ['Leg Day'], [null], [undefined]])

  same('quickSession/naming.shouldPromptForQuickSessionName',
    webNaming.shouldPromptForQuickSessionName, coreNaming.shouldPromptForQuickSessionName, [
      [null],
      [undefined],
      [{ title: 'Quick Session' }],
      [{ title: 'Leg Day' }],
      [{ title: 'Leg Day', needsName: true }],
      [{ title: 'Quick Session', needsName: false }],
      [{ title: 'Quick Session', sourceSessionId: 'old' }],
      [{ title: 'Quick Session', needsName: true, sourceSessionId: 'old' }],
    ])

  const at = new Date(Date.UTC(2026, 8, 9, 12, 0, 0))
  same('quickSession/naming.fallbackQuickSessionName',
    webNaming.fallbackQuickSessionName, coreNaming.fallbackQuickSessionName, [
      ['2026-09-09', at],
      ['2026-01-01', at],
      ['2026-12-31', at],
      ['  2026-09-09  ', at],
      ['2026-9-9', at],
      ['not-a-date', at],
      ['', at],
      [null, at],
      [undefined, at],
    ])

  manifest('quickSession/naming', webNaming, coreNaming)
})

test('quickSession/log: the local day key and the logged-exercise body', () => {
  same('quickSession/log.localDateStr', webQuickLog.localDateStr, coreQuickLog.localDateStr, [
    [new Date(2026, 0, 1, 0, 0, 0)],
    [new Date(2026, 8, 9, 23, 59, 59)],
    [new Date(2026, 11, 31, 12, 0, 0)],
  ])

  const draft = (over: Record<string, unknown> = {}) => ({
    exerciseSlug: 'squat', name: 'Squat', trackingType: 'reps_weight', sets: 3, reps: '8-12', ...over,
  })
  same('quickSession/log.buildLoggedExercises',
    webQuickLog.buildLoggedExercises, coreQuickLog.buildLoggedExercises, [
      [[], true],
      [[draft()], true],
      [[draft()], false],
      [[draft({ sets: 0 })], true],
      [[draft({ sets: Number.NaN })], true],
      [[draft({ reps: '', duration: '30 sec', trackingType: 'time' })], true],
      [[draft({ reps: 'AMRAP' })], true],
      [[draft({ rest: '90 sec', groupId: 'g', groupType: 'superset', groupLabel: 'Superset', groupRounds: 3, addedAdHoc: true })], false],
      [[draft(), draft({ exerciseSlug: '', name: 'Ad hoc' })], true],
    ] as Array<Parameters<typeof webQuickLog.buildLoggedExercises>>)

  manifest('quickSession/log', webQuickLog, coreQuickLog, {
    webOnly: {
      logQuickSession: 'reads the token from localStorage and POSTs a relative URL; native saves through @become/api-client',
    },
  })
})

// ───────────────────────────────────────────────────────────────────────────
// 8. Streaks: the arithmetic and the tile pages
// ───────────────────────────────────────────────────────────────────────────

const DAYS = (...keys: string[]) => keys
const WEEK = ['2026-09-06', '2026-09-07', '2026-09-08', '2026-09-09', '2026-09-10', '2026-09-11', '2026-09-12']

test('streaks/pillars: day streaks, week streaks, lost weeks', () => {
  const p = webPillars
  const q = corePillars

  same('streaks/pillars.shiftDay', p.shiftDay, q.shiftDay, [
    ['2026-09-09', 0], ['2026-09-09', 1], ['2026-09-09', -1], ['2026-03-01', -1],
    ['2026-01-01', -1], ['2026-12-31', 1], ['nonsense', 1], ['2026-09-09', -7],
  ])
  same('streaks/pillars.weekKeyOf', p.weekKeyOf, q.weekKeyOf, WEEK.map(d => [d] as [string]))
  same('streaks/pillars.weekdayOf', p.weekdayOf, q.weekdayOf, WEEK.map(d => [d] as [string]))
  same('streaks/pillars.dayStreak', p.dayStreak, q.dayStreak, [
    [[], '2026-09-09'],
    [DAYS('2026-09-09'), '2026-09-09'],
    [DAYS('2026-09-07', '2026-09-08'), '2026-09-09'],
    [DAYS('2026-09-07', '2026-09-08', '2026-09-09'), '2026-09-09'],
    [DAYS('2026-09-01', '2026-09-02', '2026-09-03', '2026-09-04', '2026-09-08'), '2026-09-09'],
    [DAYS('2026-09-06'), '2026-09-09'],
    [DAYS('nonsense', '2026-09-09'), '2026-09-09'],
    [new Set(['2026-09-08', '2026-09-09']), '2026-09-09'],
  ])
  same('streaks/pillars.weekStreak', p.weekStreak, q.weekStreak, [
    [[], 5, '2026-09-09'],
    [DAYS(...WEEK.slice(0, 5)), 5, '2026-09-09'],
    [DAYS(...WEEK.slice(0, 3)), 5, '2026-09-09'],
    [DAYS('2026-08-31', '2026-09-01', '2026-09-02', '2026-09-03', '2026-09-04', ...WEEK.slice(0, 5)), 5, '2026-09-09'],
    [DAYS(...WEEK.slice(0, 2)), 0, '2026-09-09'],
    [DAYS(...WEEK.slice(0, 2)), 1.4, '2026-09-09'],
  ])
  same('streaks/pillars.workoutOrRestDays', p.workoutOrRestDays, q.workoutOrRestDays, [
    [DAYS('2026-09-07'), WEEK, [1, 3, 5], undefined],
    [DAYS('2026-09-07'), WEEK, [], 4],
    [DAYS('2026-09-07'), WEEK, null, 4],
    [DAYS('2026-09-07'), WEEK, null, 7],
    [DAYS('2026-09-07'), WEEK, null, 0],
    [DAYS('2026-09-07'), WEEK, null, null],
  ])
  same('streaks/pillars.lostWeeks', p.lostWeeks, q.lostWeeks, [
    [[], 5, '2026-09-09', null, 3],
    [DAYS(...WEEK.slice(0, 5)), 5, '2026-09-09', null, 3],
    [DAYS(...WEEK.slice(0, 2)), 5, '2026-09-09', null, 2],
    [DAYS(...WEEK.slice(0, 2)), 5, '2026-09-09', [1, 3, 5], 2],
    [DAYS('2026-09-09'), 2, '2026-09-09', [3], 1],
    [DAYS(...WEEK.slice(0, 2)), 3, '2026-09-11', [], 1],
  ])
  const lost = webPillars.lostWeeks(DAYS(...WEEK.slice(0, 2)), 5, '2026-09-09', null, 2)
  const noLostWeeks = new Set<string>()
  same('streaks/pillars.onTrackDays', p.onTrackDays, q.onTrackDays, [[WEEK, lost], [[], lost], [WEEK, noLostWeeks]])
  same('streaks/pillars.withoutLostWeeks', p.withoutLostWeeks, q.withoutLostWeeks, [[WEEK, lost], [[], noLostWeeks]])
  same('streaks/pillars.dayRange', p.dayRange, q.dayRange, [
    ['2026-09-09', '2026-09-09'], ['2026-09-06', '2026-09-12'], ['2026-09-12', '2026-09-06'],
  ])
  same('streaks/pillars.intersectDays', p.intersectDays, q.intersectDays, [
    [],
    [new Set(WEEK)],
    [new Set(WEEK), new Set(['2026-09-09'])],
    [new Set(WEEK), new Set(['2026-09-09']), new Set(['2026-09-10'])],
    [new Set<string>(), new Set(['2026-09-09'])],
  ])
  same('streaks/pillars.streakDisplay', p.streakDisplay, q.streakDisplay,
    [[-1], [0], [1], [2], [3], [4], [99]].map(a => a as [number]))

  manifest('streaks/pillars', webPillars, corePillars)
})

const streaks = (
  over: Partial<webTile.StreaksLite['pillars']> = {},
  overall: Partial<webTile.StreaksLite['overall']> = {},
): webTile.StreaksLite => ({
  overall: { current: 5, best: 18, nextMilestone: 7, activeToday: true, freezes: 1, ...overall },
  pillars: {
    workout: { unit: 'days', current: 10, best: 10, thisWeek: 1, target: 5, weekLost: false },
    nutrition: { current: 4, best: 9, activeToday: true },
    mindset: { current: 6, best: 17, activeToday: true },
    super: { current: 4, best: 4, activeToday: false, today: { nutrition: true, mindset: false, trained: true, restDay: false, weekOnTrack: true } },
    ...over,
  },
})

/** Below and above STREAK_VISIBLE_MIN, on every pillar. */
const STREAK_CASES: Array<webTile.StreaksLite | null> = [
  null,
  streaks(),
  // Every pillar below the visible minimum: only the day-streak page, "Building".
  streaks(
    {
      workout: { unit: 'days', current: 1, best: 1, thisWeek: 0, target: 5, weekLost: true },
      nutrition: { current: 2, best: 2, activeToday: false },
      mindset: { current: 0, best: 0, activeToday: false },
      super: { current: 0, best: 0, activeToday: false, today: { nutrition: false, mindset: false, trained: false, restDay: false, weekOnTrack: false } },
    },
    { current: 2, best: 2, nextMilestone: 7, activeToday: false },
  ),
  // Exactly at the minimum, everywhere.
  streaks(
    {
      workout: { unit: 'days', current: 3, best: 3, thisWeek: 3, target: 3, weekLost: false },
      nutrition: { current: 3, best: 3, activeToday: true },
      mindset: { current: 3, best: 3, activeToday: true },
      super: { current: 3, best: 9, activeToday: true, today: { nutrition: true, mindset: true, trained: true, restDay: false, weekOnTrack: true } },
    },
    { current: 3, best: 3, nextMilestone: 7, activeToday: true },
  ),
  // Super streak alive with a record to chase; nothing missing today.
  streaks({ super: { current: 12, best: 30, activeToday: true, today: { nutrition: true, mindset: true, trained: true, restDay: false, weekOnTrack: true } } }),
  // Super streak at risk, all three missing, a freeze in hand.
  streaks({
    super: {
      current: 9, best: 9, activeToday: false,
      today: { nutrition: false, mindset: false, trained: false, restDay: false, weekOnTrack: true },
      freeze: { available: true, returnsOn: null, usedDays: [], frozenToday: false },
    },
  }),
  // Same, freeze already spent today.
  streaks({
    super: {
      current: 9, best: 9, activeToday: false,
      today: { nutrition: true, mindset: false, trained: false, restDay: false, weekOnTrack: true },
      freeze: { available: true, returnsOn: '2026-10-01', usedDays: ['2026-09-30'], frozenToday: true },
    },
  }),
  // Workout streak above the minimum but with NO target — no page.
  streaks({ workout: { unit: 'days', current: 12, best: 12, thisWeek: 2, target: null, weekLost: false } }),
  // Week off track.
  streaks({ workout: { unit: 'days', current: 12, best: 12, thisWeek: 1, target: 6, weekLost: true } }),
  // Every milestone reached.
  streaks({}, { current: 400, best: 400, nextMilestone: null, activeToday: true }),
  // A one-day-old everything (singular units).
  streaks(
    {
      workout: { unit: 'days', current: 1, best: 1, thisWeek: 1, target: 1, weekLost: false },
      nutrition: { current: 1, best: 4, activeToday: false },
      mindset: { current: 1, best: 4, activeToday: false },
      super: { current: 1, best: 1, activeToday: false, today: { nutrition: false, mindset: true, trained: true, restDay: false, weekOnTrack: true } },
    },
    { current: 1, best: 1, nextMilestone: 7, activeToday: false },
  ),
]

test('streaks/tile: the pages, below and above the visible minimum', () => {
  same('streaks/tile.streakPages', webTile.streakPages, coreTile.streakPages,
    STREAK_CASES.map(s => [s] as [webTile.StreaksLite | null]))
  same('streaks/tile.superMissing', webTile.superMissing, coreTile.superMissing,
    STREAK_CASES.filter((s): s is webTile.StreaksLite => s !== null).map(s => [s] as [webTile.StreaksLite]))
  same('streaks/tile.superAtRisk', webTile.superAtRisk, coreTile.superAtRisk,
    STREAK_CASES.flatMap(s => [0, 15, 16, 18, 21, 22, 23].map(h => [s, h] as [webTile.StreaksLite | null, number])))

  manifest('streaks/tile', webTile, coreTile)
})

// ───────────────────────────────────────────────────────────────────────────
// 9. The goal tile, in every state
// ───────────────────────────────────────────────────────────────────────────

type GoalInputs = webGoalTile.GoalTileInputs

const GOAL_CASES: GoalInputs[] = [
  // Nothing at all → "Set a goal".
  { weightUnit: 'lbs' },
  // A target and a weigh-in, above target, no plan.
  { weightUnit: 'lbs', fitnessGoal: 'lose_weight', targetWeightKg: 93, startWeightKg: 100, latestWeight: 210 },
  // Within the hold band → "Goal reached".
  { weightUnit: 'lbs', fitnessGoal: 'lose_weight', targetWeightKg: 93, startWeightKg: 100, latestWeight: 205.5 },
  { weightUnit: 'kg', fitnessGoal: 'lose_weight', targetWeightKg: 93, startWeightKg: 100, latestWeight: 93.5 },
  // Below target → must move UP.
  { weightUnit: 'lbs', fitnessGoal: 'gain_muscle', targetWeightKg: 93, startWeightKg: 85, latestWeight: 180 },
  // Drifted the wrong way: the bar honestly reads 0.
  { weightUnit: 'lbs', fitnessGoal: 'lose_weight', targetWeightKg: 93, startWeightKg: 93.5, latestWeight: 215 },
  // No startWeightKg → the earliest weigh-in in the window is the start.
  { weightUnit: 'lbs', fitnessGoal: 'lose_weight', targetWeightKg: 93, earliestWeight: 220, latestWeight: 210 },
  // Neither start nor earliest.
  { weightUnit: 'lbs', fitnessGoal: 'lose_weight', targetWeightKg: 93, latestWeight: 210 },
  // With a pace read: behind, on, ahead, and on-with-no-eta.
  { weightUnit: 'lbs', fitnessGoal: 'lose_weight', targetWeightKg: 93, startWeightKg: 100, latestWeight: 210, pace: { status: 'behind', eta: '~6 wks', behindByKg: 0.7 } },
  { weightUnit: 'lbs', fitnessGoal: 'lose_weight', targetWeightKg: 93, startWeightKg: 100, latestWeight: 210, pace: { status: 'behind', eta: '', behindByKg: 0 } },
  { weightUnit: 'lbs', fitnessGoal: 'lose_weight', targetWeightKg: 93, startWeightKg: 100, latestWeight: 210, pace: { status: 'on', eta: '~3 wks', behindByKg: 0 } },
  { weightUnit: 'lbs', fitnessGoal: 'lose_weight', targetWeightKg: 93, startWeightKg: 100, latestWeight: 210, pace: { status: 'ahead', eta: '~2 wks', behindByKg: 0 } },
  { weightUnit: 'lbs', fitnessGoal: 'lose_weight', targetWeightKg: 93, startWeightKg: 100, latestWeight: 210, pace: { status: 'on', eta: '', behindByKg: 0 } },
  { weightUnit: 'kg', fitnessGoal: 'maintain', targetWeightKg: 93, startWeightKg: 100, latestWeight: 95.4, pace: { status: 'ahead', eta: '~1 wk', behindByKg: 0 } },
  // A target and no weigh-in yet.
  { weightUnit: 'lbs', fitnessGoal: 'improve_performance', targetWeightKg: 93 },
  { weightUnit: 'kg', targetWeightKg: 93, latestWeight: 0 },
  // No target: the program's completion, named as such.
  { weightUnit: 'lbs', fitnessGoal: 'general_health', program: { name: 'Phase 1', currentWeek: 2, totalWeeks: 8, programId: 'p1' } },
  { weightUnit: 'lbs', program: { name: 'Phase 1', completedWorkouts: 9, totalWorkouts: 24, currentWeek: 2, totalWeeks: 8, programId: 'p1' } },
  { weightUnit: 'lbs', program: { name: 'Phase 1', completedWorkouts: 0, totalWorkouts: 0, currentWeek: 1, totalWeeks: 0, programId: 'p1' } },
  { weightUnit: 'lbs', program: { name: 'Done', completedWorkouts: 30, totalWorkouts: 24, currentWeek: 9, totalWeeks: 8, programId: 'p1' } },
  // Unknown goal names, and a zero/negative target.
  { weightUnit: 'lbs', fitnessGoal: 'something_else', latestWeight: 200 },
  { weightUnit: 'lbs', targetWeightKg: 0, latestWeight: 200 },
  { weightUnit: 'lbs', targetWeightKg: -5, latestWeight: 200 },
  { weightUnit: 'lbs', fitnessGoal: null, nutritionDirection: 'lose', targetWeightKg: null, startWeightKg: null, latestWeight: null, earliestWeight: null, pace: null, program: null },
]

test('dashboard/goalTile: every tile state', () => {
  same('dashboard/goalTile.describeGoal', webGoalTile.describeGoal, coreGoalTile.describeGoal,
    GOAL_CASES.map(g => [g] as [GoalInputs]))
  same('dashboard/goalTile.goalLabel', webGoalTile.goalLabel, coreGoalTile.goalLabel,
    [['lose_weight'], ['gain_muscle'], ['maintain'], ['improve_performance'], ['general_health'], ['nope'], [''], [null], [undefined]])
  same('dashboard/goalTile.kgToUnit', webGoalTile.kgToUnit, coreGoalTile.kgToUnit,
    [0, 1, 93, 100.5, -3].flatMap(kg => (['lbs', 'kg'] as const).map(u => [kg, u] as [number, 'lbs' | 'kg'])))
  same('dashboard/goalTile.formatWeight', webGoalTile.formatWeight, coreGoalTile.formatWeight,
    [0, 0.44, 1.05, 9.96, 205.5, 205.44, -3].flatMap(n => (['lbs', 'kg'] as const).map(u => [n, u] as [number, 'lbs' | 'kg'])))
  same('dashboard/goalTile.formatWeightDelta', webGoalTile.formatWeightDelta, coreGoalTile.formatWeightDelta,
    [0, 0.04, 0.6, 3, 9.5, 9.94, 10, 12.4, -4.5].flatMap(n => (['lbs', 'kg'] as const).map(u => [n, u] as [number, 'lbs' | 'kg'])))
  same('dashboard/goalTile.holdBand', webGoalTile.holdBand, coreGoalTile.holdBand, [['lbs'], ['kg']])

  manifest('dashboard/goalTile', webGoalTile, coreGoalTile)
})

// ───────────────────────────────────────────────────────────────────────────
// 10. The dashboard layout model
// ───────────────────────────────────────────────────────────────────────────

const LAYOUT_INPUTS: unknown[] = [
  undefined,
  null,
  'nope',
  {},
  [],
  [{ id: 'streak', kind: 'stat', size: '1x1' }],
  [{ id: 'streak', kind: 'stat', size: '2x1', locked: null }],
  [{ id: 'smart', kind: 'smart-rotating', size: '2x1', locked: 'stat:weight' }],
  [{ id: 'streak', kind: 'stat', size: '1x1', locked: 'stat:weight' }],
  [{ id: '', kind: 'stat', size: '1x1' }],
  [{ id: 'x', kind: 'nope', size: '1x1' }],
  [{ id: 'x', kind: 'stat', size: '3x3' }],
  [{ id: 'x', kind: 'stat', size: '1x1', locked: '' }],
  [{ id: 'x', kind: 'stat', size: '1x1', locked: 7 }],
  [{ id: 'smart', kind: 'smart-rotating', size: '2x1', settings: {} }],
  [{ id: 'smart', kind: 'smart-rotating', size: '2x1', settings: { pool: ['stat:a', 'metric:b', 'stat:a'] } }],
  [{ id: 'smart', kind: 'smart-rotating', size: '2x1', settings: { pool: ['bogus'] } }],
  [{ id: 'smart', kind: 'smart-rotating', size: '2x1', settings: { pool: 'nope' } }],
  [{ id: 'smart', kind: 'smart-rotating', size: '2x1', settings: { pool: Array.from({ length: 21 }, (_, i) => `stat:${i}`) } }],
  [{ id: 'smart', kind: 'smart-rotating', size: '2x1', settings: { intervalMs: 4000 } }],
  [{ id: 'smart', kind: 'smart-rotating', size: '2x1', settings: { intervalMs: 0 } }],
  [{ id: 'smart', kind: 'smart-rotating', size: '2x1', settings: { intervalMs: 'fast' } }],
  [{ id: 'smart', kind: 'smart-rotating', size: '2x1', settings: [] }],
  [{ id: 'smart', kind: 'smart-rotating', size: '2x1', settings: null }],
  ['not-a-tile'],
  Array.from({ length: 21 }, (_, i) => ({ id: `t${i}`, kind: 'stat', size: '1x1' })),
]

test('dashboardLayout/types: the tile model and its validators', () => {
  same('dashboardLayout/types.isDashboardTileKind',
    webLayoutTypes.isDashboardTileKind, coreLayoutTypes.isDashboardTileKind,
    [['stat'], ['metric'], ['smart-rotating'], ['nope'], [1], [null], [undefined]])
  same('dashboardLayout/types.isDashboardTileSize',
    webLayoutTypes.isDashboardTileSize, coreLayoutTypes.isDashboardTileSize,
    [['1x1'], ['2x1'], ['2x2'], [null]])
  same('dashboardLayout/types.parseDashboardTile',
    webLayoutTypes.parseDashboardTile, coreLayoutTypes.parseDashboardTile,
    LAYOUT_INPUTS.flatMap(l => (Array.isArray(l) ? l : [l])).map(t => [t] as [unknown]))
  same('dashboardLayout/types.parseDashboardLayout',
    webLayoutTypes.parseDashboardLayout, coreLayoutTypes.parseDashboardLayout,
    LAYOUT_INPUTS.map(l => [l] as [unknown]))
  same('dashboardLayout/types.safeParseDashboardLayout',
    webLayoutTypes.safeParseDashboardLayout, coreLayoutTypes.safeParseDashboardLayout,
    LAYOUT_INPUTS.map(l => [l] as [unknown]))

  // The error class travels too: same name, same base.
  assert.equal(coreLayoutTypes.DashboardLayoutError.name, webLayoutTypes.DashboardLayoutError.name)
  assert.ok(new coreLayoutTypes.DashboardLayoutError('x') instanceof Error)

  manifest('dashboardLayout/types', webLayoutTypes, coreLayoutTypes)
})

test('dashboardLayout/defaults: the default layouts and the healing signature', () => {
  same('dashboardLayout/defaults.isStatTileId',
    webLayoutDefaults.isStatTileId, coreLayoutDefaults.isStatTileId,
    [['streak'], ['mood'], ['weekly'], ['goal'], ['calories'], ['water'], ['weight'], ['workouts'], ['nope'], [null]])
  same('dashboardLayout/defaults.defaultLayout',
    webLayoutDefaults.defaultLayout, coreLayoutDefaults.defaultLayout, [[]])
  same('dashboardLayout/defaults.richDefaultLayout',
    webLayoutDefaults.richDefaultLayout, coreLayoutDefaults.richDefaultLayout, [[]])
  same('dashboardLayout/defaults.isLegacyDefaultLayout',
    webLayoutDefaults.isLegacyDefaultLayout, coreLayoutDefaults.isLegacyDefaultLayout, [
      [webLayoutDefaults.defaultLayout()],
      [webLayoutDefaults.richDefaultLayout()],
      [[]],
      [webLayoutDefaults.defaultLayout().map((t, i) => (i === 0 ? { ...t, size: '2x1' as const } : t))],
      [webLayoutDefaults.defaultLayout().map((t, i) => (i === 0 ? { ...t, locked: 'stat:x' } : t))],
      [[...webLayoutDefaults.defaultLayout()].reverse()],
    ])

  // A fresh array of fresh objects each call — callers mutate them.
  assert.notEqual(coreLayoutDefaults.richDefaultLayout(), coreLayoutDefaults.richDefaultLayout())

  manifest('dashboardLayout/defaults', webLayoutDefaults, coreLayoutDefaults)
})

// ───────────────────────────────────────────────────────────────────────────
// 11. Trim and framing windows
// ───────────────────────────────────────────────────────────────────────────

test('videoTrim: every trim window', () => {
  const trims: Array<{ videoTrim?: { start?: number | null; end?: number | null } | null } | null | undefined> = [
    null, undefined, {}, { videoTrim: null },
    { videoTrim: { start: 0, end: null } },
    { videoTrim: { start: 2, end: 8 } },
    { videoTrim: { start: 8, end: 2 } },
    { videoTrim: { start: 2, end: 2.2 } },
    { videoTrim: { start: -5, end: 8 } },
    { videoTrim: { start: 2, end: null } },
    { videoTrim: { start: null, end: 8 } },
    { videoTrim: { start: 0, end: 10 } },
    { videoTrim: { start: 0, end: 9.995 } },
    { videoTrim: { start: 1, end: 10 } },
    { videoTrim: { start: 20, end: 30 } },
    { videoTrim: { start: Number.NaN, end: Number.POSITIVE_INFINITY } },
  ]
  const durations: Array<number | null | undefined> = [undefined, null, 0, -1, 10, 9.999, 30, Number.NaN]
  same('videoTrim.resolveTrim', webVideoTrim.resolveTrim, coreVideoTrim.resolveTrim,
    trims.flatMap(t => durations.map(d => [t, d] as [typeof t, typeof d])))
  same('videoTrim.formatTimecode', webVideoTrim.formatTimecode, coreVideoTrim.formatTimecode,
    [0, 0.04, 9.96, 59.99, 60, 72.4, 600, -1, Number.NaN, Number.POSITIVE_INFINITY].map(n => [n] as [number]))

  manifest('videoTrim', webVideoTrim, coreVideoTrim)
})

test('videoFraming: orientation and the per-surface auto rules', () => {
  const dims: Array<[number | null | undefined, number | null | undefined]> = [
    [1920, 1080], [1080, 1920], [1000, 1000], [1180, 1000], [900, 1000], [1000, 900],
    [0, 100], [100, 0], [-1, 100], [undefined, undefined], [null, 1080], [1920, null],
  ]
  same('videoFraming.detectOrientation', webVideoFraming.detectOrientation, coreVideoFraming.detectOrientation, dims)

  const overrides: Array<webVideoFraming.VideoFramingOverride | null | undefined> = [
    undefined, null, {},
    { fit: 'contain' }, { fit: 'cover' }, { fit: null },
    { positionX: 0 }, { positionX: 120 }, { positionX: -20 }, { positionY: 10 },
    { zoom: 40 }, { zoom: 150 }, { zoom: 500 }, { zoom: Number.NaN },
    { fit: 'contain', positionX: 25, positionY: 75, zoom: 200 },
  ]
  same('videoFraming.resolveFraming', webVideoFraming.resolveFraming, coreVideoFraming.resolveFraming,
    dims.flatMap(([w, h]) => overrides.flatMap(o =>
      (['form', 'live', 'preview'] as const).map(s =>
        [{ videoWidth: w, videoHeight: h, videoFraming: o }, s] as [webVideoFraming.VideoFramingInput, webVideoFraming.VideoSurface]))))

  manifest('videoFraming', webVideoFraming, coreVideoFraming)
})

// ───────────────────────────────────────────────────────────────────────────
// 12. Every copy names the file it was copied from
// ───────────────────────────────────────────────────────────────────────────

test('each copy declares its web source, and that source exists', () => {
  // The re-copy procedure (expo/README.md) is `cp <source> <copy>`, so the
  // source path has to be in the copy and has to still be right. A renamed or
  // deleted web module fails here rather than quietly becoming a fork.
  const REPO = path.join(__dirname, '../../../..')
  const COPIES = [
    'workoutUtils.ts',
    'workout/tracking.ts',
    'workout/durationUnit.ts',
    'workout/equipmentVariant.ts',
    'workout/dumbbellWeight.ts',
    'workout/buildAsYouGo.ts',
    'workout/position.ts',
    'quickSession/naming.ts',
    'quickSession/log.ts',
    'streaks/pillars.ts',
    'streaks/tile.ts',
    'dashboard/goalTile.ts',
    'dashboardLayout/types.ts',
    'dashboardLayout/defaults.ts',
    'videoTrim.ts',
    'videoFraming.ts',
  ]
  for (const rel of COPIES) {
    const copyPath = path.join(REPO, 'shared/core/src/training', rel)
    assert.ok(fs.existsSync(copyPath), `${rel}: the copy is missing from shared/core/src/training/`)
    const head = fs.readFileSync(copyPath, 'utf8').slice(0, 2000)
    const declared = /^\/\/ Source: (\S+)$/m.exec(head)?.[1]
    assert.equal(declared, `webapp/lib/${rel}`,
      `shared/core/src/training/${rel} must declare "// Source: webapp/lib/${rel}" in its header`)
    assert.ok(fs.existsSync(path.join(REPO, declared)), `${declared} no longer exists — the copy has become a fork`)
    assert.match(head, /A COPY\. DO NOT EDIT THIS FILE\./,
      `shared/core/src/training/${rel} lost its "do not edit" header`)
  }
})

// ───────────────────────────────────────────────────────────────────────────
// 13. Does this test actually bite?
// ───────────────────────────────────────────────────────────────────────────

test('the comparator catches a copy that answers differently', () => {
  // A copy with ONE wrong answer, in the branch nobody would notice: the
  // tracking alias that a resumed session arrives as.
  const mutant = ((value?: string | null) =>
    value === 'reps' ? 'reps_only' : webTracking.normalizeTracking(value)) as typeof webTracking.normalizeTracking
  assert.throws(
    () => compare('mutant.normalizeTracking', webTracking.normalizeTracking, mutant, [['reps']]),
    /DRIFT in mutant\.normalizeTracking/,
  )

  // A copy with a changed CONSTANT, which no function call would reveal.
  assert.throws(
    () => manifest('mutant', { STREAK_VISIBLE_MIN: 3 }, { STREAK_VISIBLE_MIN: 2 }),
    /mutant\.STREAK_VISIBLE_MIN: the copied constant differs/,
  )

  // A copy that grew (or lost) an export.
  assert.throws(
    () => manifest('mutant', { a: 1, b: 2 }, { a: 1 }),
    /the copy's exports do not match/,
  )

  // A web export that no fixture drives.
  assert.throws(
    () => manifest('mutant', { untested: () => 1 }, { untested: () => 1 }),
    /mutant\.untested is exported but no fixture compares it/,
  )
})

test('the table is not hollow', () => {
  // A floor, so the table cannot be gutted into a green no-op. The real
  // coverage guarantee is `manifest`'s per-export check above.
  assert.ok(comparisons > 1800, `only ${comparisons} comparisons ran — the fixture table has shrunk`)
  assert.ok(covered.size >= 70, `only ${covered.size} exports were compared`)
})
