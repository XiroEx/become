// Run with: npm run test:file tests/unit/programs/start-date-route.test.ts

const g = globalThis as unknown as { mongoose?: { conn: unknown; promise: unknown } }
g.mongoose = { conn: { readyState: 1 }, promise: null }
;(process.env as Record<string, string | undefined>).NODE_ENV = 'test'
process.env.JWT_SECRET ||= 'become-unit-test-secret'
process.env.MONGODB_URI ||= 'mongodb://127.0.0.1:27017/become-test'

import { test, mock, before } from 'node:test'
import assert from 'node:assert/strict'
import mongoose from 'mongoose'
import { NextRequest } from 'next/server'
import UserProgress from '../../../models/UserProgress'
import Schedule from '../../../models/Schedule'
import ProgramModel from '../../../models/Program'
import { signToken } from '../../../lib/auth'

let putHandler: any

before(async () => {
  const g = globalThis as any
  g.mongoose = g.mongoose || { conn: null, promise: null }
  g.mongoose.conn = { readyState: 1 }
  const mod = await import('../../../app/api/programs/start-date/route')
  putHandler = (mod as any).PUT ?? (mod as any).default?.PUT
})

function makeRequest(body?: unknown, authHeader?: string): NextRequest {
  const headers = new Headers()
  if (authHeader) headers.set('Authorization', authHeader)
  if (body !== undefined) headers.set('Content-Type', 'application/json')
  return new NextRequest('http://localhost/api/programs/start-date', {
    method: 'PUT',
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })
}

async function authedHeader(userId: string) {
  const token = await signToken({ userId, email: 'test@example.com' })
  return `Bearer ${token}`
}

test('(id: 9d6d2a40) Whole-document schedule.save() calls in PUT handler are replaced with targeted Schedule.updateOne (program found in DB)', async () => {
  const userId = new mongoose.Types.ObjectId().toString()
  const token = await authedHeader(userId)
  const programId = 'hypertrophy-101'
  const newStartDateStr = '2026-07-06'
  const expectedStartDate = new Date(newStartDateStr + 'T00:00:00.000Z')

  let saveCalled = false
  const scheduleId = new mongoose.Types.ObjectId()
  const scheduleDoc: any = {
    _id: scheduleId,
    userId,
    programId,
    settings: {
      trainingDays: [1, 3, 5],
      startDate: new Date('2026-06-01T00:00:00.000Z'),
    },
    scheduledWorkouts: [
      {
        date: new Date('2026-06-01T00:00:00.000Z'),
        programId,
        phase: 1,
        dayLabel: 'Day 1',
        workoutTitle: 'Chest & Triceps',
        status: 'completed',
        completedAt: new Date('2026-06-01T10:00:00.000Z'),
      },
    ],
    save: async () => {
      saveCalled = true
    },
  }

  const programDoc = {
    program_id: programId,
    phases: [
      {
        phase: '1',
        weeks: '1',
        focus: 'Hypertrophy',
        workouts: [
          { day: 'Day 1', title: 'Chest & Triceps', exercises: [] },
          { day: 'Day 2', title: 'Back & Biceps', exercises: [] },
        ],
      },
    ],
  }

  const userProgressUpdateCalls: any[] = []
  const userProgressUpdateMock = mock.method(UserProgress, 'updateOne', async (filter: any, update: any) => {
    userProgressUpdateCalls.push({ filter, update })
    return { matchedCount: 1, modifiedCount: 1 }
  })
  const scheduleFindMock = mock.method(Schedule, 'findOne', async () => scheduleDoc)
  const programFindMock = mock.method(ProgramModel, 'findOne', () => ({
    lean: async () => programDoc,
  }))
  const scheduleUpdateCalls: any[] = []
  const scheduleUpdateMock = mock.method(Schedule, 'updateOne', async (filter: any, update: any) => {
    scheduleUpdateCalls.push({ filter, update })
    return { acknowledged: true, modifiedCount: 1 }
  })

  try {
    const req = makeRequest({ programId, startDate: newStartDateStr }, token)
    const res = await putHandler(req)
    assert.equal(res.status, 200)
    const json = await res.json()

    assert.equal(json.message, 'Start date updated and schedule regenerated')
    assert.equal(new Date(json.startDate).toISOString(), expectedStartDate.toISOString())
    assert.ok(json.totalScheduledWorkouts > 0)
    assert.ok(Array.isArray(scheduleUpdateCalls[0].update.$set.scheduledWorkouts))

    assert.equal(saveCalled, false, 'schedule.save() must NOT be called')
    assert.equal(scheduleUpdateCalls.length, 1)
    assert.deepEqual(scheduleUpdateCalls[0].filter, { _id: scheduleId })
    assert.equal(
      scheduleUpdateCalls[0].update.$set['settings.startDate'].toISOString(),
      expectedStartDate.toISOString()
    )
    assert.ok(scheduleUpdateCalls[0].update.$set.scheduledWorkouts.length > 0)
  } finally {
    userProgressUpdateMock.mock.restore()
    scheduleFindMock.mock.restore()
    programFindMock.mock.restore()
    scheduleUpdateMock.mock.restore()
  }
})

