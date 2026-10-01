// Run with: npm run test:file tests/unit/contract/np022DailyRhythm.test.ts
//
// THE DAILY-RHYTHM SURFACE, CHECKED AGAINST THE SHARED SCHEMAS (NP-022).
//
// Covers streaks, freeze, check-in, mood, and weight routes:
//   - POST /api/mood
//   - GET /api/weight
//   - POST /api/weight
//   - GET /api/streaks
//   - POST /api/streaks/freeze
//   - GET /api/checkin
//   - POST /api/checkin

import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import mongoose from 'mongoose'

// Real route handlers
import { POST as moodPOST } from '../../../app/api/mood/route'
import { GET as weightGET, POST as weightPOST } from '../../../app/api/weight/route'
import { GET as streaksGET } from '../../../app/api/streaks/route'
import { POST as freezePOST } from '../../../app/api/streaks/freeze/route'
import { GET as checkinGET, POST as checkinPOST } from '../../../app/api/checkin/route'

// The contract: RELATIVE imports of shared/api-client — see _contract.ts.
import {
  LogMoodResponseSchema,
  LogMoodRequestSchema,
} from '../../../../shared/api-client/src/schemas/mood'
import {
  LogWeightResponseSchema,
  LogWeightRequestSchema,
  WeightCheckResponseSchema,
  GoalReachedSchema,
} from '../../../../shared/api-client/src/schemas/weight'
import {
  StreaksResponseSchema,
  FreezeSuccessResponseSchema,
  FreezeRefusalResponseSchema,
  FREEZE_REFUSALS,
} from '../../../../shared/api-client/src/schemas/streak'
import {
  CheckInResponseSchema,
  CheckInActionRequestSchema,
  CheckInActionResponseSchema,
} from '../../../../shared/api-client/src/schemas/checkin'

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
import StreakCredit from '../../../models/StreakCredit'
import { signToken } from '../../../lib/auth'
import { ensureGoals } from '../../../lib/goals/ensure'

// ---------------------------------------------------------------------------
// The manifest: every route NP-022's schemas describe.
// ---------------------------------------------------------------------------

const NP022_ROUTES: readonly ContractRoute[] = [
  { method: 'POST', path: '/api/mood', schema: 'LogMoodResponseSchema', note: 'records mood and returns streak' },
  { method: 'GET', path: '/api/weight', schema: 'WeightCheckResponseSchema', note: 'prompt state and skip tracking' },
  { method: 'POST', path: '/api/weight', schema: 'LogWeightResponseSchema', note: 'records weight/skip, returns streak and goalReached' },
  { method: 'GET', path: '/api/streaks', schema: 'StreaksResponseSchema', note: 'all pillars, super streak, and credits' },
  { method: 'POST', path: '/api/streaks/freeze', schema: 'FreezeSuccessResponseSchema + FreezeRefusalResponseSchema', note: 'success (200) and refusal (409)' },
  { method: 'GET', path: '/api/checkin', schema: 'CheckInResponseSchema', note: 'check-in decision and status' },
  { method: 'POST', path: '/api/checkin', schema: 'CheckInActionResponseSchema', note: 'action: shown or skip' },
]

const coverage = new Coverage()

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const MEMBER: ContractMember = {
  id: '6ab0220000000000000f7ee0',
  email: 'plus@np022.contract.test',
  label: 'plus',
  auth: '',
}

async function cleanFixtures(): Promise<void> {
  const objectId = new mongoose.Types.ObjectId(MEMBER.id)
  await User.deleteMany({ $or: [{ _id: objectId }, { email: MEMBER.email }] })
  await UserProgress.deleteMany({ userId: MEMBER.id })
  await Goal.deleteMany({ userId: objectId })
  await StreakCredit.deleteMany({ userId: objectId })
}

