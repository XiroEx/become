// Run with: npm run test:file tests/unit/entitlements/gates.test.ts
//
// Route tests need a live Mongo + auth context this suite does not stand up
// (same rationale as the other route tests here), so this is a source scan. It
// exists because the two mistakes in this area are silent:
//
//   - gating a MUTATE route locks a capped member out of their own data with no
//     way back under the cap, and
//   - gating the wrong CREATE route (or forgetting one) either breaks core
//     logging or leaves a free bypass.
//
// Both read fine in review and only show up in production.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

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

// ─── Only three writers may touch User.tier ──────────────────────────────────

test('no API route other than the admin one writes tier', () => {
  // Tier is DERIVED state. The three legitimate writers are admin tooling,
  // scripts/migrate-tiers.mjs, and the billing webhook (not built yet). Any
  // other route setting it would be deriving a tier on a request path, which
  // grandfathers members automatically.
  const ALLOWED = new Set(['app/api/admin/users/[id]/route.ts'])
  const offenders: string[] = []

  for (const file of walk(path.join(ROOT, 'app/api'))) {
    const rel = path.relative(ROOT, file)
    const src = fs.readFileSync(file, 'utf8')
    // `tier: <value>` inside an object literal, or `x.tier = ...`. Case
    // sensitive, so `requiresTier:` and `sessionsLimit` are not matched.
    const writes = /\btier\s*:\s*['"]/.test(src) || /\.tier\s*=[^=]/.test(src)
    if (writes && !ALLOWED.has(rel)) offenders.push(rel)
  }

  assert.deepEqual(offenders, [], `unexpected tier writers: ${offenders.join(', ')}`)
})

test('the admin route validates tier against TIERS and also accepts grandfathered', () => {
  const src = readSource('app/api/admin/users/[id]/route.ts')
  assert.match(src, /TIERS\.includes\(body\.tier/)
  assert.match(src, /update\.tier = body\.tier/)
  assert.match(src, /update\.grandfathered = body\.grandfathered/)
  // Boolean() coercion is what made `{"grandfathered":"false"}` set the flag
  // TRUE. Neither of the two access-deciding booleans may be coerced.
  assert.doesNotMatch(src, /Boolean\(body\.grandfathered\)/)
  assert.doesNotMatch(src, /Boolean\(body\.onboardingCompleted\)/)
})

// ─── Create paths are quota-gated ────────────────────────────────────────────

const CREATE_GATES: Array<[string, string]> = [
  ['app/api/programs/custom/route.ts', 'custom-programs'],
  ['app/api/exercises/custom/route.ts', 'custom-exercises'],
  ['app/api/meals/route.ts', 'custom-meals'],
  ['app/api/meal-logs/combine/route.ts', 'custom-meals'],
  ['app/api/nutrition/recipes/[id]/to-meal/route.ts', 'custom-meals'],
  ['app/api/nutrition/foods/route.ts', 'custom-foods'],
  ['app/api/meals/[id]/save-as-food/route.ts', 'custom-foods'],
  ['app/api/nutrition/recipes/[id]/save-as-food/route.ts', 'custom-foods'],
  ['app/api/workouts/session/route.ts', 'custom-sessions'],
]

test('every create route calls requireQuota with its own feature key', () => {
  for (const [rel, feature] of CREATE_GATES) {
    const src = readSource(rel)
    assert.match(
      src,
      new RegExp(`requireQuota\\(\\s*(request|req),\\s*['"]${feature}['"]`),
      `${rel} must gate creation on ${feature}`,
    )
  }
})

// ─── Mutate paths are NOT quota-gated (the anti-lockout rule) ────────────────

test('own-item mutate routes keep requireFeature and never take a quota', () => {
  // A free member sitting at 3/3 must still be able to rename, re-record and
  // DELETE what they own — deleting is the only way back under an inventory
  // cap. Swapping any of these to requireQuota is a hard lockout.
  const MUTATE_ONLY = [
    'app/api/exercises/custom/[slug]/route.ts',
    'app/api/exercises/custom/[slug]/submit/route.ts',
    'app/api/exercises/custom/[slug]/video/route.ts',
    'app/api/exercises/custom/[slug]/trim/route.ts',
    'app/api/programs/custom/[programId]/route.ts',
    'app/api/meals/[id]/route.ts',
  ]
  for (const rel of MUTATE_ONLY) {
    const src = readSource(rel)
    assert.match(src, /requireFeature\(/, `${rel} lost its requireFeature guard`)
    assert.doesNotMatch(src, /requireQuota\(/, `${rel} must not be quota-gated`)
  }

  // The custom-exercise collection route carries both: POST creates (quota),
  // DELETE removes (feature only, so it is always available at the cap).
  const collection = readSource('app/api/exercises/custom/route.ts')
  assert.match(collection, /requireQuota\(req, "custom-exercises"\)/)
  assert.match(collection, /requireFeature\(req, "custom-exercises"\)/)
})

// ─── Routes that must stay wide open ─────────────────────────────────────────

test('food catalog import is never gated', () => {
  // POST /api/nutrition/foods/import materialises a USDA/OpenFoodFacts search
  // hit into a Food doc SO IT CAN BE LOGGED — including the manual fallback
  // when the source import fails. It looks like custom-food creation and is
  // not. Gating it stops free members logging food from search at all, which
  // is the single easiest way to break the app.
  const src = readSource('app/api/nutrition/foods/import/route.ts')
  assert.doesNotMatch(src, /requireQuota\(/)
  assert.doesNotMatch(src, /requireFeature\(/)
})

test('assist, transcription and catalog-enrolment routes are never gated', () => {
  const OPEN = [
    // A within-builder complement/suggest helper, not a generation.
    'app/api/generate/session/complete/route.ts',
    // Pasting in a program you already have is transcription, not generation.
    'app/api/ai/workout/import/route.ts',
    // Starting a coach program is the thing the app exists to do.
    'app/api/programs/enroll/route.ts',
    'app/api/programs/saved/route.ts',
    // Bookmarking an existing catalog food is not creating a custom one.
    'app/api/me/foods/route.ts',
  ]
  for (const rel of OPEN) {
    const src = readSource(rel)
    assert.doesNotMatch(src, /requireQuota\(/, `${rel} must not be quota-gated`)
    assert.doesNotMatch(src, /requireFeature\(/, `${rel} must not be tier-gated`)
  }
})

test('saving a workout is never refused — only the star is soft-dropped', () => {
  // Quick-session logs ARE workout history. Capping their creation caps
  // history, which is unshippable; the keepable artifact is the favorite flag.
  const src = readSource('app/api/workouts/route.ts')
  assert.match(src, /peekQuota\(payload\.userId, 'custom-sessions'\)/)
  assert.match(src, /favoriteDenied/)
  assert.match(src, /\.\.\.\(carryFavorite && \{ favorite: true \}\)/)
  // The soft path peeks; it must never consume or return a gate response.
  const quickSave = src.slice(src.indexOf('async function handleQuickSessionSave'))
  assert.doesNotMatch(quickSave, /gateResponse\(/)
  assert.doesNotMatch(quickSave, /requireQuota\(/)
  assert.doesNotMatch(quickSave, /status:\s*403/)
})

// ─── The kill-switch has no bypasses ─────────────────────────────────────────

test('no route hand-rolls a tier check around hasFeature', () => {
  // meal-logs/combine used to call loadUserEntitlement + hasFeature directly,
  // which meant it 403'd for free members even with ENTITLEMENTS_ENFORCED off.
  // Every gate must go through requireFeature/requireQuota so the switch and
  // the allowances apply uniformly.
  const offenders: string[] = []
  for (const file of walk(path.join(ROOT, 'app/api'))) {
    const src = fs.readFileSync(file, 'utf8')
    if (/\bhasFeature\s*\(/.test(src)) offenders.push(path.relative(ROOT, file))
  }
  assert.deepEqual(offenders, [], `routes calling hasFeature directly: ${offenders.join(', ')}`)
})

// ─── Mind + Vision ───────────────────────────────────────────────────────────

test('Vision is gated on write and open on read', () => {
  const src = readSource('app/api/mind/vision/route.ts')
  const get = src.slice(src.indexOf('export async function GET'), src.indexOf('export async function PATCH'))
  const patch = src.slice(src.indexOf('export async function PATCH'), src.indexOf('export async function POST'))
  const post = src.slice(src.indexOf('export async function POST'))

  assert.match(patch, /requireFeature\(request, 'vision'\)/)
  assert.match(post, /requireFeature\(request, 'vision'\)/)
  // GET stays open: an existing vision must still render, and the teaser wants
  // the real data shape.
  assert.doesNotMatch(get, /requireFeature\(/)
})

test('Mind sessions 1-10 are gated on both the start and the completion', () => {
  const src = readSource('app/api/mind/session/route.ts')
  assert.match(src, /'mind-sessions'/)
  assert.match(src, /async function mindSessionGate/)

  const post = src.slice(src.indexOf('export async function POST'), src.indexOf('export async function PUT'))
  const put = src.slice(src.indexOf('export async function PUT'))
  // PUT is the first write of a composed session. Gating only the POST would
  // walk a locked member through a whole session before refusing it.
  assert.match(post, /mindSessionGate\(/)
  assert.match(put, /mindSessionGate\(/)

  // GET reports the lock so the hub can draw it before Begin.
  const get = src.slice(src.indexOf('export async function GET'), src.indexOf('export async function POST'))
  assert.match(get, /locked: mindLocked/)
  assert.match(get, /sessionsUsed/)
  assert.match(get, /sessionsLimit/)
})

// ─── PATCH /api/admin/users/[id] — the two access-deciding fields ────────────
//
// This is the ONE route allowed to write `tier`, `grandfathered` and `role`, so
// its input validation is the whole perimeter. Both defects it carried were
// silent:
//
//   - `Boolean(body.grandfathered)` made the JSON body {"grandfathered":"false"}
//     set the flag TRUE, because every non-empty string is truthy. A field that
//     decides who we promised never to charge cannot be coerced.
//   - `tier` and `grandfathered` were writable independently, which mints
//     `tier:'free' + grandfathered:true` — the row loadUserEntitlement logs as a
//     bug, because it gates a member as free while telling them they are
//     grandfathered.
//
// The handler's own branches run before any query, but verifyAdmin and the
// read-before-write do not, so the data-plane modules are stubbed here.
// require.cache is keyed by resolved filename and `@/lib/...` resolves to the
// same file as the relative path, so the stubs are what the route receives.

type UserRow = { _id: string; role?: string; tier?: string; grandfathered?: boolean }

const ACTOR_ID = 'deadbeefdeadbeefdeadbeef'
const TARGET_ID = '69ee5d9a0a303c1b8a6f4457'

let adminResult: Record<string, unknown> = { success: true, userId: ACTOR_ID, email: 'admin@become.io' }
let currentRow: UserRow | null = null
let lastSet: Record<string, unknown> | null = null
let auditLines: unknown[][] = []

function stub(rel: string, exports: Record<string, unknown>) {
  const filename = require.resolve(path.join(ROOT, rel))
  require.cache[filename] = { id: filename, filename, loaded: true, exports } as unknown as NodeModule
}

// Chainable enough for `.select(...).lean()`.
function chain(value: unknown) {
  const link: Record<string, unknown> = {}
  link.select = () => link
  link.lean = async () => value
  link.then = (resolve: (v: unknown) => unknown) => Promise.resolve(value).then(resolve)
  return link
}

const FakeUser = {
  findById: () => chain(currentRow),
  findByIdAndUpdate: (_id: string, doc: { $set: Record<string, unknown> }) => {
    lastSet = doc.$set
    return chain({ ...(currentRow ?? {}), ...doc.$set })
  },
  findByIdAndDelete: () => chain(null),
}

stub('lib/adminAuth.ts', { verifyAdmin: async () => adminResult })
stub('lib/mongodb.ts', { __esModule: true, default: async () => undefined })
stub('models/User.ts', { __esModule: true, default: FakeUser })
stub('models/UserProgress.ts', {
  __esModule: true,
  default: { findOne: () => chain(null), deleteOne: async () => undefined },
})
stub('models/MindProgress.ts', { __esModule: true, default: { findOne: () => chain(null) } })

// eslint-disable-next-line @typescript-eslint/no-require-imports
const adminUserRoute = require(path.join(ROOT, 'app/api/admin/users/[id]/route.ts')) as {
  PATCH: (req: unknown, ctx: { params: Promise<{ id: string }> }) => Promise<Response>
}

async function patch(body: unknown, targetId: string = TARGET_ID) {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { NextRequest } = require('next/server') as typeof import('next/server')
  const req = new NextRequest(`http://localhost/api/admin/users/${targetId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  })
  lastSet = null
  auditLines = []
  const originalInfo = console.info
  console.info = (...args: unknown[]) => {
    if (args[0] === '[admin-audit]') auditLines.push(args)
    else originalInfo(...args)
  }
  try {
    const res = await adminUserRoute.PATCH(req, { params: Promise.resolve({ id: targetId }) })
    return { status: res.status, json: await res.json() as Record<string, unknown> }
  } finally {
    console.info = originalInfo
  }
}

function reset(row: UserRow) {
  adminResult = { success: true, userId: ACTOR_ID, email: 'admin@become.io' }
  currentRow = row
}

// ── Booleans are booleans ────────────────────────────────────────────────────

test('grandfathered rejects a non-boolean instead of coercing it', async () => {
  // The exact reported defect: "false" is a non-empty string, so Boolean()
  // returned true and the PATCH granted the flag it was asked to remove.
  reset({ _id: TARGET_ID, tier: 'plus', grandfathered: true })
  const res = await patch({ grandfathered: 'false' })
  assert.equal(res.status, 400)
  assert.match(String(res.json.error), /grandfathered must be a boolean/)
  assert.equal(lastSet, null, 'a rejected body must not reach the database')
})

test('grandfathered rejects other truthy non-booleans too', async () => {
  for (const value of [1, 'true', 'yes', {}, []]) {
    reset({ _id: TARGET_ID, tier: 'plus', grandfathered: false })
    const res = await patch({ grandfathered: value })
    assert.equal(res.status, 400, `grandfathered: ${JSON.stringify(value)} must be refused`)
  }
})

test('grandfathered accepts a real boolean', async () => {
  reset({ _id: TARGET_ID, tier: 'plus', grandfathered: false })
  const res = await patch({ grandfathered: true })
  assert.equal(res.status, 200)
  assert.equal(lastSet?.grandfathered, true)
})

test('onboardingCompleted is validated the same way', async () => {
  reset({ _id: TARGET_ID, tier: 'free' })
  assert.equal((await patch({ onboardingCompleted: 'false' })).status, 400)
  reset({ _id: TARGET_ID, tier: 'free' })
  const ok = await patch({ onboardingCompleted: false })
  assert.equal(ok.status, 200)
  assert.equal(lastSet?.onboardingCompleted, false)
})

// ── tier and grandfathered move together ─────────────────────────────────────

test('demoting to free clears grandfathered when the body is silent about it', async () => {
  reset({ _id: TARGET_ID, tier: 'plus', grandfathered: true })
  const res = await patch({ tier: 'free' })
  assert.equal(res.status, 200)
  assert.equal(lastSet?.tier, 'free')
  assert.equal(lastSet?.grandfathered, false, 'the flag must not survive the demotion')
})

test('tier:free + grandfathered:true is refused rather than silently corrected', async () => {
  reset({ _id: TARGET_ID, tier: 'plus', grandfathered: true })
  const res = await patch({ tier: 'free', grandfathered: true })
  assert.equal(res.status, 400)
  assert.match(String(res.json.error), /grandfathered requires tier 'plus'/)
  assert.equal(lastSet, null)
})

test('grandfathered:true alone is refused when the stored tier is not plus', async () => {
  // Same impossible row, reached from the other side: only one field is in the
  // body, so the check has to resolve against what is already stored.
  reset({ _id: TARGET_ID, tier: 'free', grandfathered: false })
  const res = await patch({ grandfathered: true })
  assert.equal(res.status, 400)
  assert.match(String(res.json.error), /resolved tier: 'free'/)
  assert.equal(lastSet, null)
})

test('grandfathered:true alongside tier:plus is the coherent pair and passes', async () => {
  reset({ _id: TARGET_ID, tier: 'free', grandfathered: false })
  const res = await patch({ tier: 'plus', grandfathered: true })
  assert.equal(res.status, 200)
  assert.equal(lastSet?.tier, 'plus')
  assert.equal(lastSet?.grandfathered, true)
})

test('the body may still clear the flag explicitly while demoting', async () => {
  reset({ _id: TARGET_ID, tier: 'plus', grandfathered: true })
  const res = await patch({ tier: 'free', grandfathered: false })
  assert.equal(res.status, 200)
  assert.equal(lastSet?.grandfathered, false)
})

test('a legacy tier row cannot be handed the flag', async () => {
  // migrate-tiers.mjs has not run for this row; 'pro' is not plus, so the pair
  // is incoherent and the write is refused rather than half-applied.
  reset({ _id: TARGET_ID, tier: 'pro', grandfathered: false })
  const res = await patch({ grandfathered: true })
  assert.equal(res.status, 400)
  assert.equal(lastSet, null)
})

// ── The remaining hardening ──────────────────────────────────────────────────

test('an admin cannot change their own role', async () => {
  // DELETE already refuses self-deletion; without the same guard here the last
  // admin can demote themselves and no route is left that could undo it.
  reset({ _id: ACTOR_ID, role: 'admin', tier: 'plus' })
  const res = await patch({ role: 'user' }, ACTOR_ID)
  assert.equal(res.status, 400)
  assert.match(String(res.json.error), /Cannot change your own role/)
  assert.equal(lastSet, null)
})

test('another admin may still be demoted', async () => {
  reset({ _id: TARGET_ID, role: 'admin', tier: 'plus' })
  const res = await patch({ role: 'user' })
  assert.equal(res.status, 200)
  assert.equal(lastSet?.role, 'user')
})

test('malformed JSON is a 400, not a 500', async () => {
  reset({ _id: TARGET_ID, tier: 'free' })
  const res = await patch('not-json{{{')
  assert.equal(res.status, 400)
  assert.match(String(res.json.error), /Invalid JSON body/)
})

test('every accepted write emits an audit line with the actor and the old values', async () => {
  reset({ _id: TARGET_ID, role: 'user', tier: 'plus', grandfathered: true })
  const res = await patch({ tier: 'free' })
  assert.equal(res.status, 200)
  assert.equal(auditLines.length, 1, 'exactly one [admin-audit] line per write')

  const entry = auditLines[0][1] as Record<string, unknown>
  assert.equal(entry.actorId, ACTOR_ID)
  assert.equal(entry.targetId, TARGET_ID)
  assert.deepEqual(entry.fields, ['tier', 'grandfathered'])
  assert.deepEqual(entry.before, { role: 'user', tier: 'plus', grandfathered: true })
  assert.deepEqual(entry.after, { role: 'user', tier: 'free', grandfathered: false })
})

test('a refused write leaves no audit line', async () => {
  reset({ _id: TARGET_ID, tier: 'free' })
  await patch({ grandfathered: true })
  assert.equal(auditLines.length, 0)
})
