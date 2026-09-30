// Run with: npm run test:file tests/unit/contract/np020Exercises.test.ts
//
// THE EXERCISE CATALOGUE SURFACE, CHECKED AGAINST THE SHARED SCHEMAS (NP-020).
//
// Read tests/unit/contract/_contract.ts first — it explains why the schemas are
// imported by RELATIVE path, why "it parses" is not the whole check, and what a
// domain file has to end with.
//
// WHAT THIS FILE IS FOR
//
// shared/api-client described ONE of these eleven routes, with six of a swap
// candidate's sixteen fields: `trackingType`, `laterality` and
// `movementPatterns` — the three the live screen needs to log a replacement at
// all — rode through `.passthrough()` untyped, and search, variations, the
// custom-exercise CRUD, the quick-session hydrate call and the demo-video list
// had no schema whatsoever. So every route below is called for real — the
// exported handler, a signed token, the loopback test database — and parsed with
// the schema the native app reads it through.
//
// ITS OWN FIXTURES, ON PURPOSE. The runner executes test FILES in parallel
// against ONE database, so this file uses its own member
// (`@np020.contract.test`), its own `np020-` exercise slugs and its own
// `NP020 …` display names. Nothing here counts rows it did not create, and the
// search query is the fixture prefix rather than a real word, so a catalogue
// another file (or a previous local run) left behind cannot change an assertion.

import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import mongoose from 'mongoose'
import type { NextRequest } from 'next/server'

// The routes. Real exported handlers.
import { GET as alternativesGET } from '../../../app/api/exercises/alternatives/route'
import { GET as searchGET } from '../../../app/api/exercises/search/route'
import { GET as variationsGET } from '../../../app/api/exercises/variations/route'
import {
  GET as customGET,
  POST as customPOST,
  DELETE as customDELETE,
} from '../../../app/api/exercises/custom/route'
import { PATCH as customPATCH } from '../../../app/api/exercises/custom/[slug]/route'
import {
  POST as submitPOST,
  DELETE as submitDELETE,
} from '../../../app/api/exercises/custom/[slug]/submit/route'
import { POST as hydratePOST } from '../../../app/api/exercises/hydrate/route'
import { GET as exerciseVideosGET } from '../../../app/api/exercise-videos/route'

// The contract. RELATIVE imports of shared/api-client — see _contract.ts.
import {
  AlternativeCandidateSchema,
  CustomExerciseDeleteResponseSchema,
  CustomExerciseResponseSchema,
  CustomExerciseSubmitResponseSchema,
  CustomExerciseWriteRequestSchema,
  CustomExercisesResponseSchema,
  ExerciseAlternativesQuerySchema,
  ExerciseAlternativesResponseSchema,
  ExerciseHydrateRequestSchema,
  ExerciseHydrateResponseSchema,
  ExerciseSearchResponseSchema,
  ExerciseVariationsResponseSchema,
  ExerciseVideoResponseSchema,
  ExerciseVideosResponseSchema,
  type CustomExerciseWriteRequest,
  type ExerciseHydrateRequest,
} from '../../../../shared/api-client/src/schemas/exercises'

// The assertion + coverage gate.
import {
  Coverage,
  assertContract,
  assertEveryRouteCovered,
  getJson,
  sendJson,
  type ContractMember,
  type ContractRoute,
  type Handler,
} from './_contract'

import User from '../../../models/User'
import Exercise from '../../../models/Exercise'
import ExerciseVideo from '../../../models/ExerciseVideo'
import { invalidateExerciseCache } from '../../../lib/hydrateExercises'
import { signToken } from '../../../lib/auth'

// ---------------------------------------------------------------------------
// The manifest: every route NP-020's schemas describe.
// ---------------------------------------------------------------------------

const NP020_ROUTES: readonly ContractRoute[] = [
  { method: 'GET', path: '/api/exercises/alternatives', schema: 'ExerciseAlternativesResponseSchema', note: 'the swap picker: trackingType, laterality, movementPatterns' },
  { method: 'GET', path: '/api/exercises/search', schema: 'ExerciseSearchResponseSchema', note: 'projected .lean() rows — `_id` is on the wire' },
  { method: 'GET', path: '/api/exercises/variations', schema: 'ExerciseVariationsResponseSchema', note: 'hand-built rows; the source exercise is first' },
  { method: 'GET', path: '/api/exercises/custom', schema: 'CustomExercisesResponseSchema', note: 'the caller\'s own, with media + review fields' },
  { method: 'POST', path: '/api/exercises/custom', schema: 'CustomExerciseResponseSchema', note: 'quota-gated (free: 3 lifetime)' },
  { method: 'PATCH', path: '/api/exercises/custom/[slug]', schema: 'CustomExerciseResponseSchema', note: 'same request shape as POST' },
  { method: 'POST', path: '/api/exercises/custom/[slug]/submit', schema: 'CustomExerciseSubmitResponseSchema', note: 'into the admin queue, not visible yet' },
  { method: 'DELETE', path: '/api/exercises/custom/[slug]/submit', schema: 'CustomExerciseSubmitResponseSchema', note: 'withdraw: the status ALONE comes back' },
  { method: 'DELETE', path: '/api/exercises/custom', schema: 'CustomExerciseDeleteResponseSchema', note: '?slug= in the query, not a path segment' },
  { method: 'POST', path: '/api/exercises/hydrate', schema: 'ExerciseHydrateResponseSchema', note: 'index-aligned video fields for a quick session' },
  { method: 'GET', path: '/api/exercise-videos', schema: 'ExerciseVideosResponseSchema + ExerciseVideoResponseSchema', note: 'TWO envelopes: { videos } and { video }' },
]

