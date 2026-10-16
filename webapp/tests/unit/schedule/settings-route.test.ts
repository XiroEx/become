// Run with: npm run test:file tests/unit/schedule/settings-route.test.ts

const g = globalThis as unknown as { mongoose?: { conn: unknown; promise: unknown } }
g.mongoose = { conn: { readyState: 1 }, promise: null }
;(process.env as Record<string, string | undefined>).NODE_ENV = 'test'
process.env.JWT_SECRET ||= 'become-unit-test-secret'
process.env.MONGODB_URI ||= 'mongodb://127.0.0.1:27017/become-test'

import { test, mock, before } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import mongoose from 'mongoose'
import { NextRequest } from 'next/server'
import Schedule from '../../../models/Schedule'
import ProgramModel from '../../../models/Program'
import UserProgress from '../../../models/UserProgress'
import { signToken } from '../../../lib/auth'

let putHandler: any

before(async () => {
  const g = globalThis as any
  g.mongoose = g.mongoose || { conn: null, promise: null }
  g.mongoose.conn = { readyState: 1 }
  const mod = await import('../../../app/api/schedule/settings/route')
  putHandler = (mod as any).PUT ?? (mod as any).default?.PUT
})

function makePutRequest(body?: unknown, authHeader?: string): NextRequest {
  const headers = new Headers()
  if (authHeader) headers.set('Authorization', authHeader)
  if (body !== undefined) headers.set('Content-Type', 'application/json')
  return new NextRequest('http://localhost/api/schedule/settings', {
    method: 'PUT',
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })
}

async function authedHeader(userId: string) {
  const token = await signToken({ userId, email: 'test@example.com' })
  return `Bearer ${token}`
}

test('(id: 9d6d2a48) Whole-document schedule.save() in PUT handler is replaced with targeted Schedule.updateOne', async () => {
  const userId = new mongoose.Types.ObjectId().toString()
  const scheduleId = new mongoose.Types.ObjectId()
  const token = await authedHeader(userId)
  const programId = 'prog-hypertrophy'

  // Test Case A: without startDate
  let saveCalled = false
  const scheduleDoc: any = {
    _id: scheduleId,
    userId: new mongoose.Types.ObjectId(userId),
    programId,
    settings: {
      trainingDays: [1, 3, 5],
      startDate: new Date('2026-01-01'),
    },
    scheduledWorkouts: [],
    save: async () => {
      saveCalled = true
    },
  }

  const findOneScheduleMock = mock.method(Schedule, 'findOne', async () => scheduleDoc)
  const findOneProgramMock = mock.method(ProgramModel, 'findOne', () => ({
    lean: async () => ({
      program_id: programId,
      phases: [],
    }),
  }))
  const updateOneUserProgressMock = mock.method(UserProgress, 'updateOne', async () => ({ acknowledged: true }))

  const updateOneScheduleCalls: any[] = []
  const updateOneScheduleMock = mock.method(Schedule, 'updateOne', async (filter: any, update: any) => {
    updateOneScheduleCalls.push({ filter, update })
    return { acknowledged: true, matchedCount: 1, modifiedCount: 1 }
  })

  try {
    const res = await putHandler(
      makePutRequest({ programId, trainingDays: [0, 2, 4] }, token)
    )
    assert.equal(res.status, 200)
    assert.equal(saveCalled, false, 'schedule.save() must NOT be called')
    assert.equal(updateOneScheduleCalls.length, 1, 'Schedule.updateOne must be called once')
    assert.deepEqual(updateOneScheduleCalls[0].filter, { _id: scheduleId })
    assert.deepEqual(updateOneScheduleCalls[0].update.$set['settings.trainingDays'], [0, 2, 4])
    assert.ok(Array.isArray(updateOneScheduleCalls[0].update.$set.scheduledWorkouts))
    assert.equal(updateOneScheduleCalls[0].update.$set['settings.startDate'], undefined)

    // Test Case B: with startDate
    saveCalled = false
    updateOneScheduleCalls.length = 0
    const newStartDate = '2026-11-01T00:00:00.000Z'
    const resWithStart = await putHandler(
      makePutRequest({ programId, trainingDays: [1, 3, 5], startDate: newStartDate }, token)
    )
    assert.equal(resWithStart.status, 200)
    assert.equal(saveCalled, false, 'schedule.save() must NOT be called')
    assert.equal(updateOneScheduleCalls.length, 1, 'Schedule.updateOne must be called once')
    assert.deepEqual(updateOneScheduleCalls[0].filter, { _id: scheduleId })
    assert.deepEqual(updateOneScheduleCalls[0].update.$set['settings.trainingDays'], [1, 3, 5])
    assert.deepEqual(updateOneScheduleCalls[0].update.$set['settings.startDate'], new Date(newStartDate))
  } finally {
    findOneScheduleMock.mock.restore()
    findOneProgramMock.mock.restore()
    updateOneUserProgressMock.mock.restore()
    updateOneScheduleMock.mock.restore()
  }
})

