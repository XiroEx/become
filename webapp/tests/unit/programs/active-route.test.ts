// Run with: npm run test:file tests/unit/programs/active-route.test.ts

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
import ProgramModel from '../../../models/Program'
import Schedule from '../../../models/Schedule'
import { signToken } from '../../../lib/auth'

let getHandler: any

before(async () => {
  const g = globalThis as any
  g.mongoose = g.mongoose || { conn: null, promise: null }
  g.mongoose.conn = { readyState: 1 }
  const mod = await import('../../../app/api/programs/active/route')
  getHandler = (mod as any).GET ?? (mod as any).default?.GET
})

function makeRequest(authHeader?: string): NextRequest {
  const headers = new Headers()
  if (authHeader) headers.set('Authorization', authHeader)
  return new NextRequest('http://localhost/api/programs/active', {
    method: 'GET',
    headers,
  })
}

async function authedHeader(userId: string) {
  const token = await signToken({ userId, email: 'test@example.com' })
  return `Bearer ${token}`
}

test('(id: 9d6d2937) UserProgress.updateOne at line 33 is properly awaited with error logging', async () => {
  const userId = new mongoose.Types.ObjectId().toString()
  const token = await authedHeader(userId)

  let updateAwaited = false
  const updateCalls: any[] = []
  const loggedErrors: any[] = []

  const originalConsoleError = console.error
  console.error = (...args: any[]) => {
    loggedErrors.push(args)
  }

  const findOneMock = mock.method(UserProgress, 'findOne', () => ({
    lean: async () => ({
      userId,
      activePrograms: [
        {
          programId: 'orphaned-prog',
          programName: 'Orphaned Program',
          startDate: new Date('2026-01-01'),
          currentPhase: 1,
          currentDay: 'Day 1',
          completedWorkouts: 0,
          totalWorkouts: 10,
          status: 'in-progress',
        },
      ],
      workoutLogs: [],
    }),
  }))

  // Existing programs does not include 'orphaned-prog', so it is treated as orphaned
  const programFindMock = mock.method(ProgramModel, 'find', () => ({
    lean: async () => [],
  }))

  const scheduleFindMock = mock.method(Schedule, 'find', () => ({
    lean: () => Promise.resolve([]),
  }))

  const updateOneMock = mock.method(UserProgress, 'updateOne', async (filter: any, update: any) => {
    await new Promise((resolve) => setTimeout(resolve, 20))
    updateAwaited = true
    updateCalls.push({ filter, update })
    throw new Error('Simulated DB failure on cleanup')
  })

  try {
    const res = await getHandler(makeRequest(token))
    assert.equal(res.status, 200)
    assert.equal(updateAwaited, true, 'UserProgress.updateOne must be awaited before response completes')
    assert.equal(updateCalls.length, 1)
    assert.deepEqual(updateCalls[0].filter, { userId })
    assert.deepEqual(updateCalls[0].update, {
      $pull: {
        activePrograms: { programId: { $in: ['orphaned-prog'] } },
        workoutLogs: { programId: { $in: ['orphaned-prog'] } },
      },
    })

    // Error must be logged via console.error
    assert.ok(
      loggedErrors.some((args) =>
        args.some((a: any) => String(a).includes('Error cleaning up orphaned active programs') || String(a?.message).includes('Simulated DB failure')),
      ),
      'Write error must be logged via console.error',
    )

    const json = await res.json()
    assert.deepEqual(json.activePrograms, [])
  } finally {
    console.error = originalConsoleError
    findOneMock.mock.restore()
    programFindMock.mock.restore()
    scheduleFindMock.mock.restore()
    updateOneMock.mock.restore()
  }
})