// Deliberately NOT here: the admin/upload verbs on these paths (POST
// /api/exercise-videos, the per-slug video/trim/framing writers) and
// GET /api/exercises, which is NP-016's `ExercisesListResponseSchema`.

const coverage = new Coverage()

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const MEMBER: ContractMember = {
  id: '6ab0200000000000000f7ee0',
  email: 'plus@np020.contract.test',
  label: 'plus',
  auth: '',
}

const SOURCE_SLUG = 'np020-barbell-back-squat'
const SOURCE_NAME = 'NP020 Barbell Back Squat'
/** The fixture prefix, used as the search query — see the header. */
const SEARCH_QUERY = 'np020'

/** An owned custom exercise, seeded directly so its score is predictable. */
const OWNED_CUSTOM_SLUG = 'np020-custom-dumbbell-box-squat'
const OWNED_CUSTOM_VIDEO = 'https://cdn.become.test/np020/dumbbell-box-squat.mp4'

/** The demo-video rows. `?name=` is keyed on the DISPLAY name, not the slug. */
const VIDEO_NAME = SOURCE_NAME
const VIDEO_URL = 'https://cdn.become.test/np020/barbell-back-squat.mp4'

/**
 * The catalogue. Four exercises that share a body region and a primary muscle,
 * so `findAlternatives` scores them against each other and `isVariationOf`
 * keeps the squat family together.
 */
const CATALOGUE = [
  {
    slug: SOURCE_SLUG,
    name: SOURCE_NAME,
    aliases: ['NP020 Back Squat'],
    category: 'strength',
    mechanics: 'compound',
    role: 'compound',
    movementPatterns: ['squat'],
    laterality: 'bilateral',
    difficulty: 'intermediate',
    primaryMuscles: ['quads', 'glutes'],
    secondaryMuscles: ['hamstrings', 'lower_back'],
    stabilizers: ['abs'],
    equipment: ['barbell', 'squat_rack'],
    trackingType: 'reps_weight',
    bodyRegion: 'lower_body',
    tags: ['np020'],
    // The catalogue half of the demo: a video, its intrinsic size, and the two
    // admin overrides. `/api/exercises/hydrate` answers with exactly these.
    videoUrl: VIDEO_URL,
    thumbnailUrl: 'https://cdn.become.test/np020/barbell-back-squat.jpg',
    videoWidth: 1080,
    videoHeight: 1920,
    videoFraming: { fit: 'cover', positionX: 50, positionY: 40, zoom: 110 },
    videoTrim: { start: 0.5, end: 6.25 },
    // Explicitly linked, so one candidate carries isExplicitAlternative: true.
    alternatives: ['np020-goblet-squat'],
    variations: ['np020-front-squat'],
    isActive: true,
  },
  {
    slug: 'np020-goblet-squat',
    name: 'NP020 Goblet Squat',
    category: 'strength',
    mechanics: 'compound',
    role: 'secondary',
    movementPatterns: ['squat'],
    laterality: 'bilateral',
    difficulty: 'beginner',
    primaryMuscles: ['quads', 'glutes'],
    equipment: ['kettlebell'],
    trackingType: 'reps_weight',
    bodyRegion: 'lower_body',
    isActive: true,
  },
  {
    slug: 'np020-front-squat',
    name: 'NP020 Front Squat',
    category: 'strength',
    mechanics: 'compound',
    role: 'compound',
    movementPatterns: ['squat'],
    laterality: 'bilateral',
    difficulty: 'advanced',
    primaryMuscles: ['quads'],
    equipment: ['barbell'],
    trackingType: 'reps_weight',
    bodyRegion: 'lower_body',
    isActive: true,
  },
  {
    // A different region entirely: it must NOT reach the squat picker.
    slug: 'np020-lat-pulldown',
    name: 'NP020 Lat Pulldown',
    category: 'strength',
    mechanics: 'compound',
    role: 'secondary',
    movementPatterns: ['vertical_pull'],
    laterality: 'bilateral',
    difficulty: 'beginner',
    primaryMuscles: ['lats'],
    equipment: ['lat_pulldown'],
    trackingType: 'reps_weight',
    bodyRegion: 'upper_body',
    isActive: true,
  },
]

async function cleanFixtures(): Promise<void> {
  const objectId = new mongoose.Types.ObjectId(MEMBER.id)
  await User.deleteMany({ $or: [{ _id: objectId }, { email: MEMBER.email }] })
  // Both the seeded rows and anything POST /api/exercises/custom minted (its
  // slug carries a timestamp, so it cannot be named up front).
  await Exercise.deleteMany({
    $or: [{ slug: { $regex: '^np020-' } }, { createdBy: MEMBER.id }],
  })
  await ExerciseVideo.deleteMany({ $or: [{ slug: { $regex: '^np020-' } }, { exerciseName: { $regex: '^NP020' } }] })
}

