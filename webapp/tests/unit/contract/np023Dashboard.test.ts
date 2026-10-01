// Run with: npm run test:file tests/unit/contract/np023Dashboard.test.ts
//
// THE DASHBOARD SURFACE, CHECKED AGAINST THE SHARED SCHEMAS (NP-023).
//
// Read tests/unit/contract/_contract.ts first — it explains why the schemas are
// imported by RELATIVE path, why "it parses" is not the whole check, and what a
// domain file has to end with.
//
// WHAT THIS FILE IS FOR
//
// The dashboard — the first screen a member sees — ran on ten route methods the
// shared client did not type at all: the tile layout, the rotator's picks, the
// tile-tap and dismissal writes, the program nudge, the goal read and write,
// and GET /api/progress, which feeds every stat tile and the current-program
// card. webapp/lib/dashboardLayout/types.ts even claimed to mirror
// `@become/api-client`'s `schemas/dashboard.ts`, a file that did not exist.
//
// So every route below is called for real — the exported handler, a signed
// token, the loopback test database — and parsed with the schema the native app
// reads it through.
//
// THE FIXTURE IS RICH ON PURPOSE. A field the fixture leaves empty is a field
// this file never checks: an absent `currentProgram` would have hidden the
// current-program card's whole shape, and an absent goal would have hidden
// `goal.pace` — which is an OBJECT, and was once typed as a number, and made
// this exact route fail to parse. So the member here has a program, a schedule,
// a completed session with real sets, a weight and mood history, a target
// weight and a weekly training target.
//
// ITS OWN FIXTURES, ALSO ON PURPOSE. The runner executes test FILES in
// parallel, so this file uses its own member (`@np023.contract.test`), its own
// program id and its own rows rather than the shared np015 ones.

import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import mongoose from 'mongoose'

// The routes. Every one of these is a real exported handler.
import {
  GET as layoutGET,
  PATCH as layoutPATCH,
} from '../../../app/api/dashboard/layout/route'
import { GET as tilesGET } from '../../../app/api/dashboard/tiles/route'
import { POST as tileTapPOST } from '../../../app/api/dashboard/tile-tap/route'
import { POST as dismissPOST } from '../../../app/api/suggestions/dismiss/route'
import {
  GET as nudgeGET,
  POST as nudgePOST,
} from '../../../app/api/program-nudge/route'
import { GET as goalsGET, PUT as goalsPUT } from '../../../app/api/goals/route'
import { GET as progressGET } from '../../../app/api/progress/route'

// The contract. RELATIVE imports of shared/api-client — see _contract.ts.
import {
  DashboardLayoutResponseSchema,
  DashboardLayoutPatchResponseSchema,
  DashboardTilesResponseSchema,
  DashboardTileTapResponseSchema,
  SuggestionDismissResponseSchema,
  ProgramNudgeResponseSchema,
  GoalProgressResponseSchema,
  ProgressApiResponseSchema,
  MAX_DASHBOARD_TILES,
  SMART_INTERVAL_OPTIONS_MS,
  SMART_ROTATING_TILE_ID,
} from '../../../../shared/api-client/src/schemas/dashboard'

// The assertion + coverage gate.
import {
  Coverage,
  assertContract,
  assertEveryRouteCovered,
  getJson,
  sendJson,
  type ContractMember,
  type ContractRoute,
} from './_contract'

import User from '../../../models/User'
import UserProgress from '../../../models/UserProgress'
import ProgramModel from '../../../models/Program'
import Schedule from '../../../models/Schedule'
import Goal from '../../../models/Goal'
import { signToken } from '../../../lib/auth'

// ---------------------------------------------------------------------------
// The manifest: every route NP-023's schemas describe.
// ---------------------------------------------------------------------------

const NP023_ROUTES: readonly ContractRoute[] = [
  // the tile layout — the persisted, cross-device source of truth
  { method: 'GET', path: '/api/dashboard/layout', schema: 'DashboardLayoutResponseSchema', note: 'at most 20 tiles; migrates from pinnedTiles on first read' },
  { method: 'PATCH', path: '/api/dashboard/layout', schema: 'DashboardLayoutPatchResponseSchema', note: '`layout` is the FULL new ordered list' },
  // what the tiles render
  { method: 'GET', path: '/api/dashboard/tiles', schema: 'DashboardTilesResponseSchema', note: 'rotator picks, metrics, suggestions, engagement' },
  { method: 'POST', path: '/api/dashboard/tile-tap', schema: 'DashboardTileTapResponseSchema', note: 'the smart tile’s adaptive signal' },
  { method: 'POST', path: '/api/suggestions/dismiss', schema: 'SuggestionDismissResponseSchema', note: 'idempotent: `wasUpdate` marks the replay' },
  // the "ready to start a program?" modal
  { method: 'GET', path: '/api/program-nudge', schema: 'ProgramNudgeResponseSchema', note: 'due, showings, dismissCount, dontShowAgain, hasServerState' },
  { method: 'POST', path: '/api/program-nudge', schema: 'ProgramNudgeResponseSchema', note: 'shown | dismiss | dismiss_forever | adopt' },
  // goals: the goal tile, the check-in’s goal line and the Becoming door
  { method: 'GET', path: '/api/goals', schema: 'GoalProgressResponseSchema', note: 'then → now → next, per pillar' },
  { method: 'PUT', path: '/api/goals', schema: 'GoalProgressResponseSchema', note: 'answers with the FRESH GET payload' },
  // the stat tiles and the current-program card
  { method: 'GET', path: '/api/progress', schema: 'ProgressApiResponseSchema', note: 'stats, moodData, weightData, goal (pace is an OBJECT) and currentProgram' },
]