test('(id: 9d6d2a40) Whole-document schedule.save() calls in PUT handler are replaced with targeted Schedule.updateOne (program not in DB)', async () => {
  const userId = new mongoose.Types.ObjectId().toString()
  const token = await authedHeader(userId)
  const programId = 'legacy-program-not-in-db'
  const newStartDateStr = '2026-08-01'
  const expectedStartDate = new Date(newStartDateStr + 'T00:00:00.000Z')

  let saveCalled = false
  const scheduleId = new mongoose.Types.ObjectId()
  const scheduleDoc: any = {
    _id: scheduleId,
    userId,
    programId,
    settings: {
      trainingDays: [1, 3, 5],
      startDate: new Date('2026-06-01T00:00:00.000Z'),
    },
    scheduledWorkouts: [],
    save: async () => {
      saveCalled = true
    },
  }

  const userProgressUpdateCalls: any[] = []
  const userProgressUpdateMock = mock.method(UserProgress, 'updateOne', async (filter: any, update: any) => {
    userProgressUpdateCalls.push({ filter, update })
    return { matchedCount: 1, modifiedCount: 1 }
  })
  const scheduleFindMock = mock.method(Schedule, 'findOne', async () => scheduleDoc)
  const programFindMock = mock.method(ProgramModel, 'findOne', () => ({
    lean: async () => null,
  }))
  const scheduleUpdateCalls: any[] = []
  const scheduleUpdateMock = mock.method(Schedule, 'updateOne', async (filter: any, update: any) => {
    scheduleUpdateCalls.push({ filter, update })
    return { acknowledged: true, modifiedCount: 1 }
  })

  try {
    const req = makeRequest({ programId, startDate: newStartDateStr }, token)
    const res = await putHandler(req)
    assert.equal(res.status, 200)
    const json = await res.json()

    assert.equal(json.message, 'Start date updated')
    assert.equal(new Date(json.startDate).toISOString(), expectedStartDate.toISOString())

    assert.equal(saveCalled, false, 'schedule.save() must NOT be called')
    assert.equal(scheduleUpdateCalls.length, 1)
    assert.deepEqual(scheduleUpdateCalls[0].filter, { _id: scheduleId })
    assert.deepEqual(scheduleUpdateCalls[0].update, {
      $set: { 'settings.startDate': expectedStartDate },
    })
  } finally {
    userProgressUpdateMock.mock.restore()
    scheduleFindMock.mock.restore()
    programFindMock.mock.restore()
    scheduleUpdateMock.mock.restore()
  }
})

test('(id: 9d6d2a41) Errors during Schedule updates are logged to console.error (program found)', async () => {
  const userId = new mongoose.Types.ObjectId().toString()
  const token = await authedHeader(userId)
  const programId = 'hypertrophy-101'
  const newStartDateStr = '2026-07-06'

  const scheduleDoc: any = {
    _id: new mongoose.Types.ObjectId(),
    userId,
    programId,
    settings: {
      trainingDays: [1, 3, 5],
      startDate: new Date('2026-06-01T00:00:00.000Z'),
    },
    scheduledWorkouts: [],
  }

  const programDoc = {
    program_id: programId,
    phases: [
      {
        phase: '1',
        weeks: '1',
        focus: 'Hypertrophy',
        workouts: [{ day: 'Day 1', title: 'Chest', exercises: [] }],
      },
    ],
  }

  const loggedErrors: any[] = []
  const originalConsoleError = console.error
  console.error = (...args: any[]) => {
    loggedErrors.push(args)
  }

  const userProgressUpdateMock = mock.method(UserProgress, 'updateOne', async () => ({
    matchedCount: 1,
    modifiedCount: 1,
  }))
  const scheduleFindMock = mock.method(Schedule, 'findOne', async () => scheduleDoc)
  const programFindMock = mock.method(ProgramModel, 'findOne', () => ({
    lean: async () => programDoc,
  }))
  const dbError = new Error('Database write failure during Schedule.updateOne (with regen)')
  const scheduleUpdateMock = mock.method(Schedule, 'updateOne', async () => {
    throw dbError
  })

  try {
    const req = makeRequest({ programId, startDate: newStartDateStr }, token)
    const res = await putHandler(req)
    assert.equal(res.status, 500)
    const json = await res.json()
    assert.deepEqual(json, { error: 'Internal server error' })

    const foundErrorLog = loggedErrors.some((args) =>
      args.some(
        (arg: any) =>
          typeof arg === 'string' && arg.includes('PUT /api/programs/start-date update error:')
      )
    )
    assert.ok(foundErrorLog, 'console.error must log "PUT /api/programs/start-date update error:"')
  } finally {
    console.error = originalConsoleError
    userProgressUpdateMock.mock.restore()
    scheduleFindMock.mock.restore()
    programFindMock.mock.restore()
    scheduleUpdateMock.mock.restore()
  }
})