before(async () => {
  process.env.JWT_SECRET ||= 'become-unit-test-secret'
  // With the kill-switch off, every entitlement is granted and the quota gate
  // on POST /api/exercises/custom is not the one production runs.
  process.env.ENTITLEMENTS_ENFORCED = '1'

  await mongoose.connect(process.env.MONGODB_URI ?? 'mongodb://127.0.0.1:27017/become-test')
  await cleanFixtures()

  await User.create({
    _id: new mongoose.Types.ObjectId(MEMBER.id),
    email: MEMBER.email,
    // Legacy column, `required` on the model; magic-link members never use it.
    password: 'contract-test-unused',
    name: 'Contract Exercises',
    // Plus, so `requireFeature`/`requireQuota` answer `full` and the CRUD
    // below is testing the ROUTE rather than the gate.
    tier: 'plus',
    onboardingCompleted: true,
  })
  MEMBER.auth = `Bearer ${await signToken({ userId: MEMBER.id, email: MEMBER.email })}`

  await Exercise.insertMany(CATALOGUE)

  // One of the member's own exercises, seeded rather than POSTed so the swap
  // picker has a predictable `isCustom: true` row with a video of its own.
  await Exercise.create({
    slug: OWNED_CUSTOM_SLUG,
    name: 'NP020 Dumbbell Box Squat',
    category: 'strength',
    mechanics: 'compound',
    role: 'accessory',
    movementPatterns: ['squat'],
    laterality: 'bilateral',
    difficulty: 'beginner',
    primaryMuscles: ['quads'],
    secondaryMuscles: ['glutes'],
    stabilizers: [],
    equipment: ['dumbbell', 'box'],
    trackingType: 'reps_weight',
    bodyRegion: 'lower_body',
    tags: ['np020', 'custom'],
    videoUrl: OWNED_CUSTOM_VIDEO,
    isActive: true,
    isCustom: true,
    createdBy: MEMBER.id,
    isUniversal: false,
    reviewStatus: 'none',
  })

  await ExerciseVideo.create({
    slug: SOURCE_SLUG,
    exerciseName: VIDEO_NAME,
    videoUrl: VIDEO_URL,
    thumbnailUrl: 'https://cdn.become.test/np020/barbell-back-squat.jpg',
    isPlaceholder: false,
    storageKey: 'np020/barbell-back-squat.mp4',
    status: 'active',
    sizeBytes: 2_411_003,
    mimeType: 'video/mp4',
    uploadedBy: new mongoose.Types.ObjectId(MEMBER.id),
    videoWidth: 1080,
    videoHeight: 1920,
    framing: { fit: 'contain', positionX: 50, positionY: 50, zoom: 100 },
    trim: { start: 0.5, end: 5.25 },
  })

  // lib/hydrateExercises caches the catalogue by slug for the life of the
  // process; a cache built before this seeding would make the hydrate route
  // answer for an empty catalogue.
  invalidateExerciseCache()
})

after(async () => {
  await cleanFixtures()
  await mongoose.disconnect()
})

/**
 * A `[slug]` route takes Next's second argument. Bound here so the handler
 * matches the harness's one-argument `Handler`, and so the slug the URL names
 * and the slug the handler is given can never disagree.
 */
function withSlug(
  handler: (
    request: NextRequest,
    context: { params: Promise<{ slug: string }> },
  ) => Promise<Response>,
  slug: string,
): Handler {
  return (request) => handler(request, { params: Promise.resolve({ slug }) })
}

// ═══════════════════════════════════════════════════════════════════════════
// GET /api/exercises/alternatives — the reason this ticket exists
// ═══════════════════════════════════════════════════════════════════════════

test('GET /api/exercises/alternatives matches ExerciseAlternativesResponseSchema with the logging fields TYPED', async () => {
  // Typed at the call site from the shared request schema: the two list params
  // are COMMA-SEPARATED strings, which is the mistake this makes impossible.
  const query = ExerciseAlternativesQuerySchema.parse({
    slug: SOURCE_SLUG,
    workoutSlugs: 'np020-lat-pulldown',
    programRole: 'compound',
    limit: 30,
  })

  const { status, body } = await getJson(alternativesGET, '/api/exercises/alternatives', MEMBER, {
    slug: query.slug,
    workoutSlugs: query.workoutSlugs!,
    programRole: query.programRole!,
    limit: String(query.limit),
  })
  coverage.mark('GET', '/api/exercises/alternatives')

  assert.equal(status, 200, JSON.stringify(body))
  assertContract({
    label: 'GET /api/exercises/alternatives',
    schema: ExerciseAlternativesResponseSchema,
    body,
    expectKeys: [
      // The richer `source` — this used to be typed as `{ slug, name }` only.
      'source.slug',
      'source.name',
      'source.primaryMuscles',
      'source.movementPatterns',
      'source.equipment',
      'source.bodyRegion',
      'source.role',
      'source.category',
      'alternatives',
      'alternatives.0.slug',
      'alternatives.0.name',
      'alternatives.0.score',
      'alternatives.0.reasons',
      'alternatives.0.equipment',
      'alternatives.0.primaryMuscles',
      // The three the swap picker cannot log a replacement without.
      'alternatives.0.trackingType',
      'alternatives.0.laterality',
      'alternatives.0.movementPatterns',
      'alternatives.0.difficulty',
      'alternatives.0.category',
      'alternatives.0.bodyRegion',
      'alternatives.0.role',
      'alternatives.0.isExplicitAlternative',
      'alternatives.0.isCustom',
      'alternatives.0.videoUrl',
      'total',
    ],
  })

  const parsed = ExerciseAlternativesResponseSchema.parse(body)
  assert.equal(parsed.source?.slug, SOURCE_SLUG)
  assert.deepEqual(parsed.source?.movementPatterns, ['squat'])
  assert.equal(parsed.total, parsed.alternatives.length)

  const bySlug = new Map(parsed.alternatives.map((alt) => [alt.slug, alt]))

  // Every candidate reads its logging metadata off the PARSED row, with no
  // cast: that is the whole point of the re-alignment.
  const goblet = bySlug.get('np020-goblet-squat')
  assert.ok(goblet, `the explicitly-linked alternative is missing: ${[...bySlug.keys()].join(', ')}`)
  assert.equal(goblet.trackingType, 'reps_weight')
  assert.equal(goblet.laterality, 'bilateral')
  assert.deepEqual(goblet.movementPatterns, ['squat'])
  assert.equal(goblet.bodyRegion, 'lower_body')
  assert.equal(goblet.role, 'secondary')
  assert.equal(goblet.difficulty, 'beginner')
  assert.equal(goblet.isExplicitAlternative, true, 'the catalogue links these two')
  assert.equal(goblet.isCustom, false)
  assert.equal(goblet.videoUrl, null, 'a catalogue row with no upload answers null, not absent')
  assert.ok((goblet.score ?? 0) > 15, 'the scorer drops anything under 15')
  assert.ok((goblet.reasons ?? []).length > 0)

  // The member's own exercise: `isCustom` and a row-local `videoUrl`, because a
  // custom exercise's demo lives on its own document and the native picker has
  // no second list to merge it in from.
  const custom = bySlug.get(OWNED_CUSTOM_SLUG)
  assert.ok(custom, 'the member\'s own exercise is a swap candidate')
  assert.equal(custom.isCustom, true)
  assert.equal(custom.videoUrl, OWNED_CUSTOM_VIDEO)
  assert.equal(custom.laterality, 'bilateral')

  // `workoutSlugs` is a penalty, not a filter, but a different body region is
  // scored out entirely.
  assert.equal(bySlug.has('np020-lat-pulldown'), false)
  // And never the source itself.
  assert.equal(bySlug.has(SOURCE_SLUG), false)

  // Two of the shared schema's tolerances, confirmed against the real body:
  // only slug + name are required of a row (the picker merges hand-built ones),
  // and every row the ROUTE sends carries far more than that.
  assert.equal(AlternativeCandidateSchema.safeParse({ slug: 'x', name: 'X' }).success, true)
})

