// Run with: npm run test:file tests/unit/mind/mindStateRoute.test.ts
//
// Tests for POST /api/mind/state:
// - (id: 9d6d297c) MindProgress.findOneAndUpdate XP grant is properly awaited in POST handler
// - (id: 9d6d297d) Errors during MindProgress.findOneAndUpdate are logged to console.error
// - (id: 9d6d297e) The app/api/mind/state/route.ts entry is removed from ALLOWLIST in unawaitedWriteParity.test.ts
// - Response payload, status codes, and route behavior maintained

const g = globalThis as unknown as { mongoose?: { conn: unknown; promise: unknown } }
g.mongoose = { conn: { readyState: 1 }, promise: null }
;(process.env as Record<string, string | undefined>).NODE_ENV = 'test'
process.env.JWT_SECRET ||= 'become-unit-test-secret'
process.env.MONGODB_URI ||= 'mongodb://127.0.0.1:27017/become-test'

import { test, before } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { NextRequest } from 'next/server'
import StateLog from '../../../models/StateLog'
import MindProgress from '../../../models/MindProgress'
import { signToken } from '../../../lib/auth'

const TEST_USER_ID = '65f00000000000000000ee01'
let postHandler: (req: NextRequest) => Promise<Response>

before(async () => {
  const mod = await import('../../../app/api/mind/state/route')
  postHandler = mod.POST
})

async function authedToken(userId = TEST_USER_ID) {
  const token = await signToken({ userId, email: 'mind-state-test@example.com' })
  return `Bearer ${token}`
}

function makePostRequest(body: unknown, authHeader?: string): NextRequest {
  const headers = new Headers()
  if (authHeader) headers.set('Authorization', authHeader)
  headers.set('Content-Type', 'application/json')
  return new NextRequest('http://localhost/api/mind/state', {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  })
}

// ── Validation and Auth ──────────────────────────────────────────────────────

test('POST /api/mind/state: returns 401 when unauthorized', async () => {
  const res = await postHandler(makePostRequest({ state: 'stressed' }))
  assert.equal(res.status, 401)
  const data = await res.json()
  assert.equal(data.error, 'Unauthorized')
})

test('POST /api/mind/state: returns 400 for invalid state', async () => {
  const token = await authedToken()
  const res = await postHandler(makePostRequest({ state: 'invalid-state' }, token))
  assert.equal(res.status, 400)
  const data = await res.json()
  assert.equal(data.error, 'Invalid state')
})

// ── Acceptance: 9d6d297c (MindProgress XP write is properly awaited) ─────────

test('(id: 9d6d297c) MindProgress.findOneAndUpdate XP grant is properly awaited in POST handler', async () => {
  const token = await authedToken()
  let writeFinished = false
  let callArgs: { filter: unknown; update: unknown; options: unknown } | null = null

  const origCountDocuments = StateLog.countDocuments
  const origCreate = StateLog.create
  const origFindOneAndUpdate = MindProgress.findOneAndUpdate

  try {
    ;(StateLog as unknown as { countDocuments: () => Promise<number> }).countDocuments = () => Promise.resolve(0)
    ;(StateLog as unknown as { create: (doc: unknown) => Promise<unknown> }).create = (doc: unknown) =>
      Promise.resolve({ _id: 'statelog123', ...(doc as object), createdAt: new Date() })

    ;(MindProgress as unknown as { findOneAndUpdate: (filter: unknown, update: unknown, options: unknown) => Promise<unknown> }).findOneAndUpdate = async (
      filter: unknown,
      update: unknown,
      options: unknown,
    ) => {
      callArgs = { filter, update, options }
      await new Promise((resolve) => setTimeout(resolve, 30))
      writeFinished = true
      return { userId: TEST_USER_ID, xp: 10 }
    }

    const res = await postHandler(makePostRequest({ state: 'stressed', feeling: 'Overwhelmed' }, token))
    assert.equal(res.status, 200)
    assert.equal(writeFinished, true, 'MindProgress write must have finished before route handler returned')
    assert.deepEqual(callArgs, {
      filter: { userId: TEST_USER_ID },
      update: { $inc: { xp: 10 } },
      options: { upsert: true, setDefaultsOnInsert: true },
    })
  } finally {
    StateLog.countDocuments = origCountDocuments
    StateLog.create = origCreate
    MindProgress.findOneAndUpdate = origFindOneAndUpdate
  }
})

// ── Acceptance: 9d6d297d (Errors during MindProgress.findOneAndUpdate are logged to console.error) ──

test('(id: 9d6d297d) Errors during MindProgress.findOneAndUpdate are logged to console.error without failing request', async () => {
  const token = await authedToken()
  const writeErr = new Error('Database write failure: E11000 duplicate key')
  const errorLogs: unknown[][] = []

  const origCountDocuments = StateLog.countDocuments
  const origCreate = StateLog.create
  const origFindOneAndUpdate = MindProgress.findOneAndUpdate
  const origConsoleError = console.error

  try {
    console.error = (...args: unknown[]) => {
      errorLogs.push(args)
    }

    ;(StateLog as unknown as { countDocuments: () => Promise<number> }).countDocuments = () => Promise.resolve(2)
    ;(StateLog as unknown as { create: (doc: unknown) => Promise<unknown> }).create = (doc: unknown) =>
      Promise.resolve({ _id: 'statelog456', ...(doc as object), createdAt: new Date() })

    ;(MindProgress as unknown as { findOneAndUpdate: () => Promise<unknown> }).findOneAndUpdate = () =>
      Promise.reject(writeErr)

    const res = await postHandler(makePostRequest({ state: 'locked_in' }, token))
    assert.equal(res.status, 200)
    const json = await res.json()
    assert.ok(json.log)
    assert.ok(json.recommendation?.message)

    const logged = errorLogs.find(
      (args) => args[0] === 'POST /api/mind/state MindProgress XP grant error:' && args[1] === writeErr,
    )
    assert.ok(logged, 'console.error must be called with expected prefix and error object')
  } finally {
    StateLog.countDocuments = origCountDocuments
    StateLog.create = origCreate
    MindProgress.findOneAndUpdate = origFindOneAndUpdate
    console.error = origConsoleError
  }
})

// ── Acceptance: 9d6d297e (app/api/mind/state/route.ts removed from ALLOWLIST in unawaitedWriteParity.test.ts) ──

test('(id: 9d6d297e) app/api/mind/state/route.ts is removed from ALLOWLIST in unawaitedWriteParity.test.ts', () => {
  const parityPath = path.join(__dirname, '../unawaitedWriteParity.test.ts')
  const parityContent = fs.readFileSync(parityPath, 'utf8')
  assert.ok(
    !parityContent.includes('app/api/mind/state/route.ts'),
    'app/api/mind/state/route.ts must not appear in ALLOWLIST in unawaitedWriteParity.test.ts',
  )
})

// ── Static code assertions ───────────────────────────────────────────────────

test('mind/state/route.ts statically awaits MindProgress.findOneAndUpdate and logs error', () => {
  const routePath = path.join(__dirname, '../../../app/api/mind/state/route.ts')
  const content = fs.readFileSync(routePath, 'utf8')
  assert.match(
    content,
    /await\s+MindProgress\.findOneAndUpdate/,
    'route must await MindProgress.findOneAndUpdate',
  )
  assert.match(
    content,
    /console\.error\(\s*['"]POST \/api\/mind\/state MindProgress XP grant error:['"]/,
    'route must log with exact prefix on write error',
  )
})