// Deliberately NOT here: GET|PATCH /api/dashboard/pinned-tiles (the legacy
// alias /api/dashboard/layout supersedes, kept for one release) and
// GET /api/progress/prs (the progress page's own PR table, not a dashboard
// tile), and POST /api/progress (a legacy writer with no native caller).

const coverage = new Coverage()

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const MEMBER: ContractMember = {
  id: '6ab0230000000000000f7ee0',
  email: 'plus@np023.contract.test',
  label: 'plus',
  auth: '',
}

const PROGRAM_ID = 'np023-contract-dashboard'
const SQUAT_SLUG = 'np023-barbell-back-squat'
const START_DATE = new Date('2026-09-01T00:00:00.000Z')

/** Valid against models/Program.ts: phase, weeks and focus are all required. */
const PHASES = [
  {
    phase: 'Phase 1',
    weeks: '1-4',
    focus: 'Accumulation',
    workouts: [
      {
        day: 'Day 1',
        title: 'Lower A',
        exercises: [{ exerciseSlug: SQUAT_SLUG, name: 'Barbell Back Squat', sets: 4, reps: '5-8' }],
      },
      {
        day: 'Day 2',
        title: 'Upper A',
        exercises: [{ exerciseSlug: SQUAT_SLUG, sets: 3, reps: '8' }],
      },
    ],
  },
]

async function cleanFixtures(): Promise<void> {
  const uid = new mongoose.Types.ObjectId(MEMBER.id)
  await User.deleteMany({ $or: [{ _id: uid }, { email: MEMBER.email }] })
  await UserProgress.deleteMany({ userId: uid })
  await Schedule.deleteMany({ userId: uid })
  await Goal.deleteMany({ userId: uid })
  await ProgramModel.deleteMany({ program_id: PROGRAM_ID })
}

