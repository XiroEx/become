// Run with: npm run test:file tests/unit/mind/identityRoute.test.ts
//
// Tests for PATCH /api/mind/identity:
// - Replacing whole-document doc.save() with targeted IdentityProfile.updateOne (9d6d2a85)
// - GET evolutionScore write and PUT findOneAndUpdate remain untouched (9d6d2a86)
// - Removing app/api/mind/identity/route.ts from ALLOWLIST in documentSaveParity.test.ts (9d6d2a87)
// - Response format and status codes remain unchanged (9d6d2a88)
// - Clean unit test execution (9d6d2a89)

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
import IdentityProfile from '../../../models/IdentityProfile'
import { signToken } from '../../../lib/auth'
import { localDateKey } from '../../../lib/dayWindow'

const DAY_MS = 86_400_000
const TEST_USER_ID = new mongoose.Types.ObjectId().toString()
let patchHandler: (req: NextRequest) => Promise<Response>

before(async () => {
  const glob = globalThis as unknown as { mongoose?: { conn: { readyState: number } | null; promise: unknown } }
  glob.mongoose = glob.mongoose || { conn: null, promise: null }
  glob.mongoose.conn = { readyState: 1 }
  const mod = await import('../../../app/api/mind/identity/route')
  patchHandler = mod.PATCH
})

async function authedToken(userId = TEST_USER_ID) {
  const token = await signToken({ userId, email: 'identity-test@example.com' })
  return `Bearer ${token}`
}

function makePatchRequest(body: unknown, authHeader?: string): NextRequest {
  const headers = new Headers()
  if (authHeader) headers.set('Authorization', authHeader)
  headers.set('Content-Type', 'application/json')
  return new NextRequest('http://localhost/api/mind/identity', {
    method: 'PATCH',
    headers,
    body: JSON.stringify(body),
  })
}

// ── Static code assertions ───────────────────────────────────────────────────

test('(id: 9d6d2a85) route.ts does not call doc.save() anywhere in PATCH and uses targeted IdentityProfile.updateOne', () => {
  const code = fs.readFileSync(
    path.join(__dirname, '../../../app/api/mind/identity/route.ts'),
    'utf8',
  )
  const patchSection = code.slice(code.indexOf('export async function PATCH'))
  assert.ok(patchSection.length > 0, 'PATCH handler must exist in route.ts')

  // Strip comments before checking for .save()
  const uncommented = patchSection
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/.*$/gm, '')

  assert.doesNotMatch(uncommented, /\.save\s*\(/, 'PATCH handler must not call .save()')
  assert.match(
    patchSection,
    /IdentityProfile\.updateOne\(\s*\{\s*_id:\s*doc\._id\s*\},\s*\{\s*\$set:\s*\{\s*currentSelf,\s*futureSelf\s*\}\s*\},?\s*\)/,
    'PATCH edit path must call IdentityProfile.updateOne with { _id: doc._id } and { currentSelf, futureSelf }',
  )
  assert.match(
    patchSection,
    /if\s*\(\s*doc\.lastAffirmedKey\s*!==\s*today\s*\)[\s\S]*?await\s+IdentityProfile\.updateOne\(\s*\{\s*_id:\s*doc\._id\s*\},\s*\{\s*\$set:\s*\{[\s\S]*?affirmStreak:[\s\S]*?lastAffirmedKey:[\s\S]*?longestAffirmStreak:[\s\S]*?\},?\s*\},?\s*\)/,
    'PATCH affirm path must call IdentityProfile.updateOne with { _id: doc._id } and streak fields in $set',
  )
})

test('(id: 9d6d2a86) GET evolutionScore write and PUT findOneAndUpdate are left untouched', () => {
  const code = fs.readFileSync(
    path.join(__dirname, '../../../app/api/mind/identity/route.ts'),
    'utf8',
  )
  // GET evolutionScore write untouched
  assert.match(
    code,
    /await\s+IdentityProfile\.updateOne\(\s*\{\s*userId:\s*auth\.userId\s*\},\s*\{\s*\$set:\s*\{\s*evolutionScore:\s*score\s*\}\s*\},?\s*\)/,
    'GET evolutionScore updateOne must be untouched',
  )
  // PUT findOneAndUpdate untouched
  assert.match(
    code,
    /await\s+IdentityProfile\.findOneAndUpdate\(\s*\{\s*userId:\s*auth\.userId\s*\},\s*\{\s*currentSelf,\s*futureSelf,\s*primaryObstacle,\s*startingPoint,\s*onboardingCompleted:\s*true\s*\},\s*\{\s*upsert:\s*true,\s*new:\s*true,\s*setDefaultsOnInsert:\s*true\s*\}\s*\)\.lean\(\)/,
    'PUT findOneAndUpdate must be untouched',
  )
})

