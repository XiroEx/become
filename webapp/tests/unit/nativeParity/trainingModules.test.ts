// Run with: npm run test:file tests/unit/nativeParity/trainingModules.test.ts
//
// LOCKSTEP DRIFT TEST: WEBAPP <-> EXPO SHARED TRAINING MODULES (NP-017 / NP-058)
//
// Pure domain modules are vendored into expo/lib/shared/training/ so React Native
// shares identical training, streak, and dashboard calculations with the web.
// This test imports BOTH the web source (webapp/lib/...) and the Expo copy
// (expo/lib/shared/training/...) and runs each pair through comprehensive fixture
// tables to guarantee 1:1 behavioral parity.
//
// A divergence here blocks webapp CI until the native copy is re-synchronized.

import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

// ── Web Sources ──────────────────────────────────────────────────────────────
import * as webWorkoutUtils from '../../../lib/workoutUtils'
import * as webTracking from '../../../lib/workout/tracking'
import * as webDurationUnit from '../../../lib/workout/durationUnit'
import * as webEquipmentVariant from '../../../lib/workout/equipmentVariant'
import * as webDumbbellWeight from '../../../lib/workout/dumbbellWeight'
import * as webBuildAsYouGo from '../../../lib/workout/buildAsYouGo'
import * as webPosition from '../../../lib/workout/position'
import * as webNaming from '../../../lib/quickSession/naming'
import * as webLog from '../../../lib/quickSession/log'
import * as webTile from '../../../lib/streaks/tile'
import * as webPillars from '../../../lib/streaks/pillars'
import * as webGoalTile from '../../../lib/dashboard/goalTile'
import * as webDashboardLayoutTypes from '../../../lib/dashboardLayout/types'
import * as webDashboardLayoutDefaults from '../../../lib/dashboardLayout/defaults'
import * as webVideoTrim from '../../../lib/videoTrim'
import * as webVideoFraming from '../../../lib/videoFraming'

// ── Expo Copies ──────────────────────────────────────────────────────────────
import * as nativeWorkoutUtils from '../../../../expo/lib/shared/training/workoutUtils'
import * as nativeTracking from '../../../../expo/lib/shared/training/tracking'
import * as nativeDurationUnit from '../../../../expo/lib/shared/training/durationUnit'
import * as nativeEquipmentVariant from '../../../../expo/lib/shared/training/equipmentVariant'
import * as nativeDumbbellWeight from '../../../../expo/lib/shared/training/dumbbellWeight'
import * as nativeBuildAsYouGo from '../../../../expo/lib/shared/training/buildAsYouGo'
import * as nativePosition from '../../../../expo/lib/shared/training/position'
import * as nativeNaming from '../../../../expo/lib/shared/training/naming'
import * as nativeLog from '../../../../expo/lib/shared/training/log'
import * as nativeTile from '../../../../expo/lib/shared/training/tile'
import * as nativePillars from '../../../../expo/lib/shared/training/pillars'
import * as nativeGoalTile from '../../../../expo/lib/shared/training/goalTile'
import * as nativeDashboardLayoutTypes from '../../../../expo/lib/shared/training/dashboardLayout/types'
import * as nativeDashboardLayoutDefaults from '../../../../expo/lib/shared/training/dashboardLayout/defaults'
import * as nativeVideoTrim from '../../../../expo/lib/shared/training/videoTrim'
import * as nativeVideoFraming from '../../../../expo/lib/shared/training/videoFraming'

