// Run with: npm run test:file tests/unit/ai/run-ownership.test.ts
//
// GET /api/ai/run/<runId> used to hand ANY run to ANY authenticated user; the
// only control was that runIds are "unguessable" — which they are not, since
// they are given to the client and persisted in localStorage
// (lib/ai/runStore.ts, key become.ai.runs.v1). Ownership is now recorded at
// trigger time and checked on every poll, failing closed.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'
import { Types } from 'mongoose'
import { NextRequest } from 'next/server'
import { GET } from '../../../app/api/ai/run/[runId]/route'
import { isRunOwner } from '../../../lib/ai/runOwnership'
import { signToken } from '../../../lib/auth'

const ROOT = process.cwd()
const AI_API = path.join(ROOT, 'app', 'api', 'ai')

function runRequest(authHeader?: string): NextRequest {
  const headers = new Headers()
  if (authHeader) headers.set('Authorization', authHeader)
  return new NextRequest('http://localhost/api/ai/run/abc', { method: 'GET', headers })
}

// ── isRunOwner: the authorization decision, pure ────────────────────────────

test('isRunOwner: the initiator owns their run', () => {
  assert.equal(isRunOwner({ userId: 'u1' }, 'u1'), true)
})

test('isRunOwner: another user does NOT own it (the actual vulnerability)', () => {
  assert.equal(isRunOwner({ userId: 'u1' }, 'u2'), false)
})

test('isRunOwner: an unknown run belongs to nobody', () => {
  assert.equal(isRunOwner(null, 'u1'), false)
})

test('isRunOwner: an empty caller never matches', () => {
  assert.equal(isRunOwner({ userId: 'u1' }, ''), false)
})

test('isRunOwner: normalises ObjectId vs string', () => {
  const id = new Types.ObjectId()
  assert.equal(
    isRunOwner({ userId: id } as unknown as { userId: string }, id.toString()),
    true,
  )
})

// ── Route branches (all assert before any DB call) ──────────────────────────

test('GET /api/ai/run/<id>: no Authorization → 401', async () => {
  const res = await GET(runRequest(), { params: Promise.resolve({ runId: 'abc' }) })
  assert.equal(res.status, 401)
})

test('GET /api/ai/run/<id>: invalid JWT → 401', async () => {
  const res = await GET(runRequest('Bearer garbage'), {
    params: Promise.resolve({ runId: 'abc' }),
  })
  assert.equal(res.status, 401)
})

test('GET /api/ai/run/<id>: authed but empty runId → 400', async () => {
  const token = await signToken({ userId: 'run-test-user', email: 'run@example.com' })
  const res = await GET(runRequest(`Bearer ${token}`), {
    params: Promise.resolve({ runId: '' }),
  })
  assert.equal(res.status, 400)
  const body = await res.json()
  assert.match(String(body.error), /Missing runId/)
})

// ── Enforcement greps: the net that keeps this fixed ────────────────────────

test('the poll route checks ownership and 404s a run that is not yours', () => {
  const src = readFileSync(path.join(AI_API, 'run', '[runId]', 'route.ts'), 'utf8')
  assert.match(src, /userOwnsRun/)
  assert.match(src, /status: 404/)
})

test('every AI route that returns a runId binds it to the caller', () => {
  const unowned: string[] = []
  const rawTrigger: string[] = []
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name)
      if (entry.isDirectory()) {
        walk(full)
        continue
      }
      if (entry.name !== 'route.ts') continue
      const src = readFileSync(full, 'utf8')
      const rel = path.relative(AI_API, full)
      if (/triggerBecomeTask.*from '@\/lib\/ai\/becomeGraph'/.test(src)) rawTrigger.push(rel)
      // `\s*` so a call wrapped across lines still counts as owned.
      if (src.includes('runId: trig.runId') && !/triggerOwnedRun\(\s*gate\.user\b/.test(src)) {
        unowned.push(rel)
      }
    }
  }
  walk(AI_API)
  assert.deepEqual(rawTrigger, [], 'AI routes must trigger via triggerOwnedRun, not triggerBecomeTask')
  assert.deepEqual(unowned, [], 'a run handed to the client with no ownership row is unpollable')
})

test('userOwnsRun fails closed on a lookup error', () => {
  const src = readFileSync(path.join(ROOT, 'lib', 'ai', 'runOwnership.ts'), 'utf8')
  const fn = src.slice(src.indexOf('export async function userOwnsRun'))
  const body = fn.slice(fn.indexOf('catch'))
  assert.match(body, /return false/, 'a failed ownership lookup must deny, not allow')
})

test('AiRun keys ownership by the JWT subject string and expires itself', () => {
  const src = readFileSync(path.join(ROOT, 'models', 'AiRun.ts'), 'utf8')
  assert.match(src, /userId:\s*\{\s*type:\s*String/, 'an ObjectId cast would 500 the poll path')
  assert.match(src, /expireAfterSeconds/)
})
