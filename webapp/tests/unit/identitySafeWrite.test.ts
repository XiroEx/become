// Tests for safe identity evolutionScore writes on GET /api/mind/identity.

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
import IdentityProfile from '../../models/IdentityProfile'
import DisciplineChallenge from '../../models/DisciplineChallenge'
import StateLog from '../../models/StateLog'
import Mission from '../../models/Mission'
import { signToken } from '../../lib/auth'

const USER_ID = '65f00000000000000000cc99'

let getIdentity: any

before(async () => {
  const mod = await import('../../app/api/mind/identity/route')
  getIdentity = (mod as any).GET ?? (mod as any).default?.GET
})

async function makeAuthToken(userId = USER_ID) {
  return `Bearer ${await signToken({ userId, email: 'identity-safe-test@example.com' })}`
}

function makeIdentityRequest(token: string): NextRequest {
  return new NextRequest('http://localhost/api/mind/identity', {
    method: 'GET',
    headers: new Headers({
      Authorization: token,
    }),
  })
}

// ── Static code assertions ───────────────────────────────────────────────────

test('GET /api/mind/identity uses targeted updateOne with $set evolutionScore', () => {
  const code = fs.readFileSync(
    path.join(__dirname, '../../app/api/mind/identity/route.ts'),
    'utf8',
  )
  assert.match(code, /IdentityProfile\.updateOne/)
  assert.match(code, /\$set:\s*\{\s*evolutionScore:\s*score\s*\}/)
})

// ── Acceptance criteria tests ────────────────────────────────────────────────

test('(id: 9d6d28a4) GET performs no write when recomputed evolutionScore equals stored one', async () => {
  const token = await makeAuthToken()

  mock.method(DisciplineChallenge, 'countDocuments', () => Promise.resolve(5)) // 5 * 3 = 15
  mock.method(StateLog, 'countDocuments', () => Promise.resolve(10)) // 10 * 1 = 10
  mock.method(Mission, 'findOne', () => ({ lean: () => Promise.resolve({ _id: 'm1' }) })) // 15
  // Total score = 15 + 10 + 15 = 40

  let updateCalled = false
  mock.method(IdentityProfile, 'updateOne', async () => {
    updateCalled = true
    return { acknowledged: true }
  })

  // Stored evolutionScore is already 40
  mock.method(IdentityProfile, 'findOne', () => ({
    lean: () => Promise.resolve({
      userId: USER_ID,
      primaryObstacle: 'clarity',
      startingPoint: 'lost',
      evolutionScore: 40,
    }),
  }))

  const res = await getIdentity(makeIdentityRequest(token))
  assert.equal(res.status, 200)
  const data = await res.json()
  assert.equal(data.evolution?.score, 40)
  assert.equal(updateCalled, false, 'Expected no updateOne call when evolutionScore equals stored value')
})

test('(id: 9d6d28a5) When score changed, targeted $set updateOne is awaited before response is sent', async () => {
  const token = await makeAuthToken()

  mock.method(DisciplineChallenge, 'countDocuments', () => Promise.resolve(5))
  mock.method(StateLog, 'countDocuments', () => Promise.resolve(10))
  mock.method(Mission, 'findOne', () => ({ lean: () => Promise.resolve({ _id: 'm1' }) }))
  // Total score = 40

  let updateFinished = false
  let updateArgs: any = null
  mock.method(IdentityProfile, 'updateOne', async (...args: any[]) => {
    updateArgs = args
    await new Promise((r) => setTimeout(r, 20))
    updateFinished = true
    return { acknowledged: true }
  })

  // Stored evolutionScore is 0 (differs from 40)
  mock.method(IdentityProfile, 'findOne', () => ({
    lean: () => Promise.resolve({
      userId: USER_ID,
      primaryObstacle: 'clarity',
      startingPoint: 'lost',
      evolutionScore: 0,
    }),
  }))

  const res = await getIdentity(makeIdentityRequest(token))
  assert.equal(res.status, 200)
  const data = await res.json()
  assert.equal(data.evolution?.score, 40)
  assert.equal(updateFinished, true, 'Expected updateOne to be awaited before response was returned')
  assert.deepEqual(updateArgs[0], { userId: USER_ID })
  assert.deepEqual(updateArgs[1], { $set: { evolutionScore: 40 } })
})

test('(id: 9d6d28a6) A write failure is logged rather than swallowed and still returns computed score', async () => {
  const token = await makeAuthToken()

  mock.method(DisciplineChallenge, 'countDocuments', () => Promise.resolve(5))
  mock.method(StateLog, 'countDocuments', () => Promise.resolve(10))
  mock.method(Mission, 'findOne', () => ({ lean: () => Promise.resolve({ _id: 'm1' }) }))

  mock.method(IdentityProfile, 'updateOne', async () => {
    throw new Error('Database write simulated failure')
  })

  let loggedError: any = null
  const origError = console.error
  console.error = (...args: any[]) => {
    loggedError = args
  }

  // Stored evolutionScore is 0 (differs from 40)
  mock.method(IdentityProfile, 'findOne', () => ({
    lean: () => Promise.resolve({
      userId: USER_ID,
      primaryObstacle: 'clarity',
      startingPoint: 'lost',
      evolutionScore: 0,
    }),
  }))

  try {
    const res = await getIdentity(makeIdentityRequest(token))
    assert.equal(res.status, 200, 'Response should succeed with status 200 despite write failure')
    const data = await res.json()
    assert.equal(data.evolution?.score, 40, 'Response should return computed score')
    assert.ok(loggedError, 'Expected write failure to be logged with console.error')
    assert.match(String(loggedError[0]), /Failed to persist evolutionScore/)
  } finally {
    console.error = origError
  }
})