describe('Native Parity — Training & Dashboard Modules Lockstep', () => {

  // ── 1. workoutUtils ────────────────────────────────────────────────────────
  describe('workoutUtils parity (buildWorkoutFlow, groupExercises)', () => {
    const fixtures: webWorkoutUtils.WorkoutExercise[][] = [
      [],
      [
        { name: 'Push-up', sets: 3 },
        { name: 'Pull-up', sets: 4 },
      ],
      [
        { name: 'Squat', sets: 3, groupId: 'ss1', groupType: 'superset', groupRounds: 3 },
        { name: 'Calf Raise', sets: 3, groupId: 'ss1', groupType: 'superset', groupRounds: 3 },
      ],
      [
        { name: 'Bench Press', sets: 4, groupId: 'c1', groupType: 'circuit', groupRounds: 4 },
        { name: 'DB Fly', sets: 3, groupId: 'c1', groupType: 'circuit', groupRounds: 4 },
        { name: 'Pushdown', sets: 2, groupId: 'c1', groupType: 'circuit', groupRounds: 4 },
      ],
      [
        { name: 'Warmup Jog', sets: 1 },
        { name: 'Clean', sets: 3, groupId: 'complex', groupType: 'superset', groupRounds: 3 },
        { name: 'Press', sets: 3, groupId: 'complex', groupType: 'superset', groupRounds: 3 },
        { name: 'Cooldown Stretch', sets: 2 },
      ],
      [
        { name: 'Isolated Group', sets: 3, groupId: 'single', groupType: 'superset' },
      ],
    ]

    it('groupExercises matches across all exercise grouping topologies', () => {
      for (const exercises of fixtures) {
        const webGroups = webWorkoutUtils.groupExercises(exercises)
        const nativeGroups = nativeWorkoutUtils.groupExercises(exercises)
        assert.deepEqual(nativeGroups, webGroups)
      }
    })

    it('buildWorkoutFlow matches across sequential, superset, and circuit flows', () => {
      for (const exercises of fixtures) {
        const webFlow = webWorkoutUtils.buildWorkoutFlow(exercises)
        const nativeFlow = nativeWorkoutUtils.buildWorkoutFlow(exercises)
        assert.deepEqual(nativeFlow, webFlow)
      }
    })
  })

  // ── 2. tracking ────────────────────────────────────────────────────────────
  describe('tracking parity (normalizeTracking, dimensions, unit labels)', () => {
    const rawTrackingTypes: Array<string | null | undefined> = [
      undefined,
      null,
      '',
      '   ',
      'reps_weight',
      'reps_bodyweight',
      'reps_only',
      'time',
      'time_distance',
      'intervals',
      'none',
      'reps',
      'weight',
      'weights',
      'repsweight',
      'reps-weight',
      'bodyweight',
      'reps_body',
      'duration',
      'timed',
      'seconds',
      'distance',
      'interval',
      'cardio',
      '  TIME_DISTANCE  ',
      'WEIGHT_REPS',
      'arbitrary_unknown_type',
    ]

    it('normalizeTracking matches for every canonical type, alias, and edge case', () => {
      for (const input of rawTrackingTypes) {
        const webNormalized = webTracking.normalizeTracking(input)
        const nativeNormalized = nativeTracking.normalizeTracking(input)
        assert.equal(nativeNormalized, webNormalized, `Mismatch on input: ${input}`)
      }
    })

    it('tracksWeight, tracksTime, tracksSpeed, categoryForTracking match across types', () => {
      for (const input of rawTrackingTypes) {
        assert.equal(nativeTracking.tracksWeight(input), webTracking.tracksWeight(input))
        assert.equal(nativeTracking.tracksTime(input), webTracking.tracksTime(input))
        assert.equal(nativeTracking.tracksSpeed(input), webTracking.tracksSpeed(input))
        assert.equal(nativeTracking.categoryForTracking(input), webTracking.categoryForTracking(input))
      }
    })

    it('setUnitLabel matches for singular and plural counts across types', () => {
      for (const input of rawTrackingTypes) {
        for (const count of [0, 1, 2, 5]) {
          assert.equal(nativeTracking.setUnitLabel(input, count), webTracking.setUnitLabel(input, count))
        }
      }
    })

    it('isSetFilled checks match on completed, rep, and weight presence', () => {
      const sets: webTracking.TypedSet[] = [
        { completed: false },
        { completed: true },
        { reps: '10', weight: '135' },
        { duration: '60' },
        { reps: '0' },
        { weight: '0' },
      ]
      for (const t of rawTrackingTypes) {
        for (const s of sets) {
          assert.equal(nativeTracking.isSetFilled(t, s), webTracking.isSetFilled(t, s))
        }
      }
    })
  })

  // ── 3. durationUnit ────────────────────────────────────────────────────────
  describe('durationUnit parity (sec/min conversion, default unit, floors)', () => {
    it('defaultDurationUnit matches across tracking inputs', () => {
      const inputs = [null, undefined, '', 'time_distance', 'distance', 'time', 'intervals', 'reps_weight']
      for (const inp of inputs) {
        assert.equal(nativeDurationUnit.defaultDurationUnit(inp), webDurationUnit.defaultDurationUnit(inp))
      }
    })

    it('secondsToUnitDisplay matches across units and value formats', () => {
      const values = ['', null, undefined, 0, 30, 60, 90, 900, 125.5, '45', '75.2', 'invalid']
      const units: Array<'sec' | 'min'> = ['sec', 'min']
      for (const unit of units) {
        for (const val of values) {
          assert.equal(
            nativeDurationUnit.secondsToUnitDisplay(val as any, unit),
            webDurationUnit.secondsToUnitDisplay(val as any, unit),
            `Mismatch for val: ${val}, unit: ${unit}`
          )
        }
      }
    })

    it('unitDisplayToSeconds matches conversion back to stored seconds', () => {
      const inputs = ['', '   ', '0', '15', '1.5', '0.5', '60', '90.25', 'invalid']
      const units: Array<'sec' | 'min'> = ['sec', 'min']
      for (const unit of units) {
        for (const val of inputs) {
          assert.equal(
            nativeDurationUnit.unitDisplayToSeconds(val, unit),
            webDurationUnit.unitDisplayToSeconds(val, unit),
            `Mismatch for val: ${val}, unit: ${unit}`
          )
        }
      }
    })

    it('isFloorsExercise identifies stair machines by regex', () => {
      const names = [
        'Stairmaster',
        'Stair Climber',
        'Stairs - 10 floors',
        'Treadmill Walk',
        'Stationary Bike',
        '',
        null,
        undefined,
      ]
      for (const name of names) {
        assert.equal(nativeDurationUnit.isFloorsExercise(name), webDurationUnit.isFloorsExercise(name))
      }
    })
  })

  // ── 4. dumbbellWeight & equipmentVariant ────────────────────────────────────
  describe('dumbbellWeight & equipmentVariant parity', () => {
    const exercises: Array<{
      name?: string
      aliases?: string[]
      equipment?: string[]
      laterality?: string
      movementPatterns?: string[]
    } | null | undefined> = [
      null,
      undefined,
      {},
      { name: 'Dumbbell Bench Press', equipment: ['dumbbell'] },
      { name: 'DB Incline Fly', equipment: ['dumbbell', 'bench'] },
      { name: 'Barbell Bench Press', equipment: ['barbell', 'bench'] },
      // 9/9 alias fix: Barbell Bench Press aliased with DB/bar must not be classified as dumbbell
      { name: 'Barbell Bench Press', aliases: ['Bench Press (DB/bar)'], equipment: ['barbell', 'squat_rack'] },
      { name: 'Cable Woodchopper', aliases: ['DB Woodchoppers'], equipment: ['cable'] },
      { name: 'Push-up', equipment: ['bodyweight'] },
      { name: 'Leg Press', equipment: ['machine'] },
      { name: 'Double KB Front Squat', equipment: ['kettlebell'] },
      { name: 'KB Swing', equipment: ['kettlebell'] },
      { name: 'Goblet Squat', equipment: ['kettlebell'] },
      { name: 'Goblet Squat', equipment: ['dumbbell'] },
      { name: 'Single-Arm DB Row', equipment: ['dumbbell'], laterality: 'unilateral' },
      { name: 'Alternating DB Curl', equipment: ['dumbbell'], laterality: 'alternating' },
      { name: 'Farmer Carry', equipment: ['dumbbell'], movementPatterns: ['carry'] },
      // Name fallback when equipment is missing
      { name: 'DB Row' },
      { name: 'Kettlebell Snatch' },
      { name: 'Cable Tricep Pushdown' },
    ]

    it('getBellWeightInfo matches style and showTotal for every exercise case', () => {
      for (const ex of exercises) {
        const webInfo = webDumbbellWeight.getBellWeightInfo(ex)
        const nativeInfo = nativeDumbbellWeight.getBellWeightInfo(ex)
        assert.deepEqual(nativeInfo, webInfo, `Mismatch for exercise: ${JSON.stringify(ex)}`)
      }
    })

    it('bellWeightLabel and weightQuickPicks match across all bell styles', () => {
      const styles: Array<webDumbbellWeight.BellStyle> = ['dumbbell', 'kettlebell', null]
      for (const s of styles) {
        assert.equal(nativeDumbbellWeight.bellWeightLabel(s), webDumbbellWeight.bellWeightLabel(s))
        assert.deepEqual(nativeDumbbellWeight.weightQuickPicks(s), webDumbbellWeight.weightQuickPicks(s))
      }
    })

    it('equipmentVariant helpers match across equipment arrays', () => {
      const equipmentLists = [
        ['dumbbell'],
        ['kettlebell'],
        ['barbell'],
        ['cable'],
        ['machine'],
        ['bodyweight'],
        ['bench', 'squat_rack'],
        ['dumbbell', 'bench'],
        [],
        null,
        undefined,
      ]
      for (const eq of equipmentLists) {
        assert.equal(nativeEquipmentVariant.loadStyleOf(eq), webEquipmentVariant.loadStyleOf(eq))
        assert.equal(nativeEquipmentVariant.implementLabel(eq), webEquipmentVariant.implementLabel(eq))
      }

      for (const ex of exercises) {
        assert.deepEqual(
          nativeEquipmentVariant.equipmentAssumption(ex),
          webEquipmentVariant.equipmentAssumption(ex)
        )
      }
    })
  })

  // ── 5. buildAsYouGo ────────────────────────────────────────────────────────
  describe('buildAsYouGo parity (grouping, reordering, ad-hoc exercises)', () => {
    const baseExercises: webWorkoutUtils.WorkoutExercise[] = [
      { name: 'Squat', sets: 3 },
      { name: 'Lunge', sets: 3 },
      { name: 'Leg Extension', sets: 3 },
      { name: 'Leg Curl', sets: 3 },
    ]

    it('groupLabelFor and naturalKindFor match for various group sizes', () => {
      for (const size of [1, 2, 3, 4, 5]) {
        assert.equal(nativeBuildAsYouGo.naturalKindFor(size), webBuildAsYouGo.naturalKindFor(size))
        for (const kind of webBuildAsYouGo.GROUP_KINDS) {
          assert.equal(nativeBuildAsYouGo.groupLabelFor(kind, size), webBuildAsYouGo.groupLabelFor(kind, size))
        }
      }
    })

    it('needsMoreExercises and canRemoveExercise match', () => {
      for (const count of [0, 1, 2, 3, 4, 5, 8]) {
        assert.equal(nativeBuildAsYouGo.needsMoreExercises(count), webBuildAsYouGo.needsMoreExercises(count))
      }
      assert.equal(nativeBuildAsYouGo.canRemoveExercise(baseExercises), webBuildAsYouGo.canRemoveExercise(baseExercises))
      assert.equal(nativeBuildAsYouGo.canRemoveExercise([baseExercises[0]]), webBuildAsYouGo.canRemoveExercise([baseExercises[0]]))
    })

    it('moveExercise returns identical new order and mapping', () => {
      const webRes = webBuildAsYouGo.moveExercise(baseExercises, 0, 3)
      const nativeRes = nativeBuildAsYouGo.moveExercise(baseExercises, 0, 3)
      assert.deepEqual(nativeRes.order, webRes.order)
      assert.deepEqual(
        nativeRes.exercises.map(e => e.name),
        webRes.exercises.map(e => e.name)
      )
    })

    it('appendExercise and removeExercise match mutation results', () => {
      const adHoc: webBuildAsYouGo.AdHocExercise = { name: 'Calf Raise', sets: 3 }
      const webAdded = webBuildAsYouGo.appendExercise(baseExercises, adHoc)
      const nativeAdded = nativeBuildAsYouGo.appendExercise(baseExercises, adHoc)
      assert.deepEqual(nativeAdded.order, webAdded.order)
      assert.equal(nativeAdded.index, webAdded.index)

      const webRemoved = webBuildAsYouGo.removeExercise(webAdded.exercises, 1)
      const nativeRemoved = nativeBuildAsYouGo.removeExercise(nativeAdded.exercises, 1)
      assert.deepEqual(nativeRemoved.order, webRemoved.order)
    })
  })

  // ── 6. position ────────────────────────────────────────────────────────────
  describe('position parity (resolveStartStep, scope, age limits)', () => {
    const flow = [
      { exerciseIndex: 0, setIndex: 0 },
      { exerciseIndex: 0, setIndex: 1 },
      { exerciseIndex: 1, setIndex: 0 },
      { exerciseIndex: 1, setIndex: 1 },
    ]

    it('resolveStartStep prioritizes remembered step when valid', () => {
      const data = [[{ completed: true }, { completed: false }], [{ completed: false }, { completed: false }]]
      const saved = { exerciseIndex: 1, setIndex: 1, at: Date.now() }

      assert.equal(
        nativePosition.resolveStartStep(flow, data, saved),
        webPosition.resolveStartStep(flow, data, saved)
      )
    })

    it('resolveStartStep falls back to first incomplete set when saved is missing/stale', () => {
      const data = [[{ completed: true }, { completed: false }], [{ completed: false }, { completed: false }]]
      assert.equal(
        nativePosition.resolveStartStep(flow, data, null),
        webPosition.resolveStartStep(flow, data, null)
      )
    })

    it('scope helpers and max age constant match', () => {
      assert.equal(nativePosition.quickScope('session-1'), webPosition.quickScope('session-1'))
      assert.equal(nativePosition.programScope('p-1', 'day-3'), webPosition.programScope('p-1', 'day-3'))
      assert.equal(nativePosition.POSITION_MAX_AGE_MS, webPosition.POSITION_MAX_AGE_MS)
    })
  })

  // ── 7. naming & log ────────────────────────────────────────────────────────
  describe('naming & log parity', () => {
    it('isDefaultQuickSessionName matches across inputs', () => {
      const inputs = ['', '   ', 'Quick Session', 'quick session', 'workout now', 'Workout Now', 'Legs', null, undefined]
      for (const inp of inputs) {
        assert.equal(nativeNaming.isDefaultQuickSessionName(inp), webNaming.isDefaultQuickSessionName(inp))
      }
    })

    it('shouldPromptForQuickSessionName matches for new drafts vs history repeats', () => {
      const cases = [
        null,
        undefined,
        { title: 'Quick Session', sourceSessionId: 'prior-1' },
        { title: 'Quick Session', sourceSessionId: null, needsName: true },
        { title: 'Quick Session', sourceSessionId: null, needsName: false },
        { title: 'Upper Body', sourceSessionId: null },
      ]
      for (const c of cases) {
        assert.equal(
          nativeNaming.shouldPromptForQuickSessionName(c as any),
          webNaming.shouldPromptForQuickSessionName(c as any)
        )
      }
    })

    it('fallbackQuickSessionName formats local date strings without UTC day shift', () => {
      const fixedDate = new Date(2026, 8, 30) // Sep 30 2026
      assert.equal(
        nativeNaming.fallbackQuickSessionName('2026-09-09', fixedDate),
        webNaming.fallbackQuickSessionName('2026-09-09', fixedDate)
      )
      assert.equal(
        nativeNaming.fallbackQuickSessionName(null, fixedDate),
        webNaming.fallbackQuickSessionName(null, fixedDate)
      )
    })

    it('buildLoggedExercises maps draft exercises to log entries identically', () => {
      const drafts = [
        { name: 'Push-up', sets: 3, reps: '10' },
        { name: 'Plank', sets: 2, duration: '45 sec', trackingType: 'time' },
      ]
      for (const done of [true, false]) {
        assert.deepEqual(
          nativeLog.buildLoggedExercises(drafts, done),
          webLog.buildLoggedExercises(drafts, done)
        )
      }
    })
  })

  // ── 8. streaks (tile & pillars) ────────────────────────────────────────────
  describe('streaks parity (tile.ts & pillars.ts)', () => {
    const mockStreaks: webTile.StreaksLite = {
      overall: { current: 5, best: 10, nextMilestone: 7, activeToday: true, freezes: 1 },
      pillars: {
        workout: { unit: 'days', current: 2, best: 5, thisWeek: 2, target: 4, remainingThisWeek: 2, weekLost: false },
        nutrition: { current: 4, best: 4, activeToday: true },
        mindset: { current: 0, best: 3, activeToday: false },
        super: {
          current: 0,
          best: 4,
          activeToday: false,
          today: { nutrition: true, mindset: false, trained: true, restDay: false, weekOnTrack: true },
        },
      },
    }

    it('STREAK_VISIBLE_MIN and streakDisplay match', () => {
      assert.equal(nativePillars.STREAK_VISIBLE_MIN, webPillars.STREAK_VISIBLE_MIN)
      for (const n of [0, 1, 2, 3, 5]) {
        assert.deepEqual(nativePillars.streakDisplay(n), webPillars.streakDisplay(n))
      }
    })

    it('streakPages generates identical cards for streaks above and below visible threshold', () => {
      const webPages = webTile.streakPages(mockStreaks)
      const nativePages = nativeTile.streakPages(mockStreaks)
      assert.deepEqual(nativePages, webPages)

      // Null case
      assert.deepEqual(nativeTile.streakPages(null), webTile.streakPages(null))
    })

    it('superMissing and superAtRisk match across day hours', () => {
      assert.deepEqual(nativeTile.superMissing(mockStreaks), webTile.superMissing(mockStreaks))
      for (const hour of [9, 15, 16, 18, 21, 23]) {
        assert.deepEqual(nativeTile.superAtRisk(mockStreaks, hour), webTile.superAtRisk(mockStreaks, hour))
      }
    })

    it('date helpers in pillars (shiftDay, weekKeyOf, weekdayOf) match', () => {
      const keys = ['2026-09-01', '2026-09-30', '2026-10-01']
      for (const k of keys) {
        assert.equal(nativePillars.shiftDay(k, 1), webPillars.shiftDay(k, 1))
        assert.equal(nativePillars.shiftDay(k, -7), webPillars.shiftDay(k, -7))
        assert.equal(nativePillars.weekKeyOf(k), webPillars.weekKeyOf(k))
        assert.equal(nativePillars.weekdayOf(k), webPillars.weekdayOf(k))
      }
    })
  })

  // ── 9. goalTile ────────────────────────────────────────────────────────────
  describe('goalTile parity', () => {
    const tileInputs: webGoalTile.GoalTileInputs[] = [
      {
        fitnessGoal: 'lose_weight',
        nutritionDirection: 'lose',
        targetWeightKg: 80,
        startWeightKg: 90,
        latestWeight: 185,
        earliestWeight: 198,
        weightUnit: 'lbs',
      },
      {
        fitnessGoal: 'gain_muscle',
        targetWeightKg: 85,
        startWeightKg: 75,
        latestWeight: 82,
        weightUnit: 'kg',
      },
      {
        weightUnit: 'lbs',
        program: {
          name: 'Hypertrophy I',
          completedWorkouts: 8,
          totalWorkouts: 24,
          currentWeek: 2,
          totalWeeks: 6,
          programId: 'prog-1',
        },
      },
      {
        weightUnit: 'lbs',
      },
    ]

    it('describeGoal returns identical view descriptors for all goal states', () => {
      for (const inp of tileInputs) {
        const webView = webGoalTile.describeGoal(inp)
        const nativeView = nativeGoalTile.describeGoal(inp as any)
        assert.deepEqual(nativeView, webView, `Mismatch on goalTileInput: ${JSON.stringify(inp)}`)
      }
    })

    it('formatWeight, formatWeightDelta, and holdBand match', () => {
      for (const u of ['lbs', 'kg'] as const) {
        assert.equal(nativeGoalTile.formatWeight(150, u), webGoalTile.formatWeight(150, u))
        assert.equal(nativeGoalTile.formatWeightDelta(-3.2, u), webGoalTile.formatWeightDelta(-3.2, u))
        assert.equal(nativeGoalTile.holdBand(u), webGoalTile.holdBand(u))
      }
    })
  })

  // ── 10. dashboardLayout ────────────────────────────────────────────────────
  describe('dashboardLayout parity (constants, defaults, parser)', () => {
    it('constants and defaults match between web and native', () => {
      assert.equal(nativeDashboardLayoutTypes.MAX_DASHBOARD_TILES, webDashboardLayoutTypes.MAX_DASHBOARD_TILES)
      assert.equal(nativeDashboardLayoutTypes.MAX_SMART_POOL, webDashboardLayoutTypes.MAX_SMART_POOL)
      assert.equal(nativeDashboardLayoutTypes.DEFAULT_SMART_INTERVAL_MS, webDashboardLayoutTypes.DEFAULT_SMART_INTERVAL_MS)
      assert.deepEqual(nativeDashboardLayoutTypes.TILE_KINDS, webDashboardLayoutTypes.TILE_KINDS)
      assert.deepEqual(nativeDashboardLayoutTypes.TILE_SIZES, webDashboardLayoutTypes.TILE_SIZES)
      assert.deepEqual(nativeDashboardLayoutDefaults.defaultLayout(), webDashboardLayoutDefaults.defaultLayout())
      assert.deepEqual(nativeDashboardLayoutDefaults.richDefaultLayout(), webDashboardLayoutDefaults.richDefaultLayout())
      assert.deepEqual(nativeDashboardLayoutDefaults.STAT_TILE_IDS, webDashboardLayoutDefaults.STAT_TILE_IDS)
      assert.equal(nativeDashboardLayoutDefaults.SMART_ROTATING_TILE_ID, webDashboardLayoutDefaults.SMART_ROTATING_TILE_ID)
    })

    it('parseDashboardLayout produces identical results on valid and corrupt layouts', () => {
      const valid = webDashboardLayoutDefaults.defaultLayout()
      assert.deepEqual(
        nativeDashboardLayoutTypes.parseDashboardLayout(valid),
        webDashboardLayoutTypes.parseDashboardLayout(valid)
      )

      const invalidCases = [
        null,
        {},
        'not-an-array',
        [{ id: 'x', kind: 'invalid_kind', size: '2x2' }],
      ]
      for (const inv of invalidCases) {
        let webErr: unknown = null
        let nativeErr: unknown = null
        try { webDashboardLayoutTypes.parseDashboardLayout(inv) } catch (e) { webErr = e }
        try { nativeDashboardLayoutTypes.parseDashboardLayout(inv) } catch (e) { nativeErr = e }
        assert.equal(nativeErr instanceof Error, webErr instanceof Error)
      }
    })
  })

  // ── 11. videoTrim ──────────────────────────────────────────────────────────
  describe('videoTrim parity (resolveTrim, formatTimecode)', () => {
    const trimInputs = [
      { input: null, duration: 60 },
      { input: { videoTrim: null }, duration: 60 },
      { input: { videoTrim: { start: 5, end: 25 } }, duration: 60 },
      { input: { videoTrim: { start: 70, end: 80 } }, duration: 60 }, // start >= duration
      { input: { videoTrim: { start: 10, end: 90 } }, duration: 60 }, // end > duration
      { input: { videoTrim: { start: 10, end: 10.2 } }, duration: 60 }, // duration < MIN_TRIM
      { input: { videoTrim: { start: 0, end: 60 } }, duration: 60 }, // isFullLength
      { input: { videoTrim: { start: 5, end: 20 } }, duration: null }, // no duration yet
    ]

    it('resolveTrim calculates identical clamp, bounds, and isFullLength', () => {
      for (const t of trimInputs) {
        const webRes = webVideoTrim.resolveTrim(t.input, t.duration)
        const nativeRes = nativeVideoTrim.resolveTrim(t.input, t.duration)
        assert.deepEqual(nativeRes, webRes, `Mismatch on trim input: ${JSON.stringify(t)}`)
      }
    })

    it('formatTimecode matches across time ranges', () => {
      for (const sec of [0, 45, 72.4, 130.85, 3600, -10]) {
        assert.equal(nativeVideoTrim.formatTimecode(sec), webVideoTrim.formatTimecode(sec))
      }
    })
  })

  // ── 12. videoFraming ───────────────────────────────────────────────────────
  describe('videoFraming parity (resolveFraming)', () => {
    const framingInputs: Array<{
      input: webVideoFraming.VideoFramingInput
      surface: webVideoFraming.VideoSurface
    }> = [
      { input: { videoWidth: 1920, videoHeight: 1080 }, surface: 'live' },
      { input: { videoWidth: 1080, videoHeight: 1920 }, surface: 'live' },
      { input: { videoWidth: 1080, videoHeight: 1080 }, surface: 'live' },
      { input: { videoWidth: 1920, videoHeight: 1080 }, surface: 'form' },
      { input: { videoWidth: 1080, videoHeight: 1920 }, surface: 'preview' },
      {
        input: {
          videoWidth: 1920,
          videoHeight: 1080,
          videoFraming: { fit: 'contain', positionX: 30, positionY: 70, zoom: 1.25 },
        },
        surface: 'live',
      },
      { input: { videoWidth: null, videoHeight: null }, surface: 'live' },
    ]

    it('resolveFraming computes identical fit, position, zoom, and orientation', () => {
      for (const f of framingInputs) {
        const webRes = webVideoFraming.resolveFraming(f.input, f.surface)
        const nativeRes = nativeVideoFraming.resolveFraming(f.input, f.surface)
        assert.deepEqual(nativeRes, webRes, `Mismatch on framing input: ${JSON.stringify(f)}`)
      }
    })
  })

  // ── 13. Proofs that the lockstep comparator fails on drift ─────────────────
  describe('Parity assertion proofs (confirm test detects divergence)', () => {
    it('fails when flow step count or ordering diverges', () => {
      const exercises = [{ name: 'Squat', sets: 3 }]
      const webFlow = webWorkoutUtils.buildWorkoutFlow(exercises)
      const divergentFlow = [...webFlow, { exerciseIndex: 99, setIndex: 0, groupId: null, isFirstInRound: true, isLastInRound: true, roundNumber: 0 }]
      assert.throws(() => {
        assert.deepEqual(divergentFlow, webFlow)
      }, /AssertionError/)
    })

    it('fails when tracking alias resolution diverges', () => {
      const webNorm = webTracking.normalizeTracking('cardio')
      const fakeDivergent = 'time_distance' as any
      assert.throws(() => {
        assert.equal(fakeDivergent, webNorm)
      }, /AssertionError/)
    })

    it('fails when dumbbell classification diverges', () => {
      const webInfo = webDumbbellWeight.getBellWeightInfo({ name: 'Barbell Bench Press', equipment: ['barbell'] })
      const fakeDivergent = { style: 'dumbbell', showTotal: true }
      assert.throws(() => {
        assert.deepEqual(fakeDivergent, webInfo)
      }, /AssertionError/)
    })
  })
})