test('(id: 9d6d2a41) Errors during Schedule updates are logged to console.error (program not found)', async () => {
  const userId = new mongoose.Types.ObjectId().toString()
  const token = await authedHeader(userId)
  const programId = 'legacy-program-not-in-db'
  const newStartDateStr = '2026-08-01'

  const scheduleDoc: any = {
    _id: new mongoose.Types.ObjectId(),
    userId,
    programId,
    settings: {
      trainingDays: [1, 3, 5],
      startDate: new Date('2026-06-01T00:00:00.000Z'),
    },
    scheduledWorkouts: [],
  }

  const loggedErrors: any[] = []
  const originalConsoleError = console.error
  console.error = (...args: any[]) => {
    loggedErrors.push(args)
  }

  const userProgressUpdateMock = mock.method(UserProgress, 'updateOne', async () => ({
    matchedCount: 1,
    modifiedCount: 1,
  }))
  const scheduleFindMock = mock.method(Schedule, 'findOne', async () => scheduleDoc)
  const programFindMock = mock.method(ProgramModel, 'findOne', () => ({
    lean: async () => null,
  }))
  const dbError = new Error('Database write failure during Schedule.updateOne (without regen)')
  const scheduleUpdateMock = mock.method(Schedule, 'updateOne', async () => {
    throw dbError
  })

  try {
    const req = makeRequest({ programId, startDate: newStartDateStr }, token)
    const res = await putHandler(req)
    assert.equal(res.status, 500)
    const json = await res.json()
    assert.deepEqual(json, { error: 'Internal server error' })

    const foundErrorLog = loggedErrors.some((args) =>
      args.some(
        (arg: any) =>
          typeof arg === 'string' && arg.includes('PUT /api/programs/start-date update error:')
      )
    )
    assert.ok(foundErrorLog, 'console.error must log "PUT /api/programs/start-date update error:"')
  } finally {
    console.error = originalConsoleError
    userProgressUpdateMock.mock.restore()
    scheduleFindMock.mock.restore()
    programFindMock.mock.restore()
    scheduleUpdateMock.mock.restore()
  }
})

test('(id: 9d6d2a43) Response format and status codes remain unchanged', async () => {
  const userId = new mongoose.Types.ObjectId().toString()
  const token = await authedHeader(userId)

  // 1. 401 Unauthorized when unauthenticated
  const resUnauth = await putHandler(makeRequest({ programId: 'p1', startDate: '2026-07-01' }))
  assert.equal(resUnauth.status, 401)
  assert.equal((await resUnauth.json()).error, 'No token provided')

  // 2. 400 Bad Request when missing programId
  const resNoProgram = await putHandler(makeRequest({ startDate: '2026-07-01' }, token))
  assert.equal(resNoProgram.status, 400)
  assert.equal((await resNoProgram.json()).error, 'programId and startDate are required')

  // 3. 400 Bad Request when missing startDate
  const resNoDate = await putHandler(makeRequest({ programId: 'p1' }, token))
  assert.equal(resNoDate.status, 400)
  assert.equal((await resNoDate.json()).error, 'programId and startDate are required')

  // 4. 404 Not Found when activeProgram not in UserProgress
  const userProgressUpdateMock = mock.method(UserProgress, 'updateOne', async () => ({
    matchedCount: 0,
    modifiedCount: 0,
  }))
  try {
    const resNotFound = await putHandler(makeRequest({ programId: 'non-existent', startDate: '2026-07-01' }, token))
    assert.equal(resNotFound.status, 404)
    assert.equal((await resNotFound.json()).error, 'Program not found in your active programs')
  } finally {
    userProgressUpdateMock.mock.restore()
  }

  // 5. 200 OK when no schedule exists for user
  const userProgressSuccessMock = mock.method(UserProgress, 'updateOne', async () => ({
    matchedCount: 1,
    modifiedCount: 1,
  }))
  const scheduleFindNullMock = mock.method(Schedule, 'findOne', async () => null)
  try {
    const resNoSchedule = await putHandler(makeRequest({ programId: 'p-no-sched', startDate: '2026-07-01' }, token))
    assert.equal(resNoSchedule.status, 200)
    const json = await resNoSchedule.json()
    assert.deepEqual(json, {
      message: 'Start date updated',
      startDate: new Date('2026-07-01T00:00:00.000Z').toISOString(),
    })
  } finally {
    userProgressSuccessMock.mock.restore()
    scheduleFindNullMock.mock.restore()
  }
})
