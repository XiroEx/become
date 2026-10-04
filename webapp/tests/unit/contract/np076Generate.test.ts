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
// Now: the member picks a focus, gets a preview, and Regenerate gives a
// different session. It is permanently UNMETERED (pinned by
// tests/unit/allowance/inventory.test.ts and
// tests/unit/entitlements/generatorFallback.test.ts), so it works for every
// member — including a free one past the AI allowance. The native app reads
// every answer through `shared/api-client/src/schemas/generate.ts`, and until
// this file existed nothing failed when the web changed one.
//
// So the real exported handler is called for real — a signed token, the
// loopback test database, real catalog rows — and the JSON it answers with is
// parsed with the schema the native app reads it through.
//
// ITS OWN FIXTURES, ON PURPOSE. The runner executes test FILES in parallel, so
// this file uses its own members (`@np076.contract.test`), its own catalog
// rows and its own program-free members rather than the shared np015 ones.
// Two files sharing a fixture row would race.

import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import mongoose from 'mongoose'
import { NextRequest } from 'next/server'

// The route. The real exported handler.
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
  type ContractMember,
  type ContractRoute,
  type Handler,
  type HttpMethod,
} from './_contract'

import User from '../../../models/User'
import ExerciseModel from '../../../models/Exercise'
import { invalidateExerciseCache } from '../../../lib/hydrateExercises'
import { signToken } from '../../../lib/auth'

// ---------------------------------------------------------------------------
// The manifest: every route NP-076's schemas describe.
// ---------------------------------------------------------------------------

const NP076_ROUTES: readonly ContractRoute[] = [
  { method: 'POST', path: '/api/generate/session', schema: 'GenerateSessionRequestSchema + GenerateSessionResponseSchema', note: 'focus → preview; Regenerate (no seed) gives a different session; unmetered' },
]

const coverage = new Coverage()

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

/** Free, past any AI allowance: the generator still answers (it is unmetered). */
const MEMBER: ContractMember = {
  id: '6ab0760000000000000f7ee0',
  email: 'free@np076.contract.test',
  label: 'free',
  auth: '',
}

const ALL_MEMBERS = [MEMBER]

const BENCH_SLUG = 'np076-barbell-bench-press'
const ROW_SLUG = 'np076-seated-cable-row'
const PRESS_SLUG = 'np076-overhead-press'
const CURL_SLUG = 'np076-dumbbell-curl'
const SQUAT_SLUG = 'np076-barbell-back-squat'
const PLANK_SLUG = 'np076-plank'

// ---------------------------------------------------------------------------
// Calling a handler
// ---------------------------------------------------------------------------

interface CallResult {
  status: number
  body: unknown
}

async function readJson(response: Response): Promise<CallResult> {
  if (response.status === 204) return { status: 204, body: null }
  const text = await response.text()
  return { status: response.status, body: text ? (JSON.parse(text) as unknown) : null }
}

async function call(
  handler: Handler,
  method: HttpMethod,
  path: string,
  member: ContractMember,
  options: { query?: Record<string, string>; body?: unknown } = {},
): Promise<CallResult> {
  const url = new URL(`http://localhost${path}`)
  for (const [key, value] of Object.entries(options.query ?? {})) {
    url.searchParams.set(key, value)
  }
  const headers = new Headers({
    Authorization: member.auth,
    'Content-Type': 'application/json',
  })
  const request =
    method === 'GET' || options.body === undefined
      ? new NextRequest(url, { method, headers })
      : new NextRequest(url, { method, headers, body: JSON.stringify(options.body) })
  return readJson(await handler(request))
}

// ---------------------------------------------------------------------------
// Seeding
// ---------------------------------------------------------------------------

async function cleanFixtures(): Promise<void> {
  const ids = ALL_MEMBERS.map((m) => new mongoose.Types.ObjectId(m.id))
  const emails = ALL_MEMBERS.map((m) => m.email)
  await User.deleteMany({ $or: [{ _id: { $in: ids } }, { email: { $in: emails } }] })
  await ExerciseModel.deleteMany({
    slug: { $in: [BENCH_SLUG, ROW_SLUG, PRESS_SLUG, CURL_SLUG, SQUAT_SLUG, PLANK_SLUG] },
  })
}

