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
import Schedule from '../../models/Schedule'
import UserProgress from '../../models/UserProgress'
import { signToken } from '../../lib/auth'

let getHandler: (req: NextRequest) => Promise<Response>

before(async () => {
  const mod = await import('../../app/api/schedule/route')
  getHandler = mod.GET
})

function makeRequest(token: string): NextRequest {
  const headers = new Headers()
  headers.set('Authorization', `Bearer ${token}`)
  return new NextRequest('http://localhost/api/schedule', {
    method: 'GET',
    headers,
  })
}

test('static code structure: Schedule.updateOne self-heal write is awaited and errors are logged', () => {
  const routePath = path.resolve(__dirname, '../../app/api/schedule/route.ts')
  const content = fs.readFileSync(routePath, 'utf8')

  // Must not have unawaited catch(() => {}) fire-and-forget
  assert.ok(
    !content.includes('Schedule.updateOne({ _id: schedule._id }, { $set }).catch(() => {})'),
    'Unawaited fire-and-forget Schedule.updateOne with empty catch must be removed',
  )

  // Must await Schedule.updateOne
  assert.ok(
    content.includes('await Schedule.updateOne({ _id: schedule._id }, { $set })'),
    'Schedule.updateOne must be awaited',
  )

  // Must log write error to console.error
  assert.ok(
    content.includes('console.error('),
    'Write errors must be logged to console.error',
  )
})

test('(id: 9d6d293e) Schedule.updateOne at line 198 is properly awaited in GET handler', async () => {
  const userId = new mongoose.Types.ObjectId().toString()
  const scheduleId = new mongoose.Types.ObjectId()
  const token = await signToken({ userId, email: 'test@example.com' })

  let updateAwaited = false
  const updateCalls: Array<{ filter: Record<string, unknown>; update: Record<string, unknown> }> = []

  const futureDate = new Date(Date.now() + 86400000 * 2)

  const scheduleFindMock = mock.method(Schedule, 'find', () => ({
    lean: async () => [
      {
        _id: scheduleId,
        programId: 'prog-test',
        programName: 'Test Program',
        settings: { trainingDays: [1, 3, 5] },
        scheduledWorkouts: [
          {
            date: futureDate,
            status: 'missed',
            dayLabel: 'Day 1',
            phase: 1,
            workoutTitle: 'Workout 1',
          },
        ],
      },
    ],
  }))

  const userProgressFindMock = mock.method(UserProgress, 'findOne', () => ({
    lean: async () => ({
      userId,
      activePrograms: [{ programId: 'prog-test', status: 'in-progress' }],
    }),
  }))

  const updateOneMock = mock.method(Schedule, 'updateOne', async (filter: Record<string, unknown>, update: Record<string, unknown>) => {
    await new Promise((resolve) => setTimeout(resolve, 20))
    updateAwaited = true
    updateCalls.push({ filter, update })
    return { acknowledged: true, modifiedCount: 1 }
  })

  try {
    const res = await getHandler(makeRequest(token))
    assert.equal(res.status, 200)
    assert.equal(updateAwaited, true, 'Schedule.updateOne must be awaited before GET returns')
    assert.equal(updateCalls.length, 1)
    assert.equal(String(updateCalls[0].filter._id), String(scheduleId))
    const setOps = updateCalls[0].update.$set as Record<string, string>
    assert.equal(setOps['scheduledWorkouts.0.status'], 'scheduled')

    const json = (await res.json()) as { schedules: Array<{ scheduledWorkouts: Array<{ status: string }> }> }
    assert.ok(json.schedules && json.schedules.length === 1)
    assert.equal(json.schedules[0].scheduledWorkouts[0].status, 'scheduled')
  } finally {
    scheduleFindMock.mock.restore()
    userProgressFindMock.mock.restore()
    updateOneMock.mock.restore()
  }
})

test('(id: 9d6d293f) Errors during Schedule.updateOne self-heal are logged to console.error', async () => {
  const userId = new mongoose.Types.ObjectId().toString()
  const scheduleId = new mongoose.Types.ObjectId()
  const token = await signToken({ userId, email: 'test@example.com' })

  const loggedErrors: unknown[][] = []
  const originalConsoleError = console.error
  console.error = (...args: unknown[]) => {
    loggedErrors.push(args)
  }

  const futureDate = new Date(Date.now() + 86400000 * 2)

  const scheduleFindMock = mock.method(Schedule, 'find', () => ({
    lean: async () => [
      {
        _id: scheduleId,
        programId: 'prog-test',
        programName: 'Test Program',
        settings: { trainingDays: [1, 3, 5] },
        scheduledWorkouts: [
          {
            date: futureDate,
            status: 'missed',
            dayLabel: 'Day 1',
            phase: 1,
            workoutTitle: 'Workout 1',
          },
        ],
      },
    ],
  }))

  const userProgressFindMock = mock.method(UserProgress, 'findOne', () => ({
    lean: async () => ({
      userId,
      activePrograms: [{ programId: 'prog-test', status: 'in-progress' }],
    }),
  }))

  const updateOneMock = mock.method(Schedule, 'updateOne', async () => {
    await new Promise((resolve) => setTimeout(resolve, 10))
    throw new Error('Simulated database write error during self-heal')
  })

  try {
    const res = await getHandler(makeRequest(token))
    assert.equal(res.status, 200, 'GET handler should remain resilient and return 200 even on self-heal write failure')

    // Error must be logged via console.error
    assert.ok(
      loggedErrors.some((args) =>
        args.some((a: unknown) => {
          const message = a instanceof Error ? a.message : String(a)
          return message.includes('self-healing') || message.includes('Simulated database write error')
        }),
      ),
      'Write error must be logged via console.error',
    )

    const json = (await res.json()) as { schedules: Array<{ scheduledWorkouts: Array<{ status: string }> }> }
    assert.ok(json.schedules && json.schedules.length === 1)
    assert.equal(json.schedules[0].scheduledWorkouts[0].status, 'scheduled')
  } finally {
    console.error = originalConsoleError
    scheduleFindMock.mock.restore()
    userProgressFindMock.mock.restore()
    updateOneMock.mock.restore()
  }
})