before(async () => {
  process.env.JWT_SECRET ||= 'become-unit-test-secret'
  // With the kill-switch off every gate answers "allowed" and the free/Plus
  // difference a response describes never appears.
  process.env.ENTITLEMENTS_ENFORCED = '1'

  await mongoose.connect(process.env.MONGODB_URI ?? 'mongodb://127.0.0.1:27017/become-test')
  await cleanFixtures()

  await User.create({
    _id: new mongoose.Types.ObjectId(MEMBER.id),
    email: MEMBER.email,
    // Legacy column, `required` on the model; magic-link members never use it.
    password: 'contract-test-unused',
    name: 'Contract Dashboard',
    tier: 'plus',
    profile: {
      fitnessGoal: 'lose_weight',
      nutritionDirection: 'lose',
      experienceLevel: 'intermediate',
      // A target weight AND a weekly target, so ensureGoals creates both
      // pillars and `goal.pace` on /api/progress is a real read rather than
      // null.
      targetWeightKg: 80,
      currentWeightKg: 85,
      weeklyAvailability: 4,
      weightUnit: 'kg',
    },
    onboardingCompleted: true,
  })
  MEMBER.auth = `Bearer ${await signToken({ userId: MEMBER.id, email: MEMBER.email })}`

  // The program the enrolment points at. Seeded the way the other contract
  // files do it (see np019Programs.test.ts): `target_user` is an enum and
  // every phase needs `phase`, `weeks` and `focus`, so a fixture missing them
  // fails validation in `before()` and takes every test in the file with it.
  await ProgramModel.create({
    program_id: PROGRAM_ID,
    name: 'NP023 Contract Dashboard',
    description: 'A two-day fixture program.',
    duration_weeks: 4,
    training_days_per_week: 2,
    goal: 'Lose fat',
    target_user: 'Intermediate',
    equipment: ['barbell'],
    tags: ['np023'],
    phases: PHASES,
  })

  await UserProgress.create({
    userId: new mongoose.Types.ObjectId(MEMBER.id),
    height: 70,
    streakDays: 5,
    longestStreak: 12,
    totalWorkouts: 9,
    // A customized layout: four stat squares and the wide smart tile, with both
    // settings the smart tile can carry.
    dashboardLayout: [
      { id: 'streak', kind: 'stat', size: '1x1' },
      { id: 'mood', kind: 'stat', size: '1x1' },
      { id: 'weekly', kind: 'stat', size: '1x1' },
      { id: 'weight', kind: 'stat', size: '2x1' },
      {
        id: SMART_ROTATING_TILE_ID,
        kind: 'smart-rotating',
        size: '2x1',
        locked: null,
        settings: {
          pool: ['stat:streak', 'stat:mood', 'stat:calories'],
          intervalMs: SMART_INTERVAL_OPTIONS_MS[1],
        },
      },
    ],
    tileEngagement: [{ key: 'stat:streak', taps: 3, lastTapAt: new Date('2026-09-28T09:00:00.000Z') }],
    weightHistory: [
      { date: new Date('2026-09-01T00:00:00.000Z'), weight: 86, unit: 'kg' },
      { date: new Date('2026-09-28T00:00:00.000Z'), weight: 84.2, unit: 'kg', bodyFat: 18.4 },
    ],
    moodHistory: [
      { date: new Date('2026-09-29T00:00:00.000Z'), mood: 4 },
      { date: new Date('2026-09-30T00:00:00.000Z'), mood: 5 },
    ],
    workoutLogs: [
      {
        date: new Date('2026-09-28T18:00:00.000Z'),
        programId: PROGRAM_ID,
        phase: 1,
        day: 'Day 1',
        kind: 'program',
        title: 'Lower A',
        sessionId: 'np023-session-1',
        completed: true,
        duration: 48,
        notes: 'Felt strong.',
        exercises: [
          {
            name: 'Barbell Back Squat',
            exerciseSlug: SQUAT_SLUG,
            sets: [
              { setNumber: 1, reps: 5, weight: 100, completed: true },
              { setNumber: 2, reps: 3, weight: 120, completed: true },
            ],
          },
        ],
      },
    ],
    // A persisted PR, so `?detailed=1`'s `pbs` and the training goal's
    // baseline/lift rows are real rather than empty.
    exercisePRs: [
      {
        exerciseSlug: SQUAT_SLUG,
        exerciseName: 'Barbell Back Squat',
        maxWeight: { weight: 120, reps: 3, e1rm: 132, date: new Date('2026-09-28T18:00:00.000Z') },
        maxReps: { weight: 100, reps: 5, e1rm: 117, date: new Date('2026-09-28T18:00:00.000Z') },
        maxE1RM: { weight: 120, reps: 3, e1rm: 132, date: new Date('2026-09-28T18:00:00.000Z') },
      },
    ],
    // The enrolment the current-program card is built from. `status` must be
    // one the route recognizes ('in-progress' / 'active'), or `currentProgram`
    // comes back null and the card's whole shape goes unchecked.
    activePrograms: [
      {
        programId: PROGRAM_ID,
        programName: 'NP023 Contract Dashboard',
        startDate: START_DATE,
        currentPhase: 1,
        currentDay: 'Day 2',
        completedWorkouts: 1,
        totalWorkouts: 8,
        lastWorkoutDate: new Date('2026-09-28T18:00:00.000Z'),
        status: 'in-progress',
        hasSchedule: true,
      },
    ],
    // Seen once, never dismissed: `hasServerState` true and the opt-out not yet
    // offered, which is the state the modal actually gates on.
    programNudge: {
      dismissCount: 0,
      shownCount: 1,
      lastShownAt: new Date('2026-09-29T08:00:00.000Z'),
      dontShowAgain: false,
    },
  })

  // A schedule, so the current-program card's week and session counts are
  // derived from real sessions rather than the coarse fallback.
  await Schedule.create({
    userId: new mongoose.Types.ObjectId(MEMBER.id),
    programId: PROGRAM_ID,
    programName: 'NP023 Contract Dashboard',
    settings: { trainingDays: [1, 3], startDate: START_DATE },
    scheduledWorkouts: [
      { date: new Date('2026-09-28T00:00:00.000Z'), programId: PROGRAM_ID, phase: 1, dayLabel: 'Day 1', workoutTitle: 'Lower A', status: 'completed' },
      { date: new Date(Date.now() + 86_400_000), programId: PROGRAM_ID, phase: 1, dayLabel: 'Day 2', workoutTitle: 'Upper A', status: 'scheduled' },
      { date: new Date(Date.now() + 7 * 86_400_000), programId: PROGRAM_ID, phase: 1, dayLabel: 'Day 1', workoutTitle: 'Lower A', status: 'scheduled' },
    ],
  })
})

after(async () => {
  await cleanFixtures()
  await mongoose.disconnect()
})