test('(id: 9d6d2938) UserProgress.updateOne at line 116 is properly awaited with error logging', async () => {
  const userId = new mongoose.Types.ObjectId().toString()
  const token = await authedHeader(userId)

  let updateAwaited = false
  const updateCalls: any[] = []
  const loggedErrors: any[] = []

  const originalConsoleError = console.error
  console.error = (...args: any[]) => {
    loggedErrors.push(args)
  }

  const findOneMock = mock.method(UserProgress, 'findOne', () => ({
    lean: async () => ({
      userId,
      activePrograms: [
        {
          programId: 'prog-1',
          programName: 'Program 1',
          startDate: new Date('2026-01-01'),
          currentPhase: 1,
          currentDay: 'Day 1',
          completedWorkouts: 0,
          totalWorkouts: 2,
          status: 'completed', // Marked completed in UserProgress
        },
      ],
      workoutLogs: [],
    }),
  }))

  const programFindMock = mock.method(ProgramModel, 'find', () => ({
    lean: async () => [{ program_id: 'prog-1' }],
  }))

  // Schedule has 2 workouts, 0 completed, so remaining = 2 > 0 -> should self-heal to in-progress
  const scheduleFindMock = mock.method(Schedule, 'find', () => ({
    lean: () => Promise.resolve([
      {
        programId: 'prog-1',
        scheduledWorkouts: [
          { status: 'scheduled', dayLabel: 'Day 1', date: new Date('2026-01-01') },
          { status: 'scheduled', dayLabel: 'Day 2', date: new Date('2026-01-02') },
        ],
      },
    ]),
  }))

  const updateOneMock = mock.method(UserProgress, 'updateOne', async (filter: any, update: any) => {
    await new Promise((resolve) => setTimeout(resolve, 20))
    updateAwaited = true
    updateCalls.push({ filter, update })
    throw new Error('Simulated DB failure on self-heal in-progress')
  })

  try {
    const res = await getHandler(makeRequest(token))
    assert.equal(res.status, 200)
    assert.equal(updateAwaited, true, 'UserProgress.updateOne must be awaited before response completes')
    assert.equal(updateCalls.length, 1)
    assert.deepEqual(updateCalls[0].filter, { userId, 'activePrograms.programId': 'prog-1' })
    assert.deepEqual(updateCalls[0].update, { $set: { 'activePrograms.$.status': 'in-progress' } })

    assert.ok(
      loggedErrors.some((args) =>
        args.some((a: any) => String(a).includes('Error restoring active program status') || String(a?.message).includes('Simulated DB failure')),
      ),
      'Write error must be logged via console.error',
    )

    const json = await res.json()
    assert.equal(json.activePrograms.length, 1)
    assert.equal(json.activePrograms[0].status, 'in-progress')
  } finally {
    console.error = originalConsoleError
    findOneMock.mock.restore()
    programFindMock.mock.restore()
    scheduleFindMock.mock.restore()
    updateOneMock.mock.restore()
  }
})

