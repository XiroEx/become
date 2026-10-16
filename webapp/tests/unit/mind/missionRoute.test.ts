// Run with: npm run test:file tests/unit/mind/missionRoute.test.ts

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
import Mission from '../../../models/Mission'
import { signToken } from '../../../lib/auth'
import { localDateKey } from '../../../lib/dayWindow'

const DAY_MS = 86_400_000
const TEST_USER_ID = new mongoose.Types.ObjectId().toString()
let patchHandler: (req: NextRequest) => Promise<Response>

before(async () => {
  const glob = globalThis as unknown as { mongoose?: { conn: { readyState: number } | null; promise: unknown } }
  glob.mongoose = glob.mongoose || { conn: null, promise: null }
  glob.mongoose.conn = { readyState: 1 }
  const mod = await import('../../../app/api/mind/mission/route')
  patchHandler = mod.PATCH
})

async function authedToken(userId = TEST_USER_ID) {
  const token = await signToken({ userId, email: 'mission-test@example.com' })
  return `Bearer ${token}`
}

function makePatchRequest(body: unknown, authHeader?: string): NextRequest {
  const headers = new Headers()
  if (authHeader) headers.set('Authorization', authHeader)
  headers.set('Content-Type', 'application/json')
  return new NextRequest('http://localhost/api/mind/mission', {
    method: 'PATCH',
    headers,
    body: JSON.stringify(body),
  })
}

interface MockMissionDoc {
  _id: mongoose.Types.ObjectId
  userId: string
  momentumStreak: number
  longestMomentumStreak: number
  lastMovedKey: string | null
  save: () => Promise<void>
}

// ── Acceptance: 9d6d2a50 (Whole-document doc.save() replaced with Mission.updateOne) ──

test('(id: 9d6d2a50) Whole-document doc.save() in PATCH handler is replaced with targeted Mission.updateOne', async () => {
  const token = await authedToken()
  const docId = new mongoose.Types.ObjectId()
  const tz = 0
  const today = localDateKey(null, tz)
  const yesterday = localDateKey(null, tz, new Date(Date.now() - DAY_MS))

  let saveCalled = false
  const mockDoc: MockMissionDoc = {
    _id: docId,
    userId: TEST_USER_ID,
    momentumStreak: 3,
    longestMomentumStreak: 5,
    lastMovedKey: yesterday,
    save: async () => {
      saveCalled = true
    },
  }

  const updateOneCalls: Array<{ filter: unknown; update: unknown }> = []
  const findOneMock = mock.method(Mission, 'findOne', async () => mockDoc)
  const updateOneMock = mock.method(Mission, 'updateOne', async (filter: unknown, update: unknown) => {
    updateOneCalls.push({ filter, update })
    return { acknowledged: true, modifiedCount: 1 }
  })

  try {
    const res = await patchHandler(makePatchRequest({ action: 'move', tz }, token))
    assert.equal(res.status, 200)
    const json = await res.json()
    assert.deepEqual(json, {
      momentum: {
        streak: 4,
        longest: 5,
        movedToday: true,
      },
    })

    assert.equal(saveCalled, false, 'doc.save() must NOT be called')
    assert.equal(updateOneCalls.length, 1, 'Mission.updateOne must be called once')
    assert.deepEqual(updateOneCalls[0].filter, { _id: docId })
    assert.deepEqual(updateOneCalls[0].update, {
      $set: {
        momentumStreak: 4,
        lastMovedKey: today,
        longestMomentumStreak: 5,
      },
    })
  } finally {
    findOneMock.mock.restore()
    updateOneMock.mock.restore()
  }
})

test('(id: 9d6d2a50) Streak resets to 1 when moving after a missed day and updates longest', async () => {
  const token = await authedToken()
  const docId = new mongoose.Types.ObjectId()
  const tz = 0
  const today = localDateKey(null, tz)
  const olderDay = localDateKey(null, tz, new Date(Date.now() - 3 * DAY_MS))

  let saveCalled = false
  const mockDoc: MockMissionDoc = {
    _id: docId,
    userId: TEST_USER_ID,
    momentumStreak: 5,
    longestMomentumStreak: 5,
    lastMovedKey: olderDay,
    save: async () => {
      saveCalled = true
    },
  }

  const updateOneCalls: Array<{ filter: unknown; update: unknown }> = []
  const findOneMock = mock.method(Mission, 'findOne', async () => mockDoc)
  const updateOneMock = mock.method(Mission, 'updateOne', async (filter: unknown, update: unknown) => {
    updateOneCalls.push({ filter, update })
    return { acknowledged: true, modifiedCount: 1 }
  })

  try {
    const res = await patchHandler(makePatchRequest({ action: 'move', tz }, token))
    assert.equal(res.status, 200)
    const json = await res.json()
    assert.deepEqual(json, {
      momentum: {
        streak: 1,
        longest: 5,
        movedToday: true,
      },
    })

    assert.equal(saveCalled, false, 'doc.save() must NOT be called')
    assert.equal(updateOneCalls.length, 1)
    assert.deepEqual(updateOneCalls[0].update, {
      $set: {
        momentumStreak: 1,
        lastMovedKey: today,
        longestMomentumStreak: 5,
      },
    })
  } finally {
    findOneMock.mock.restore()
    updateOneMock.mock.restore()
  }
})