// ═══════════════════════════════════════════════════════════════════════════
// The tile layout
// ═══════════════════════════════════════════════════════════════════════════

test('GET /api/dashboard/layout matches DashboardLayoutResponseSchema, settings and all', async () => {
  const { status, body } = await getJson(layoutGET, '/api/dashboard/layout', MEMBER)
  coverage.mark('GET', '/api/dashboard/layout')

  assert.equal(status, 200, JSON.stringify(body))
  assertContract({
    label: 'GET /api/dashboard/layout',
    schema: DashboardLayoutResponseSchema,
    body,
    expectKeys: [
      'layout',
      'layout.0.id',
      'layout.0.kind',
      'layout.0.size',
      // The smart tile is the only one that carries settings, and the pool +
      // interval are what the customizer round-trips. `locked` is NOT expected
      // here: the route omits it when it is null (see below).
      'layout.4.settings',
      'layout.4.settings.pool',
      'layout.4.settings.intervalMs',
    ],
  })

  const parsed = DashboardLayoutResponseSchema.parse(body)
  assert.ok(parsed.layout.length <= MAX_DASHBOARD_TILES)
  assert.equal(parsed.layout[0]?.kind, 'stat')
  assert.equal(parsed.layout[3]?.size, '2x1')

  const smart = parsed.layout[4]
  assert.equal(smart?.id, SMART_ROTATING_TILE_ID)
  assert.equal(smart?.kind, 'smart-rotating')
  // A stored `locked: null` is OMITTED on the wire, not sent as null — which is
  // why the shared schema has it `.nullable().optional()` and why a client must
  // read "absent or null" as "this tile rotates".
  assert.equal(smart?.locked, undefined)
  assert.equal(smart?.settings?.intervalMs, SMART_INTERVAL_OPTIONS_MS[1])
  assert.deepEqual(smart?.settings?.pool, ['stat:streak', 'stat:mood', 'stat:calories'])
})

test('PATCH /api/dashboard/layout echoes the layout it stored, and refuses more than 20 tiles', async () => {
  const layout = [
    { id: 'streak', kind: 'stat', size: '1x1' },
    { id: 'mood', kind: 'stat', size: '1x1' },
    { id: SMART_ROTATING_TILE_ID, kind: 'smart-rotating', size: '2x1', locked: 'stat:streak' },
  ]
  const { status, body } = await sendJson(
    layoutPATCH,
    'PATCH',
    '/api/dashboard/layout',
    MEMBER,
    { layout },
  )
  coverage.mark('PATCH', '/api/dashboard/layout')

  assert.equal(status, 200, JSON.stringify(body))
  assertContract({
    label: 'PATCH /api/dashboard/layout',
    schema: DashboardLayoutPatchResponseSchema,
    body,
    expectKeys: ['success', 'layout', 'layout.2.locked'],
  })
  const parsed = DashboardLayoutPatchResponseSchema.parse(body)
  assert.equal(parsed.success, true)
  assert.equal(parsed.layout[2]?.locked, 'stat:streak')

  // The 20-tile limit is the server's, and the shared schema carries the same
  // number: a client that sends 21 gets a 400, not a truncated layout.
  const tooMany = await sendJson(layoutPATCH, 'PATCH', '/api/dashboard/layout', MEMBER, {
    layout: Array.from({ length: MAX_DASHBOARD_TILES + 1 }, (_, i) => ({
      id: `np023-${i}`,
      kind: 'stat',
      size: '1x1',
    })),
  })
  assert.equal(tooMany.status, 400, JSON.stringify(tooMany.body))

  // Put the rich layout back for anything that reads it after this.
  await sendJson(layoutPATCH, 'PATCH', '/api/dashboard/layout', MEMBER, { layout })
})

// ═══════════════════════════════════════════════════════════════════════════
// What the tiles render
// ═══════════════════════════════════════════════════════════════════════════

