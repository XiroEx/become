// Run with: npm run test:file tests/unit/contract/np023Dashboard.test.ts
//
// THE DASHBOARD SURFACE, CHECKED AGAINST THE SHARED SCHEMAS (NP-023).
//
// Read tests/unit/contract/_contract.ts first — it explains why the schemas
// are imported by RELATIVE path, why "it parses" is not the whole check, and
// what a domain file has to end with.
//
// WHAT THIS FILE IS FOR
//
// The dashboard runs on routes the shared client did not type: layout, tiles,
// tile-tap, suggestions dismiss, program-nudge, goals, and progress.
//
// Every route below is called for real — the exported handler, a signed token,
// the loopback test database — and parsed with the schema the native app reads
// it through.
//
// ITS OWN FIXTURES, ON PURPOSE. The runner executes test FILES in parallel, so
// this file uses its own member (@np023.contract.test) and clean rows rather
// than sharing rows with other test files.

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
  DashboardLayoutPatchResponseSchema,
  DashboardTilesResponseSchema,
  DashboardTileTapResponseSchema,
  SuggestionDismissResponseSchema,
  ProgramNudgeResponseSchema,
  GoalProgressResponseSchema,
  ProgressApiResponseSchema,
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
import { signToken } from '../../../lib/auth'

// ---------------------------------------------------------------------------
// The manifest: every route NP-023's schemas describe.
// ---------------------------------------------------------------------------

