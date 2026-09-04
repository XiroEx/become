// Run with: npx tsx --test tests/unit/security/admin-revocation.test.ts
//
// REGRESSION: revoking admin never took effect.
//
// GET /api/auth/me is a sliding session — it mints a fresh 30-day token on
// every call. It minted that token with `role: payload.role`, the role claim
// from the token it was HANDED, inside the very handler that had already loaded
// the User row from Mongo. So a demoted admin refreshed their own stale claim
// into a brand new token on every app open and stayed admin forever.
//
// That mattered because a long list of write paths trusted the claim:
// PATCH/DELETE of ANY member's food, PATCH/DELETE of any meal, the meal, recipe
// and program image routes, meal-plans/bulk-from-meal, and the
// isVerified/isFirstClass escalation on POST /api/nutrition/foods.
//
// Two halves, both required:
//   1. refreshedSessionClaims() — the refresh reads the DATABASE row, so the
//      claim goes stale within one call;
//   2. isVerifiedAdmin() — every route that WIDENS access on the strength of an
//      admin claim confirms it against the database, so a token already in the
//      wild cannot use its stale claim either.
//
// The claim is still consulted first, as a fast NEGATIVE only: a token that
// does not assert admin cannot be one, so ordinary members never pay for the
// extra read.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { refreshedSessionClaims, signToken, verifyToken } from '../../../lib/auth'
import { claimsAdmin, isVerifiedAdmin } from '../../../lib/adminAuth'

const ROOT = path.join(__dirname, '../../..')
const readSource = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8')

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) walk(full, out)
    else if (entry.name.endsWith('.ts')) out.push(full)
  }
  return out
}

const payload = { userId: 'u1', email: 'stale@example.com', role: 'admin' }

// ── refreshedSessionClaims: the database wins ───────────────────────────────

test('THE BUG: a demoted admin does NOT get admin back on refresh', () => {
  const claims = refreshedSessionClaims(payload, { email: 'u@example.com', role: 'user' })
  assert.equal(claims.role, 'user')
})

test('a user whose role field was removed refreshes with no role at all', () => {
  const claims = refreshedSessionClaims(payload, { email: 'u@example.com' })
  assert.equal(claims.role, undefined)
})

test('a real admin keeps admin', () => {
  const claims = refreshedSessionClaims(
    { userId: 'u1', email: 'a@example.com' },
    { email: 'a@example.com', role: 'admin' },
  )
  assert.equal(claims.role, 'admin')
})

test('a PROMOTION also lands on the next refresh, not only on a fresh login', () => {
  const claims = refreshedSessionClaims(
    { userId: 'u1', email: 'a@example.com', role: 'user' },
    { email: 'a@example.com', role: 'admin' },
  )
  assert.equal(claims.role, 'admin')
})

test('the email comes from the row, falling back to the verified payload', () => {
  assert.equal(
    refreshedSessionClaims(payload, { email: 'new@example.com', role: 'user' }).email,
    'new@example.com',
  )
  assert.equal(refreshedSessionClaims(payload, { role: 'user' }).email, 'stale@example.com')
})

test('userId is taken from the verified token, never from the row', () => {
  // It is the identity the token proved and the key the row was loaded by, so
  // it can never disagree — and reading it from the row would silently
  // retarget the session if the wrong document were ever passed in.
  const claims = refreshedSessionClaims(payload, {
    email: 'x@example.com',
    role: 'user',
    // @ts-expect-error — proving a stray field cannot move the session
    _id: 'someone-else',
  })
  assert.equal(claims.userId, 'u1')
})

test('a null row (deleted user) yields no role', () => {
  assert.equal(refreshedSessionClaims(payload, null).role, undefined)
})

// ── End to end through the real token codec ─────────────────────────────────

test('the token a demoted admin actually receives does not assert admin', async () => {
  process.env.JWT_SECRET ||= 'unit-test-placeholder'
  const token = await signToken(refreshedSessionClaims(payload, { role: 'user' }))
  const decoded = await verifyToken(token)
  assert.notEqual(decoded.role, 'admin')

  // And the control: an actual admin's refreshed token still carries it.
  const adminToken = await signToken(refreshedSessionClaims(payload, { role: 'admin' }))
  assert.equal((await verifyToken(adminToken)).role, 'admin')
})