test('GET /api/dashboard/tiles matches DashboardTilesResponseSchema', async () => {
  const { status, body } = await getJson(tilesGET, '/api/dashboard/tiles', MEMBER)
  coverage.mark('GET', '/api/dashboard/tiles')

  assert.equal(status, 200, JSON.stringify(body))
  assertContract({
    label: 'GET /api/dashboard/tiles',
    schema: DashboardTilesResponseSchema,
    body,
    expectKeys: [
      'tiles',
      'metrics',
      'suggestions',
      // The adaptive signal, seeded above — so this is a real row, not [].
      'engagement',
      'engagement.0.key',
      'engagement.0.taps',
      'engagement.0.lastTapAt',
      // The server's clock: a client's recency maths must not depend on the
      // device's.
      'now',
    ],
  })

  const parsed = DashboardTilesResponseSchema.parse(body)
  assert.equal(parsed.engagement[0]?.key, 'stat:streak')
  assert.equal(parsed.engagement[0]?.taps, 3)
  assert.ok(Number.isFinite(Date.parse(parsed.now)), '`now` is an ISO instant')
  // Whatever the rotator picked, a metric pick names a metric in `metrics[]`
  // and a suggestion pick names one in `suggestions[]` — that pairing IS the
  // response's meaning, and nothing else in the suite checks it.
  for (const tile of parsed.tiles) {
    if (tile.kind === 'metric') {
      assert.ok(tile.tileId, 'a metric pick carries tileId')
      assert.equal(tile.suggestionId, undefined)
    } else {
      assert.ok(tile.suggestionId, 'a suggestion pick carries suggestionId')
      assert.equal(tile.tileId, undefined)
      assert.ok(
        parsed.suggestions.some((s) => s.id === tile.suggestionId),
        'a picked suggestion is in suggestions[]',
      )
    }
  }
  // The dashboard never shows exercise-scoped suggestions; the route filters
  // them, and a client that stopped expecting `placement` would not notice.
  assert.equal(
    parsed.suggestions.every((s) => s.placement !== 'exercise'),
    true,
  )
})

test('POST /api/dashboard/tile-tap matches DashboardTileTapResponseSchema', async () => {
  const { status, body } = await sendJson(
    tileTapPOST,
    'POST',
    '/api/dashboard/tile-tap',
    MEMBER,
    { key: 'stat:streak' },
  )
  coverage.mark('POST', '/api/dashboard/tile-tap')

  assert.equal(status, 200, JSON.stringify(body))
  assertContract({
    label: 'POST /api/dashboard/tile-tap',
    schema: DashboardTileTapResponseSchema,
    body,
    expectKeys: ['success'],
  })
  assert.equal(DashboardTileTapResponseSchema.parse(body).success, true)

  // `key` must be a `stat:<id>` / `metric:<id>` card key — the same pattern
  // DashboardTileTapRequestSchema enforces on the sending side.
  const bad = await sendJson(tileTapPOST, 'POST', '/api/dashboard/tile-tap', MEMBER, {
    key: 'streak',
  })
  assert.equal(bad.status, 400, JSON.stringify(bad.body))
})

test('POST /api/suggestions/dismiss matches SuggestionDismissResponseSchema, twice', async () => {
  const first = await sendJson(
    dismissPOST,
    'POST',
    '/api/suggestions/dismiss',
    MEMBER,
    { id: 'np023-suggestion' },
  )
  coverage.mark('POST', '/api/suggestions/dismiss')

  assert.equal(first.status, 200, JSON.stringify(first.body))
  assertContract({
    label: 'POST /api/suggestions/dismiss',
    schema: SuggestionDismissResponseSchema,
    body: first.body,
    expectKeys: ['success', 'id', 'wasUpdate', 'count'],
  })
  const parsedFirst = SuggestionDismissResponseSchema.parse(first.body)
  assert.equal(parsedFirst.wasUpdate, false)
  assert.equal(parsedFirst.count, 1)

  // Idempotent: the replay replaces the stamp instead of appending a duplicate,
  // and `wasUpdate` is how a client knows which of the two happened.
  const replay = await sendJson(dismissPOST, 'POST', '/api/suggestions/dismiss', MEMBER, {
    id: 'np023-suggestion',
  })
  assertContract({
    label: 'POST /api/suggestions/dismiss (replay)',
    schema: SuggestionDismissResponseSchema,
    body: replay.body,
    expectKeys: ['success', 'id', 'wasUpdate', 'count'],
  })
  const parsedReplay = SuggestionDismissResponseSchema.parse(replay.body)
  assert.equal(parsedReplay.wasUpdate, true)
  assert.equal(parsedReplay.count, 1)
})

// ═══════════════════════════════════════════════════════════════════════════
// The program nudge
// ═══════════════════════════════════════════════════════════════════════════

const NUDGE_KEYS = ['due', 'showings', 'dismissCount', 'dontShowAgain', 'hasServerState']

test('GET /api/program-nudge matches ProgramNudgeResponseSchema with the gating state', async () => {
  const { status, body } = await getJson(nudgeGET, '/api/program-nudge', MEMBER)
  coverage.mark('GET', '/api/program-nudge')

  assert.equal(status, 200, JSON.stringify(body))
  assertContract({
    label: 'GET /api/program-nudge',
    schema: ProgramNudgeResponseSchema,
    body,
    expectKeys: NUDGE_KEYS,
  })

  const parsed = ProgramNudgeResponseSchema.parse(body)
  // Read BEFORE this showing is recorded: the fixture has been shown once, so
  // the modal sees 1 and may offer its opt-out.
  assert.equal(parsed.showings, 1)
  assert.equal(parsed.dismissCount, 0)
  assert.equal(parsed.dontShowAgain, false)
  assert.equal(parsed.hasServerState, true)
})

