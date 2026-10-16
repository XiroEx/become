// Run with: npm run test:file tests/unit/dashboardTiles/tile-tap-route.test.ts
//
// Auth + body-validation + targeted update tests for POST /api/dashboard/tile-tap.

import { test, before } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { NextRequest } from 'next/server'
import { signToken } from '../../../lib/auth'
import UserProgress from '../../../models/UserProgress'

let postHandler: any

before(async () => {
  const g = globalThis as any
  g.mongoose = g.mongoose || { conn: null, promise: null }
  g.mongoose.conn = { readyState: 1 }
  g.mongoose.promise = Promise.resolve(g.mongoose.conn)
  const mod = await import('../../../app/api/dashboard/tile-tap/route')
  postHandler = (mod as any).POST ?? (mod as any).default?.POST
})

function makeRequest(body: unknown, authHeader?: string): NextRequest {
  const headers = new Headers()
  if (authHeader) headers.set('Authorization', authHeader)
  headers.set('Content-Type', 'application/json')
  return new NextRequest('http://localhost/api/dashboard/tile-tap', {
    method: 'POST',
    headers,
    body: typeof body === 'string' ? body : JSON.stringify(body),
  })
}

async function authed(userId = 'fake-user') {
  return `Bearer ${await signToken({ userId, email: 't@example.com' })}`
}

test('POST /api/dashboard/tile-tap: no auth → 401', async () => {
  const res = await postHandler(makeRequest({ key: 'stat:workouts' }))
  assert.equal(res.status, 401)
  const json = await res.json()
  assert.deepEqual(json, { error: 'Unauthorized' })
})

test('POST /api/dashboard/tile-tap: invalid JWT → 401', async () => {
  const res = await postHandler(makeRequest({ key: 'stat:workouts' }, 'Bearer garbage'))
  assert.equal(res.status, 401)
  const json = await res.json()
  assert.deepEqual(json, { error: 'Unauthorized' })
})

test('POST /api/dashboard/tile-tap: invalid JSON → 400', async () => {
  const res = await postHandler(makeRequest('not-json{{{', await authed()))
  assert.equal(res.status, 400)
  const json = await res.json()
  assert.match(String(json.error), /Invalid JSON body/)
})

test('POST /api/dashboard/tile-tap: missing or invalid key → 400', async () => {
  const res1 = await postHandler(makeRequest({}, await authed()))
  assert.equal(res1.status, 400)
  assert.deepEqual(await res1.json(), { error: 'Missing or invalid field: key' })

  const res2 = await postHandler(makeRequest({ key: 'not_a_valid_key' }, await authed()))
  assert.equal(res2.status, 400)
  assert.deepEqual(await res2.json(), { error: 'Missing or invalid field: key' })

  const res3 = await postHandler(makeRequest({ key: 12345 }, await authed()))
  assert.equal(res3.status, 400)
  assert.deepEqual(await res3.json(), { error: 'Missing or invalid field: key' })
})

// ── Targeted update and error handling ──────────────────────────────────────