// ═══════════════════════════════════════════════════════════════════════════
// GET /api/exercises/search
// ═══════════════════════════════════════════════════════════════════════════

test('GET /api/exercises/search matches ExerciseSearchResponseSchema, `_id` included', async () => {
  const { status, body } = await getJson(searchGET, '/api/exercises/search', MEMBER, {
    q: SEARCH_QUERY,
    limit: '20',
  })
  coverage.mark('GET', '/api/exercises/search')

  assert.equal(status, 200, JSON.stringify(body))
  assertContract({
    label: 'GET /api/exercises/search',
    schema: ExerciseSearchResponseSchema,
    body,
    expectKeys: [
      'exercises',
      // Rule 2: a projected `.lean()` read still carries `_id`.
      'exercises.0._id',
      'exercises.0.slug',
      'exercises.0.name',
      'exercises.0.aliases',
      'exercises.0.trackingType',
      'exercises.0.equipment',
      'exercises.0.laterality',
      'exercises.0.movementPatterns',
      'exercises.0.primaryMuscles',
      'exercises.0.secondaryMuscles',
      'exercises.0.category',
      'exercises.0.bodyRegion',
      'exercises.0.role',
      'exercises.0.difficulty',
      'exercises.0.videoUrl',
      'exercises.0.isCustom',
    ],
  })

  const parsed = ExerciseSearchResponseSchema.parse(body)
  const slugs = parsed.exercises.map((e) => e.slug)
  // The whole fixture family, and the member's own exercise with it.
  for (const slug of [SOURCE_SLUG, 'np020-goblet-squat', 'np020-front-squat', 'np020-lat-pulldown', OWNED_CUSTOM_SLUG]) {
    assert.ok(slugs.includes(slug), `${slug} is missing from ${slugs.join(', ')}`)
  }

  const source = parsed.exercises.find((e) => e.slug === SOURCE_SLUG)
  assert.ok(source)
  // Enough classification to build a swap row from a search hit with no second
  // round-trip — which is exactly what the web modal does with it.
  assert.equal(source.trackingType, 'reps_weight')
  assert.equal(source.laterality, 'bilateral')
  assert.deepEqual(source.movementPatterns, ['squat'])
  assert.deepEqual(source.aliases, ['NP020 Back Squat'])
  assert.equal(source.isCustom, false)
  assert.equal(source.videoUrl, VIDEO_URL)
  assert.match(source._id ?? '', /^[0-9a-f]{24}$/)

  const own = parsed.exercises.find((e) => e.slug === OWNED_CUSTOM_SLUG)
  assert.equal(own?.isCustom, true)
})

test('GET /api/exercises/search answers 200 with an empty list under two characters', async () => {
  // Not a 400: a half-typed query must read as "no matches" rather than an
  // error the add/swap flow has to handle.
  const { status, body } = await getJson(searchGET, '/api/exercises/search', MEMBER, { q: 'n' })
  assert.equal(status, 200)
  assertContract({
    label: 'GET /api/exercises/search (q too short)',
    schema: ExerciseSearchResponseSchema,
    body,
    expectKeys: ['exercises'],
  })
  assert.deepEqual(ExerciseSearchResponseSchema.parse(body).exercises, [])
})

// ═══════════════════════════════════════════════════════════════════════════
// GET /api/exercises/variations
// ═══════════════════════════════════════════════════════════════════════════