// ── claimsAdmin: the fast negative, and only that ───────────────────────────

test('claimsAdmin is false for everything that is not an explicit admin claim', () => {
  assert.equal(claimsAdmin({ userId: 'u1', role: 'user' }), false)
  assert.equal(claimsAdmin({ userId: 'u1', role: 'trainer' }), false)
  assert.equal(claimsAdmin({ userId: 'u1' }), false)
  assert.equal(claimsAdmin({ role: 'admin' }), false)
  assert.equal(claimsAdmin({ userId: '', role: 'admin' }), false)
  assert.equal(claimsAdmin(null), false)
  assert.equal(claimsAdmin(undefined), false)
})

test('claimsAdmin is true only for a well-formed admin claim', () => {
  assert.equal(claimsAdmin({ userId: 'u1', role: 'admin' }), true)
})

test('isVerifiedAdmin short-circuits a non-admin claim without touching Mongo', async () => {
  // The hot path: no database round trip is added for ordinary members. If this
  // ever started connecting it would hang here (no Mongo in the unit env).
  process.env.MONGODB_URI ||= 'mongodb://127.0.0.1:27017/become-unit-test'
  const started = Date.now()
  assert.equal(await isVerifiedAdmin({ userId: 'u1', role: 'user' }), false)
  assert.equal(await isVerifiedAdmin(null), false)
  assert.ok(Date.now() - started < 1000, 'isVerifiedAdmin tried to reach the database')
})

// ── Source guards ───────────────────────────────────────────────────────────

test('/api/auth/me mints from the database row, never from the presented claim', () => {
  const src = readSource('app/api/auth/me/route.ts')
  assert.match(src, /refreshedSessionClaims\(payload, user/)
  assert.doesNotMatch(
    src,
    /role:\s*payload\.role/,
    '/api/auth/me must not re-mint the role claim it was handed',
  )
})

test('no API route decides admin from a verifyAuth role claim', () => {
  // verifyAuth returns the JWT claim verbatim. Branching on it is exactly the
  // bug: it survives a demotion for the life of the token. The legitimate
  // sources are isVerifiedAdmin / requireAdmin / verifyTrainerOrAdmin (all read
  // the User row) and the entitlement gates, whose `role` comes from
  // loadUserEntitlement().
  const offenders: string[] = []
  for (const file of walk(path.join(ROOT, 'app/api'))) {
    const src = fs.readFileSync(file, 'utf8')
    // Strip comments so the explanatory notes in the routes do not match.
    const code = src.replace(/\/\/[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '')
    if (/\b(authResult|auth|authed)\.role\s*[!=]==\s*['"]admin['"]/.test(code)) {
      offenders.push(path.relative(ROOT, file))
    }
  }
  assert.deepEqual(offenders, [], `admin decided from a token claim in: ${offenders.join(', ')}`)
})

test('the routes that used to trust the claim now confirm it', () => {
  // Each of these branched on `authResult.role === 'admin'` to act on data the
  // caller did not own.
  const CONFIRMS = [
    'app/api/nutrition/foods/[id]/route.ts',
    'app/api/nutrition/foods/route.ts',
    'app/api/meals/[id]/route.ts',
    'app/api/meals/[id]/image/route.ts',
    'app/api/meals/[id]/log/route.ts',
    'app/api/meal-plans/bulk-from-meal/route.ts',
    'app/api/nutrition/recipes/[id]/image/route.ts',
  ]
  for (const rel of CONFIRMS) {
    assert.match(
      readSource(rel),
      /isVerifiedAdmin\(|gate\.role === 'admin'/,
      `${rel} lost its database-backed admin check`,
    )
  }

  // The program image routes are admin-ONLY, so they take the whole gate.
  const programImage = readSource('app/api/programs/[programId]/image/route.ts')
  assert.match(programImage, /requireAdmin\(request\)/)
  assert.doesNotMatch(programImage, /role !== 'admin'/)
})

test('isVerifiedAdmin reads the role from Mongo and fails closed', () => {
  const src = readSource('lib/adminAuth.ts')
  assert.match(src, /export async function isVerifiedAdmin/)
  assert.match(src, /User\.findById\(auth!\.userId\)\.select\('role'\)/)
  // A throw must deny, not escalate.
  assert.match(src, /catch \(error\) \{[\s\S]*?return false/)
})