test('(id: 9d6d2939) UserProgress.updateOne at line 128 is properly awaited with error logging', async () => {
  const userId = new mongoose.Types.ObjectId().toString()
  const token = await authedHeader(userId)

  let updateAwaited = false
  const updateCalls: any[] = []
  const loggedErrors: any[] = []

  const originalConsoleError = console.error
  console.error = (...args: any[]) => {
    loggedErrors.push(args)
  }

  const findOneMock = mock.method(UserProgress, 'findOne', () => ({
    lean: async () => ({
      userId,
      activePrograms: [
        {
          programId: 'prog-2',
          programName: 'Program 2',
          startDate: new Date('2026-01-01'),
          currentPhase: 1,
          currentDay: 'Day 1',
          completedWorkouts: 2,
          totalWorkouts: 2,
          status: 'in-progress',
        },
      ],
      workoutLogs: [],
    }),
  }))

  const programFindMock = mock.method(ProgramModel, 'find', () => ({
    lean: async () => [{ program_id: 'prog-2' }],
  }))

  // All workouts completed: totalWorkouts = 2, completedWorkouts = 2 -> forward self-heal to completed
  const scheduleFindMock = mock.method(Schedule, 'find', () => ({
    lean: () => Promise.resolve([
      {
        programId: 'prog-2',
        scheduledWorkouts: [
          { status: 'completed', dayLabel: 'Day 1', date: new Date('2026-01-01') },
          { status: 'completed', dayLabel: 'Day 2', date: new Date('2026-01-02') },
        ],
      },
    ]),
  }))

  const updateOneMock = mock.method(UserProgress, 'updateOne', async (filter: any, update: any) => {
    await new Promise((resolve) => setTimeout(resolve, 20))
    updateAwaited = true
    updateCalls.push({ filter, update })
    throw new Error('Simulated DB failure on forward self-heal completed')
  })

  try {
    const res = await getHandler(makeRequest(token))
    assert.equal(res.status, 200)
    assert.equal(updateAwaited, true, 'UserProgress.updateOne must be awaited before response completes')
    assert.equal(updateCalls.length, 1)
    assert.deepEqual(updateCalls[0].filter, { userId, 'activePrograms.programId': 'prog-2' })
    assert.deepEqual(updateCalls[0].update, { $set: { 'activePrograms.$.status': 'completed' } })

    assert.ok(
      loggedErrors.some((args) =>
        args.some((a: any) => String(a).includes('Error auto-completing active program status') || String(a?.message).includes('Simulated DB failure')),
      ),
      'Write error must be logged via console.error',
    )

    const json = await res.json()
    // Truly completed programs are excluded from active programs list
    assert.equal(json.activePrograms.length, 0)
  } finally {
    console.error = originalConsoleError
    findOneMock.mock.restore()
    programFindMock.mock.restore()
    scheduleFindMock.mock.restore()
    updateOneMock.mock.restore()
  }
})

test('(id: 9d6d293a) Existing unit tests pass and response contract is unchanged', async () => {
  const userId = new mongoose.Types.ObjectId().toString()
  const token = await authedHeader(userId)

  const findOneMock = mock.method(UserProgress, 'findOne', () => ({
    lean: async () => ({
      userId,
      activePrograms: [
        {
          programId: 'prog-active',
          programName: 'Active Strength',
          startDate: new Date('2026-01-01'),
          currentPhase: 1,
          currentDay: 'Day 2',
          completedWorkouts: 1,
          totalWorkouts: 4,
          status: 'in-progress',
          lastWorkoutDate: new Date('2026-01-02'),
        },
      ],
      workoutLogs: [],
    }),
  }))

  const programFindMock = mock.method(ProgramModel, 'find', () => ({
    lean: async () => [{ program_id: 'prog-active' }],
  }))

  const scheduleFindMock = mock.method(Schedule, 'find', () => ({
    lean: () => Promise.resolve([
      {
        programId: 'prog-active',
        scheduledWorkouts: [
          { status: 'completed', dayLabel: 'Day 1', date: new Date('2026-01-01') },
          { status: 'scheduled', dayLabel: 'Day 2', date: new Date('2026-01-02') },
          { status: 'scheduled', dayLabel: 'Day 3', date: new Date('2026-01-03') },
          { status: 'rest', dayLabel: 'Rest', date: new Date('2026-01-04') },
        ],
      },
    ]),
  }))

  try {
    const res = await getHandler(makeRequest(token))
    assert.equal(res.status, 200)
    const json = await res.json()

    assert.ok(Array.isArray(json.activePrograms))
    assert.equal(json.activePrograms.length, 1)

    const program = json.activePrograms[0]
    const keys = Object.keys(program).sort()
    assert.deepEqual(keys, [
      'completedWorkouts',
      'currentDay',
      'currentPhase',
      'lastWorkoutDate',
      'programId',
      'programName',
      'progress',
      'startDate',
      'status',
      'totalWorkouts',
    ])

    assert.equal(program.programId, 'prog-active')
    assert.equal(program.programName, 'Active Strength')
    assert.equal(program.completedWorkouts, 1)
    assert.equal(program.totalWorkouts, 3) // 3 non-rest sessions
    assert.equal(program.progress, 33) // 1 / 3 = 33%
    assert.equal(program.status, 'in-progress')
  } finally {
    findOneMock.mock.restore()
    programFindMock.mock.restore()
    scheduleFindMock.mock.restore()
  }
})