test('(id: 9d6d2a49) Errors during Schedule update are logged to console.error', async () => {
  const userId = new mongoose.Types.ObjectId().toString()
  const scheduleId = new mongoose.Types.ObjectId()
  const token = await authedHeader(userId)
  const programId = 'prog-hypertrophy'

  const scheduleDoc: any = {
    _id: scheduleId,
    userId: new mongoose.Types.ObjectId(userId),
    programId,
    settings: {
      trainingDays: [1, 3, 5],
      startDate: new Date('2026-01-01'),
    },
    scheduledWorkouts: [],
    save: async () => {},
  }

  const loggedErrors: any[] = []
  const originalConsoleError = console.error
  console.error = (...args: any[]) => {
    loggedErrors.push(args)
  }

  const findOneScheduleMock = mock.method(Schedule, 'findOne', async () => scheduleDoc)
  const findOneProgramMock = mock.method(ProgramModel, 'findOne', () => ({
    lean: async () => ({
      program_id: programId,
      phases: [],
    }),
  }))
  const updateOneUserProgressMock = mock.method(UserProgress, 'updateOne', async () => ({ acknowledged: true }))

  const simulatedDbError = new Error('Database write failure during Schedule.updateOne')
  const updateOneScheduleMock = mock.method(Schedule, 'updateOne', async () => {
    throw simulatedDbError
  })

  try {
    const res = await putHandler(
      makePutRequest({ programId, trainingDays: [1, 3, 5] }, token)
    )
    assert.equal(res.status, 500)
    const json = await res.json()
    assert.deepEqual(json, { error: 'Internal server error' })

    const foundErrorLog = loggedErrors.some((args) =>
      args.some((arg: any) =>
        typeof arg === 'string' && arg.includes('PUT /api/schedule/settings update error:')
      ) && args.includes(simulatedDbError)
    )
    assert.ok(foundErrorLog, 'console.error must log "PUT /api/schedule/settings update error:" with the error')
  } finally {
    console.error = originalConsoleError
    findOneScheduleMock.mock.restore()
    findOneProgramMock.mock.restore()
    updateOneUserProgressMock.mock.restore()
    updateOneScheduleMock.mock.restore()
  }
})

test('(id: 9d6d2a4a) The app/api/schedule/settings/route.ts entry is removed from ALLOWLIST in documentSaveParity.test.ts', async () => {
  const filePath = path.resolve(__dirname, '../documentSaveParity.test.ts')
  const fileContent = fs.readFileSync(filePath, 'utf-8')
  assert.ok(
    !fileContent.includes("'app/api/schedule/settings/route.ts'"),
    'ALLOWLIST in documentSaveParity.test.ts must not contain app/api/schedule/settings/route.ts'
  )
})

