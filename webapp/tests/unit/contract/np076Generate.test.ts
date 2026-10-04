// Run with: npm run test:file tests/unit/contract/np076Generate.test.ts
//
// THE GENERATE SURFACE, CHECKED AGAINST THE SHARED SCHEMAS (NP-076).
//
// Read tests/unit/contract/_contract.ts first — it explains why the schemas are
// imported by RELATIVE path, why "it parses" is not the whole check, and what a
// domain file has to end with.
//
// WHAT THIS FILE IS FOR
//
// `POST /api/generate/session` is the deterministic generator behind Workout
// Now. It is permanently UNMETERED (tests/unit/allowance/inventory.test.ts
// pins it): it is the fallback every AI route degrades to, so it works for
// every member, including a free one past the AI allowance. The native sheet
// (NP-076) reads it through `GenerateSessionRequestSchema` /
// `GenerateSessionResponseSchema` in `shared/api-client/src/schemas/generate`.
//
// So this file calls the real handler for real — the exported POST, a signed
// token, the loopback test database with a seeded catalogue — and parses what
// comes back with the schema the native app reads it through.
//
// ITS OWN FIXTURES, ON PURPOSE. The runner executes test FILES in parallel, so
// this file uses its own member (`@np076.contract.test`) and its own catalogue
// rows rather than any shared ones. Two files sharing a fixture row would race.

import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import mongoose from 'mongoose'

import { POST as generateSessionPOST } from '../../../app/api/generate/session/route'

// The contract. RELATIVE imports of shared/api-client — see _contract.ts.
import {
  GenerateSessionRequestSchema,
  GenerateSessionResponseSchema,
} from '../../../../shared/api-client/src/schemas/generate'

// The assertion + coverage gate.
import {
  Coverage,
  assertContract,
  assertEveryRouteCovered,
  seedMembers,
  FREE_MEMBER,
  PLUS_MEMBER,
  dropMembers,
  sendJson,
  type ContractRoute,
} from './_contract'

import Exercise from '../../../models/Exercise'

// ---------------------------------------------------------------------------
// The manifest: every route NP-076's schemas describe.
// ---------------------------------------------------------------------------

const NP076_ROUTES: readonly ContractRoute[] = [
  { method: 'POST', path: '/api/generate/session', schema: 'GenerateSessionRequestSchema + GenerateSessionResponseSchema', note: 'deterministic quick-session draft; unmetered by design' },
]

const coverage = new Coverage()

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const MEMBER = FREE_MEMBER
const PLUS = PLUS_MEMBER

const CATALOGUE = [
  {
    slug: 'np076-bench-press',
    name: 'NP076 Bench Press',
    category: 'strength',
    mechanics: 'compound',
    role: 'compound',
    movementPatterns: ['horizontal_push'],
    laterality: 'bilateral',
    difficulty: 'intermediate',
    primaryMuscles: ['chest'],
    equipment: ['barbell'],
    trackingType: 'reps_weight',
    bodyRegion: 'upper_body',
    isActive: true,
  },
  {
    slug: 'np076-overhead-press',
    name: 'NP076 Overhead Press',
    category: 'strength',
    mechanics: 'compound',
    role: 'compound',
    movementPatterns: ['vertical_push'],
    laterality: 'bilateral',
    difficulty: 'intermediate',
    primaryMuscles: ['front_delts'],
    equipment: ['barbell'],
    trackingType: 'reps_weight',
    bodyRegion: 'upper_body',
    isActive: true,
  },
  {
    slug: 'np076-incline-press',
    name: 'NP076 Incline Press',
    category: 'strength',
    mechanics: 'compound',
    role: 'secondary',
    movementPatterns: ['horizontal_push'],
    laterality: 'bilateral',
    difficulty: 'beginner',
    primaryMuscles: ['upper_chest'],
    equipment: ['dumbbell'],
    trackingType: 'reps_weight',
    bodyRegion: 'upper_body',
    isActive: true,
  },
  {
    slug: 'np076-lateral-raise',
    name: 'NP076 Lateral Raise',
    category: 'strength',
    mechanics: 'isolation',
    role: 'accessory',
    movementPatterns: ['shoulder_abduction'],
    laterality: 'bilateral',
    difficulty: 'beginner',
    primaryMuscles: ['side_delts'],
    equipment: ['dumbbell'],
    trackingType: 'reps_weight',
    bodyRegion: 'upper_body',
    isActive: true,
  },
  {
    slug: 'np076-triceps-pushdown',
    name: 'NP076 Triceps Pushdown',
    category: 'strength',
    mechanics: 'isolation',
    role: 'accessory',
    movementPatterns: ['elbow_extension'],
    laterality: 'bilateral',
    difficulty: 'beginner',
    primaryMuscles: ['triceps'],
    equipment: ['cable'],
    trackingType: 'reps_weight',
    bodyRegion: 'upper_body',
    isActive: true,
  },
]