test('POST /api/program-nudge matches ProgramNudgeResponseSchema and reports `adopted`', async () => {
  const { status, body } = await sendJson(
    nudgePOST,
    'POST',
    '/api/program-nudge',
    MEMBER,
    { action: 'dismiss' },
  )
  coverage.mark('POST', '/api/program-nudge')

  assert.equal(status, 200, JSON.stringify(body))
  assertContract({
    label: 'POST /api/program-nudge (dismiss)',
    schema: ProgramNudgeResponseSchema,
    body,
    expectKeys: [...NUDGE_KEYS, 'adopted'],
  })
  const dismissed = ProgramNudgeResponseSchema.parse(body)
  assert.equal(dismissed.dismissCount, 1)
  assert.equal(dismissed.adopted, false)

  // The permanent opt-out — the thing the server-side state exists for.
  const forever = await sendJson(nudgePOST, 'POST', '/api/program-nudge', MEMBER, {
    action: 'dismiss_forever',
  })
  assertContract({
    label: 'POST /api/program-nudge (dismiss_forever)',
    schema: ProgramNudgeResponseSchema,
    body: forever.body,
    expectKeys: [...NUDGE_KEYS, 'adopted'],
  })
  const parsedForever = ProgramNudgeResponseSchema.parse(forever.body)
  assert.equal(parsedForever.dontShowAgain, true)
  assert.equal(parsedForever.due, false)

  // An unknown action is a 400, not a silent no-op.
  const unknown = await sendJson(nudgePOST, 'POST', '/api/program-nudge', MEMBER, {
    action: 'snooze',
  })
  assert.equal(unknown.status, 400, JSON.stringify(unknown.body))
})

// ═══════════════════════════════════════════════════════════════════════════
// Goals — the goal tile, the check-in's goal line and the Becoming door
// ═══════════════════════════════════════════════════════════════════════════

const GOAL_KEYS = [
  'todayKey',
  'nutrition',
  'nutrition.unit',
  'nutrition.status',
  'nutrition.kind',
  'nutrition.direction',
  'nutrition.startedAt',
  'nutrition.achievedAt',
  'nutrition.baseline.weight',
  'nutrition.baseline.date',
  'nutrition.journeyStart.weight',
  'nutrition.now.weight',
  'nutrition.now.fourWeeksAgo',
  'nutrition.target.weight',
  'nutrition.target.paceKgPerWeek',
  'nutrition.target.pacePerWeek',
  'nutrition.target.bandKg',
  'nutrition.pace',
  'nutrition.adherence.logDays',
  'nutrition.adherence.proteinOk',
  'nutrition.proteinGoal',
  'nutrition.suggestion.key',
  'nutrition.suggestion.severity',
  'training',
  'training.status',
  'training.target.daysPerWeek',
  'training.target.programId',
  'training.thisWeek.done',
  'training.thisWeek.remaining',
  'training.thisWeek.chancesLeft',
  'training.thisWeek.weekLost',
  'training.avgLast4',
  'training.weeklyCounts',
  'training.baseline.daysPerWeek',
  'training.baseline.prs',
  'training.lifts',
  'training.suggestedLifts',
  'training.hasLiftTargets',
  'training.liftRationales',
  'training.week.sessions',
  'training.week.volume',
  'training.week.hasWeightedWork',
  'training.unit',
  'training.suggestion.key',
]

test('GET /api/goals matches GoalProgressResponseSchema, with a real pace read', async () => {
  const { status, body } = await getJson(goalsGET, '/api/goals', MEMBER, { tz: '0' })
  coverage.mark('GET', '/api/goals')

  assert.equal(status, 200, JSON.stringify(body))
  assertContract({
    label: 'GET /api/goals',
    schema: GoalProgressResponseSchema,
    body,
    expectKeys: GOAL_KEYS,
  })

  const parsed = GoalProgressResponseSchema.parse(body)
  assert.match(parsed.todayKey, /^\d{4}-\d{2}-\d{2}$/)
  // ensureGoals turns a target weight into a dated plan, so the nutrition
  // pillar is active and `pace` is an object rather than null.
  assert.equal(parsed.nutrition.status, 'active')
  assert.equal(parsed.nutrition.direction, 'lose')
  assert.equal(parsed.nutrition.unit, 'kg')
  assert.ok(parsed.nutrition.pace, 'a member with a target and a weigh-in has a pace read')
  assert.ok(
    ['ahead', 'on', 'behind', 'done', 'na'].includes(parsed.nutrition.pace.status),
    `unexpected pace status ${parsed.nutrition.pace.status}`,
  )
  assert.equal(typeof parsed.nutrition.pace.eta, 'string')
  // A weekly training target makes the training pillar active too.
  assert.equal(parsed.training.status, 'active')
  assert.equal(parsed.training.target.daysPerWeek, 4)
  assert.equal(parsed.training.unit, 'kg')
})

