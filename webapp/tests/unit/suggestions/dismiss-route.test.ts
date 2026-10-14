// Run with: npm run test:file tests/unit/suggestions/dismiss-route.test.ts
//
// Exercises auth + body-validation branches of POST /api/suggestions/dismiss
// and targeted updateOne persistence without whole-document validation.

// Ensure mock db connection is set BEFORE loading modules that invoke dbConnect
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
import UserProgress from '../../../models/UserProgress'
import { signToken } from '../../../lib/auth'

let postHandler: any

before(async () => {
  const g = globalThis as any
  g.mongoose = g.mongoose || { conn: null, promise: null }
  g.mongoose.conn = { readyState: 1 }
  const mod = await import('../../../app/api/suggestions/dismiss/route')
  postHandler = (mod as any).POST ?? (mod as any).default?.POST
})

function makeRequest(body: unknown | undefined, authHeader?: string): NextRequest {
  const headers = new Headers()
  if (authHeader) headers.set('Authorization', authHeader)
  headers.set('Content-Type', 'application/json')
  return new NextRequest('http://localhost/api/suggestions/dismiss', {
    method: 'POST',
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  })
}

async function authedHeader() {
  // verifyAuth is JWT-only (no DB lookup), so any signed token is accepted.
  const token = await signToken({ userId: 'fake-test-user', email: 't@example.com' })
  return `Bearer ${token}`
}

test('POST /api/suggestions/dismiss: no auth header → 401', async () => {
  const res = await postHandler(makeRequest({ id: 'log-weight' }))
  assert.equal(res.status, 401)
  const json = await res.json()
  assert.match(String(json.error), /Unauthorized/)
})

test('POST /api/suggestions/dismiss: invalid JWT → 401', async () => {
  const res = await postHandler(makeRequest({ id: 'log-weight' }, 'Bearer garbage'))
  assert.equal(res.status, 401)
})

test('POST /api/suggestions/dismiss: authed + missing id → 400 (no DB touched)', async () => {
  const res = await postHandler(makeRequest({}, await authedHeader()))
  assert.equal(res.status, 400)
  const json = await res.json()
  assert.match(String(json.error), /Missing required field: id/)
})

test('POST /api/suggestions/dismiss: authed + empty-string id → 400', async () => {
  const res = await postHandler(makeRequest({ id: '   ' }, await authedHeader()))
  assert.equal(res.status, 400)
})

test('POST /api/suggestions/dismiss: authed + non-string id → 400', async () => {
  const res = await postHandler(makeRequest({ id: 42 }, await authedHeader()))
  assert.equal(res.status, 400)
})

test('POST /api/suggestions/dismiss: authed + invalid JSON body → 400', async () => {
  const headers = new Headers()
  headers.set('Authorization', await authedHeader())
  headers.set('Content-Type', 'application/json')
  const req = new NextRequest('http://localhost/api/suggestions/dismiss', {
    method: 'POST',
    headers,
    body: 'not-json{{{',
  })
  const res = await postHandler(req)
  assert.equal(res.status, 400)
  const json = await res.json()
  assert.match(String(json.error), /Invalid JSON body/)
})

// ── Targeted update & validation bypass tests (acceptance id: 96d410bd, 96d410be, 96d410bf) ──

test('(id: 96d410bd) POST /api/suggestions/dismiss does not call save() and uses targeted updateOne', () => {
  const routeCode = fs.readFileSync(
    path.join(__dirname, '../../../app/api/suggestions/dismiss/route.ts'),
    'utf8',
  )
  const stripComments = (s: string) =>
    s.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '')

  assert.doesNotMatch(stripComments(routeCode), /\.save\(/)
  assert.match(routeCode, /UserProgress\.updateOne/)
  assert.match(routeCode, /upsert:\s*true/)
})

test('(id: 96d410bd) Dismissing a suggestion succeeds for a member whose UserProgress document would fail whole-document validation', async () => {
  const token = await authedHeader()

  // Malformed legacy document: missing required `setNumber` in SetLogSchema
  const malformedData = {
    userId: 'fake-test-user',
    workoutLogs: [
      {
        date: new Date(),
        exercises: [
          {
            exerciseSlug: 'squat',
            sets: [{ reps: 10 } as any], // missing required setNumber
          },
        ],
      },
    ],
    dismissedSuggestions: [] as any[],
  }

  // 1. Prove that whole-document validation fails on this document
  const legacyDoc = new UserProgress(malformedData)
  const valError = legacyDoc.validateSync()
  assert.ok(valError, 'Document must fail whole-document validation')
  assert.match(valError.message, /setNumber/, 'Validation error mentions missing setNumber')

  // 2. Mock findOne to return this invalid doc
  const findOneMock = mock.method(UserProgress, 'findOne', () => {
    return Promise.resolve(malformedData)
  })

  let updateArgs: any = null
  const updateOneMock = mock.method(UserProgress, 'updateOne', async (filter: any, update: any, options: any) => {
    updateArgs = { filter, update, options }
    return { acknowledged: true, modifiedCount: 1 }
  })

  try {
    const res = await postHandler(makeRequest({ id: 'log-weight' }, token))
    assert.equal(res.status, 200)
    const json = await res.json()

    assert.equal(json.success, true)
    assert.equal(json.id, 'log-weight')
    assert.equal(json.wasUpdate, false)
    assert.equal(json.count, 1)

    // Verify targeted update was performed via updateOne with upsert
    assert.ok(updateArgs, 'UserProgress.updateOne must be called')
    assert.deepEqual(updateArgs.filter, { userId: 'fake-test-user' })
    assert.ok(updateArgs.update.$set?.dismissedSuggestions)
    assert.equal(updateArgs.update.$set.dismissedSuggestions.length, 1)
    assert.equal(updateArgs.update.$set.dismissedSuggestions[0].id, 'log-weight')
    assert.equal(updateArgs.options?.upsert, true)
  } finally {
    findOneMock.mock.restore()
    updateOneMock.mock.restore()
  }
})

