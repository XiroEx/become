// Run with: npm run test:file tests/unit/mind/disciplineRoute.test.ts
//
// Tests for POST & GET /api/mind/discipline:
// - Awaiting MindProgress XP write and resilience to XP failures (96d4122c)
// - Granting XP only on actual transition to completed (never duplicate) (96d4122d)
// - Upserting when row does not exist (never returns 200 with challenge: null) (96d4122e)
// - GET response shape and challenge selection maths intact (96d4122f)
// - Static assertions against regressions (no .save(), awaited XP grant)

// Ensure mock db connection is set BEFORE loading modules that invoke dbConnect
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
import DisciplineChallenge from '../../../models/DisciplineChallenge'
import MindProgress from '../../../models/MindProgress'
import { signToken } from '../../../lib/auth'

const TEST_USER_ID = '65f00000000000000000dd01'
let postHandler: (req: NextRequest) => Promise<Response>
let getHandler: (req: NextRequest) => Promise<Response>

before(async () => {
  const mod = await import('../../../app/api/mind/discipline/route')
  postHandler = mod.POST
  getHandler = mod.GET
})

async function authedToken(userId = TEST_USER_ID) {
  const token = await signToken({ userId, email: 'discipline-test@example.com' })
  return `Bearer ${token}`
}

function makePostRequest(body: unknown, authHeader?: string): NextRequest {
  const headers = new Headers()
  if (authHeader) headers.set('Authorization', authHeader)
  headers.set('Content-Type', 'application/json')
  return new NextRequest('http://localhost/api/mind/discipline', {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  })
}

function makeGetRequest(url: string, authHeader?: string): NextRequest {
  const headers = new Headers()
  if (authHeader) headers.set('Authorization', authHeader)
  return new NextRequest(url, {
    method: 'GET',
    headers,
  })
}

// ── Validation and Auth ──────────────────────────────────────────────────────

test('POST /api/mind/discipline: returns 401 when unauthorized', async () => {
  const res = await postHandler(makePostRequest({ action: 'complete' }))
  assert.equal(res.status, 401)
  const data = await res.json()
  assert.equal(data.error, 'Unauthorized')
})

test('POST /api/mind/discipline: returns 400 for invalid action', async () => {
  const token = await authedToken()
  const res = await postHandler(makePostRequest({ action: 'invalid-action' }, token))
  assert.equal(res.status, 400)
  const data = await res.json()
  assert.equal(data.error, 'action must be "complete" or "excuse"')
})

test('POST /api/mind/discipline: returns 400 for excuse shorter than 5 chars', async () => {
  const token = await authedToken()
  const res = await postHandler(makePostRequest({ action: 'excuse', excuse: 'nope' }, token))
  assert.equal(res.status, 400)
  const data = await res.json()
  assert.equal(data.error, 'Excuse text required')
})

// ── Acceptance: 96d4122d (XP only on transition, never duplicate) ────────────

test('(id: 96d4122d) XP is granted when challenge transitions to completed', async () => {
  const token = await authedToken()
  let xpUpdateCalls: Array<{ filter: any; update: any; options: any }> = []
  let challengeUpsertCalled = false

  const origDisciplineFindOneAndUpdate = DisciplineChallenge.findOneAndUpdate
  const origMindProgressFindOneAndUpdate = MindProgress.findOneAndUpdate

  try {
    ;(DisciplineChallenge as any).findOneAndUpdate = (filter: any, update: any, options: any) => {
      // Step 1: initial upsert
      if (update.$setOnInsert) {
        challengeUpsertCalled = true
        return {
          catch: () => Promise.resolve(),
        }
      }
      // Step 2: transition update
      if (filter.completed?.$ne === true) {
        return {
          lean: () => Promise.resolve({
            userId: TEST_USER_ID,
            challenge: 'Do 50 pushups',
            completed: true,
            completedAt: new Date(),
          }),
        }
      }
      return { lean: () => Promise.resolve(null) }
    }

    ;(MindProgress as any).findOneAndUpdate = (filter: any, update: any, options: any) => {
      xpUpdateCalls.push({ filter, update, options })
      return Promise.resolve({ userId: TEST_USER_ID, xp: 20 })
    }

    const res = await postHandler(makePostRequest({ action: 'complete', tz: 0 }, token))
    assert.equal(res.status, 200)
    const json = await res.json()
    assert.equal(json.challenge?.completed, true)
    assert.equal(challengeUpsertCalled, true)
    assert.equal(xpUpdateCalls.length, 1)
    assert.deepEqual(xpUpdateCalls[0].update, { $inc: { xp: 20 } })
  } finally {
    DisciplineChallenge.findOneAndUpdate = origDisciplineFindOneAndUpdate
    MindProgress.findOneAndUpdate = origMindProgressFindOneAndUpdate
  }
})