test('(id: 9d6d2a4b) Response format and status codes remain unchanged', async () => {
  const userId = new mongoose.Types.ObjectId().toString()
  const scheduleId = new mongoose.Types.ObjectId()
  const token = await authedHeader(userId)
  const programId = 'prog-hypertrophy'

  // 1. 401 Unauthorized
  const unauthRes = await putHandler(makePutRequest({ programId, trainingDays: [1, 2, 3] }))
  assert.equal(unauthRes.status, 401)
  const unauthJson = await unauthRes.json()
  assert.equal(typeof unauthJson.error, 'string')

  // 2. 400 Bad Request (missing programId)
  const noProgRes = await putHandler(makePutRequest({ trainingDays: [1, 2, 3] }, token))
  assert.equal(noProgRes.status, 400)
  assert.deepEqual(await noProgRes.json(), { error: 'programId and trainingDays are required' })

  // 3. 400 Bad Request (missing trainingDays)
  const noDaysRes = await putHandler(makePutRequest({ programId }, token))
  assert.equal(noDaysRes.status, 400)
  assert.deepEqual(await noDaysRes.json(), { error: 'programId and trainingDays are required' })

  // 4. 400 Bad Request (empty trainingDays array)
  const emptyDaysRes = await putHandler(makePutRequest({ programId, trainingDays: [] }, token))
  assert.equal(emptyDaysRes.status, 400)
  assert.deepEqual(await emptyDaysRes.json(), { error: 'trainingDays must be a non-empty array of day numbers (0-6)' })

  // 5. 400 Bad Request (non-array trainingDays)
  const invalidDaysRes = await putHandler(makePutRequest({ programId, trainingDays: 'monday' }, token))
  assert.equal(invalidDaysRes.status, 400)
  assert.deepEqual(await invalidDaysRes.json(), { error: 'trainingDays must be a non-empty array of day numbers (0-6)' })

  // 6. 404 Schedule not found
  const findOneScheduleNullMock = mock.method(Schedule, 'findOne', async () => null)
  try {
    const notFoundRes = await putHandler(makePutRequest({ programId, trainingDays: [1, 3, 5] }, token))
    assert.equal(notFoundRes.status, 404)
    assert.deepEqual(await notFoundRes.json(), { error: 'Schedule not found' })
  } finally {
    findOneScheduleNullMock.mock.restore()
  }

  // 7. 404 Program not found
  const scheduleDoc: any = {
    _id: scheduleId,
    userId: new mongoose.Types.ObjectId(userId),
    programId,
    settings: {
      trainingDays: [1, 3, 5],
      startDate: new Date('2026-01-01'),
    },
    scheduledWorkouts: [],
    save: async () => {},
  }
  const findOneScheduleMock = mock.method(Schedule, 'findOne', async () => scheduleDoc)
  const findOneProgramNullMock = mock.method(ProgramModel, 'findOne', () => ({
    lean: async () => null,
  }))
  try {
    const progNotFoundRes = await putHandler(makePutRequest({ programId, trainingDays: [1, 3, 5] }, token))
    assert.equal(progNotFoundRes.status, 404)
    assert.deepEqual(await progNotFoundRes.json(), { error: 'Program not found' })
  } finally {
    findOneScheduleMock.mock.restore()
    findOneProgramNullMock.mock.restore()
  }

  // 8. 200 Success response payload
  const findOneScheduleSuccessMock = mock.method(Schedule, 'findOne', async () => scheduleDoc)
  const findOneProgramSuccessMock = mock.method(ProgramModel, 'findOne', () => ({
    lean: async () => ({
      program_id: programId,
      phases: [],
    }),
  }))
  const updateOneUserProgressMock = mock.method(UserProgress, 'updateOne', async () => ({ acknowledged: true }))
  const updateOneScheduleMock = mock.method(Schedule, 'updateOne', async () => ({ acknowledged: true }))

  try {
    const successRes = await putHandler(makePutRequest({ programId, trainingDays: [1, 2, 4] }, token))
    assert.equal(successRes.status, 200)
    const successJson = await successRes.json()
    assert.equal(successJson.message, 'Schedule settings updated and future workouts regenerated')
    assert.ok(successJson.schedule)
    assert.equal(successJson.schedule.programId, programId)
    assert.deepEqual(successJson.schedule.settings.trainingDays, [1, 2, 4])
    assert.equal(typeof successJson.schedule.totalScheduledWorkouts, 'number')
    assert.equal(typeof successJson.schedule.pastWorkouts, 'number')
    assert.equal(typeof successJson.schedule.futureWorkouts, 'number')
  } finally {
    findOneScheduleSuccessMock.mock.restore()
    findOneProgramSuccessMock.mock.restore()
    updateOneUserProgressMock.mock.restore()
    updateOneScheduleMock.mock.restore()
  }
})
