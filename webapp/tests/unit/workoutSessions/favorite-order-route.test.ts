// Run with: npm run test:file tests/unit/workoutSessions/favorite-order-route.test.ts
//
// Auth + body-validation branches of PATCH /api/workouts/favorite-order.
// The 200 path touches MongoDB and is covered by the validator tests + Playwright.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { NextRequest } from 'next/server'
import { PATCH } from '../../../app/api/workouts/favorite-order/route'
import { signToken } from '../../../lib/auth'
import UserProgress from '../../../models/UserProgress'

function makeRequest(body: unknown, authHeader?: string): NextRequest {
  const headers = new Headers()
  if (authHeader) headers.set('Authorization', authHeader)
  headers.set('Content-Type', 'application/json')
  return new NextRequest('http://localhost/api/workouts/favorite-order', {
    method: 'PATCH',
    headers,
    body: typeof body === 'string' ? body : JSON.stringify(body),
  })
}

async function authed() {
  return `Bearer ${await signToken({ userId: 'fake-user', email: 't@example.com' })}`
}

test('PATCH /api/workouts/favorite-order: no auth → 401', async () => {
  const res = await PATCH(makeRequest({ order: ['a'] }))
  assert.equal(res.status, 401)
})

test('PATCH /api/workouts/favorite-order: invalid JWT → 401', async () => {
  const res = await PATCH(makeRequest({ order: ['a'] }, 'Bearer garbage'))
  assert.equal(res.status, 401)
})

test('PATCH /api/workouts/favorite-order: invalid JSON → 400', async () => {
  const res = await PATCH(makeRequest('not-json{{{', await authed()))
  assert.equal(res.status, 400)
  const json = await res.json()
  assert.match(String(json.error), /Invalid JSON body/)
})

test('PATCH /api/workouts/favorite-order: missing order → 400', async () => {
  const res = await PATCH(makeRequest({}, await authed()))
  assert.equal(res.status, 400)
})

test('PATCH /api/workouts/favorite-order: non-string entry → 400', async () => {
  const res = await PATCH(makeRequest({ order: ['a', 42] }, await authed()))
  assert.equal(res.status, 400)
})

test('PATCH /api/workouts/favorite-order: too many entries → 400', async () => {
  const res = await PATCH(
    makeRequest(
      { order: Array.from({ length: 201 }, (_, i) => `s${i}`) },
      await authed(),
    ),
  )
  assert.equal(res.status, 400)
  const json = await res.json()
  assert.match(String(json.error), /may not exceed 200/)
})

// ── Targeted update and error handling ──────────────────────────────────────

test('(id: 9d6d2a04) Whole-document existing.save() in PATCH handler is replaced with targeted UserProgress update', () => {
  const routePath = path.join(__dirname, '../../../app/api/workouts/favorite-order/route.ts')
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
    /\$set:\s*\{\s*favoriteSessionOrder:\s*validated\.order\s*\}/,
    'route must use $set for favoriteSessionOrder',
  )
})

test('(id: 9d6d2a06) The app/api/workouts/favorite-order/route.ts entry is removed from ALLOWLIST in documentSaveParity.test.ts', () => {
  const parityPath = path.join(__dirname, '../documentSaveParity.test.ts')
  const src = fs.readFileSync(parityPath, 'utf8')
  assert.ok(
    !src.includes("'app/api/workouts/favorite-order/route.ts'"),
    'app/api/workouts/favorite-order/route.ts must not be in ALLOWLIST',
  )
})

