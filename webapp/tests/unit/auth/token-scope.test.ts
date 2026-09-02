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
//   • exactly five GET handlers opt in, and they are the ones the LIVE
//     become-ai graph calls — verified against the graph's freeform runner
//     node, whose four MCP tools carry
//     `Authorization: Bearer {{state.data.input.userToken}}` into the
//     mcp-gateway `become/data` namespace:
//         become_get_context   -> GET /api/ai/context
//         become_get_progress  -> GET /api/progress?detailed=1
//         become_get_nutrition -> GET /api/nutrition/summary?period=week|month
//         become_get_mind      -> GET /api/mind/progress + GET /api/mind/wins
//     Allowlisting only /api/ai/context would have 401'd the other four on
//     deploy, and the graph degrades to an ungrounded reply rather than
//     erroring, so nothing would have reported it.

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

// ── The allowlist is exactly the graph's tool surface, and no wider ─────────

/** Route files the become-ai tool loop legitimately reaches, GET-only. */
const ALLOWLISTED = [
  ['ai', 'context'],
  ['progress'],
  ['nutrition', 'summary'],
  ['mind', 'progress'],
  ['mind', 'wins'],
].map((segments) => path.join(...segments, 'route.ts'))

test('every tool-surface route opts in', () => {
  for (const rel of ALLOWLISTED) {
    const src = readFileSync(path.join(APP_API, rel), 'utf8')
    assert.match(src, /allowScopes/, `${rel} must opt in`)
    assert.match(src, /AI_TOOL_SCOPES/, `${rel} must use the shared constant`)
  }
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
    [...ALLOWLISTED].sort(),
    'widening the ai-tools allowlist needs a deliberate review against what the live become-ai graph calls — update this test with it',
  )
})

test('the opt-in is READ-only: the POSTs sharing those files still reject it', async () => {
  // /api/progress and /api/mind/wins each export a POST beside the allowlisted
  // GET. The file-level scan above cannot tell them apart, so pin the handlers.
  const progress = await import('../../../app/api/progress/route')
  assert.equal(
    (await progress.POST(req('/api/progress', `Bearer ${await toolToken()}`, 'POST'))).status,
    401,
    'a read token must not be able to write progress',
  )

  const wins = await import('../../../app/api/mind/wins/route')
  assert.equal(
    (await wins.POST(req('/api/mind/wins', `Bearer ${await toolToken()}`, 'POST'))).status,
    401,
    'a read token must not be able to write a win',
  )
})

/** Split a route file into one slice per exported handler, keyed by method. */
function handlerBodies(src: string): Record<string, string> {
  const re = /export async function (GET|POST|PUT|PATCH|DELETE)\b/g
  const starts: Array<{ method: string; at: number }> = []
  for (let m = re.exec(src); m; m = re.exec(src)) starts.push({ method: m[1], at: m.index })

  const out: Record<string, string> = {}
  starts.forEach(({ method, at }, i) => {
    out[method] = src.slice(at, starts[i + 1]?.at ?? src.length)
  })
  return out
}

test('the opt-in sits in the GET handler of every allowlisted route', () => {
  // The file-level scan cannot see WHICH handler opted in. These routes are a
  // read surface for the graph; a token that could POST would be a different
  // and much larger grant. Asserted structurally so it holds with no database.
  for (const rel of ALLOWLISTED) {
    const bodies = handlerBodies(readFileSync(path.join(APP_API, rel), 'utf8'))
    assert.ok(bodies.GET, `${rel} should export a GET`)
    assert.match(bodies.GET, /allowScopes/, `${rel}: the GET must be the opted-in handler`)

    for (const [method, body] of Object.entries(bodies)) {
      if (method === 'GET') continue
      assert.doesNotMatch(
        body,
        /allowScopes/,
        `${rel}: ${method} must not accept a scoped token — the ai-tools token reads, it never writes`,
      )
    }
  }
})