test('(id: 96d410be) A member with no UserProgress document yet still gets the dismissal persisted (upsert)', async () => {
  const token = await authedHeader()

  // No existing document for brand-new account
  const findOneMock = mock.method(UserProgress, 'findOne', () => {
    return Promise.resolve(null)
  })

  let updateArgs: any = null
  const updateOneMock = mock.method(UserProgress, 'updateOne', async (filter: any, update: any, options: any) => {
    updateArgs = { filter, update, options }
    return { acknowledged: true, upsertedCount: 1 }
  })

  try {
    const res = await postHandler(makeRequest({ id: 'streak-milestone-7' }, token))
    assert.equal(res.status, 200)
    const json = await res.json()

    assert.equal(json.success, true)
    assert.equal(json.id, 'streak-milestone-7')
    assert.equal(json.wasUpdate, false)
    assert.equal(json.count, 1)

    assert.ok(updateArgs, 'UserProgress.updateOne must be called')
    assert.deepEqual(updateArgs.filter, { userId: 'fake-test-user' })
    assert.ok(updateArgs.update.$set?.dismissedSuggestions)
    assert.equal(updateArgs.update.$set.dismissedSuggestions.length, 1)
    assert.equal(updateArgs.update.$set.dismissedSuggestions[0].id, 'streak-milestone-7')
    assert.equal(updateArgs.options?.upsert, true)
  } finally {
    findOneMock.mock.restore()
    updateOneMock.mock.restore()
  }
})

test('(id: 96d410be) Re-dismissing the same id replaces dismissedAt instead of appending a duplicate', async () => {
  const token = await authedHeader()

  const firstDate = new Date('2026-10-14T10:00:00.000Z')
  const existingDoc = {
    userId: 'fake-test-user',
    dismissedSuggestions: [
      { id: 'log-weight', dismissedAt: firstDate },
    ],
  }

  const findOneMock = mock.method(UserProgress, 'findOne', () => {
    return Promise.resolve(existingDoc)
  })

  let updateArgs: any = null
  const updateOneMock = mock.method(UserProgress, 'updateOne', async (filter: any, update: any, options: any) => {
    updateArgs = { filter, update, options }
    return { acknowledged: true, modifiedCount: 1 }
  })

  try {
    const res = await postHandler(makeRequest({ id: 'log-weight' }, token))
    assert.equal(res.status, 200)
    const json = await res.json()

    assert.equal(json.success, true)
    assert.equal(json.id, 'log-weight')
    assert.equal(json.wasUpdate, true)
    assert.equal(json.count, 1)

    assert.ok(updateArgs, 'UserProgress.updateOne must be called')
    assert.deepEqual(updateArgs.filter, { userId: 'fake-test-user' })
    const list = updateArgs.update.$set.dismissedSuggestions
    assert.equal(list.length, 1, 'Must replace, not append duplicate')
    assert.equal(list[0].id, 'log-weight')
    assert.ok(
      new Date(list[0].dismissedAt).getTime() > firstDate.getTime(),
      'dismissedAt must be updated to new timestamp',
    )
    assert.equal(updateArgs.options?.upsert, true)
  } finally {
    findOneMock.mock.restore()
    updateOneMock.mock.restore()
  }
})

test('(id: 96d410bf) The response stays exactly { success, id, wasUpdate, count }', async () => {
  const token = await authedHeader()

  const findOneMock = mock.method(UserProgress, 'findOne', () => {
    return Promise.resolve(null)
  })

  const updateOneMock = mock.method(UserProgress, 'updateOne', async () => {
    return { acknowledged: true }
  })

  try {
    const res = await postHandler(makeRequest({ id: 'log-weight' }, token))
    assert.equal(res.status, 200)
    const json = await res.json()

    // Assert exact key set: exactly four keys, no extra, no missing
    const keys = Object.keys(json).sort()
    assert.deepEqual(keys, ['count', 'id', 'success', 'wasUpdate'])

    assert.equal(typeof json.success, 'boolean')
    assert.equal(typeof json.id, 'string')
    assert.equal(typeof json.wasUpdate, 'boolean')
    assert.equal(typeof json.count, 'number')
  } finally {
    findOneMock.mock.restore()
    updateOneMock.mock.restore()
  }
})