test('(id: 9d6d2a05) Errors during UserProgress update are logged to console.error', async () => {
  const g = globalThis as unknown as { mongoose?: { conn: unknown; promise: unknown } }
  if (!g.mongoose) {
    g.mongoose = { conn: null, promise: null }
  }
  const prevConn = g.mongoose.conn
  g.mongoose.conn = { readyState: 1 }

  const origFindOne = UserProgress.findOne
  const origUpdateOne = UserProgress.updateOne
  const origConsoleError = console.error
  const errorLogs: unknown[][] = []
  console.error = (...args: unknown[]) => {
    errorLogs.push(args)
  }

  const writeErr = new Error('Database write failure')
  ;(UserProgress as unknown as { findOne: () => Promise<unknown> }).findOne = () =>
    Promise.resolve({ userId: 'fake-user', favoriteSessionOrder: [] })
  ;(UserProgress as unknown as { updateOne: () => Promise<unknown> }).updateOne = () =>
    Promise.reject(writeErr)

  try {
    const res = await PATCH(
      makeRequest({ order: ['session1', 'session2'] }, await authed()),
    )
    assert.equal(res.status, 500)
    const json = await res.json()
    assert.deepEqual(json, { error: 'Internal server error' })

    const logged = errorLogs.find(
      (args) => args[0] === 'PATCH /api/workouts/favorite-order update error:' && args[1] === writeErr,
    )
    assert.ok(logged, 'console.error must be called with expected prefix and error')
  } finally {
    g.mongoose.conn = prevConn
    UserProgress.findOne = origFindOne
    UserProgress.updateOne = origUpdateOne
    console.error = origConsoleError
  }
})

test('(id: 9d6d2a07) Response format and status codes remain unchanged: successful targeted update returns 200 with payload', async () => {
  const g = globalThis as unknown as { mongoose?: { conn: unknown; promise: unknown } }
  if (!g.mongoose) {
    g.mongoose = { conn: null, promise: null }
  }
  const prevConn = g.mongoose.conn
  g.mongoose.conn = { readyState: 1 }

  const origFindOne = UserProgress.findOne
  const origUpdateOne = UserProgress.updateOne
  let calledWith: unknown = null
  ;(UserProgress as unknown as { findOne: () => Promise<unknown> }).findOne = () =>
    Promise.resolve({ userId: 'fake-user', favoriteSessionOrder: [] })
  ;(UserProgress as unknown as { updateOne: (...args: unknown[]) => Promise<unknown> }).updateOne = (...args: unknown[]) => {
    calledWith = args
    return Promise.resolve({ acknowledged: true, modifiedCount: 1 })
  }

  try {
    const res = await PATCH(
      makeRequest({ order: ['s1', 's2'] }, await authed()),
    )
    assert.equal(res.status, 200)
    const json = await res.json()
    assert.deepEqual(json, {
      success: true,
      favoriteSessionOrder: ['s1', 's2'],
    })
    assert.deepEqual(calledWith, [
      { userId: 'fake-user' },
      { $set: { favoriteSessionOrder: ['s1', 's2'] } },
    ])
  } finally {
    g.mongoose.conn = prevConn
    UserProgress.findOne = origFindOne
    UserProgress.updateOne = origUpdateOne
  }
})

test('(id: 9d6d2a07) Response format and status codes remain unchanged: new document creation when none exists', async () => {
  const g = globalThis as unknown as { mongoose?: { conn: unknown; promise: unknown } }
  if (!g.mongoose) {
    g.mongoose = { conn: null, promise: null }
  }
  const prevConn = g.mongoose.conn
  g.mongoose.conn = { readyState: 1 }

  const origFindOne = UserProgress.findOne
  const origCreate = UserProgress.create
  let createCalledWith: unknown = null
  ;(UserProgress as unknown as { findOne: () => Promise<unknown> }).findOne = () =>
    Promise.resolve(null)
  ;(UserProgress as unknown as { create: (...args: unknown[]) => Promise<unknown> }).create = (...args: unknown[]) => {
    createCalledWith = args
    return Promise.resolve({ userId: 'fake-user', favoriteSessionOrder: ['s1', 's2'] })
  }

  try {
    const res = await PATCH(
      makeRequest({ order: ['s1', 's2'] }, await authed()),
    )
    assert.equal(res.status, 200)
    const json = await res.json()
    assert.deepEqual(json, {
      success: true,
      favoriteSessionOrder: ['s1', 's2'],
    })
    assert.deepEqual(createCalledWith, [
      {
        userId: 'fake-user',
        favoriteSessionOrder: ['s1', 's2'],
      },
    ])
  } finally {
    g.mongoose.conn = prevConn
    UserProgress.findOne = origFindOne
    UserProgress.create = origCreate
  }
})