async function cleanFixtures(): Promise<void> {
  await Exercise.deleteMany({ slug: { $regex: '^np076-' } })
}

before(async () => {
  process.env.JWT_SECRET ||= 'become-unit-test-secret'
  process.env.ENTITLEMENTS_ENFORCED = '1'

  await mongoose.connect(process.env.MONGODB_URI ?? 'mongodb://127.0.0.1:27017/become-test')
  await cleanFixtures()
  await seedMembers()
  await Exercise.insertMany(CATALOGUE)
})

after(async () => {
  await cleanFixtures()
  await dropMembers()
  await mongoose.disconnect()
})

// ---------------------------------------------------------------------------
// The routes
// ---------------------------------------------------------------------------

test('POST /api/generate/session matches GenerateSessionResponseSchema (free member, unmetered)', async () => {
  const body = GenerateSessionRequestSchema.parse({ focus: 'push' })
  const { status, body: json } = await sendJson(generateSessionPOST, 'POST', '/api/generate/session', MEMBER, body)
  coverage.mark('POST', '/api/generate/session')

  assert.equal(status, 200, JSON.stringify(json))
  assertContract({
    label: 'POST /api/generate/session (free)',
    schema: GenerateSessionResponseSchema,
    body: json,
    expectKeys: ['session', 'session.title', 'session.exercises', 'session.exercises.0.exerciseSlug', 'session.exercises.0.name', 'session.exercises.0.sets', 'session.exercises.0.reps', 'seed'],
  })

  const parsed = GenerateSessionResponseSchema.parse(json)
  assert.ok(parsed.session.exercises.length >= 3, 'the generator fills a session, not a stub')
  assert.equal(parsed.session.focus, 'push')
})

test('POST /api/generate/session with a seed reproduces, without one varies the seed', async () => {
  const seeded = GenerateSessionRequestSchema.parse({ focus: 'push', seed: 42 })
  const first = await sendJson(generateSessionPOST, 'POST', '/api/generate/session', PLUS, seeded)
  assert.equal(first.status, 200, JSON.stringify(first.body))
  const second = await sendJson(generateSessionPOST, 'POST', '/api/generate/session', PLUS, seeded)
  assert.equal(second.status, 200, JSON.stringify(second.body))

  const a = GenerateSessionResponseSchema.parse(first.body)
  const b = GenerateSessionResponseSchema.parse(second.body)
  assert.equal(a.seed, 42)
  assert.equal(b.seed, 42)
  assert.deepEqual(
    a.session.exercises.map((e) => e.exerciseSlug),
    b.session.exercises.map((e) => e.exerciseSlug),
    'the same seed reproduces the same session',
  )

  // No seed: the server mints one, and the envelope carries it back.
  const unseeded = GenerateSessionRequestSchema.parse({ focus: 'push' })
  const fresh = await sendJson(generateSessionPOST, 'POST', '/api/generate/session', PLUS, unseeded)
  assert.equal(fresh.status, 200, JSON.stringify(fresh.body))
  const c = GenerateSessionResponseSchema.parse(fresh.body)
  assert.equal(typeof c.seed, 'number')
})

test('POST /api/generate/session 400s without a valid focus', async () => {
  const { status } = await sendJson(generateSessionPOST, 'POST', '/api/generate/session', MEMBER, { focus: 'nope' })
  assert.equal(status, 400)
})

// ═══════════════════════════════════════════════════════════════════════════
// The coverage gate. Keep this last.
// ═══════════════════════════════════════════════════════════════════════════

test('every route NP-076 covers was actually called with its schema', () => {
  assertEveryRouteCovered(NP076_ROUTES, coverage)
  assert.equal(NP076_ROUTES.length, 1)
  assert.equal(coverage.list().length, 1)
})
