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
// The dashboard runs on routes the shared client does not type:
//   - GET|PATCH /api/dashboard/layout (the unified layout model)
//   - GET /api/dashboard/tiles (metrics and suggestions rotator)
//   - POST /api/dashboard/tile-tap (adaptive smart-tile signal)
//   - POST /api/suggestions/dismiss (suggestion dismissal)
//   - GET|POST /api/program-nudge (program onboarding nudge)
//   - GET /api/goals?tz and PUT /api/goals (nutrition and training goals)
//   - GET /api/progress?tz (dashboard stats, moodData, weightData, goal and currentProgram)
//
// Every route below is called for real — the exported handler, a signed
// token, the loopback test database — and parsed with the schema the native app
// reads it through.
//
// ITS OWN FIXTURES, ON PURPOSE. The runner executes test FILES in parallel against
// ONE database, so this file uses its own member (@np023.contract.test), its own
// program id and its own rows rather than shared np015 rows.

import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import mongoose from 'mongoose'

// The routes. Real exported handlers.
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
import {
  GET as goalsGET,
  PUT as goalsPUT,
} from '../../../app/api/goals/route'
import { GET as progressGET } from '../../../app/api/progress/route'

// The contract. RELATIVE imports of shared/api-client — see _contract.ts.
import {
  DashboardLayoutResponseSchema,
  DashboardLayoutPatchRequestSchema,
  DashboardLayoutPatchResponseSchema,
  DashboardTilesResponseSchema,
  DashboardTileTapRequestSchema,
  DashboardTileTapResponseSchema,
  SuggestionDismissRequestSchema,
  SuggestionDismissResponseSchema,
  ProgramNudgeResponseSchema,
  ProgramNudgeRequestSchema,
  ProgramNudgeActionResponseSchema,
  GoalProgressResponseSchema,
  GoalsUpdateRequestSchema,
  ProgressApiResponseSchema,
  type DashboardTile,
  type DashboardLayoutPatchRequest,
  type DashboardTileTapRequest,
  type SuggestionDismissRequest,
  type ProgramNudgeRequest,
  type GoalsUpdateRequest,
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
import Goal from '../../../models/Goal'
import ProgramModel from '../../../models/Program'
import Schedule from '../../../models/Schedule'
import { signToken } from '../../../lib/auth'

// ---------------------------------------------------------------------------
// The manifest: every route NP-023's schemas describe.
// ---------------------------------------------------------------------------

const NP023_ROUTES: readonly ContractRoute[] = [
  {
    method: 'GET',
    path: '/api/dashboard/layout',
    schema: 'DashboardLayoutResponseSchema',
    note: 'unified dashboard layout',
  },
  {
    method: 'PATCH',
    path: '/api/dashboard/layout',
    schema: 'DashboardLayoutPatchResponseSchema',
    note: 'replaces user layout (max 20 tiles)',
  },
  {
    method: 'GET',
    path: '/api/dashboard/tiles',
    schema: 'DashboardTilesResponseSchema',
    note: 'rotator-picked tiles, metrics, suggestions and engagement',
  },
  {
    method: 'POST',
    path: '/api/dashboard/tile-tap',
    schema: 'DashboardTileTapResponseSchema',
    note: 'record smart tile tap',
  },
  {
    method: 'POST',
    path: '/api/suggestions/dismiss',
    schema: 'SuggestionDismissResponseSchema',
    note: 'dismiss a suggestion by id',
  },
  {
    method: 'GET',
    path: '/api/program-nudge',
    schema: 'ProgramNudgeResponseSchema',
    note: 'program nudge status',
  },
  {
    method: 'POST',
    path: '/api/program-nudge',
    schema: 'ProgramNudgeActionResponseSchema',
    note: 'record program nudge action',
  },
  {
    method: 'GET',
    path: '/api/goals',
    schema: 'GoalProgressResponseSchema',
    note: 'goal progress read for nutrition and training',
  },
  {
    method: 'PUT',
    path: '/api/goals',
    schema: 'GoalProgressResponseSchema',
    note: 'update pace or training target',
  },
  {
    method: 'GET',
    path: '/api/progress',
    schema: 'ProgressApiResponseSchema',
    note: 'dashboard stats, moodData, weightData, goal and currentProgram',
  },
]

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

const PROGRAM_ID = 'np023-contract-program'
const PROGRAM_NAME = 'NP023 Contract Program'

async function cleanFixtures(): Promise<void> {
  const objectId = new mongoose.Types.ObjectId(MEMBER.id)
  await User.deleteMany({ $or: [{ _id: objectId }, { email: MEMBER.email }] })
  await UserProgress.deleteMany({ userId: MEMBER.id })
  await Goal.deleteMany({ userId: MEMBER.id })
  await Schedule.deleteMany({ userId: objectId })
  await ProgramModel.deleteMany({ program_id: PROGRAM_ID })
}

before(async () => {
  process.env.JWT_SECRET ||= 'become-unit-test-secret'
  process.env.ENTITLEMENTS_ENFORCED = '1'

  await mongoose.connect(process.env.MONGODB_URI ?? 'mongodb://127.0.0.1:27017/become-test')
  await cleanFixtures()

  const uid = new mongoose.Types.ObjectId(MEMBER.id)

  await User.create({
    _id: uid,
    email: MEMBER.email,
    password: 'contract-test-unused',
    name: 'Contract Dashboard',
    tier: 'plus',
    profile: {
      fitnessGoal: 'lose_weight',
      nutritionDirection: 'lose',
      targetWeightKg: 75,
      currentWeightKg: 85,
      weightUnit: 'kg',
      weeklyAvailability: 4,
    },
    onboardingCompleted: true,
  })
  MEMBER.auth = `Bearer ${await signToken({ userId: MEMBER.id, email: MEMBER.email })}`

  await ProgramModel.create({
    program_id: PROGRAM_ID,
    name: PROGRAM_NAME,
    duration_weeks: 12,
    training_days_per_week: 4,
    phases: [
      {
        phase: 'Phase 1',
        workouts: [{ day: 'Day 1', title: 'Start Training' }],
      },
    ],
  })

  await UserProgress.create({
    userId: uid,
    streakDays: 7,
    longestStreak: 14,
    totalWorkouts: 15,
    height: 70,
    weightHistory: [
      { date: new Date('2026-09-01T00:00:00.000Z'), weight: 85 },
      { date: new Date('2026-09-15T00:00:00.000Z'), weight: 83.5 },
      { date: new Date('2026-09-29T00:00:00.000Z'), weight: 81.2 },
    ],
    moodHistory: [
      { date: new Date('2026-09-28T00:00:00.000Z'), mood: 4 },
      { date: new Date('2026-09-29T00:00:00.000Z'), mood: 5 },
    ],
    activePrograms: [
      {
        programId: PROGRAM_ID,
        programName: PROGRAM_NAME,
        startDate: new Date('2026-09-01T00:00:00.000Z'),
        status: 'in-progress',
        currentPhase: 1,
        completedWorkouts: 4,
        totalWorkouts: 48,
      },
    ],
    dashboardLayout: [
      { id: 'stat:streak', kind: 'stat', size: '1x1' },
      { id: 'stat:mood', kind: 'stat', size: '1x1' },
    ],
  })

  await Schedule.create({
    userId: uid,
    programId: PROGRAM_ID,
    programName: PROGRAM_NAME,
    settings: {
      trainingDays: [1, 3, 5],
      startDate: '2026-09-01T00:00:00.000Z',
    },
    scheduledWorkouts: [
      {
        date: '2026-09-01T00:00:00.000Z',
        programId: PROGRAM_ID,
        phase: 1,
        dayLabel: 'Day 1',
        workoutTitle: 'Start Training',
        status: 'completed',
      },
      {
        date: '2026-10-01T00:00:00.000Z',
        programId: PROGRAM_ID,
        phase: 1,
        dayLabel: 'Day 2',
        workoutTitle: 'Lower Body',
        status: 'scheduled',
      },
    ],
  })

  await Goal.create({
    userId: MEMBER.id,
    pillar: 'nutrition',
    status: 'active',
    kind: 'weight',
    baseline: {
      weightKg: 85,
      date: new Date('2026-09-01T00:00:00.000Z'),
    },
    target: {
      weightKg: 75,
      direction: 'lose',
      paceKgPerWeek: 0.5,
      bandKg: 0.9,
    },
  })

  await Goal.create({
    userId: MEMBER.id,
    pillar: 'training',
    status: 'active',
    target: {
      daysPerWeek: 4,
      programId: PROGRAM_ID,
    },
  })
})

after(async () => {
  await cleanFixtures()
  await mongoose.disconnect()
})

// ═══════════════════════════════════════════════════════════════════════════
// 1. Dashboard Layout
// ═══════════════════════════════════════════════════════════════════════════

test('GET /api/dashboard/layout matches DashboardLayoutResponseSchema', async () => {
  const { status, body } = await getJson(layoutGET, '/api/dashboard/layout', MEMBER)
  coverage.mark('GET', '/api/dashboard/layout')

  assert.equal(status, 200, JSON.stringify(body))
  assertContract({
    label: 'GET /api/dashboard/layout',
    schema: DashboardLayoutResponseSchema,
    body,
    expectKeys: ['layout', 'layout.0.id', 'layout.0.kind', 'layout.0.size'],
  })
})

test('PATCH /api/dashboard/layout matches DashboardLayoutPatchResponseSchema', async () => {
  const nextLayout: DashboardTile[] = [
    { id: 'stat:streak', kind: 'stat', size: '1x1' },
    { id: 'stat:mood', kind: 'stat', size: '1x1' },
    {
      id: 'smart-rotating',
      kind: 'smart-rotating',
      size: '1x1',
      locked: null,
      settings: {
        pool: ['stat:streak', 'stat:mood'],
        intervalMs: 6000,
      },
    },
  ]
  const req: DashboardLayoutPatchRequest = { layout: nextLayout }
  assert.equal(DashboardLayoutPatchRequestSchema.safeParse(req).success, true)

  const { status, body } = await sendJson(
    layoutPATCH,
    'PATCH',
    '/api/dashboard/layout',
    MEMBER,
    req,
  )
  coverage.mark('PATCH', '/api/dashboard/layout')

  assert.equal(status, 200, JSON.stringify(body))
  assertContract({
    label: 'PATCH /api/dashboard/layout',
    schema: DashboardLayoutPatchResponseSchema,
    body,
    expectKeys: ['success', 'layout', 'layout.0.id', 'layout.0.kind', 'layout.0.size'],
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// 2. Dashboard Tiles, Tile-Tap & Dismiss
// ═══════════════════════════════════════════════════════════════════════════

test('GET /api/dashboard/tiles matches DashboardTilesResponseSchema', async () => {
  const { status, body } = await getJson(tilesGET, '/api/dashboard/tiles', MEMBER)
  coverage.mark('GET', '/api/dashboard/tiles')

  assert.equal(status, 200, JSON.stringify(body))
  assertContract({
    label: 'GET /api/dashboard/tiles',
    schema: DashboardTilesResponseSchema,
    body,
    expectKeys: ['tiles', 'metrics', 'suggestions', 'engagement', 'now'],
  })
})

test('POST /api/dashboard/tile-tap matches DashboardTileTapResponseSchema', async () => {
  const req: DashboardTileTapRequest = { key: 'stat:streak' }
  assert.equal(DashboardTileTapRequestSchema.safeParse(req).success, true)

  const { status, body } = await sendJson(
    tileTapPOST,
    'POST',
    '/api/dashboard/tile-tap',
    MEMBER,
    req,
  )
  coverage.mark('POST', '/api/dashboard/tile-tap')

  assert.equal(status, 200, JSON.stringify(body))
  assertContract({
    label: 'POST /api/dashboard/tile-tap',
    schema: DashboardTileTapResponseSchema,
    body,
    expectKeys: ['success'],
  })
})

test('POST /api/suggestions/dismiss matches SuggestionDismissResponseSchema', async () => {
  const req: SuggestionDismissRequest = { id: 'sample-suggestion' }
  assert.equal(SuggestionDismissRequestSchema.safeParse(req).success, true)

  const { status, body } = await sendJson(
    dismissPOST,
    'POST',
    '/api/suggestions/dismiss',
    MEMBER,
    req,
  )
  coverage.mark('POST', '/api/suggestions/dismiss')

  assert.equal(status, 200, JSON.stringify(body))
  assertContract({
    label: 'POST /api/suggestions/dismiss',
    schema: SuggestionDismissResponseSchema,
    body,
    expectKeys: ['success', 'id', 'wasUpdate', 'count'],
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// 3. Program Nudge
// ═══════════════════════════════════════════════════════════════════════════

test('GET /api/program-nudge matches ProgramNudgeResponseSchema', async () => {
  const { status, body } = await getJson(nudgeGET, '/api/program-nudge', MEMBER)
  coverage.mark('GET', '/api/program-nudge')

  assert.equal(status, 200, JSON.stringify(body))
  assertContract({
    label: 'GET /api/program-nudge',
    schema: ProgramNudgeResponseSchema,
    body,
    expectKeys: ['due', 'showings', 'dismissCount', 'dontShowAgain', 'hasServerState'],
  })
})

test('POST /api/program-nudge matches ProgramNudgeActionResponseSchema', async () => {
  const req: ProgramNudgeRequest = { action: 'shown' }
  assert.equal(ProgramNudgeRequestSchema.safeParse(req).success, true)

  const { status, body } = await sendJson(
    nudgePOST,
    'POST',
    '/api/program-nudge',
    MEMBER,
    req,
  )
  coverage.mark('POST', '/api/program-nudge')

  assert.equal(status, 200, JSON.stringify(body))
  assertContract({
    label: 'POST /api/program-nudge',
    schema: ProgramNudgeActionResponseSchema,
    body,
    expectKeys: ['due', 'showings', 'dismissCount', 'dontShowAgain', 'hasServerState'],
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// 4. Goals
// ═══════════════════════════════════════════════════════════════════════════

test('GET /api/goals matches GoalProgressResponseSchema', async () => {
  const { status, body } = await getJson(goalsGET, '/api/goals', MEMBER, { tz: '0' })
  coverage.mark('GET', '/api/goals')

  assert.equal(status, 200, JSON.stringify(body))
  assertContract({
    label: 'GET /api/goals',
    schema: GoalProgressResponseSchema,
    body,
    expectKeys: [
      'todayKey',
      'nutrition',
      'nutrition.unit',
      'nutrition.status',
      'nutrition.target',
      'training',
      'training.status',
      'training.target',
      'training.week',
    ],
  })
})

test('PUT /api/goals matches GoalProgressResponseSchema', async () => {
  const req: GoalsUpdateRequest = {
    pillar: 'nutrition',
    paceKgPerWeek: 0.5,
    adherence: { logDaysPerWeek: 5, proteinDaysPerWeek: 5 },
  }
  assert.equal(GoalsUpdateRequestSchema.safeParse(req).success, true)

  const { status, body } = await sendJson(goalsPUT, 'PUT', '/api/goals', MEMBER, req)
  coverage.mark('PUT', '/api/goals')

  assert.equal(status, 200, JSON.stringify(body))
  assertContract({
    label: 'PUT /api/goals',
    schema: GoalProgressResponseSchema,
    body,
    expectKeys: ['todayKey', 'nutrition', 'training'],
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// 5. Progress
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
      'stats',
      'moodData',
      'weightData',
      'goal',
      'goal.pace',
      'currentProgram',
    ],
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// The coverage gate. Keep this last.
// ═══════════════════════════════════════════════════════════════════════════

test('every route NP-023 covers was actually called with its schema', () => {
  assertEveryRouteCovered(NP023_ROUTES, coverage)
  assert.equal(NP023_ROUTES.length, 10)
  assert.equal(coverage.list().length, 10)
})