test('(id: 9d6d2a50) Moving a second time on the same day is idempotent and does not update DB', async () => {
  const token = await authedToken()
  const docId = new mongoose.Types.ObjectId()
  const tz = 0
  const today = localDateKey(null, tz)

  let saveCalled = false
  const mockDoc: MockMissionDoc = {
    _id: docId,
    userId: TEST_USER_ID,
    momentumStreak: 4,
    longestMomentumStreak: 6,
    lastMovedKey: today,
    save: async () => {
      saveCalled = true
    },
  }

  const updateOneCalls: Array<{ filter: unknown; update: unknown }> = []
  const findOneMock = mock.method(Mission, 'findOne', async () => mockDoc)
  const updateOneMock = mock.method(Mission, 'updateOne', async (filter: unknown, update: unknown) => {
    updateOneCalls.push({ filter, update })
    return { acknowledged: true, modifiedCount: 1 }
  })

  try {
    const res = await patchHandler(makePatchRequest({ action: 'move', tz }, token))
    assert.equal(res.status, 200)
    const json = await res.json()
    assert.deepEqual(json, {
      momentum: {
        streak: 4,
        longest: 6,
        movedToday: true,
      },
    })

    assert.equal(saveCalled, false)
    assert.equal(updateOneCalls.length, 0, 'Mission.updateOne must not be called when already moved today')
  } finally {
    findOneMock.mock.restore()
    updateOneMock.mock.restore()
  }
})

// ── Acceptance: 9d6d2a51 (Errors during Mission update are logged to console.error) ──

test('(id: 9d6d2a51) Errors during Mission update are logged to console.error', async () => {
  const token = await authedToken()
  const docId = new mongoose.Types.ObjectId()
  const tz = 0

  const mockDoc: MockMissionDoc = {
    _id: docId,
    userId: TEST_USER_ID,
    momentumStreak: 2,
    longestMomentumStreak: 2,
    lastMovedKey: null,
    save: async () => {},
  }

  const loggedErrors: unknown[][] = []
  const originalConsoleError = console.error
  console.error = (...args: unknown[]) => {
    loggedErrors.push(args)
  }

  const dbError = new Error('Database write failure during Mission.updateOne')
  const findOneMock = mock.method(Mission, 'findOne', async () => mockDoc)
  const updateOneMock = mock.method(Mission, 'updateOne', async () => {
    throw dbError
  })

  try {
    const res = await patchHandler(makePatchRequest({ action: 'move', tz }, token))
    assert.equal(res.status, 500)
    const json = await res.json()
    assert.deepEqual(json, { error: 'Server error' })

    const foundErrorLog = loggedErrors.some((args) =>
      args.some((arg: unknown) =>
        typeof arg === 'string' && arg.includes('PATCH /api/mind/mission update error:')
      )
    )
    assert.ok(foundErrorLog, 'console.error must log "PATCH /api/mind/mission update error:"')
  } finally {
    console.error = originalConsoleError
    findOneMock.mock.restore()
    updateOneMock.mock.restore()
  }
})

// ── Acceptance: 9d6d2a52 (app/api/mind/mission/route.ts removed from ALLOWLIST in documentSaveParity.test.ts) ──

test('(id: 9d6d2a52) The app/api/mind/mission/route.ts entry is removed from ALLOWLIST in documentSaveParity.test.ts', () => {
  const parityPath = path.join(__dirname, '../documentSaveParity.test.ts')
  const parityContent = fs.readFileSync(parityPath, 'utf8')
  assert.ok(
    !parityContent.includes("'app/api/mind/mission/route.ts'"),
    'app/api/mind/mission/route.ts must not appear in ALLOWLIST in documentSaveParity.test.ts',
  )

  const routePath = path.join(__dirname, '../../../app/api/mind/mission/route.ts')
  const routeContent = fs.readFileSync(routePath, 'utf8')
  assert.ok(
    !routeContent.includes('.save()'),
    'app/api/mind/mission/route.ts must not contain .save()',
  )
})

// ── Acceptance: 9d6d2a53 (Response format and status codes remain unchanged) ──

test('(id: 9d6d2a53) Response format and status codes remain unchanged (401, 400, 404, 200, 500)', async () => {
  const token = await authedToken()

  // 401 Unauthorized
  const unauthRes = await patchHandler(makePatchRequest({ action: 'move' }))
  assert.equal(unauthRes.status, 401)
  assert.deepEqual(await unauthRes.json(), { error: 'Unauthorized' })

  // 400 Bad Request: missing action
  const badActionRes = await patchHandler(makePatchRequest({ action: 'invalid' }, token))
  assert.equal(badActionRes.status, 400)
  assert.deepEqual(await badActionRes.json(), { error: 'action must be "move"' })

  // 404 Not Found: no mission doc
  const findOneNullMock = mock.method(Mission, 'findOne', async () => null)
  try {
    const notFoundRes = await patchHandler(makePatchRequest({ action: 'move' }, token))
    assert.equal(notFoundRes.status, 404)
    assert.deepEqual(await notFoundRes.json(), { error: 'Set your mission first' })
  } finally {
    findOneNullMock.mock.restore()
  }

  // 500 Server error on unexpected failure (e.g., db connection or findOne error)
  const origErr = console.error
  console.error = () => {}
  const findOneErrMock = mock.method(Mission, 'findOne', async () => {
    throw new Error('Connection lost')
  })
  try {
    const errRes = await patchHandler(makePatchRequest({ action: 'move' }, token))
    assert.equal(errRes.status, 500)
    assert.deepEqual(await errRes.json(), { error: 'Server error' })
  } finally {
    findOneErrMock.mock.restore()
    console.error = origErr
  }
})