test('GET /api/exercises/variations matches ExerciseVariationsResponseSchema, source first', async () => {
  const { status, body } = await getJson(variationsGET, '/api/exercises/variations', MEMBER, {
    slug: SOURCE_SLUG,
  })
  coverage.mark('GET', '/api/exercises/variations')

  assert.equal(status, 200, JSON.stringify(body))
  assertContract({
    label: 'GET /api/exercises/variations',
    schema: ExerciseVariationsResponseSchema,
    body,
    expectKeys: [
      'variations',
      'variations.0.slug',
      'variations.0.name',
      'variations.0.equipment',
      'variations.0.laterality',
      'variations.0.difficulty',
      'variations.0.trackingType',
      'variations.0.category',
      'variations.0.movementPatterns',
      'sourceSlug',
    ],
  })

  const parsed = ExerciseVariationsResponseSchema.parse(body)
  assert.equal(parsed.sourceSlug, SOURCE_SLUG)
  // The list is "this movement's family", so the source exercise is row 0.
  assert.equal(parsed.variations[0]?.slug, SOURCE_SLUG)
  // The rest of the squat family: same pattern set, shared primary muscle,
  // same body region. The lat pulldown is in neither.
  const slugs = parsed.variations.map((v) => v.slug)
  assert.deepEqual(
    [...slugs].sort(),
    [OWNED_CUSTOM_SLUG, SOURCE_SLUG, 'np020-front-squat', 'np020-goblet-squat'].sort(),
  )

  // Switching a variation in re-derives the live exercise's `type` from
  // `category` and its weight convention from `movementPatterns` + equipment,
  // so no row may be missing them.
  for (const variation of parsed.variations) {
    assert.equal(variation.category, 'strength')
    assert.equal(variation.trackingType, 'reps_weight')
    assert.deepEqual(variation.movementPatterns, ['squat'])
    assert.ok(variation.equipment.length > 0)
  }
})

// ═══════════════════════════════════════════════════════════════════════════
// /api/exercises/custom — create, list, edit, submit, withdraw, delete
// ═══════════════════════════════════════════════════════════════════════════

/** The slug POST mints (it ends in a timestamp), shared by the tests below. */
let createdSlug = ''

test('POST /api/exercises/custom matches CustomExerciseResponseSchema', async () => {
  // Typed at the call site: create and edit take the SAME body, so this object
  // is a CustomExerciseWriteRequest rather than a literal that hopes to be one.
  const request: CustomExerciseWriteRequest = {
    name: 'NP020 Sandbag Shoulder Carry',
    trackingType: 'time_distance',
    muscleGroup: 'core',
    primaryMuscles: ['abs', 'traps'],
    secondaryMuscles: ['glutes'],
    stabilizers: ['obliques'],
    equipment: ['backpack'],
    movementPatterns: ['carry'],
    laterality: 'unilateral',
    mechanics: 'compound',
    difficulty: 'intermediate',
    category: 'conditioning',
    role: 'accessory',
    defaultSets: 3,
    defaultReps: '40 m',
  }
  assert.equal(CustomExerciseWriteRequestSchema.safeParse(request).success, true)

  const { status, body } = await sendJson(
    customPOST,
    'POST',
    '/api/exercises/custom',
    MEMBER,
    request,
  )
  coverage.mark('POST', '/api/exercises/custom')

  assert.equal(status, 200, JSON.stringify(body))
  assertContract({
    label: 'POST /api/exercises/custom',
    schema: CustomExerciseResponseSchema,
    body,
    expectKeys: [
      'exercise.slug',
      'exercise.name',
      'exercise.trackingType',
      'exercise.primaryMuscles',
      'exercise.secondaryMuscles',
      'exercise.stabilizers',
      'exercise.bodyRegion',
      'exercise.category',
      'exercise.equipment',
      'exercise.mechanics',
      'exercise.movementPatterns',
      'exercise.laterality',
      'exercise.role',
      'exercise.difficulty',
      'exercise.defaultSets',
      'exercise.defaultReps',
      'exercise.tags',
      'exercise.videoUrl',
      'exercise.thumbnailUrl',
      'exercise.createdAt',
      'exercise.isUniversal',
      'exercise.reviewStatus',
      'exercise.submittedAt',
      'exercise.reviewNote',
    ],
  })

  const parsed = CustomExerciseResponseSchema.parse(body)
  createdSlug = parsed.exercise.slug
  assert.match(createdSlug, /^custom-/)
  assert.equal(parsed.exercise.trackingType, 'time_distance')
  assert.equal(parsed.exercise.laterality, 'unilateral')
  assert.deepEqual(parsed.exercise.movementPatterns, ['carry'])
  assert.equal(parsed.exercise.defaultSets, 3)
  // Media is echoed as null on create, so a caller can hold ONE shape for a
  // custom exercise whether it came from POST or from GET.
  assert.equal(parsed.exercise.videoUrl, null)
  assert.equal(parsed.exercise.thumbnailUrl, null)
  // Owner-private until an admin approves it: submitting is a later, separate
  // step, and nothing here grants visibility.
  assert.equal(parsed.exercise.isUniversal, false)
  assert.equal(parsed.exercise.reviewStatus, 'none')
  assert.equal(parsed.exercise.submittedAt, null)
  assert.equal(parsed.exercise.reviewNote, null)
})

