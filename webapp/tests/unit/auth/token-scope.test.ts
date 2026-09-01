// Run with: npx tsx --test tests/unit/auth/token-scope.test.ts
//
// Token SCOPE enforcement. Before this, `mintToolToken`'s 15-minute
// `scope: 'ai-tools'` claim was decorative: verifyAuth never read it, so that
// token was accepted by every one of the ~149 verifyAuth call sites, by the
// admin gates, and — worst — by GET /api/auth/me, whose sliding refresh minted
// a fresh 30-day SESSION from it.
//
// The contract these tests pin:
//   • a token with NO scope claim is a full session and works everywhere (all
//     existing sessions keep working — that is the blast-radius assertion);
//   • a token WITH a scope is rejected unless the route named that exact scope;
//   • exactly one route opts in (GET /api/ai/context).

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'
import jwt from 'jsonwebtoken'
import { NextRequest } from 'next/server'
import { isScopeAllowed, signToken, verifyAuth, type JWTPayload } from '../../../lib/auth'
import { mintToolToken } from '../../../lib/ai/routeHelpers'
import { getRuntimeConfig } from '../../../lib/runtimeConfig'

const APP_API = path.join(process.cwd(), 'app', 'api')

function req(url: string, authHeader?: string, method = 'GET'): NextRequest {
  const headers = new Headers()
  if (authHeader) headers.set('Authorization', authHeader)
  if (method !== 'GET') headers.set('Content-Type', 'application/json')
  return new NextRequest(`http://localhost${url}`, {
    method,
    headers,
    ...(method === 'GET' ? {} : { body: JSON.stringify({}) }),
  })
}

async function sessionToken(payload?: Partial<JWTPayload>): Promise<string> {
  return signToken({ userId: 'u1', email: 'a@b.c', ...payload })
}

async function toolToken(): Promise<string> {
  const t = await mintToolToken('u1', 'a@b.c')
  assert.ok(t, 'mintToolToken should mint in the unit env')
  return t
}

// ── isScopeAllowed: the whole decision, pure ────────────────────────────────

test('isScopeAllowed: unscoped session with no opt-in → allowed', () => {
  assert.equal(isScopeAllowed(undefined, undefined), true)
})

test('isScopeAllowed: unscoped session on an opted-in route → allowed', () => {
  assert.equal(isScopeAllowed(undefined, ['ai-tools']), true)
})

test('isScopeAllowed: scoped token with no opt-in → DENIED (the core fix)', () => {
  assert.equal(isScopeAllowed('ai-tools', undefined), false)
})

test('isScopeAllowed: scoped token against an empty allowlist → denied', () => {
  assert.equal(isScopeAllowed('ai-tools', []), false)
})

test('isScopeAllowed: scoped token on the route that names it → allowed', () => {
  assert.equal(isScopeAllowed('ai-tools', ['ai-tools']), true)
})

test('isScopeAllowed: an unknown scope never passes', () => {
  assert.equal(isScopeAllowed('admin-tools', ['ai-tools']), false)
})

// ── verifyAuth: same decision, through a real request ───────────────────────

test('verifyAuth: an ordinary session token still works with no options', async () => {
  const res = await verifyAuth(req('/api/anything', `Bearer ${await sessionToken()}`))
  assert.equal(res.success, true)
  assert.equal(res.userId, 'u1')
  assert.equal(res.scope, undefined)
})

test('verifyAuth: an ai-tools token is rejected on a route that did not opt in', async () => {
  const res = await verifyAuth(req('/api/anything', `Bearer ${await toolToken()}`))
  assert.equal(res.success, false)
  assert.match(String(res.error), /scope/i)
})

test('verifyAuth: an ai-tools token is accepted where allowScopes names it', async () => {
  const res = await verifyAuth(req('/api/ai/context', `Bearer ${await toolToken()}`), {
    allowScopes: ['ai-tools'],
  })
  assert.equal(res.success, true)
  assert.equal(res.userId, 'u1')
  assert.equal(res.scope, 'ai-tools')
})

test('verifyAuth: an unrecognised scope is rejected even by an opted-in route', async () => {
  const { auth } = await getRuntimeConfig()
  const rogue = jwt.sign({ userId: 'u1', email: 'a@b.c', scope: 'admin-tools' }, auth.jwtSecret, {
    expiresIn: '15m',
  })
  const res = await verifyAuth(req('/api/ai/context', `Bearer ${rogue}`), {
    allowScopes: ['ai-tools'],
  })
  assert.equal(res.success, false)
})

test('signToken strips a scope claim — a scoped payload cannot become a session', async () => {
  const token = await signToken({
    userId: 'u1',
    email: 'a@b.c',
    role: 'admin',
    scope: 'ai-tools',
  } as JWTPayload)
  const decoded = jwt.decode(token) as Record<string, unknown>
  assert.equal(decoded.scope, undefined, 'scope must never ride into a 30-day session')
  assert.equal(decoded.role, 'admin', 'role must still pass through')
})

test('mintToolToken stays short-lived (15 minutes)', async () => {
  const decoded = jwt.decode(await toolToken()) as { iat: number; exp: number }
  assert.equal(decoded.exp - decoded.iat, 900)
})

// ── Route level: the gate actually bites, before any DB call ────────────────

test('a write route rejects an ai-tools token but accepts a session token', async () => {
  const { PATCH } = await import('../../../app/api/workouts/session/route')
  const denied = await PATCH(req('/api/workouts/session', `Bearer ${await toolToken()}`, 'PATCH'))
  assert.equal(denied.status, 401)

  const allowed = await PATCH(
    req('/api/workouts/session', `Bearer ${await sessionToken()}`, 'PATCH'),
  )
  assert.notEqual(allowed.status, 401, 'ordinary sessions must be unaffected')
})

test('GET /api/auth/me refuses to launder an ai-tools token into a session', async () => {
  const { GET } = await import('../../../app/api/auth/me/route')
  const res = await GET(req('/api/auth/me', `Bearer ${await toolToken()}`))
  assert.equal(res.status, 401)
})

test('GET /api/ai/run/<id> rejects an ai-tools token', async () => {
  const { GET } = await import('../../../app/api/ai/run/[runId]/route')
  const res = await GET(req('/api/ai/run/x', `Bearer ${await toolToken()}`), {
    params: Promise.resolve({ runId: 'x' }),
  })
  assert.equal(res.status, 401)
})

// ── The allowlist must stay exactly one route wide ──────────────────────────

test('/api/ai/context is the route that opts in', () => {
  const src = readFileSync(path.join(APP_API, 'ai', 'context', 'route.ts'), 'utf8')
  assert.match(src, /allowScopes/)
  assert.match(src, /AI_TOOL_SCOPES/)
})

test('no OTHER route may accept a scoped token', () => {
  const optedIn: string[] = []
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name)
      if (entry.isDirectory()) walk(full)
      else if (entry.name === 'route.ts' && readFileSync(full, 'utf8').includes('allowScopes')) {
        optedIn.push(path.relative(APP_API, full))
      }
    }
  }
  walk(APP_API)
  assert.deepEqual(
    optedIn.sort(),
    [path.join('ai', 'context', 'route.ts')],
    'widening the ai-tools allowlist needs a deliberate review — update this test with it',
  )
})
