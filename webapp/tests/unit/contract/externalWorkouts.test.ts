// Run with: npm run test:file tests/unit/contract/externalWorkouts.test.ts
//
// TRACKED WORKOUTS DONE OUTSIDE BECOME, CHECKED AGAINST THE SHARED SCHEMAS
// (card 6adf69c7, Part B).
//
// Read tests/unit/contract/_contract.ts first — it explains why the schemas are
// imported by RELATIVE path, why "it parses" is not the whole check, and what a
// domain file has to end with.
//
// The phone's launch sync POSTs every tracked session Health offers and both
// calendars GET them back, all through `shared/api-client`'s
// `externalWorkouts` schemas. Both halves are called for real here — the
// exported handler, a signed token, the loopback test database.
//
// ITS OWN FIXTURES, ON PURPOSE. The runner executes test FILES in parallel, so
// this file uses its own member (`@external.contract.test`) rather than the
// shared np015 pair.

import { test, before, after } from 'node:test'
import mongoose from 'mongoose'

import { GET as externalGET, POST as externalPOST } from '../../../app/api/workouts/external/route'

import {
  ExternalWorkoutsImportRequestSchema,
  ExternalWorkoutsImportResponseSchema,
  ExternalWorkoutsResponseSchema,
  type ExternalWorkoutsImportRequest,
} from '../../../../shared/api-client/src/schemas/externalWorkouts'

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
import { signToken } from '../../../lib/auth'

const ROUTES: readonly ContractRoute[] = [
  { method: 'POST', path: '/api/workouts/external', schema: 'ExternalWorkoutsImportResponseSchema', note: 'per-item applied / duplicate / error' },
  { method: 'GET', path: '/api/workouts/external', schema: 'ExternalWorkoutsResponseSchema', note: 'inclusive range of local days' },
]

const coverage = new Coverage()

const MEMBER: ContractMember = {
  id: '6ab0e70000000000000f7ee0',
  email: 'plus@external.contract.test',
  label: 'plus',
  auth: '',
}

const DAY_MS = 86_400_000

/** UTC day keys: no `tz` is sent on the reads, so "today" is the UTC day. */
function dayKey(n: number): string {
  const d = new Date()
  d.setUTCHours(0, 0, 0, 0)
  return new Date(d.getTime() + n * DAY_MS).toISOString().slice(0, 10)
}

async function clean(): Promise<void> {
  const objectId = new mongoose.Types.ObjectId(MEMBER.id)
  await User.deleteMany({ $or: [{ _id: objectId }, { email: MEMBER.email }] })
  await UserProgress.deleteMany({ userId: MEMBER.id })
}

before(async () => {
  process.env.JWT_SECRET ||= 'become-unit-test-secret'
  await mongoose.connect(process.env.MONGODB_URI ?? 'mongodb://127.0.0.1:27017/become-test')
  await clean()
  await User.create({
    _id: new mongoose.Types.ObjectId(MEMBER.id),
    email: MEMBER.email,
    password: 'contract-test-unused',
    name: 'Contract External',
    tier: 'plus',
  })
  MEMBER.auth = `Bearer ${await signToken({ userId: MEMBER.id, email: MEMBER.email })}`
})

after(async () => {
  await clean()
  await mongoose.disconnect()
})

test('POST /api/workouts/external answers per item, in the shared shape', async () => {
  const yesterday = dayKey(-1)
  const body: ExternalWorkoutsImportRequest = {
    tz: 0,
    workouts: [
      {
        source: 'healthkit',
        externalId: 'CONTRACT-HK-1',
        date: yesterday,
        startedAt: `${yesterday}T12:00:00.000Z`,
        endedAt: `${yesterday}T12:40:00.000Z`,
        activityType: 'Walking',
        activityName: 'Walking',
        durationMin: 40,
        distanceKm: 3.1,
        energyKcal: 150,
        originApp: 'Whoop',
      },
      {
        source: 'health-connect',
        externalId: 'CONTRACT-HC-1',
        // Refused on its own: no future days.
        date: dayKey(2),
        startedAt: `${yesterday}T12:00:00.000Z`,
        endedAt: `${yesterday}T12:40:00.000Z`,
      },
    ],
  }
  // What the phone sends parses as the shared request.
  ExternalWorkoutsImportRequestSchema.parse(body)

  const first = await sendJson(externalPOST, 'POST', '/api/workouts/external', MEMBER, body)
  coverage.mark('POST', '/api/workouts/external')
  assertContract({
    label: 'POST /api/workouts/external',
    schema: ExternalWorkoutsImportResponseSchema,
    body: first.body,
    expectKeys: ['success', 'results.0.applied', 'results.0.date', 'results.0.externalId', 'results.1.error'],
  })

  const again = await sendJson(externalPOST, 'POST', '/api/workouts/external', MEMBER, { tz: 0, workouts: [body.workouts[0]] })
  assertContract({
    label: 'POST /api/workouts/external (re-delivery)',
    schema: ExternalWorkoutsImportResponseSchema,
    body: again.body,
    expectKeys: ['results.0.duplicate'],
  })

  // A session from today credits the streak, which adds `streak`.
  const today = dayKey(0)
  const withStreak = await sendJson(externalPOST, 'POST', '/api/workouts/external', MEMBER, {
    tz: 0,
    workouts: [{
      source: 'healthkit',
      externalId: 'CONTRACT-HK-TODAY',
      date: today,
      startedAt: new Date(Date.now() - 50 * 60_000).toISOString(),
      endedAt: new Date(Date.now() - 5 * 60_000).toISOString(),
      activityType: 'Running',
      activityName: 'Running',
    }],
  })
  assertContract({
    label: 'POST /api/workouts/external (today)',
    schema: ExternalWorkoutsImportResponseSchema,
    body: withStreak.body,
    expectKeys: ['streak.streakDays', 'streak.streakExtended'],
  })
})

test('GET /api/workouts/external answers the calendar read in the shared shape', async () => {
  const res = await getJson(externalGET, '/api/workouts/external', MEMBER, { from: dayKey(-7), to: dayKey(0) })
  coverage.mark('GET', '/api/workouts/external')
  assertContract({
    label: 'GET /api/workouts/external',
    schema: ExternalWorkoutsResponseSchema,
    body: res.body,
    expectKeys: [
      'from',
      'to',
      'workouts.0.date',
      'workouts.0.activityName',
      'workouts.0.durationMin',
      'workouts.0.startedAt',
      'workouts.0.originApp',
      'workouts.0.distanceKm',
      'workouts.0.energyKcal',
      'workouts.0.source',
    ],
  })
})

test('every declared external-workouts route was called', () => {
  assertEveryRouteCovered(ROUTES, coverage)
})