test('GET /api/exercises/custom matches CustomExercisesResponseSchema', async () => {
  const { status, body } = await getJson(customGET, '/api/exercises/custom', MEMBER)
  coverage.mark('GET', '/api/exercises/custom')

  assert.equal(status, 200, JSON.stringify(body))
  assertContract({
    label: 'GET /api/exercises/custom',
    schema: CustomExercisesResponseSchema,
    body,
    expectKeys: [
      'exercises',
      // Rule 2 again: this is a projected `.lean()` read.
      'exercises.0._id',
      'exercises.0.slug',
      'exercises.0.name',
      'exercises.0.trackingType',
      'exercises.0.primaryMuscles',
      'exercises.0.secondaryMuscles',
      'exercises.0.stabilizers',
      'exercises.0.mechanics',
      'exercises.0.movementPatterns',
      'exercises.0.laterality',
      'exercises.0.bodyRegion',
      'exercises.0.category',
      'exercises.0.equipment',
      'exercises.0.role',
      'exercises.0.difficulty',
      'exercises.0.tags',
      // Media, so a custom exercise's own demo renders everywhere a catalogue
      // one does — the library card, the swap modal, the workout view.
      'exercises.0.videoUrl',
      'exercises.0.thumbnailUrl',
      'exercises.0.videoWidth',
      'exercises.0.videoHeight',
      'exercises.0.createdAt',
      'exercises.0.isUniversal',
      'exercises.0.reviewStatus',
      'exercises.0.submittedAt',
      'exercises.0.reviewNote',
    ],
  })

  const parsed = CustomExercisesResponseSchema.parse(body)
  const slugs = parsed.exercises.map((e) => e.slug)
  // Only the caller's own, and both of them: the seeded one and the POSTed one.
  assert.deepEqual([...slugs].sort(), [OWNED_CUSTOM_SLUG, createdSlug].sort())

  const own = parsed.exercises.find((e) => e.slug === OWNED_CUSTOM_SLUG)
  assert.ok(own)
  assert.equal(own.videoUrl, OWNED_CUSTOM_VIDEO)
  assert.equal(own.reviewStatus, 'none')
  assert.equal(own.isUniversal, false)
  assert.equal(own.laterality, 'bilateral')
})

test('PATCH /api/exercises/custom/[slug] matches CustomExerciseResponseSchema', async () => {
  assert.ok(createdSlug, 'POST must run first')

  // The same request schema as POST — one shape, so create and edit can never
  // drift into accepting different bodies.
  const request: CustomExerciseWriteRequest = {
    name: 'NP020 Sandbag Front Carry',
    trackingType: 'time',
    muscleGroup: 'core',
    primaryMuscles: ['abs'],
    equipment: ['backpack'],
    movementPatterns: ['carry'],
    laterality: 'bilateral',
    mechanics: 'compound',
    difficulty: 'beginner',
    category: 'conditioning',
    role: 'accessory',
    defaultSets: '4',
  }
  assert.equal(CustomExerciseWriteRequestSchema.safeParse(request).success, true)

  const { status, body } = await sendJson(
    withSlug(customPATCH, createdSlug),
    'PATCH',
    `/api/exercises/custom/${createdSlug}`,
    MEMBER,
    request,
  )
  coverage.mark('PATCH', '/api/exercises/custom/[slug]')

  assert.equal(status, 200, JSON.stringify(body))
  assertContract({
    label: 'PATCH /api/exercises/custom/[slug]',
    schema: CustomExerciseResponseSchema,
    body,
    expectKeys: [
      'exercise.slug',
      'exercise.name',
      'exercise.trackingType',
      'exercise.laterality',
      'exercise.movementPatterns',
      'exercise.equipment',
      'exercise.tags',
      'exercise.defaultSets',
      'exercise.isUniversal',
      'exercise.reviewStatus',
      'exercise.submittedAt',
      'exercise.reviewNote',
    ],
  })

  const parsed = CustomExerciseResponseSchema.parse(body)
  assert.equal(parsed.exercise.slug, createdSlug, 'an edit never re-slugs')
  assert.equal(parsed.exercise.name, 'NP020 Sandbag Front Carry')
  assert.equal(parsed.exercise.trackingType, 'time')
  assert.equal(parsed.exercise.laterality, 'bilateral')
  assert.equal(parsed.exercise.defaultSets, 4, 'a string default is parsed to a number')
  // Tags are REBUILT from the new classification, not added to: a
  // `time_distance` exercise edited to `time` gains the tag that describes how
  // it is now measured and LOSES the one that described how it used to be.
  const tags = parsed.exercise.tags ?? []
  assert.ok(tags.includes('isometric'), tags.join(', '))
  assert.equal(tags.includes('cardio'), false, tags.join(', '))
})

test('POST /api/exercises/custom/[slug]/submit matches CustomExerciseSubmitResponseSchema', async () => {
  assert.ok(createdSlug, 'POST must run first')

  const { status, body } = await sendJson(
    withSlug(submitPOST, createdSlug),
    'POST',
    `/api/exercises/custom/${createdSlug}/submit`,
    MEMBER,
    {},
  )
  coverage.mark('POST', '/api/exercises/custom/[slug]/submit')

  assert.equal(status, 200, JSON.stringify(body))
  assertContract({
    label: 'POST /api/exercises/custom/[slug]/submit',
    schema: CustomExerciseSubmitResponseSchema,
    body,
    // The two fields it changed — NOT the whole exercise.
    expectKeys: ['reviewStatus', 'submittedAt'],
  })

  const parsed = CustomExerciseSubmitResponseSchema.parse(body)
  assert.equal(parsed.reviewStatus, 'pending')
  assert.ok(parsed.submittedAt, 'an instant, so the queue can be ordered')

  // Submitting grants no visibility: `isUniversal` is what every catalogue read
  // checks and only an admin approval flips it.
  const stored = await Exercise.findOne({ slug: createdSlug }).lean<{ isUniversal?: boolean } | null>()
  assert.equal(stored?.isUniversal ?? false, false)

  // And a second submission is a 409, not a silent re-queue.
  const again = await sendJson(
    withSlug(submitPOST, createdSlug),
    'POST',
    `/api/exercises/custom/${createdSlug}/submit`,
    MEMBER,
    {},
  )
  assert.equal(again.status, 409)
})