before(async () => {
  process.env.JWT_SECRET ||= 'become-unit-test-secret'
  process.env.ENTITLEMENTS_ENFORCED = '1'

  await mongoose.connect(process.env.MONGODB_URI ?? 'mongodb://127.0.0.1:27017/become-test')
  await cleanFixtures()

  await User.create({
    _id: new mongoose.Types.ObjectId(MEMBER.id),
    email: MEMBER.email,
    password: 'contract-test-unused',
    name: 'Contract NP022',
    tier: 'plus',
    profile: {
      fitnessGoal: 'lose_weight',
      weightUnit: 'lbs',
      nutritionDirection: 'lose',
      targetWeightKg: 80,
      currentWeightKg: 85,
    },
    onboardingCompleted: true,
  })

  await UserProgress.create({
    userId: MEMBER.id,
    streakDays: 5,
    longestStreak: 10,
    streakFreezes: 1,
    lastActivityDate: new Date(),
  })

  MEMBER.auth = `Bearer ${await signToken({ userId: MEMBER.id, email: MEMBER.email })}`
})

after(async () => {
  await cleanFixtures()
  await mongoose.disconnect()
})

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

test('POST /api/mood returns LogMoodResponseSchema with streak', async () => {
  const { status, body } = await sendJson(moodPOST, 'POST', '/api/mood', MEMBER, {
    mood: 4,
    tz: 240,
  })
  coverage.mark('POST', '/api/mood')
  assert.equal(status, 200, JSON.stringify(body))
  assertContract({
    label: 'POST /api/mood',
    schema: LogMoodResponseSchema,
    body,
    expectKeys: ['success', 'mood', 'date', 'applied'],
  })
})

test('GET /api/weight returns WeightCheckResponseSchema prompt state', async () => {
  const { status, body } = await getJson(weightGET, '/api/weight', MEMBER, { tz: '240' })
  coverage.mark('GET', '/api/weight')
  assert.equal(status, 200, JSON.stringify(body))
  assertContract({
    label: 'GET /api/weight',
    schema: WeightCheckResponseSchema,
    body,
    expectKeys: ['needsWeightCheck', 'consecutiveSkips', 'isMandatory', 'daysSinceLastEntry'],
  })
})

test('POST /api/weight returns LogWeightResponseSchema with streak', async () => {
  const { status, body } = await sendJson(weightPOST, 'POST', '/api/weight', MEMBER, {
    weight: 185,
    tz: 240,
  })
  coverage.mark('POST', '/api/weight')
  assert.equal(status, 200, JSON.stringify(body))
  assertContract({
    label: 'POST /api/weight',
    schema: LogWeightResponseSchema,
    body,
    expectKeys: ['success', 'date', 'applied'],
  })
})

test('POST /api/weight returns LogWeightResponseSchema with goalReached when finish band is crossed', async () => {
  const objectId = new mongoose.Types.ObjectId(MEMBER.id)
  const now = new Date()
  const startDate = new Date(now.getTime() - 14 * 86_400_000)

  // Give the member their own fresh day (clear the weigh-in from the previous test)
  await UserProgress.updateOne(
    { userId: MEMBER.id },
    { $set: { weightHistory: [], 'weightSkipTracking.consecutiveSkips': 0 } },
  )
  await Goal.deleteMany({ userId: objectId })

  // Seed the goal the way ensureGoals expects
  await User.updateOne(
    { _id: objectId },
    {
      $set: {
        'profile.targetWeightKg': 80,
        'profile.nutritionDirection': 'lose',
        'profile.currentWeightKg': 85,
      },
    },
  )
  const seeded = await ensureGoals(MEMBER.id, startDate)
  assert.ok(seeded.nutrition, 'ensureGoals seeded the nutrition goal')

  const { status, body } = await sendJson(weightPOST, 'POST', '/api/weight', MEMBER, {
    weight: 176, // in lbs = ~79.8 kg, inside finish band for 80 kg target
    unit: 'lbs',
    tz: 240,
  })
  assert.equal(status, 200, JSON.stringify(body))
  assertContract({
    label: 'POST /api/weight (with goalReached)',
    schema: LogWeightResponseSchema,
    body,
    expectKeys: ['success', 'date', 'applied', 'goalReached'],
  })
  const parsed = LogWeightResponseSchema.parse(body)
  assert.ok(parsed.goalReached)
  assert.equal(parsed.goalReached.pillar, 'nutrition')
  assert.equal(parsed.goalReached.direction, 'lose')
  assert.equal(parsed.goalReached.unit, 'lbs')
  assert.equal(parsed.goalReached.currentWeight, 176)
})