before(async () => {
  process.env.JWT_SECRET ||= 'become-unit-test-secret'
  process.env.ENTITLEMENTS_ENFORCED = '1'

  await mongoose.connect(process.env.MONGODB_URI ?? 'mongodb://127.0.0.1:27017/become-test')
  await cleanFixtures()

  for (const member of ALL_MEMBERS) {
    await User.create({
      _id: new mongoose.Types.ObjectId(member.id),
      email: member.email,
      password: 'contract-test-unused',
      name: `Contract ${member.label}`,
      tier: member.label,
      profile: { fitnessGoal: 'gain_muscle', weightUnit: 'lbs' },
      onboardingCompleted: true,
    })
    member.auth = `Bearer ${await signToken({ userId: member.id, email: member.email })}`
  }

  // Six upper-body strength rows, so a push-focus draw has room to vary.
  const rows = [
    { slug: BENCH_SLUG, name: 'Barbell Bench Press', movementPatterns: ['horizontal_push'], primaryMuscles: ['chest'], equipment: ['barbell', 'flat_bench'] },
    { slug: ROW_SLUG, name: 'Seated Cable Row', movementPatterns: ['horizontal_pull'], primaryMuscles: ['lats'], equipment: ['cable'] },
    { slug: PRESS_SLUG, name: 'Overhead Press', movementPatterns: ['vertical_push'], primaryMuscles: ['front_delts'], equipment: ['barbell'] },
    { slug: CURL_SLUG, name: 'Dumbbell Curl', movementPatterns: ['elbow_flexion'], primaryMuscles: ['biceps'], equipment: ['dumbbell'] },
    { slug: SQUAT_SLUG, name: 'Barbell Back Squat', movementPatterns: ['squat'], primaryMuscles: ['quads'], equipment: ['barbell', 'squat_rack'] },
    { slug: PLANK_SLUG, name: 'Plank', movementPatterns: ['anti_extension'], primaryMuscles: ['abs'], equipment: ['bodyweight'], trackingType: 'time' as const },
  ]
  for (const row of rows) {
    await ExerciseModel.create({
      slug: row.slug,
      name: row.name,
      category: 'strength',
      role: 'accessory',
      movementPatterns: row.movementPatterns,
      laterality: 'bilateral',
      difficulty: 'intermediate',
      primaryMuscles: row.primaryMuscles,
      equipment: row.equipment,
      trackingType: row.trackingType ?? 'reps_weight',
      bodyRegion: 'upper_body',
    })
  }
  invalidateExerciseCache()
})

after(async () => {
  await cleanFixtures()
  await mongoose.disconnect()
})

// ═══════════════════════════════════════════════════════════════════════════
// POST /api/generate/session — focus → preview
// ═══════════════════════════════════════════════════════════════════════════

test('POST /api/generate/session answers a preview for a focus', async () => {
  const requestBody = { focus: 'push' }
  assert.ok(
    GenerateSessionRequestSchema.safeParse(requestBody).success,
    'the body Workout Now sends must validate as the request schema',
  )

  const { status, body } = await call(generateSessionPOST, 'POST', '/api/generate/session', MEMBER, {
    body: requestBody,
  })
  coverage.mark('POST', '/api/generate/session')
  assert.equal(status, 200, JSON.stringify(body))
  assertContract({
    label: 'POST /api/generate/session (push)',
    schema: GenerateSessionResponseSchema,
    body,
    expectKeys: ['session', 'session.title', 'session.exercises', 'seed'],
  })
  const parsed = GenerateSessionResponseSchema.parse(body)
  assert.equal(parsed.session.focus, 'push')
  assert.ok(parsed.session.exercises.length >= 3)
  assert.equal(typeof parsed.seed, 'number')
})

test('POST /api/generate/session without a seed answers a different session (Regenerate)', async () => {
  const first = await call(generateSessionPOST, 'POST', '/api/generate/session', MEMBER, {
    body: { focus: 'push' },
  })
  assert.equal(first.status, 200, JSON.stringify(first.body))
  const second = await call(generateSessionPOST, 'POST', '/api/generate/session', MEMBER, {
    body: { focus: 'push' },
  })
  assert.equal(second.status, 200, JSON.stringify(second.body))
  const a = GenerateSessionResponseSchema.parse(first.body)
  const b = GenerateSessionResponseSchema.parse(second.body)
  // Two unseeded draws mint different seeds, so the sessions differ — that is
  // what the sheet's Regenerate button relies on.
  assert.notDeepEqual(
    a.session.exercises.map((ex) => ex.exerciseSlug),
    b.session.exercises.map((ex) => ex.exerciseSlug),
  )
})

test('POST /api/generate/session refuses a missing focus with 400', async () => {
  const { status } = await call(generateSessionPOST, 'POST', '/api/generate/session', MEMBER, {
    body: {},
  })
  assert.equal(status, 400)
  assert.equal(GenerateSessionRequestSchema.safeParse({}).success, false)
})

test('every route NP-076 covers was actually called with its schema', () => {
  assertEveryRouteCovered(NP076_ROUTES, coverage)
  assert.equal(NP076_ROUTES.length, 1)
  assert.equal(coverage.list().length, 1)
})