test('(id: 9d6d29fc) Whole-document existing.save() in POST handler is replaced with targeted UserProgress update', async () => {
  // Static check
  const routePath = path.join(__dirname, '../../../app/api/dashboard/tile-tap/route.ts')
  const src = fs.readFileSync(routePath, 'utf8')
  assert.ok(!src.includes('.save('), 'route must not call .save()')
  assert.ok(
    src.includes('UserProgress.updateOne'),
    'route must use UserProgress.updateOne',
  )
  assert.match(
    src,
    /UserProgress\.updateOne\(\s*\{\s*userId:\s*auth\.userId\s*\},/,
    'route must query by userId: auth.userId',
  )
  assert.match(
    src,
    /\$set:\s*\{\s*tileEngagement:\s*next\s*\}/,
    'route must use $set for tileEngagement',
  )

  // Dynamic execution check
  const origFindOne = UserProgress.findOne
  const origUpdateOne = UserProgress.updateOne

  let saveCalled = false
  const mockExisting: any = {
    userId: 'fake-user',
    tileEngagement: [{ key: 'stat:workouts', taps: 1, lastTapAt: '2026-01-01T00:00:00.000Z' }],
    save: async () => {
      saveCalled = true
    },
  }

  let updateOneCalledWith: unknown = null
  ;(UserProgress as any).findOne = () => Promise.resolve(mockExisting)
  ;(UserProgress as any).updateOne = (...args: unknown[]) => {
    updateOneCalledWith = args
    return Promise.resolve({ acknowledged: true, modifiedCount: 1 })
  }

  try {
    const res = await postHandler(makeRequest({ key: 'stat:workouts' }, await authed('fake-user')))
    assert.equal(res.status, 200)
    assert.deepEqual(await res.json(), { success: true })

    assert.equal(saveCalled, false, 'existing.save() must NOT be called')
    assert.ok(updateOneCalledWith, 'UserProgress.updateOne must be called')
    const [filter, update] = updateOneCalledWith as [any, any]
    assert.deepEqual(filter, { userId: 'fake-user' })
    assert.equal(typeof update?.$set?.tileEngagement, 'object')
    assert.equal(update.$set.tileEngagement[0].key, 'stat:workouts')
    assert.equal(update.$set.tileEngagement[0].taps, 2)
  } finally {
    UserProgress.findOne = origFindOne
    UserProgress.updateOne = origUpdateOne
  }
})

test('(id: 9d6d29fd) Errors during UserProgress update are logged to console.error', async () => {
  const origFindOne = UserProgress.findOne
  const origUpdateOne = UserProgress.updateOne
  const origCreate = UserProgress.create
  const origConsoleError = console.error

  const errorLogs: unknown[][] = []
  console.error = (...args: unknown[]) => {
    errorLogs.push(args)
  }

  const writeErr = new Error('Database write failure during updateOne')

  // 1. Error during updateOne (existing user)
  ;(UserProgress as any).findOne = () => Promise.resolve({ userId: 'fake-user', tileEngagement: [] })
  ;(UserProgress as any).updateOne = () => Promise.reject(writeErr)

  try {
    const res = await postHandler(makeRequest({ key: 'stat:workouts' }, await authed('fake-user')))
    assert.equal(res.status, 500)
    const json = await res.json()
    assert.deepEqual(json, { error: 'Internal server error' })

    const logged = errorLogs.find(
      (args) => args[0] === 'POST /api/dashboard/tile-tap update error:' && args[1] === writeErr,
    )
    assert.ok(logged, 'console.error must be called with expected prefix and error')
  } finally {
    UserProgress.findOne = origFindOne
    UserProgress.updateOne = origUpdateOne
    UserProgress.create = origCreate
    console.error = origConsoleError
  }

  // 2. Error during create (new user)
  errorLogs.length = 0
  const createErr = new Error('Database write failure during create')
  console.error = (...args: unknown[]) => {
    errorLogs.push(args)
  }
  ;(UserProgress as any).findOne = () => Promise.resolve(null)
  ;(UserProgress as any).create = () => Promise.reject(createErr)

  try {
    const res = await postHandler(makeRequest({ key: 'stat:workouts' }, await authed('new-user')))
    assert.equal(res.status, 500)
    const json = await res.json()
    assert.deepEqual(json, { error: 'Internal server error' })

    const logged = errorLogs.find(
      (args) => args[0] === 'POST /api/dashboard/tile-tap update error:' && args[1] === createErr,
    )
    assert.ok(logged, 'console.error must be called when UserProgress.create fails')
  } finally {
    UserProgress.findOne = origFindOne
    UserProgress.updateOne = origUpdateOne
    UserProgress.create = origCreate
    console.error = origConsoleError
  }
})

test('(id: 9d6d29fe) The app/api/dashboard/tile-tap/route.ts entry is removed from ALLOWLIST in documentSaveParity.test.ts', () => {
  const parityPath = path.join(__dirname, '../documentSaveParity.test.ts')
  const src = fs.readFileSync(parityPath, 'utf8')
  assert.ok(
    !src.includes("'app/api/dashboard/tile-tap/route.ts'"),
    'app/api/dashboard/tile-tap/route.ts must not be in ALLOWLIST',
  )
})

test('(id: 9d6d29ff) Response format and status codes remain unchanged', async () => {
  const origFindOne = UserProgress.findOne
  const origUpdateOne = UserProgress.updateOne
  const origCreate = UserProgress.create

  try {
    // 1. 401 Unauthorized
    const unauthRes = await postHandler(makeRequest({ key: 'stat:workouts' }))
    assert.equal(unauthRes.status, 401)
    assert.deepEqual(await unauthRes.json(), { error: 'Unauthorized' })

    // 2. 400 Bad Request - invalid json
    const badJsonRes = await postHandler(makeRequest('invalid json', await authed()))
    assert.equal(badJsonRes.status, 400)
    assert.deepEqual(await badJsonRes.json(), { error: 'Invalid JSON body' })

    // 3. 400 Bad Request - invalid key
    const badKeyRes = await postHandler(makeRequest({ key: 'bad-key' }, await authed()))
    assert.equal(badKeyRes.status, 400)
    assert.deepEqual(await badKeyRes.json(), { error: 'Missing or invalid field: key' })

    // 4. 200 OK - existing user update
    ;(UserProgress as any).findOne = () => Promise.resolve({ userId: 'fake-user', tileEngagement: [] })
    ;(UserProgress as any).updateOne = () => Promise.resolve({ acknowledged: true, modifiedCount: 1 })
    const okRes = await postHandler(makeRequest({ key: 'stat:workouts' }, await authed('fake-user')))
    assert.equal(okRes.status, 200)
    assert.deepEqual(await okRes.json(), { success: true })

    // 5. 200 OK - new user create
    ;(UserProgress as any).findOne = () => Promise.resolve(null)
    ;(UserProgress as any).create = () => Promise.resolve({ userId: 'new-user', tileEngagement: [] })
    const createRes = await postHandler(makeRequest({ key: 'stat:workouts' }, await authed('new-user')))
    assert.equal(createRes.status, 200)
    assert.deepEqual(await createRes.json(), { success: true })
  } finally {
    UserProgress.findOne = origFindOne
    UserProgress.updateOne = origUpdateOne
    UserProgress.create = origCreate
  }
})