test('DELETE /api/exercises/custom/[slug]/submit withdraws with the status ALONE', async () => {
  assert.ok(createdSlug, 'POST must run first')

  const { status, body } = await sendJson(
    withSlug(submitDELETE, createdSlug),
    'DELETE',
    `/api/exercises/custom/${createdSlug}/submit`,
    MEMBER,
    {},
  )
  coverage.mark('DELETE', '/api/exercises/custom/[slug]/submit')

  assert.equal(status, 200, JSON.stringify(body))
  assertContract({
    label: 'DELETE /api/exercises/custom/[slug]/submit',
    schema: CustomExerciseSubmitResponseSchema,
    body,
    expectKeys: ['reviewStatus'],
  })

  const parsed = CustomExerciseSubmitResponseSchema.parse(body)
  assert.equal(parsed.reviewStatus, 'none')
  // `submittedAt` is not echoed on a withdrawal — which is why the shared
  // schema has it optional rather than required.
  assert.equal(parsed.submittedAt, undefined)
})

test('DELETE /api/exercises/custom?slug= matches CustomExerciseDeleteResponseSchema', async () => {
  assert.ok(createdSlug, 'POST must run first')

  // The slug is a QUERY parameter here, not a path segment — the one verb on
  // this surface that does not take it in the path.
  const { status, body } = await sendJson(
    customDELETE,
    'DELETE',
    `/api/exercises/custom?slug=${encodeURIComponent(createdSlug)}`,
    MEMBER,
    {},
  )
  coverage.mark('DELETE', '/api/exercises/custom')

  assert.equal(status, 200, JSON.stringify(body))
  assertContract({
    label: 'DELETE /api/exercises/custom',
    schema: CustomExerciseDeleteResponseSchema,
    body,
    expectKeys: ['ok'],
  })
  assert.equal(CustomExerciseDeleteResponseSchema.parse(body).ok, true)
  assert.equal(await Exercise.countDocuments({ slug: createdSlug }), 0)

  // Deleting it twice is a 404, not a second `{ ok: true }`.
  const again = await sendJson(
    customDELETE,
    'DELETE',
    `/api/exercises/custom?slug=${encodeURIComponent(createdSlug)}`,
    MEMBER,
    {},
  )
  assert.equal(again.status, 404)
})

// ═══════════════════════════════════════════════════════════════════════════
// POST /api/exercises/hydrate — the quick session's video lookup
// ═══════════════════════════════════════════════════════════════════════════

test('POST /api/exercises/hydrate matches ExerciseHydrateResponseSchema and is INDEX-ALIGNED', async () => {
  const request: ExerciseHydrateRequest = {
    exercises: [
      { exerciseSlug: SOURCE_SLUG, name: SOURCE_NAME },
      // Nothing in the catalogue: the entry must still be there, empty, or the
      // caller's merge-by-index lands the wrong video on the wrong lift.
      { exerciseSlug: 'np020-no-such-exercise', name: 'NP020 No Such Exercise' },
      { exerciseSlug: OWNED_CUSTOM_SLUG },
    ],
  }
  assert.equal(ExerciseHydrateRequestSchema.safeParse(request).success, true)

  const { status, body } = await sendJson(
    hydratePOST,
    'POST',
    '/api/exercises/hydrate',
    MEMBER,
    request,
  )
  coverage.mark('POST', '/api/exercises/hydrate')

  assert.equal(status, 200, JSON.stringify(body))
  assertContract({
    label: 'POST /api/exercises/hydrate',
    schema: ExerciseHydrateResponseSchema,
    body,
    expectKeys: [
      'exercises',
      'exercises.0.videoUrl',
      'exercises.0.thumbnailUrl',
      'exercises.0.videoWidth',
      'exercises.0.videoHeight',
      'exercises.0.videoFraming',
      'exercises.0.videoFraming.fit',
      'exercises.0.videoFraming.positionX',
      'exercises.0.videoFraming.positionY',
      'exercises.0.videoFraming.zoom',
      'exercises.0.videoTrim',
      'exercises.0.videoTrim.start',
      'exercises.0.videoTrim.end',
    ],
  })

  const parsed = ExerciseHydrateResponseSchema.parse(body)
  // Rule 3: one entry per requested exercise, in the order asked.
  assert.equal(parsed.exercises.length, request.exercises.length)
  assert.equal(parsed.exercises[0]?.videoUrl, VIDEO_URL)
  assert.equal(parsed.exercises[0]?.videoWidth, 1080)
  assert.equal(parsed.exercises[0]?.videoFraming?.fit, 'cover')
  assert.equal(parsed.exercises[0]?.videoTrim?.end, 6.25)
  // The unknown slug: an EMPTY object, not a null and not a dropped element.
  assert.deepEqual(parsed.exercises[1], {})
  assert.equal(parsed.exercises[2]?.videoUrl, OWNED_CUSTOM_VIDEO)
  // Video fields ONLY: the caller already has the name and classification.
  assert.equal((parsed.exercises[0] as Record<string, unknown>).name, undefined)

  // An empty request is answered, not refused.
  const empty = await sendJson(hydratePOST, 'POST', '/api/exercises/hydrate', MEMBER, {
    exercises: [],
  })
  assert.deepEqual(ExerciseHydrateResponseSchema.parse(empty.body).exercises, [])
})

