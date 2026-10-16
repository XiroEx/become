/**
 * Tests for Schedule self-healing write-back in GET /api/schedule
 * Run with: npm run test:file tests/unit/scheduleSelfHealAwait.test.ts
 */

const g = globalThis as unknown as { mongoose?: { conn: unknown; promise: unknown } }
g.mongoose = { conn: { readyState: 1 }, promise: null }
;(process.env as Record<string, string | undefined>).NODE_ENV = 'test'
process.env.JWT_SECRET ||= 'become-unit-test-secret'
process.env.MONGODB_URI ||= 'mongodb://127.0.0.1:27017/become-test'

import { test, mock, before } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { NextRequest } from 'next/server'
import Schedule from '../../models/Schedule'
import UserProgress from '../../models/UserProgress'
import { signToken } from '../../lib/auth'

const USER_ID = '65f00000000000000000bb11'
const SCHEDULE_ID = '65f00000000000000000bb22'

let getSchedule: (req: NextRequest) => Promise<Response>

before(async () => {
  const mod = await import('../../app/api/schedule/route')
  getSchedule = mod.GET
})

async function makeAuthToken(userId = USER_ID) {
  return `Bearer ${await signToken({ userId, email: 'schedule-self-heal-test@example.com' })}`
}

function makeScheduleRequest(token: string): NextRequest {
  return new NextRequest('http://localhost/api/schedule', {
    method: 'GET',
    headers: new Headers({
      Authorization: token,
    }),
  })
}

function makeFutureMissedSchedule() {
  const futureDate = new Date(Date.now() + 86400000 * 3) // 3 days in future
  return {
    _id: SCHEDULE_ID,
    userId: USER_ID,
    programId: 'prog-1',
    programName: 'Hypertrophy Program',
    settings: {},
    scheduledWorkouts: [
      {
        date: futureDate,
        programId: 'prog-1',
        dayLabel: 'Day 1',
        status: 'missed', // Future date marked missed -> should be self-healed
        phase: 1,
        workoutTitle: 'Chest & Back',
      },
    ],
  }
}

// ── Static code assertions ───────────────────────────────────────────────────

test('GET /api/schedule awaits Schedule.updateOne and logs errors', () => {
  const code = fs.readFileSync(
    path.join(__dirname, '../../app/api/schedule/route.ts'),
    'utf8',
  )
  // Ensure Schedule.updateOne is awaited in self-healing logic
  assert.match(code, /await\s+Schedule\.updateOne\s*\(\s*\{\s*_id:\s*schedule\._id\s*\}\s*,\s*\{\s*\$set\s*\}\s*\)/)
  // Ensure errors are logged to console.error
  assert.match(code, /console\.error\s*\(/)
  // Ensure no unhandled swallow .catch(() => {}) on that update
  assert.doesNotMatch(code, /Schedule\.updateOne\(\s*\{\s*_id:\s*schedule\._id\s*\}\s*,\s*\{\s*\$set\s*\}\s*\)\.catch\(\(\)\s*=>\s*\{\s*\}\)/)
})

// ── Acceptance criteria tests ────────────────────────────────────────────────

test('(id: 9d6d293e) Schedule.updateOne at line 198 is properly awaited in GET handler', async () => {
  const token = await makeAuthToken()
  const mockSchedule = makeFutureMissedSchedule()

  mock.method(Schedule, 'find', () => ({
    lean: () => Promise.resolve([mockSchedule]),
  }))
  mock.method(UserProgress, 'findOne', () => ({
    lean: () => Promise.resolve({ activePrograms: [{ programId: 'prog-1', status: 'in-progress' }] }),
  }))

  let updateFinished = false
  let updateArgs: unknown[] = []
  mock.method(Schedule, 'updateOne', async (...args: unknown[]) => {
    updateArgs = args
    await new Promise((r) => setTimeout(r, 40))
    updateFinished = true
    return { acknowledged: true }
  })

  const res = await getSchedule(makeScheduleRequest(token))
  assert.equal(res.status, 200)
  const data = (await res.json()) as { schedules: Array<{ scheduledWorkouts: Array<{ status: string }> }> }
  assert.equal(data.schedules[0].scheduledWorkouts[0].status, 'scheduled')
  assert.equal(updateFinished, true, 'Expected Schedule.updateOne to be awaited before response is returned')
  assert.deepEqual(updateArgs[0], { _id: SCHEDULE_ID })
  assert.deepEqual(updateArgs[1], { $set: { 'scheduledWorkouts.0.status': 'scheduled' } })
})

test('(id: 9d6d293f) Errors during Schedule.updateOne self-heal are logged to console.error', async () => {
  const token = await makeAuthToken()
  const mockSchedule = makeFutureMissedSchedule()

  mock.method(Schedule, 'find', () => ({
    lean: () => Promise.resolve([mockSchedule]),
  }))
  mock.method(UserProgress, 'findOne', () => ({
    lean: () => Promise.resolve({ activePrograms: [{ programId: 'prog-1', status: 'in-progress' }] }),
  }))

  const writeError = new Error('Database write simulated failure')
  mock.method(Schedule, 'updateOne', async () => {
    throw writeError
  })

  let loggedError: unknown[] | null = null
  const origError = console.error
  console.error = (...args: unknown[]) => {
    loggedError = args
  }

  try {
    const res = await getSchedule(makeScheduleRequest(token))
    assert.equal(res.status, 200, 'Response should succeed with status 200 despite write failure')
    const data = (await res.json()) as { schedules: Array<{ scheduledWorkouts: Array<{ status: string }> }> }
    assert.equal(data.schedules[0].scheduledWorkouts[0].status, 'scheduled')
    assert.ok(loggedError, 'Expected write failure to be logged with console.error')
    assert.match(String(loggedError[0]), /Failed to persist schedule self-heal|Error/)
    assert.equal(loggedError[1], writeError)
  } finally {
    console.error = origError
  }
})