test('PUT /api/goals answers with the FRESH GoalProgressResponseSchema payload', async () => {
  // The pace Settings write (NP-048) and onboarding (NP-056) both come through
  // here, and both re-render from the response rather than refetching.
  const nutrition = await sendJson(goalsPUT, 'PUT', '/api/goals', MEMBER, {
    pillar: 'nutrition',
    paceKgPerWeek: 0.5,
    adherence: { logDaysPerWeek: 6, proteinDaysPerWeek: 4 },
    tz: 0,
  })
  coverage.mark('PUT', '/api/goals')

  assert.equal(nutrition.status, 200, JSON.stringify(nutrition.body))
  assertContract({
    label: 'PUT /api/goals (nutrition)',
    schema: GoalProgressResponseSchema,
    body: nutrition.body,
    expectKeys: GOAL_KEYS,
  })
  const parsedNutrition = GoalProgressResponseSchema.parse(nutrition.body)
  assert.equal(parsedNutrition.nutrition.target.paceKgPerWeek, 0.5)
  assert.equal(parsedNutrition.nutrition.adherence?.logTarget, 6)

  const training = await sendJson(goalsPUT, 'PUT', '/api/goals', MEMBER, {
    pillar: 'training',
    daysPerWeek: 3,
    lifts: 'suggested',
    tz: 0,
  })
  assert.equal(training.status, 200, JSON.stringify(training.body))
  assertContract({
    label: 'PUT /api/goals (training)',
    schema: GoalProgressResponseSchema,
    body: training.body,
    expectKeys: GOAL_KEYS,
  })
  assert.equal(
    GoalProgressResponseSchema.parse(training.body).training.target.daysPerWeek,
    3,
  )

  // An unknown pillar is a 400 — GoalUpdateRequestSchema refuses it too.
  const bad = await sendJson(goalsPUT, 'PUT', '/api/goals', MEMBER, { pillar: 'mind' })
  assert.equal(bad.status, 400, JSON.stringify(bad.body))
})

// ═══════════════════════════════════════════════════════════════════════════
// GET /api/progress — the stat tiles and the current-program card
// ═══════════════════════════════════════════════════════════════════════════

test('GET /api/progress returns stats, moodData, weightData, goal and currentProgram', async () => {
  const { status, body } = await getJson(progressGET, '/api/progress', MEMBER, { tz: '0' })
  coverage.mark('GET', '/api/progress')

  assert.equal(status, 200, JSON.stringify(body))
  assertContract({
    label: 'GET /api/progress',
    schema: ProgressApiResponseSchema,
    body,
    expectKeys: [
      'weightData',
      'weightData.0.date',
      'weightData.0.value',
      'bmiData',
      'bodyFatData',
      'leanMassData',
      'moodData',
      'moodData.0.value',
      'stats',
      'stats.streakDays',
      'stats.totalWorkouts',
      'stats.thisWeekWorkouts',
      'stats.goalProgress',
      'longestStreak',
      // The current-program card.
      'currentProgram',
      'currentProgram.programId',
      'currentProgram.name',
      'currentProgram.currentPhase',
      'currentProgram.currentWeek',
      'currentProgram.totalWeeks',
      'currentProgram.completedWorkouts',
      'currentProgram.totalWorkouts',
      'currentProgram.nextWorkout',
      'currentProgram.nextWorkoutDay',
      // The goal tile. `pace` is an OBJECT — it was typed as a number once and
      // this route did not parse at all.
      'goal',
      'goal.fitnessGoal',
      'goal.nutritionDirection',
      'goal.targetWeightKg',
      'goal.startWeightKg',
      'goal.weeklyAvailability',
      'goal.weightUnit',
      'goal.pace',
      'goal.pace.kgPerWeek',
      'goal.pace.status',
      'goal.pace.etaWeeks',
      'goal.pace.eta',
      'goal.pace.behindByKg',
    ],
  })

  const parsed = ProgressApiResponseSchema.parse(body)
  assert.equal(parsed.weightData.length, 2)
  assert.equal(parsed.moodData.length, 2)
  assert.equal(parsed.stats.streakDays, 5)
  assert.equal(parsed.currentProgram?.programId, PROGRAM_ID)
  assert.equal(parsed.currentProgram?.name, 'NP023 Contract Dashboard')
  assert.equal(parsed.currentProgram?.totalWeeks, 4, 'from the program’s duration_weeks')
  assert.equal(parsed.currentProgram?.nextWorkoutDay, 'Day 2', 'from the schedule')

  assert.equal(parsed.goal?.weightUnit, 'kg')
  assert.equal(parsed.goal?.targetWeightKg, 80)
  // The regression this schema was corrected for: an object, not a number.
  const pace = parsed.goal?.pace
  assert.ok(pace && typeof pace === 'object', '`goal.pace` is an object')
  assert.equal(typeof pace.eta, 'string')
  assert.equal(typeof pace.behindByKg, 'number')
  assert.ok(
    ['ahead', 'on', 'behind', 'done', 'na'].includes(pace.status),
    `unexpected pace status ${pace.status}`,
  )
})