// ═══════════════════════════════════════════════════════════════════════════
// GET /api/exercise-videos — two envelopes from one route
// ═══════════════════════════════════════════════════════════════════════════

test('GET /api/exercise-videos matches ExerciseVideosResponseSchema, whole documents and all', async () => {
  const { status, body } = await getJson(exerciseVideosGET, '/api/exercise-videos', MEMBER)
  coverage.mark('GET', '/api/exercise-videos')

  assert.equal(status, 200, JSON.stringify(body))
  assertContract({
    label: 'GET /api/exercise-videos',
    schema: ExerciseVideosResponseSchema,
    body,
    expectKeys: ['videos'],
  })

  const parsed = ExerciseVideosResponseSchema.parse(body)
  const mine = parsed.videos.find((v) => v.exerciseName === VIDEO_NAME)
  assert.ok(mine, 'the seeded demo video is in the list')
  assert.equal(mine.slug, SOURCE_SLUG, 'the canonical key onto the exercise')
  assert.equal(mine.videoUrl, VIDEO_URL)
  assert.equal(mine.isPlaceholder, false)
  assert.equal(mine.status, 'active')
  assert.equal(mine.storageKey, 'np020/barbell-back-squat.mp4')
  assert.equal(mine.mimeType, 'video/mp4')
  // The two admin overrides this list exists to carry.
  assert.equal(mine.framing?.fit, 'contain')
  assert.equal(mine.trim?.end, 5.25)
  // Rule 2, in full: a whole-document read carries `_id`, `__v`, `createdAt`
  // and `updatedAt`, and every one of them has to be DECLARED.
  assert.match(mine._id ?? '', /^[0-9a-f]{24}$/)
  assert.equal(mine.__v, 0)
  assert.ok(mine.createdAt)
  assert.ok(mine.updatedAt)
})

test('GET /api/exercise-videos?exercise= answers { videos } keyed on the slug', async () => {
  const { status, body } = await getJson(exerciseVideosGET, '/api/exercise-videos', MEMBER, {
    exercise: SOURCE_SLUG,
  })

  assert.equal(status, 200, JSON.stringify(body))
  assertContract({
    label: 'GET /api/exercise-videos?exercise=',
    schema: ExerciseVideosResponseSchema,
    body,
    expectKeys: [
      'videos',
      'videos.0._id',
      'videos.0.slug',
      'videos.0.exerciseName',
      'videos.0.videoUrl',
      'videos.0.thumbnailUrl',
      'videos.0.isPlaceholder',
      'videos.0.storageKey',
      'videos.0.status',
      'videos.0.sizeBytes',
      'videos.0.mimeType',
      'videos.0.uploadedBy',
      'videos.0.videoWidth',
      'videos.0.videoHeight',
      'videos.0.framing',
      'videos.0.trim',
      'videos.0.createdAt',
      'videos.0.updatedAt',
      'videos.0.__v',
    ],
  })

  const parsed = ExerciseVideosResponseSchema.parse(body)
  assert.equal(parsed.videos.length, 1)
  assert.equal(parsed.videos[0]?.slug, SOURCE_SLUG)

  // An exercise the collection has no row for is an EMPTY list, not a 404.
  const none = await getJson(exerciseVideosGET, '/api/exercise-videos', MEMBER, {
    exercise: 'np020-goblet-squat',
  })
  assert.equal(none.status, 200)
  assert.deepEqual(ExerciseVideosResponseSchema.parse(none.body).videos, [])
})

test('GET /api/exercise-videos?name= answers { video }, and a miss is { video: null }', async () => {
  const { status, body } = await getJson(exerciseVideosGET, '/api/exercise-videos', MEMBER, {
    name: VIDEO_NAME,
  })

  assert.equal(status, 200, JSON.stringify(body))
  assertContract({
    label: 'GET /api/exercise-videos?name=',
    schema: ExerciseVideoResponseSchema,
    body,
    expectKeys: ['video.exerciseName', 'video.videoUrl', 'video.status', 'video.framing', 'video.trim'],
  })
  assert.equal(ExerciseVideoResponseSchema.parse(body).video?.slug, SOURCE_SLUG)

  // A name nothing is keyed on: `{ video: null }` with a 200, because "this
  // exercise has no demo" is an answer rather than an error.
  const miss = await getJson(exerciseVideosGET, '/api/exercise-videos', MEMBER, {
    name: 'NP020 Nothing Keyed On This',
  })
  assert.equal(miss.status, 200)
  assertContract({
    label: 'GET /api/exercise-videos?name= (miss)',
    schema: ExerciseVideoResponseSchema,
    body: miss.body,
    expectKeys: ['video'],
  })
  assert.equal(ExerciseVideoResponseSchema.parse(miss.body).video, null)
})

// ═══════════════════════════════════════════════════════════════════════════
// The coverage gate. Keep this last.
// ═══════════════════════════════════════════════════════════════════════════

test('every route NP-020 covers was actually called with its schema', () => {
  assertEveryRouteCovered(NP020_ROUTES, coverage)
  // The manifest is not allowed to shrink quietly: eleven routes, the list above.
  assert.equal(NP020_ROUTES.length, 11)
  assert.equal(coverage.list().length, 11)
})