const NP023_ROUTES: readonly ContractRoute[] = [
  {
    method: 'GET',
    path: '/api/dashboard/layout',
    schema: 'DashboardLayoutResponseSchema',
    note: 'user layout with at most 20 tiles',
  },
  {
    method: 'PATCH',
    path: '/api/dashboard/layout',
    schema: 'DashboardLayoutPatchResponseSchema',
    note: 'replaces layout',
  },
  {
    method: 'GET',
    path: '/api/dashboard/tiles',
    schema: 'DashboardTilesResponseSchema',
    note: 'rotator-picked metrics and suggestions',
  },
  {
    method: 'POST',
    path: '/api/dashboard/tile-tap',
    schema: 'DashboardTileTapResponseSchema',
    note: 'records smart tile engagement',
  },
  {
    method: 'POST',
    path: '/api/suggestions/dismiss',
    schema: 'SuggestionDismissResponseSchema',
    note: 'dismisses a dashboard suggestion',
  },
  {
    method: 'GET',
    path: '/api/program-nudge',
    schema: 'ProgramNudgeResponseSchema',
    note: 'checks whether training program nudge is due',
  },
  {
    method: 'POST',
    path: '/api/program-nudge',
    schema: 'ProgramNudgeResponseSchema',
    note: 'records user action on program nudge',
  },
  {
    method: 'GET',
    path: '/api/goals',
    schema: 'GoalProgressResponseSchema',
    note: 'goal progress read by the goal tile',
  },
  {
    method: 'PUT',
    path: '/api/goals',
    schema: 'GoalProgressResponseSchema',
    note: 'updates goal pace/training and returns progress',
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

async function cleanFixtures(): Promise<void> {
  const uid = new mongoose.Types.ObjectId(MEMBER.id)
  await User.deleteMany({ $or: [{ _id: uid }, { email: MEMBER.email }] })
  await UserProgress.deleteMany({ userId: MEMBER.id })
  await Goal.deleteMany({ userId: uid })
}

before(async () => {
  process.env.JWT_SECRET ||= 'become-unit-test-secret'
  process.env.ENTITLEMENTS_ENFORCED = '1'

  await mongoose.connect(
    process.env.MONGODB_URI ?? 'mongodb://127.0.0.1:27017/become-test',
  )
  await cleanFixtures()

  await User.create({
    _id: new mongoose.Types.ObjectId(MEMBER.id),
    email: MEMBER.email,
    password: 'contract-test-unused',
    name: 'Contract Dashboard',
    tier: 'plus',
    profile: {
      fitnessGoal: 'gain_muscle',
      weightUnit: 'lbs',
      targetWeightKg: 80,
      currentWeightKg: 85,
      weeklyAvailability: 4,
    },
    onboardingCompleted: true,
  })

  MEMBER.auth = `Bearer ${await signToken({ userId: MEMBER.id, email: MEMBER.email })}`

  await UserProgress.create({
    userId: MEMBER.id,
    streakDays: 5,
    totalWorkouts: 12,
    dashboardLayout: [
      { id: 'streak', kind: 'stat', size: '1x1' },
      { id: 'mood', kind: 'stat', size: '1x1' },
      { id: 'weekly', kind: 'stat', size: '1x1' },
      { id: 'goal', kind: 'stat', size: '1x1' },
      {
        id: 'smart',
        kind: 'smart-rotating',
        size: '2x1',
        locked: null,
        settings: {
          pool: ['stat:streak', 'stat:mood'],
          intervalMs: 6000,
        },
      },
    ],
    weightHistory: [
      { date: new Date('2026-09-01T00:00:00.000Z'), weight: 185 },
      { date: new Date('2026-09-28T00:00:00.000Z'), weight: 180 },
    ],
    moodHistory: [
      { date: new Date('2026-09-29T00:00:00.000Z'), mood: 4 },
      { date: new Date('2026-09-30T00:00:00.000Z'), mood: 5 },
    ],
    programNudge: {
      dismissCount: 0,
      shownCount: 1,
      lastShownAt: new Date(),
      dontShowAgain: false,
    },
  })
})

after(async () => {
  await cleanFixtures()
  await mongoose.disconnect()
})

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test('GET /api/dashboard/layout returns valid layout', async () => {
  const res = await getJson(layoutGET, '/api/dashboard/layout', MEMBER)
  assert.equal(res.status, 200)
  coverage.mark('GET', '/api/dashboard/layout')
  assertContract({
    label: 'GET /api/dashboard/layout',
    schema: DashboardLayoutResponseSchema,
    body: res.body,
    expectKeys: ['layout'],
  })
})

test('PATCH /api/dashboard/layout updates and returns layout', async () => {
  const res = await sendJson(
    layoutPATCH,
    'PATCH',
    '/api/dashboard/layout',
    MEMBER,
    {
      layout: [
        { id: 'streak', kind: 'stat', size: '1x1' },
        { id: 'mood', kind: 'stat', size: '1x1' },
        { id: 'smart', kind: 'smart-rotating', size: '2x1', locked: 'stat:streak' },
      ],
    },
  )
  assert.equal(res.status, 200)
  coverage.mark('PATCH', '/api/dashboard/layout')
  assertContract({
    label: 'PATCH /api/dashboard/layout',
    schema: DashboardLayoutPatchResponseSchema,
    body: res.body,
    expectKeys: ['success', 'layout'],
  })
})

test('GET /api/dashboard/tiles returns rotator-picked metrics and suggestions', async () => {
  const res = await getJson(tilesGET, '/api/dashboard/tiles', MEMBER)
  assert.equal(res.status, 200)
  coverage.mark('GET', '/api/dashboard/tiles')
  assertContract({
    label: 'GET /api/dashboard/tiles',
    schema: DashboardTilesResponseSchema,
    body: res.body,
    expectKeys: ['tiles', 'metrics', 'suggestions', 'engagement', 'now'],
  })
})

test('POST /api/dashboard/tile-tap records engagement', async () => {
  const res = await sendJson(
    tileTapPOST,
    'POST',
    '/api/dashboard/tile-tap',
    MEMBER,
    { key: 'stat:streak' },
  )
  assert.equal(res.status, 200)
  coverage.mark('POST', '/api/dashboard/tile-tap')
  assertContract({
    label: 'POST /api/dashboard/tile-tap',
    schema: DashboardTileTapResponseSchema,
    body: res.body,
    expectKeys: ['success'],
  })
})

test('POST /api/suggestions/dismiss records dismissal', async () => {
  const res = await sendJson(
    dismissPOST,
    'POST',
    '/api/suggestions/dismiss',
    MEMBER,
    { id: 'test-suggestion' },
  )
  assert.equal(res.status, 200)
  coverage.mark('POST', '/api/suggestions/dismiss')
  assertContract({
    label: 'POST /api/suggestions/dismiss',
    schema: SuggestionDismissResponseSchema,
    body: res.body,
    expectKeys: ['success', 'id', 'wasUpdate', 'count'],
  })
})

test('GET /api/program-nudge returns nudge gating state', async () => {
  const res = await getJson(nudgeGET, '/api/program-nudge', MEMBER)
  assert.equal(res.status, 200)
  coverage.mark('GET', '/api/program-nudge')
  assertContract({
    label: 'GET /api/program-nudge',
    schema: ProgramNudgeResponseSchema,
    body: res.body,
    expectKeys: [
      'due',
      'showings',
      'dismissCount',
      'dontShowAgain',
      'hasServerState',
    ],
  })
})

test('POST /api/program-nudge records action', async () => {
  const res = await sendJson(
    nudgePOST,
    'POST',
    '/api/program-nudge',
    MEMBER,
    { action: 'dismiss' },
  )
  assert.equal(res.status, 200)
  coverage.mark('POST', '/api/program-nudge')
  assertContract({
    label: 'POST /api/program-nudge',
    schema: ProgramNudgeResponseSchema,
    body: res.body,
    expectKeys: [
      'due',
      'showings',
      'dismissCount',
      'dontShowAgain',
      'hasServerState',
    ],
  })
})

test('GET /api/goals returns goal progress', async () => {
  const res = await getJson(goalsGET, '/api/goals', MEMBER, { tz: '0' })
  assert.equal(res.status, 200)
  coverage.mark('GET', '/api/goals')
  assertContract({
    label: 'GET /api/goals',
    schema: GoalProgressResponseSchema,
    body: res.body,
    expectKeys: ['todayKey', 'nutrition', 'training'],
  })
})

test('PUT /api/goals updates training days and returns progress', async () => {
  const res = await sendJson(goalsPUT, 'PUT', '/api/goals', MEMBER, {
    pillar: 'training',
    daysPerWeek: 4,
    tz: 0,
  })
  assert.equal(res.status, 200)
  coverage.mark('PUT', '/api/goals')
  assertContract({
    label: 'PUT /api/goals',
    schema: GoalProgressResponseSchema,
    body: res.body,
    expectKeys: ['todayKey', 'nutrition', 'training'],
  })
})

test('GET /api/progress returns stats, moodData, weightData, goal and currentProgram', async () => {
  const res = await getJson(progressGET, '/api/progress', MEMBER, { tz: '0' })
  assert.equal(res.status, 200)
  coverage.mark('GET', '/api/progress')
  assertContract({
    label: 'GET /api/progress',
    schema: ProgressApiResponseSchema,
    body: res.body,
    expectKeys: ['weightData', 'bmiData', 'moodData', 'stats'],
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