test('GET /api/progress?detailed=1 parses with the same schema', async () => {
  // One route, one client-side type: the progress page's extras ride on the
  // dashboard's shape, so a native build that reads either must parse both.
  const { status, body } = await getJson(progressGET, '/api/progress', MEMBER, {
    tz: '0',
    detailed: '1',
  })

  assert.equal(status, 200, JSON.stringify(body))
  assertContract({
    label: 'GET /api/progress?detailed=1',
    schema: ProgressApiResponseSchema,
    body,
    expectKeys: [
      'stats',
      'goal.pace.status',
      'pbs',
      'pbs.0.slug',
      'pbs.0.weight',
      'pbs.0.reps',
      'pbs.0.date',
      'recentWorkouts',
      'recentWorkouts.0.date',
      'recentWorkouts.0.day',
      'recentWorkouts.0.exerciseCount',
      'detailedWorkouts',
      'detailedWorkouts.0.rawDate',
      'detailedWorkouts.0.kind',
      'detailedWorkouts.0.totalVolume',
      'detailedWorkouts.0.exercises.0.bestSet',
      'detailedWorkouts.0.exercises.0.isPR',
      'detailedWorkouts.0.exercises.0.sets.0.setNumber',
      'detailedWorkouts.0.exercises.0.sets.0.completed',
      'weeklyVolume',
      'weeklyVolume.0.week',
      'weeklyVolume.0.volume',
      'totalVolumeLbs',
      'targetWeightLbs',
      'weeklyAvailability',
    ],
  })

  const parsed = ProgressApiResponseSchema.parse(body)
  assert.equal(parsed.pbs?.[0]?.weight, 120)
  assert.equal(parsed.detailedWorkouts?.[0]?.kind, 'program')
  // 5×100 + 3×120 = 860.
  assert.equal(parsed.detailedWorkouts?.[0]?.totalVolume, 860)
  assert.equal(parsed.totalVolumeLbs, 860)
})

test('GET /api/progress parses for a member with no UserProgress row at all', async () => {
  // The empty answer — and, byte for byte, the route's own error fallback. A
  // client that required `goal` or `stats.streakDays > 0` would break on every
  // first run, so the schema has to describe this shape too.
  const NEWCOMER: ContractMember = {
    id: '6ab0230000000000000f7ee1',
    email: 'newcomer@np023.contract.test',
    label: 'free',
    auth: '',
  }
  const uid = new mongoose.Types.ObjectId(NEWCOMER.id)
  await User.deleteMany({ $or: [{ _id: uid }, { email: NEWCOMER.email }] })
  await User.create({
    _id: uid,
    email: NEWCOMER.email,
    password: 'contract-test-unused',
    name: 'Contract Newcomer',
    tier: 'free',
  })
  NEWCOMER.auth = `Bearer ${await signToken({ userId: NEWCOMER.id, email: NEWCOMER.email })}`

  try {
    const { status, body } = await getJson(progressGET, '/api/progress', NEWCOMER, { tz: '0' })
    assert.equal(status, 200, JSON.stringify(body))
    assertContract({
      label: 'GET /api/progress (no UserProgress row)',
      schema: ProgressApiResponseSchema,
      body,
      expectKeys: ['weightData', 'bmiData', 'moodData', 'currentProgram', 'stats'],
    })
    const parsed = ProgressApiResponseSchema.parse(body)
    assert.deepEqual(parsed.weightData, [])
    assert.equal(parsed.currentProgram, null)
    assert.equal(parsed.stats.goalProgress, 0)
    assert.equal(parsed.goal, undefined)
  } finally {
    await User.deleteMany({ _id: uid })
    await UserProgress.deleteMany({ userId: uid })
    await Goal.deleteMany({ userId: uid })
  }
})

// ═══════════════════════════════════════════════════════════════════════════
// The coverage gate. Keep this last.
// ═══════════════════════════════════════════════════════════════════════════

test('every route NP-023 covers was actually called with its schema', () => {
  assertEveryRouteCovered(NP023_ROUTES, coverage)
  // The manifest is not allowed to shrink quietly: 10 route methods, the list
  // at the top of this file.
  assert.equal(NP023_ROUTES.length, 10)
  assert.equal(coverage.list().length, 10)
})