test('(id: 96d4122d) XP is NOT granted a second time when challenge is already completed', async () => {
  const token = await authedToken()
  let xpUpdateCalls: Array<any> = []

  const origDisciplineFindOneAndUpdate = DisciplineChallenge.findOneAndUpdate
  const origDisciplineFindOne = DisciplineChallenge.findOne
  const origMindProgressFindOneAndUpdate = MindProgress.findOneAndUpdate

  try {
    ;(DisciplineChallenge as any).findOneAndUpdate = (filter: any, update: any) => {
      if (update.$setOnInsert) {
        return { catch: () => Promise.resolve() }
      }
      if (filter.completed?.$ne === true) {
        // Already complete -> filter matches nothing
        return { lean: () => Promise.resolve(null) }
      }
      return { lean: () => Promise.resolve(null) }
    }

    ;(DisciplineChallenge as any).findOne = (filter: any) => {
      return {
        lean: () => Promise.resolve({
          userId: TEST_USER_ID,
          challenge: 'Do 50 pushups',
          completed: true,
          completedAt: new Date('2026-10-15T00:00:00Z'),
        }),
      }
    }

    ;(MindProgress as any).findOneAndUpdate = (filter: any, update: any) => {
      xpUpdateCalls.push({ filter, update })
      return Promise.resolve({})
    }

    const res = await postHandler(makePostRequest({ action: 'complete', tz: 0 }, token))
    assert.equal(res.status, 200)
    const json = await res.json()
    assert.equal(json.challenge?.completed, true)
    assert.equal(xpUpdateCalls.length, 0, 'No XP update call should be made when already complete')
  } finally {
    DisciplineChallenge.findOneAndUpdate = origDisciplineFindOneAndUpdate
    DisciplineChallenge.findOne = origDisciplineFindOne
    MindProgress.findOneAndUpdate = origMindProgressFindOneAndUpdate
  }
})

// ── Acceptance: 96d4122c (Awaited MindProgress write and failure resilience) ──

test('(id: 96d4122c) Failed MindProgress XP write does not fail the route response', async () => {
  const token = await authedToken()

  const origDisciplineFindOneAndUpdate = DisciplineChallenge.findOneAndUpdate
  const origMindProgressFindOneAndUpdate = MindProgress.findOneAndUpdate

  try {
    ;(DisciplineChallenge as any).findOneAndUpdate = (filter: any, update: any) => {
      if (update.$setOnInsert) {
        return { catch: () => Promise.resolve() }
      }
      return {
        lean: () => Promise.resolve({
          userId: TEST_USER_ID,
          challenge: 'Do 50 pushups',
          completed: true,
          completedAt: new Date(),
        }),
      }
    }

    // Simulate XP write database rejection
    ;(MindProgress as any).findOneAndUpdate = () => {
      return Promise.reject(new Error('Mongo connection timed out during XP grant'))
    }

    const res = await postHandler(makePostRequest({ action: 'complete', tz: 0 }, token))
    assert.equal(res.status, 200)
    const json = await res.json()
    assert.equal(json.challenge?.completed, true)
  } finally {
    DisciplineChallenge.findOneAndUpdate = origDisciplineFindOneAndUpdate
    MindProgress.findOneAndUpdate = origMindProgressFindOneAndUpdate
  }
})

test('(id: 96d4122c) MindProgress XP write is awaited before response returns', async () => {
  const token = await authedToken()
  let writeFinished = false

  const origDisciplineFindOneAndUpdate = DisciplineChallenge.findOneAndUpdate
  const origMindProgressFindOneAndUpdate = MindProgress.findOneAndUpdate

  try {
    ;(DisciplineChallenge as any).findOneAndUpdate = (filter: any, update: any) => {
      if (update.$setOnInsert) {
        return { catch: () => Promise.resolve() }
      }
      return {
        lean: () => Promise.resolve({
          userId: TEST_USER_ID,
          challenge: 'Do 50 pushups',
          completed: true,
          completedAt: new Date(),
        }),
      }
    }

    ;(MindProgress as any).findOneAndUpdate = async () => {
      await new Promise((resolve) => setTimeout(resolve, 20))
      writeFinished = true
      return { userId: TEST_USER_ID, xp: 20 }
    }

    const res = await postHandler(makePostRequest({ action: 'complete', tz: 0 }, token))
    assert.equal(res.status, 200)
    assert.equal(writeFinished, true, 'MindProgress write must have completed before route returned')
  } finally {
    DisciplineChallenge.findOneAndUpdate = origDisciplineFindOneAndUpdate
    MindProgress.findOneAndUpdate = origMindProgressFindOneAndUpdate
  }
})

// ── Acceptance: 96d4122e (Upsert for day row that does not exist yet) ─────────

