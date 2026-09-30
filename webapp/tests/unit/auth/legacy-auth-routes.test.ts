// Run with: npm run test:file tests/unit/auth/legacy-auth-routes.test.ts
//
// POST /api/auth/login and POST /api/auth/register used to mint a full session
// JWT with zero proof of address ownership — login returned a token for ANY
// known email, register created an account and a token from a bare name+email.
// Both are retired: 410 Gone, no DB touch, no token, ever.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'
import { POST as LOGIN } from '../../../app/api/auth/login/route'
import { POST as REGISTER } from '../../../app/api/auth/register/route'

const ROOT = process.cwd()
const LOGIN_ROUTE = path.join(ROOT, 'app', 'api', 'auth', 'login', 'route.ts')
const REGISTER_ROUTE = path.join(ROOT, 'app', 'api', 'auth', 'register', 'route.ts')

/**
 * Drop comments before scanning. The guard below is looking for a CALLER, and a
 * comment naming a retired endpoint (as lib/clientAuth.ts does, to explain why
 * its helpers are gone) is documentation, not a call.
 */
function code(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '')
}

/** A call site quotes the path; prose does not. */
function callsRetiredEndpoint(src: string): boolean {
  return /['"`]\/api\/auth\/(login|register)['"`]/.test(code(src))
}

test('POST /api/auth/login → 410 with a machine-readable pointer, never a token', async () => {
  const res = await LOGIN()
  assert.equal(res.status, 410)
  const body = await res.json()
  assert.equal(body.code, 'legacy_auth_disabled')
  assert.equal(body.use, '/api/auth/send-link')
  assert.ok(!('token' in body), 'a retired endpoint must never return a token')
  assert.ok(!('user' in body))
})

test('POST /api/auth/register → 410, no token, no user', async () => {
  const res = await REGISTER()
  assert.equal(res.status, 410)
  const body = await res.json()
  assert.equal(body.code, 'legacy_auth_disabled')
  assert.ok(!('token' in body))
  assert.ok(!('user' in body))
})

test('both routes answer 410 unconditionally — no body is parsed, no branch exists', async () => {
  // The handlers take no request at all, so there is no 400/404/500 path left
  // to reach: an empty body, malformed JSON and a well-formed one are identical.
  for (const handler of [LOGIN, REGISTER]) {
    const res = await handler()
    assert.equal(res.status, 410)
    assert.equal(res.headers.get('Cache-Control'), 'no-store')
  }
})

test('neither route file can still reach auth or the database', () => {
  for (const file of [LOGIN_ROUTE, REGISTER_ROUTE]) {
    const src = code(readFileSync(file, 'utf8'))
    for (const forbidden of ['signToken', 'models/User', 'dbConnect']) {
      assert.ok(!src.includes(forbidden), `${path.basename(path.dirname(file))} still references ${forbidden}`)
    }
  }
})

test('lib/clientAuth.ts no longer calls the retired endpoints', () => {
  const src = readFileSync(path.join(ROOT, 'lib', 'clientAuth.ts'), 'utf8')
  assert.equal(callsRetiredEndpoint(src), false)
})

test('nothing in the app calls the retired endpoints (regression guard)', () => {
  const offenders: string[] = []
  const skip = new Set(['node_modules', '.next', 'public'])
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (skip.has(entry.name)) continue
      const full = path.join(dir, entry.name)
      if (entry.isDirectory()) {
        walk(full)
        continue
      }
      if (!/\.(ts|tsx)$/.test(entry.name)) continue
      if (full === LOGIN_ROUTE || full === REGISTER_ROUTE) continue
      if (callsRetiredEndpoint(readFileSync(full, 'utf8'))) {
        offenders.push(path.relative(ROOT, full))
      }
    }
  }
  for (const top of ['app', 'components', 'hooks', 'lib']) {
    try {
      walk(path.join(ROOT, top))
    } catch {
      /* optional directory */
    }
  }
  assert.deepEqual(offenders, [], 'these endpoints are 410 Gone — use /api/auth/send-link')
})
