// Run with: npm run test:file tests/unit/dashboardTiles/pinned-tiles-route.test.ts
//
// Auth + body-validation branches of PATCH /api/dashboard/pinned-tiles.
// The 200 path touches MongoDB and is covered by helper tests + Playwright.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { NextRequest } from 'next/server'
import { PATCH } from '../../../app/api/dashboard/pinned-tiles/route'
import { signToken } from '../../../lib/auth'
import UserProgress from '../../../models/UserProgress'

function makeRequest(body: unknown, authHeader?: string): NextRequest {
  const headers = new Headers()
  if (authHeader) headers.set('Authorization', authHeader)
  headers.set('Content-Type', 'application/json')
  return new NextRequest('http://localhost/api/dashboard/pinned-tiles', {
    method: 'PATCH',
    headers,
    body: typeof body === 'string' ? body : JSON.stringify(body),
  })
}

async function authed() {
  return `Bearer ${await signToken({ userId: 'fake-user', email: 't@example.com' })}`
}

test('PATCH /api/dashboard/pinned-tiles: no auth → 401', async () => {
  const res = await PATCH(makeRequest({ pinnedTiles: ['a'] }))
  assert.equal(res.status, 401)
})

test('PATCH /api/dashboard/pinned-tiles: invalid JWT → 401', async () => {
  const res = await PATCH(makeRequest({ pinnedTiles: ['a'] }, 'Bearer garbage'))
  assert.equal(res.status, 401)
})

test('PATCH /api/dashboard/pinned-tiles: invalid JSON → 400', async () => {
  const res = await PATCH(makeRequest('not-json{{{', await authed()))
  assert.equal(res.status, 400)
  const json = await res.json()
  assert.match(String(json.error), /Invalid JSON body/)
})

test('PATCH /api/dashboard/pinned-tiles: missing pinnedTiles → 400', async () => {
  const res = await PATCH(makeRequest({}, await authed()))
  assert.equal(res.status, 400)
})

test('PATCH /api/dashboard/pinned-tiles: non-string entry → 400', async () => {
  const res = await PATCH(
    makeRequest({ pinnedTiles: ['a', 42] }, await authed()),
  )
  assert.equal(res.status, 400)
})

test('PATCH /api/dashboard/pinned-tiles: too many entries → 400', async () => {
  const res = await PATCH(
    makeRequest(
      { pinnedTiles: Array.from({ length: 21 }, (_, i) => `t${i}`) },
      await authed(),
    ),
  )
  assert.equal(res.status, 400)
  const json = await res.json()
  assert.match(String(json.error), /may not exceed 20/)
})

// ── Targeted update and error handling ──────────────────────────────────────

test('(id: 9d6d29ba) Whole-document existing.save() in PATCH handler is replaced with targeted UserProgress update', () => {
  const routePath = path.join(__dirname, '../../../app/api/dashboard/pinned-tiles/route.ts')
  const src = fs.readFileSync(routePath, 'utf8')
  assert.ok(!src.includes('.save('), 'route must not call .save()')
  assert.ok(
    src.includes('UserProgress.findOneAndUpdate'),
    'route must use UserProgress.findOneAndUpdate',
  )
  assert.match(
    src,
    /UserProgress\.findOneAndUpdate\(\s*\{\s*userId:\s*auth\.userId\s*\},/,
    'route must query by userId: auth.userId',
  )
  assert.match(
    src,
    /\$set:\s*\{\s*pinnedTiles:\s*validated\.pinnedTiles\s*\}/,
    'route must use $set for pinnedTiles',
  )
})

test('(id: 9d6d29bc) The app/api/dashboard/pinned-tiles/route.ts entry is removed from ALLOWLIST in documentSaveParity.test.ts', () => {
  const parityPath = path.join(__dirname, '../documentSaveParity.test.ts')
  const src = fs.readFileSync(parityPath, 'utf8')
  assert.ok(
    !src.includes("'app/api/dashboard/pinned-tiles/route.ts'"),
    'app/api/dashboard/pinned-tiles/route.ts must not be in ALLOWLIST',
  )
})

test('(id: 9d6d29bb) Errors during UserProgress update are logged to console.error and return 500', async () => {
  const g = globalThis as unknown as { mongoose?: { conn: unknown; promise: unknown } }
  if (!g.mongoose) {
    g.mongoose = { conn: null, promise: null }
  }
  const prevConn = g.mongoose.conn
  g.mongoose.conn = { readyState: 1 }

  const origFindOneAndUpdate = UserProgress.findOneAndUpdate
  const origConsoleError = console.error

  const errorLogs: unknown[][] = []
  console.error = (...args: unknown[]) => {
    errorLogs.push(args)
  }

  const writeErr = new Error('Database write failure')
  ;(UserProgress as unknown as { findOneAndUpdate: () => Promise<unknown> }).findOneAndUpdate = () =>
    Promise.reject(writeErr)

  try {
    const res = await PATCH(
      makeRequest({ pinnedTiles: ['tile1', 'tile2'] }, await authed()),
    )
    assert.equal(res.status, 500)
    const json = await res.json()
    assert.deepEqual(json, { error: 'Internal server error' })

    const logged = errorLogs.find(
      (args) => args[0] === 'PATCH /api/dashboard/pinned-tiles update error:' && args[1] === writeErr,
    )
    assert.ok(logged, 'console.error must be called with expected prefix and error')
  } finally {
    g.mongoose.conn = prevConn
    UserProgress.findOneAndUpdate = origFindOneAndUpdate
    console.error = origConsoleError
  }
})

test('(id: 9d6d29bd) Response format and status codes: successful targeted update returns 200 with payload', async () => {
  const g = globalThis as unknown as { mongoose?: { conn: unknown; promise: unknown } }
  if (!g.mongoose) {
    g.mongoose = { conn: null, promise: null }
  }
  const prevConn = g.mongoose.conn
  g.mongoose.conn = { readyState: 1 }

  const origFindOneAndUpdate = UserProgress.findOneAndUpdate
  let calledWith: unknown = null
  ;(UserProgress as unknown as { findOneAndUpdate: (...args: unknown[]) => Promise<unknown> }).findOneAndUpdate = (...args: unknown[]) => {
    calledWith = args
    return Promise.resolve({ userId: 'fake-user', pinnedTiles: ['tile1', 'tile2'] })
  }

  try {
    const res = await PATCH(
      makeRequest({ pinnedTiles: ['tile1', 'tile2'] }, await authed()),
    )
    assert.equal(res.status, 200)
    const json = await res.json()
    assert.deepEqual(json, {
      success: true,
      pinnedTiles: ['tile1', 'tile2'],
    })
    assert.deepEqual(calledWith, [
      { userId: 'fake-user' },
      { $set: { pinnedTiles: ['tile1', 'tile2'] } },
      { upsert: true, new: true },
    ])
  } finally {
    g.mongoose.conn = prevConn
    UserProgress.findOneAndUpdate = origFindOneAndUpdate
  }
})