test('GET /api/streaks returns StreaksResponseSchema with all pillars and super freeze', async () => {
  const { status, body } = await getJson(streaksGET, '/api/streaks', MEMBER, { tz: '240' })
  coverage.mark('GET', '/api/streaks')
  assert.equal(status, 200, JSON.stringify(body))
  assertContract({
    label: 'GET /api/streaks',
    schema: StreaksResponseSchema,
    body,
    expectKeys: [
      'todayKey',
      'minVisible',
      'overall',
      'pillars.workout',
      'pillars.nutrition',
      'pillars.mindset',
      'pillars.super',
      'credits',
    ],
  })
})

test('POST /api/streaks/freeze refusal outcome (409) matches FreezeRefusalResponseSchema', async () => {
  const { status, body } = await sendJson(freezePOST, 'POST', '/api/streaks/freeze', MEMBER, {
    tz: 240,
  })
  coverage.mark('POST', '/api/streaks/freeze')
  assert.equal(status, 409, JSON.stringify(body))
  assertContract({
    label: 'POST /api/streaks/freeze (409 refusal)',
    schema: FreezeRefusalResponseSchema,
    body,
    expectKeys: ['error', 'reason', 'streaks'],
  })
})

test('POST /api/streaks/freeze success outcome (200) matches FreezeSuccessResponseSchema', async () => {
  const objectId = new mongoose.Types.ObjectId(MEMBER.id)
  const tz = 240
  const now = new Date()
  const localNowMs = now.getTime() - tz * 60_000
  const dayMs = 86_400_000
  const d1 = new Date(localNowMs - 1 * dayMs).toISOString().slice(0, 10)
  const d2 = new Date(localNowMs - 2 * dayMs).toISOString().slice(0, 10)
  const d3 = new Date(localNowMs - 3 * dayMs).toISOString().slice(0, 10)

  // Seed 3 consecutive completed days across all three pillars so super streak >= 3
  for (const dayKey of [d1, d2, d3]) {
    for (const pillar of ['workout', 'nutrition', 'mindset'] as const) {
      await StreakCredit.create({
        userId: objectId,
        kind: 'credit',
        pillar,
        dayKey,
        reason: 'contract test',
        createdBy: 'test',
      })
    }
  }

  const { status, body } = await sendJson(freezePOST, 'POST', '/api/streaks/freeze', MEMBER, {
    tz,
  })
  assert.equal(status, 200, JSON.stringify(body))
  assertContract({
    label: 'POST /api/streaks/freeze (200 success)',
    schema: FreezeSuccessResponseSchema,
    body,
    expectKeys: ['frozen', 'streaks'],
  })
})

test('GET /api/checkin returns CheckInResponseSchema', async () => {
  const { status, body } = await getJson(checkinGET, '/api/checkin', MEMBER, { tz: '240' })
  coverage.mark('GET', '/api/checkin')
  assert.equal(status, 200, JSON.stringify(body))
  assertContract({
    label: 'GET /api/checkin',
    schema: CheckInResponseSchema,
    body,
    expectKeys: [
      'due',
      'reason',
      'complete',
      'moodLoggedToday',
      'weightLoggedToday',
      'skippedToday',
    ],
  })
})

test('POST /api/checkin returns CheckInActionResponseSchema on action shown', async () => {
  const { status, body } = await sendJson(checkinPOST, 'POST', '/api/checkin', MEMBER, {
    action: 'shown',
    tz: 240,
  })
  coverage.mark('POST', '/api/checkin')
  assert.equal(status, 200, JSON.stringify(body))
  assertContract({
    label: 'POST /api/checkin',
    schema: CheckInActionResponseSchema,
    body,
    expectKeys: ['success'],
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// The coverage gate. Keep this last.
// ═══════════════════════════════════════════════════════════════════════════

test('every route NP-022 covers was actually called with its schema', () => {
  assertEveryRouteCovered(NP022_ROUTES, coverage)
  assert.equal(NP022_ROUTES.length, 7)
  assert.equal(coverage.list().length, 7)
})