test('(id: 9d6d2a87) The app/api/mind/identity/route.ts entry is removed from ALLOWLIST in documentSaveParity.test.ts', () => {
  const parityCode = fs.readFileSync(
    path.join(__dirname, '../documentSaveParity.test.ts'),
    'utf8',
  )
  assert.doesNotMatch(
    parityCode,
    /'app\/api\/mind\/identity\/route\.ts'/,
    'app/api/mind/identity/route.ts must not be in ALLOWLIST',
  )
})

// ── Dynamic behavior & acceptance criteria tests ─────────────────────────────

test('(id: 9d6d2a85) PATCH action: edit calls IdentityProfile.updateOne and does not call doc.save()', async () => {
  const token = await authedToken()
  const docId = new mongoose.Types.ObjectId()

  let saveCalled = false
  const mockDoc = {
    _id: docId,
    userId: TEST_USER_ID,
    currentSelf: 'Old Current',
    futureSelf: 'Old Future',
    save: async () => {
      saveCalled = true
    },
  }

  const updateOneCalls: Array<{ filter: unknown; update: unknown }> = []
  const findOneMock = mock.method(IdentityProfile, 'findOne', async () => mockDoc)
  const updateOneMock = mock.method(IdentityProfile, 'updateOne', async (filter: unknown, update: unknown) => {
    updateOneCalls.push({ filter, update })
    return { acknowledged: true, modifiedCount: 1 }
  })

  try {
    const res = await patchHandler(
      makePatchRequest({ action: 'edit', currentSelf: 'Disciplined person', futureSelf: 'Elite athlete' }, token),
    )
    assert.equal(res.status, 200)
    const json = await res.json()
    assert.deepEqual(json, {
      profile: {
        currentSelf: 'Disciplined person',
        futureSelf: 'Elite athlete',
      },
    })

    assert.equal(saveCalled, false, 'doc.save() must NOT be called')
    assert.equal(updateOneCalls.length, 1, 'IdentityProfile.updateOne must be called once')
    assert.deepEqual(updateOneCalls[0].filter, { _id: docId })
    assert.deepEqual(updateOneCalls[0].update, {
      $set: {
        currentSelf: 'Disciplined person',
        futureSelf: 'Elite athlete',
      },
    })
  } finally {
    findOneMock.mock.restore()
    updateOneMock.mock.restore()
  }
})

test('(id: 9d6d2a85) PATCH action: affirm advances streak and calls IdentityProfile.updateOne instead of doc.save()', async () => {
  const token = await authedToken()
  const docId = new mongoose.Types.ObjectId()
  const tz = 0
  const today = localDateKey(null, tz)
  const yesterday = localDateKey(null, tz, new Date(Date.now() - DAY_MS))

  let saveCalled = false
  const mockDoc = {
    _id: docId,
    userId: TEST_USER_ID,
    affirmStreak: 3,
    longestAffirmStreak: 5,
    lastAffirmedKey: yesterday,
    save: async () => {
      saveCalled = true
    },
  }

  const updateOneCalls: Array<{ filter: unknown; update: unknown }> = []
  const findOneMock = mock.method(IdentityProfile, 'findOne', async () => mockDoc)
  const updateOneMock = mock.method(IdentityProfile, 'updateOne', async (filter: unknown, update: unknown) => {
    updateOneCalls.push({ filter, update })
    return { acknowledged: true, modifiedCount: 1 }
  })

  try {
    const res = await patchHandler(makePatchRequest({ action: 'affirm', tz }, token))
    assert.equal(res.status, 200)
    const json = await res.json()
    assert.deepEqual(json, {
      affirm: {
        streak: 4,
        longest: 5,
        affirmedToday: true,
      },
    })

    assert.equal(saveCalled, false, 'doc.save() must NOT be called')
    assert.equal(updateOneCalls.length, 1, 'IdentityProfile.updateOne must be called once')
    assert.deepEqual(updateOneCalls[0].filter, { _id: docId })
    assert.deepEqual(updateOneCalls[0].update, {
      $set: {
        affirmStreak: 4,
        lastAffirmedKey: today,
        longestAffirmStreak: 5,
      },
    })
  } finally {
    findOneMock.mock.restore()
    updateOneMock.mock.restore()
  }
})