test('(id: 96d4122e) action: "complete" on non-existent day row upserts and returns non-null challenge', async () => {
  const token = await authedToken()
  let upsertFilter: any = null
  let upsertUpdate: any = null

  const origDisciplineFindOneAndUpdate = DisciplineChallenge.findOneAndUpdate
  const origMindProgressFindOneAndUpdate = MindProgress.findOneAndUpdate

  try {
    ;(DisciplineChallenge as any).findOneAndUpdate = (filter: any, update: any, options: any) => {
      if (update.$setOnInsert) {
        upsertFilter = filter
        upsertUpdate = update
        return { catch: () => Promise.resolve() }
      }
      if (filter.completed?.$ne === true) {
        return {
          lean: () => Promise.resolve({
            userId: TEST_USER_ID,
            challenge: 'Walk 10000 steps',
            completed: true,
            completedAt: new Date(),
          }),
        }
      }
      return { lean: () => Promise.resolve(null) }
    }

    ;(MindProgress as any).findOneAndUpdate = () => Promise.resolve({})

    const res = await postHandler(makePostRequest({ action: 'complete', tz: 0 }, token))
    assert.equal(res.status, 200)
    const json = await res.json()
    assert.ok(json.challenge, 'challenge must not be null')
    assert.equal(json.challenge.completed, true)
    assert.equal(upsertUpdate.$setOnInsert?.completed, false)
    assert.ok(upsertUpdate.$setOnInsert?.challenge, 'challenge string must be provided in upsert')
  } finally {
    DisciplineChallenge.findOneAndUpdate = origDisciplineFindOneAndUpdate
    MindProgress.findOneAndUpdate = origMindProgressFindOneAndUpdate
  }
})

test('(id: 96d4122e) action: "excuse" upserts row when not existing and returns challenge', async () => {
  const token = await authedToken()
  let upsertFilter: any = null
  let upsertUpdate: any = null

  const origDisciplineFindOneAndUpdate = DisciplineChallenge.findOneAndUpdate
  const origMindProgressFindOneAndUpdate = MindProgress.findOneAndUpdate

  try {
    ;(DisciplineChallenge as any).findOneAndUpdate = (filter: any, update: any) => {
      if (update.$set?.excuse) {
        upsertFilter = filter
        upsertUpdate = update
        return {
          lean: () => Promise.resolve({
            userId: TEST_USER_ID,
            challenge: update.$setOnInsert?.challenge ?? 'Default challenge',
            completed: false,
            excuse: update.$set.excuse,
            excuseResponse: update.$set.excuseResponse,
          }),
        }
      }
      return { catch: () => Promise.resolve() }
    }

    ;(MindProgress as any).findOneAndUpdate = () => Promise.resolve({})

    const excuseText = 'Too exhausted after travelling all day.'
    const res = await postHandler(makePostRequest({ action: 'excuse', excuse: excuseText, tz: 0 }, token))
    assert.equal(res.status, 200)
    const json = await res.json()
    assert.ok(json.challenge, 'challenge must not be null')
    assert.equal(json.challenge.excuse, excuseText)
    assert.ok(json.excuseResponse, 'excuseResponse must be returned')
    assert.equal(upsertUpdate.$setOnInsert?.completed, false)
    assert.ok(upsertUpdate.$setOnInsert?.challenge)
  } finally {
    DisciplineChallenge.findOneAndUpdate = origDisciplineFindOneAndUpdate
    MindProgress.findOneAndUpdate = origMindProgressFindOneAndUpdate
  }
})

// ── Acceptance: 96d4122f (GET contract unchanged) ────────────────────────────

test('(id: 96d4122f) GET /api/mind/discipline retains { challenge: doc } contract', async () => {
  const token = await authedToken()

  const origDisciplineFindOneAndUpdate = DisciplineChallenge.findOneAndUpdate

  try {
    ;(DisciplineChallenge as any).findOneAndUpdate = (filter: any, update: any, options: any) => {
      return {
        lean: () => Promise.resolve({
          userId: TEST_USER_ID,
          challenge: update.$setOnInsert.challenge,
          completed: false,
        }),
      }
    }

    const res = await getHandler(makeGetRequest('http://localhost/api/mind/discipline?tz=0', token))
    assert.equal(res.status, 200)
    const json = await res.json()
    assert.ok(json.challenge)
    assert.equal(json.challenge.completed, false)
    assert.ok(typeof json.challenge.challenge === 'string')
  } finally {
    DisciplineChallenge.findOneAndUpdate = origDisciplineFindOneAndUpdate
  }
})

// ── Static code assertions ───────────────────────────────────────────────────

test('discipline route awaits MindProgress write and avoids .save()', () => {
  const routeCode = fs.readFileSync(
    path.join(__dirname, '../../../app/api/mind/discipline/route.ts'),
    'utf8',
  )
  const stripComments = (s: string) =>
    s.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '')

  assert.doesNotMatch(stripComments(routeCode), /\.save\(/, 'route must not call .save()')
  assert.match(routeCode, /await\s+MindProgress\.findOneAndUpdate/, 'MindProgress write must be awaited')
})