test('(id: 9d6d2a85) PATCH action: affirm resets streak to 1 after a missed gap', async () => {
  const token = await authedToken()
  const docId = new mongoose.Types.ObjectId()
  const tz = 0
  const today = localDateKey(null, tz)
  const longAgo = localDateKey(null, tz, new Date(Date.now() - 5 * DAY_MS))

  let saveCalled = false
  const mockDoc = {
    _id: docId,
    userId: TEST_USER_ID,
    affirmStreak: 10,
    longestAffirmStreak: 10,
    lastAffirmedKey: longAgo,
    save: async () => {
      saveCalled = true
    },
  }

  const updateOneCalls: Array<{ filter: unknown; update: unknown }> = []
  const findOneMock = mock.method(IdentityProfile, 'findOne', async () => mockDoc)
  const updateOneMock = mock.method(IdentityProfile, 'updateOne', async (filter: unknown, update: unknown) => {
    updateOneCalls.push({ filter, update })
    return { acknowledged: true, modifiedCount: 1 }
  })

  try {
    const res = await patchHandler(makePatchRequest({ action: 'affirm', tz }, token))
    assert.equal(res.status, 200)
    const json = await res.json()
    assert.deepEqual(json, {
      affirm: {
        streak: 1,
        longest: 10,
        affirmedToday: true,
      },
    })

    assert.equal(saveCalled, false, 'doc.save() must NOT be called')
    assert.equal(updateOneCalls.length, 1)
    assert.deepEqual(updateOneCalls[0].update, {
      $set: {
        affirmStreak: 1,
        lastAffirmedKey: today,
        longestAffirmStreak: 10,
      },
    })
  } finally {
    findOneMock.mock.restore()
    updateOneMock.mock.restore()
  }
})

test('(id: 9d6d2a88) Response format and status codes remain unchanged', async () => {
  const token = await authedToken()
  const docId = new mongoose.Types.ObjectId()
  const tz = 0
  const today = localDateKey(null, tz)

  // 1. 401 Unauthorized
  const unauthRes = await patchHandler(makePatchRequest({ action: 'affirm' }))
  assert.equal(unauthRes.status, 401)
  const unauthJson = await unauthRes.json()
  assert.equal(unauthJson.error, 'Unauthorized')

  // 2. 400 Bad Request on invalid action
  const invalidActionRes = await patchHandler(makePatchRequest({ action: 'invalid' }, token))
  assert.equal(invalidActionRes.status, 400)
  assert.deepEqual(await invalidActionRes.json(), { error: 'action must be "affirm" or "edit"' })

  // 3. 404 Not Found when profile does not exist
  const findOneNullMock = mock.method(IdentityProfile, 'findOne', async () => null)
  try {
    const notFoundRes = await patchHandler(makePatchRequest({ action: 'affirm' }, token))
    assert.equal(notFoundRes.status, 404)
    assert.deepEqual(await notFoundRes.json(), { error: 'Define your identity first' })
  } finally {
    findOneNullMock.mock.restore()
  }

  // 4. 400 Bad Request on edit missing currentSelf / futureSelf
  const mockDoc = {
    _id: docId,
    userId: TEST_USER_ID,
    currentSelf: 'Current',
    futureSelf: 'Future',
    affirmStreak: 2,
    longestAffirmStreak: 4,
    lastAffirmedKey: today,
    save: async () => {},
  }
  const findOneMock = mock.method(IdentityProfile, 'findOne', async () => mockDoc)
  try {
    const missingSelfRes = await patchHandler(makePatchRequest({ action: 'edit', currentSelf: '' }, token))
    assert.equal(missingSelfRes.status, 400)
    assert.deepEqual(await missingSelfRes.json(), { error: 'currentSelf and futureSelf are required' })
  } finally {
    findOneMock.mock.restore()
  }

  // 5. 200 OK idempotent affirm when already affirmed today performs NO update
  let updateCalled = false
  const findOneMock2 = mock.method(IdentityProfile, 'findOne', async () => mockDoc)
  const updateOneMock = mock.method(IdentityProfile, 'updateOne', async () => {
    updateCalled = true
    return { acknowledged: true }
  })
  try {
    const alreadyRes = await patchHandler(makePatchRequest({ action: 'affirm', tz }, token))
    assert.equal(alreadyRes.status, 200)
    assert.deepEqual(await alreadyRes.json(), {
      affirm: {
        streak: 2,
        longest: 4,
        affirmedToday: true,
      },
    })
    assert.equal(updateCalled, false, 'Expected no updateOne call when already affirmed today')
  } finally {
    findOneMock2.mock.restore()
    updateOneMock.mock.restore()
  }
})
