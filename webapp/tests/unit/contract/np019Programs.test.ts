// Run with: npm run test:file tests/unit/contract/np019Programs.test.ts
//
// THE PROGRAMS SURFACE, CHECKED AGAINST THE SHARED SCHEMAS (NP-019).
//
// Read tests/unit/contract/_contract.ts first — it explains why the schemas
// are imported by RELATIVE path, why "it parses" is not the whole check, and
// what a domain file has to end with.
//
// WHAT THIS FILE IS FOR
//
// shared/api-client's programs schemas described an API that had drifted:
// exercises reached the native app untyped, so `trackingType`, the grouping
// fields, `rest`/`tempo` and every demo-video field rode through
// `.passthrough()` and the live screen hand-cast them; two schemas described
// responses no route sends (a `{ programs }` active-programs envelope and a
// status enum with an `abandoned` the server never writes); and enrolment,
// custom programs, swaps and the journey had no schema at all.
//
// So every route below is called for real — the exported handler, a signed
// token, the loopback test database — and parsed with the schema the native
// app reads it through.
//
// ITS OWN FIXTURES, ON PURPOSE. The runner executes test FILES in parallel, so
// this file uses its own members (`@np019.contract.test`), its own program ids
// and its own UserProgress rows rather than the shared np015 ones. Two files
// sharing a fixture row would race.

import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import mongoose from 'mongoose'
import { NextRequest } from 'next/server'

// The routes. Every one of these is a real exported handler.
import { GET as programsGET } from '../../../app/api/programs/route'
import { GET as programDetailGET } from '../../../app/api/programs/[programId]/route'
import { GET as journeyGET } from '../../../app/api/programs/[programId]/journey/route'
import { GET as currentWorkoutGET } from '../../../app/api/programs/current-workout/route'
import { GET as activeGET } from '../../../app/api/programs/active/route'
import { GET as searchGET } from '../../../app/api/programs/search/route'
import { GET as recommendGET } from '../../../app/api/programs/recommend/route'
import { POST as enrollPOST } from '../../../app/api/programs/enroll/route'
import { PUT as startDatePUT } from '../../../app/api/programs/start-date/route'
import { POST as abandonPOST } from '../../../app/api/programs/abandon/route'
import {
  GET as customListGET,
  POST as customCreatePOST,
} from '../../../app/api/programs/custom/route'
import {
  GET as customGET,
  PUT as customPUT,
  PATCH as customPATCH,
  DELETE as customDELETE,
} from '../../../app/api/programs/custom/[programId]/route'
import {
  POST as swapPOST,
  DELETE as swapDELETE,
} from '../../../app/api/programs/swap/route'
import {
  GET as savedGET,
  POST as savedPOST,
  PATCH as savedPATCH,
  DELETE as savedDELETE,
} from '../../../app/api/programs/saved/route'

// The contract. RELATIVE imports of shared/api-client — see _contract.ts.
import {
  ActiveProgramsApiResponseSchema,
  CurrentWorkoutResponseSchema,
  CustomProgramDeleteResponseSchema,
  CustomProgramResponseSchema,
  CustomProgramsResponseSchema,
  ProgramAbandonResponseSchema,
  ProgramAlreadyEnrolledResponseSchema,
  ProgramDetailResponseSchema,
  ProgramEnrollResponseSchema,
  ProgramJourneyResponseSchema,
  ProgramListResponseSchema,
  ProgramRecommendResponseSchema,
  ProgramSearchResponseSchema,
  ProgramStartDateResponseSchema,
  ProgramSwapResponseSchema,
  SaveToggleResponseSchema,
  SavedProgramsResponseSchema,
} from '../../../../shared/api-client/src/schemas/programs'

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
import UserProgress from '../../../models/UserProgress'
import ProgramModel from '../../../models/Program'
import ExerciseModel from '../../../models/Exercise'
import Schedule from '../../../models/Schedule'
import { invalidateExerciseCache } from '../../../lib/hydrateExercises'
import { signToken } from '../../../lib/auth'

// ---------------------------------------------------------------------------
// The manifest: every route NP-019's schemas describe.
// ---------------------------------------------------------------------------

const NP019_ROUTES: readonly ContractRoute[] = [
  // catalog
  { method: 'GET', path: '/api/programs', schema: 'ProgramListResponseSchema', note: 'a BARE ARRAY, not an envelope' },
  { method: 'GET', path: '/api/programs/[programId]', schema: 'ProgramDetailResponseSchema', note: 'hydrated exercises: tracking, group and video fields' },
  { method: 'GET', path: '/api/programs/search', schema: 'ProgramSearchResponseSchema', note: 'phases are PROJECTED — no workouts' },
  { method: 'GET', path: '/api/programs/recommend', schema: 'ProgramRecommendResponseSchema', note: 'onboarding (NP-057) ranks with this' },
  // the workout the member is actually shown
  { method: 'GET', path: '/api/programs/current-workout', schema: 'CurrentWorkoutResponseSchema', note: 'phase is 1-BASED' },
  { method: 'GET', path: '/api/programs/active', schema: 'ActiveProgramsApiResponseSchema', note: 'Continue Training' },
  // enrolment lifecycle
  { method: 'POST', path: '/api/programs/enroll', schema: 'ProgramEnrollResponseSchema', note: 'and ProgramAlreadyEnrolledResponseSchema on the replay' },
  { method: 'PUT', path: '/api/programs/start-date', schema: 'ProgramStartDateResponseSchema' },
  { method: 'POST', path: '/api/programs/abandon', schema: 'ProgramAbandonResponseSchema' },
  // custom programs
  { method: 'GET', path: '/api/programs/custom', schema: 'CustomProgramsResponseSchema' },
  { method: 'POST', path: '/api/programs/custom', schema: 'CustomProgramResponseSchema', note: '201; the id is server-minted' },
  { method: 'GET', path: '/api/programs/custom/[programId]', schema: 'CustomProgramResponseSchema' },
  { method: 'PUT', path: '/api/programs/custom/[programId]', schema: 'CustomProgramResponseSchema' },
  { method: 'PATCH', path: '/api/programs/custom/[programId]', schema: 'CustomProgramResponseSchema' },
  { method: 'DELETE', path: '/api/programs/custom/[programId]', schema: 'CustomProgramDeleteResponseSchema' },
  // swaps
  { method: 'POST', path: '/api/programs/swap', schema: 'ProgramSwapResponseSchema' },
  { method: 'DELETE', path: '/api/programs/swap', schema: 'ProgramSwapResponseSchema', note: 'takes QUERY params, not a body' },
  // saved
  { method: 'GET', path: '/api/programs/saved', schema: 'SavedProgramsResponseSchema' },
  { method: 'POST', path: '/api/programs/saved', schema: 'SaveToggleResponseSchema' },
  { method: 'PATCH', path: '/api/programs/saved', schema: 'SaveToggleResponseSchema', note: 'reorder: { programIds }' },
  { method: 'DELETE', path: '/api/programs/saved', schema: 'SaveToggleResponseSchema' },
  // the recap
  { method: 'GET', path: '/api/programs/[programId]/journey', schema: 'ProgramJourneyResponseSchema' },
]

// Deliberately NOT here: POST/PUT/PATCH/DELETE /api/programs and
// /api/programs/[programId] (admin catalog editing — no native client),
// /api/programs/[programId]/image and /share and /share-candidates (web-only
// sharing, NP-202's surface).

const coverage = new Coverage()

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const MEMBER: ContractMember = {
  id: '6ab0190000000000000f7ee0',
  email: 'plus@np019.contract.test',
  label: 'plus',
  auth: '',
}

const PROGRAM_ID = 'np019-contract-strength'
const SQUAT_SLUG = 'np019-barbell-back-squat'
const CURL_SLUG = 'np019-lying-hamstring-curl'
const CUSTOM_SEED_NAME = 'NP019 Contract Custom Program'

/** Filled in by the custom-create test; the id is SERVER-minted. */
let customProgramId = ''

const PHASES = [
  {
    phase: 'Phase 1',
    weeks: '1-2',
    focus: 'Accumulation',
    workouts: [
      {
        day: 'Day 1',
        title: 'Lower A',
        exercises: [
          {
            exerciseSlug: SQUAT_SLUG,
            name: 'Barbell Back Squat',
            category: 'strength',
            sets: 4,
            reps: '5-8',
            rest: '2-3 min',
            tempo: '3-1-1-0',
            rpe: 8,
            percentOf1RM: 75,
            duration: '30 sec',
            role: 'compound' as const,
            details: 'Brace before you unrack.',
            // The grouping the native live screen used to hand-cast for.
            groupId: 'np019-g1',
            groupType: 'giant_set' as const,
            groupLabel: 'A',
            groupRest: '90 sec',
            groupRounds: 3,
          },
          {
            exerciseSlug: CURL_SLUG,
            name: 'Lying Hamstring Curl',
            sets: 3,
            reps: '10-12',
            rest: '60 sec',
            groupId: 'np019-g1',
            groupType: 'giant_set' as const,
            groupLabel: 'A',
          },
        ],
      },
      {
        day: 'Day 2',
        title: 'Upper A',
        exercises: [{ exerciseSlug: SQUAT_SLUG, sets: 3, reps: '8' }],
      },
    ],
  },
]

/** Every dotted path the native app reads off one hydrated exercise. */
const HYDRATED_EXERCISE_KEYS = [
  'exerciseSlug',
  'name',
  'type',
  'sets',
  'reps',
  // the program's own prescription
  'rest',
  'tempo',
  'rpe',
  'duration',
  'details',
  // the grouping
  'groupId',
  'groupType',
  'groupLabel',
  'groupRest',
  'groupRounds',
  // hydrated from the exercise catalog
  'trackingType',
  'difficulty',
  'laterality',
  'primaryMuscles',
  'equipment',
  'movementPatterns',
  'videoUrl',
  'thumbnailUrl',
  'videoWidth',
  'videoHeight',
  'videoFraming',
  'videoFraming.fit',
  'videoTrim',
  'videoTrim.start',
]

const FIRST_EXERCISE = 'phases.0.workouts.0.exercises.0'

async function cleanFixtures(): Promise<void> {
  const objectId = new mongoose.Types.ObjectId(MEMBER.id)
  await User.deleteMany({ $or: [{ _id: objectId }, { email: MEMBER.email }] })
  await UserProgress.deleteMany({ userId: MEMBER.id })
  await Schedule.deleteMany({ userId: objectId })
  await ProgramModel.deleteMany({
    $or: [{ program_id: PROGRAM_ID }, { createdBy: objectId }, { createdBy: MEMBER.id }],
  })
  await ExerciseModel.deleteMany({ slug: { $in: [SQUAT_SLUG, CURL_SLUG] } })
}

before(async () => {
  process.env.JWT_SECRET ||= 'become-unit-test-secret'
  // With the kill-switch off every gate answers "allowed" and the Plus-only
  // custom-program routes never take their real path.
  process.env.ENTITLEMENTS_ENFORCED = '1'

  await mongoose.connect(process.env.MONGODB_URI ?? 'mongodb://127.0.0.1:27017/become-test')
  await cleanFixtures()

  await User.create({
    _id: new mongoose.Types.ObjectId(MEMBER.id),
    email: MEMBER.email,
    // Legacy column, `required` on the model; magic-link members never use it.
    password: 'contract-test-unused',
    name: 'Contract Programs',
    tier: 'plus',
    profile: {
      fitnessGoal: 'gain_muscle',
      fitnessGoals: ['gain_muscle'],
      experienceLevel: 'beginner',
      weeklyAvailability: 3,
      equipmentAccess: ['full_gym'],
      weightUnit: 'lbs',
    },
    onboardingCompleted: true,
  })
  MEMBER.auth = `Bearer ${await signToken({ userId: MEMBER.id, email: MEMBER.email })}`

  // The catalog rows the program's slugs resolve to. EVERY hydrated field is
  // populated here, because a field the fixture leaves empty is a field
  // hydrateExercises never writes and this file never checks.
  await ExerciseModel.create({
    slug: SQUAT_SLUG,
    name: 'Barbell Back Squat',
    category: 'strength',
    role: 'compound',
    movementPatterns: ['squat'],
    laterality: 'bilateral',
    difficulty: 'intermediate',
    primaryMuscles: ['quads', 'glutes'],
    equipment: ['barbell', 'squat_rack'],
    trackingType: 'reps_weight',
    bodyRegion: 'lower_body',
    videoUrl: 'https://cdn.example.test/np019-squat.mp4',
    thumbnailUrl: 'https://cdn.example.test/np019-squat.jpg',
    videoWidth: 1080,
    videoHeight: 1920,
    videoFraming: { fit: 'cover', positionX: 50, positionY: 40, zoom: 120 },
    videoTrim: { start: 1.5, end: 8 },
  })
  await ExerciseModel.create({
    slug: CURL_SLUG,
    name: 'Lying Hamstring Curl',
    category: 'strength',
    role: 'accessory',
    movementPatterns: ['knee_flexion'],
    laterality: 'bilateral',
    difficulty: 'beginner',
    primaryMuscles: ['hamstrings'],
    equipment: ['leg_curl'],
    trackingType: 'reps_weight',
    bodyRegion: 'lower_body',
  })
  // The catalog is cached per process; a row created after the first hydrate
  // would be invisible to it.
  invalidateExerciseCache()

  await ProgramModel.create({
    program_id: PROGRAM_ID,
    name: 'NP019 Contract Strength',
    description: 'A two-day fixture program.',
    duration_weeks: 2,
    training_days_per_week: 2,
    goal: 'Build strength',
    target_user: 'Intermediate',
    equipment: ['barbell'],
    tags: ['np019', 'strength'],
    phases: PHASES,
  })

  // A completed session, so the journey recap has volume and a PR to report.
  await UserProgress.create({
    userId: new mongoose.Types.ObjectId(MEMBER.id),
    weightHistory: [
      { date: new Date('2026-06-01T00:00:00.000Z'), weight: 180 },
      { date: new Date('2026-06-20T00:00:00.000Z'), weight: 185 },
    ],
    workoutLogs: [
      {
        date: new Date('2026-06-05T00:00:00.000Z'),
        programId: PROGRAM_ID,
        phase: 1,
        day: 'Day 1',
        completed: true,
        duration: 52,
        exercises: [
          {
            name: 'Barbell Back Squat',
            exerciseSlug: SQUAT_SLUG,
            sets: [
              { setNumber: 1, reps: 5, weight: 225, completed: true },
              { setNumber: 2, reps: 3, weight: 275, completed: true },
            ],
          },
        ],
      },
    ],
    activePrograms: [],
  })

  // A schedule, so PUT /api/programs/start-date takes its regenerate branch
  // and current-workout derives its phase and counts from real sessions.
  await Schedule.create({
    userId: new mongoose.Types.ObjectId(MEMBER.id),
    programId: PROGRAM_ID,
    programName: 'NP019 Contract Strength',
    settings: { trainingDays: [1, 3], startDate: new Date('2026-06-01T00:00:00.000Z') },
    scheduledWorkouts: [
      {
        date: new Date('2026-06-01T00:00:00.000Z'),
        programId: PROGRAM_ID,
        phase: 1,
        dayLabel: 'Day 1',
        workoutTitle: 'Lower A',
        status: 'scheduled',
      },
      {
        date: new Date('2026-06-03T00:00:00.000Z'),
        programId: PROGRAM_ID,
        phase: 1,
        dayLabel: 'Day 2',
        workoutTitle: 'Upper A',
        status: 'scheduled',
      },
    ],
  })
})

after(async () => {
  await cleanFixtures()
  invalidateExerciseCache()
  await mongoose.disconnect()
})

// ---------------------------------------------------------------------------
// Calling a handler. The harness's getJson/sendJson do not cover the two
// shapes this domain needs: a dynamic `params` segment, and a DELETE that
// takes QUERY parameters rather than a body.
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

/** A signed call. `query` goes on the URL, `body` is JSON-encoded. */
async function call(
  handler: Handler,
  method: HttpMethod,
  path: string,
  options: { query?: Record<string, string>; body?: unknown } = {},
): Promise<CallResult> {
  const url = new URL(`http://localhost${path}`)
  for (const [key, value] of Object.entries(options.query ?? {})) {
    url.searchParams.set(key, value)
  }
  const headers = new Headers({
    Authorization: MEMBER.auth,
    'Content-Type': 'application/json',
  })
  const request =
    method === 'GET'
      ? new NextRequest(url, { headers })
      : new NextRequest(url, { method, headers, body: JSON.stringify(options.body ?? {}) })
  return readJson(await handler(request))
}

type ParamHandler = (
  request: NextRequest,
  context: { params: Promise<{ programId: string }> },
) => Promise<Response>

/** Bind a `[programId]` route's dynamic segment so it is callable as a Handler. */
function withProgramId(handler: ParamHandler, programId: string): Handler {
  return (request: NextRequest) => handler(request, { params: Promise.resolve({ programId }) })
}

// ═══════════════════════════════════════════════════════════════════════════
// The hydrated exercise — the reason this ticket exists
// ═══════════════════════════════════════════════════════════════════════════

test('GET /api/programs/[programId] matches ProgramDetailResponseSchema with the tracking, group and video fields typed', async () => {
  const { status, body } = await call(
    withProgramId(programDetailGET as ParamHandler, PROGRAM_ID),
    'GET',
    `/api/programs/${PROGRAM_ID}`,
  )
  coverage.mark('GET', '/api/programs/[programId]')

  assert.equal(status, 200)
  assertContract({
    label: 'GET /api/programs/[programId]',
    schema: ProgramDetailResponseSchema,
    body,
    expectKeys: [
      'program_id',
      'name',
      'phases',
      'phases.0.phase',
      'phases.0.weeks',
      'phases.0.focus',
      'phases.0.workouts.0.day',
      'phases.0.workouts.0.title',
      ...HYDRATED_EXERCISE_KEYS.map((key) => `${FIRST_EXERCISE}.${key}`),
    ],
  })

  // Parsing is not enough on its own: the point of typing these is that the
  // native app can READ them off the parsed object instead of casting.
  const parsed = ProgramDetailResponseSchema.parse(body)
  const exercise = parsed.phases[0]?.workouts[0]?.exercises[0]
  assert.ok(exercise)
  assert.equal(exercise.trackingType, 'reps_weight')
  assert.equal(exercise.groupType, 'giant_set', 'the wire value has an underscore')
  assert.equal(exercise.groupId, 'np019-g1')
  assert.equal(exercise.groupRounds, 3)
  assert.equal(exercise.rest, '2-3 min')
  assert.equal(exercise.tempo, '3-1-1-0')
  assert.equal(exercise.videoUrl, 'https://cdn.example.test/np019-squat.mp4')
  assert.equal(exercise.videoWidth, 1080)
  assert.equal(exercise.videoHeight, 1920)
  assert.equal(exercise.videoFraming?.fit, 'cover')
  assert.equal(exercise.videoTrim?.start, 1.5)
  // `type` is the catalog CATEGORY re-keyed by hydrateExercises.
  assert.equal(exercise.type, 'strength')
})

test('GET /api/programs/current-workout matches CurrentWorkoutResponseSchema, with the same hydrated exercise and a 1-BASED phase', async () => {
  // Enrolment first: the route 404s without one.
  await call(enrollPOST, 'POST', '/api/programs/enroll', {
    body: { programId: PROGRAM_ID, startDate: '2026-06-01' },
  })

  const { status, body } = await call(currentWorkoutGET, 'GET', '/api/programs/current-workout', {
    query: { programId: PROGRAM_ID },
  })
  coverage.mark('GET', '/api/programs/current-workout')

  assert.equal(status, 200, JSON.stringify(body))
  assertContract({
    label: 'GET /api/programs/current-workout',
    schema: CurrentWorkoutResponseSchema,
    body,
    expectKeys: [
      'workout',
      'workout.title',
      'workout.day',
      'phase',
      'day',
      'phaseInfo.name',
      'phaseInfo.focus',
      'phaseInfo.weeks',
      'completedWorkouts',
      'totalWorkouts',
      ...HYDRATED_EXERCISE_KEYS.map((key) => `workout.exercises.0.${key}`),
    ],
  })

  const parsed = CurrentWorkoutResponseSchema.parse(body)
  // Rule 1: 1-based on the wire. A 0 here would be an array index leaking out,
  // and POST /api/workouts would then log the session against the wrong phase.
  assert.equal(parsed.phase, 1)
  assert.equal(parsed.workout.exercises[0]?.groupType, 'giant_set')
  assert.equal(parsed.workout.exercises[0]?.trackingType, 'reps_weight')
  assert.equal(parsed.workout.exercises[0]?.videoUrl, 'https://cdn.example.test/np019-squat.mp4')
})

// ═══════════════════════════════════════════════════════════════════════════
// Catalog: list, search, recommend
// ═══════════════════════════════════════════════════════════════════════════

test('GET /api/programs matches ProgramListResponseSchema (a bare array)', async () => {
  const { status, body } = await call(programsGET, 'GET', '/api/programs')
  coverage.mark('GET', '/api/programs')

  assert.equal(status, 200)
  assert.ok(Array.isArray(body), 'this route answers with an ARRAY, not an envelope')
  assertContract({
    label: 'GET /api/programs',
    schema: ProgramListResponseSchema,
    body,
  })
  const parsed = ProgramListResponseSchema.parse(body)
  assert.ok(parsed.some((p) => p.program_id === PROGRAM_ID))
})

test('GET /api/programs/search matches ProgramSearchResponseSchema, phases projected without workouts', async () => {
  const { status, body } = await call(searchGET, 'GET', '/api/programs/search', {
    query: { q: 'NP019', page: '1', limit: '20' },
  })
  coverage.mark('GET', '/api/programs/search')

  assert.equal(status, 200)
  assertContract({
    label: 'GET /api/programs/search',
    schema: ProgramSearchResponseSchema,
    body,
    expectKeys: [
      'programs',
      'programs.0.program_id',
      'programs.0.name',
      'pagination.page',
      'pagination.limit',
      'pagination.total',
      'pagination.totalPages',
      'pagination.hasMore',
      'availableTags',
    ],
  })

  // The projection is the contract: a browse card must not expect sessions.
  const parsed = ProgramSearchResponseSchema.parse(body)
  const hit = parsed.programs.find((p) => p.program_id === PROGRAM_ID)
  assert.ok(hit, 'the fixture program should match its own name')
  assert.equal(hit.phases?.[0]?.phase, 'Phase 1')
  assert.deepEqual(hit.phases?.[0]?.workouts, [], 'search projects phase headers only')
})

test('GET /api/programs/recommend matches ProgramRecommendResponseSchema (the onboarding call)', async () => {
  const { status, body } = await call(recommendGET, 'GET', '/api/programs/recommend', {
    // profile=0 is what the onboarding wizard sends: rank on THIS session's
    // answers, not the profile the member is in the middle of replacing.
    query: {
      goals: 'gain_muscle',
      level: 'beginner',
      days: '2',
      equipment: 'full_gym',
      limit: '3',
      profile: '0',
    },
  })
  coverage.mark('GET', '/api/programs/recommend')

  assert.equal(status, 200)
  assertContract({
    label: 'GET /api/programs/recommend',
    schema: ProgramRecommendResponseSchema,
    body,
    expectKeys: [
      'basedOn',
      'basedOn.goals',
      'basedOn.experienceLevel',
      'basedOn.weeklyAvailability',
      'basedOn.equipmentAccess',
      'recommendations',
      'recommendations.0.program_id',
      'recommendations.0.name',
      'recommendations.0.description',
      'recommendations.0.goal',
      'recommendations.0.target_user',
      'recommendations.0.training_days_per_week',
      'recommendations.0.duration_weeks',
      'recommendations.0.tags',
      'recommendations.0.coverImage',
      'recommendations.0.score',
      'recommendations.0.reasons',
    ],
  })

  const parsed = ProgramRecommendResponseSchema.parse(body)
  assert.deepEqual(parsed.basedOn.goals, ['gain_muscle'], 'basedOn echoes the query, not the profile')
  assert.equal(parsed.basedOn.experienceLevel, 'beginner')
  assert.ok(parsed.recommendations.length >= 1)
})

// ═══════════════════════════════════════════════════════════════════════════
// Enrolment lifecycle
// ═══════════════════════════════════════════════════════════════════════════

test('GET /api/programs/active matches ActiveProgramsApiResponseSchema with a status the enum knows', async () => {
  const { status, body } = await call(activeGET, 'GET', '/api/programs/active')
  coverage.mark('GET', '/api/programs/active')

  assert.equal(status, 200)
  assertContract({
    label: 'GET /api/programs/active',
    schema: ActiveProgramsApiResponseSchema,
    body,
    expectKeys: [
      'activePrograms',
      'activePrograms.0.programId',
      'activePrograms.0.programName',
      'activePrograms.0.startDate',
      'activePrograms.0.currentPhase',
      'activePrograms.0.currentDay',
      'activePrograms.0.completedWorkouts',
      'activePrograms.0.totalWorkouts',
      'activePrograms.0.progress',
      'activePrograms.0.status',
    ],
  })

  const parsed = ActiveProgramsApiResponseSchema.parse(body)
  const row = parsed.activePrograms.find((p) => p.programId === PROGRAM_ID)
  assert.ok(row, 'the enrolment from the current-workout test should be here')
  // Rule 3: the server writes 'in-progress', which the old shared enum did not
  // have — it had an 'abandoned' the server never writes.
  assert.equal(row.status, 'in-progress')
})

test('POST /api/programs/enroll answers ProgramAlreadyEnrolledResponseSchema on the replay', async () => {
  // The member is already enrolled (see the current-workout test), so this is
  // the second of the two 200s this route can answer with.
  const replay = await call(enrollPOST, 'POST', '/api/programs/enroll', {
    body: { programId: PROGRAM_ID, startDate: '2026-06-01' },
  })
  coverage.mark('POST', '/api/programs/enroll')

  assert.equal(replay.status, 200)
  assertContract({
    label: 'POST /api/programs/enroll (already enrolled)',
    schema: ProgramAlreadyEnrolledResponseSchema,
    body: replay.body,
    expectKeys: [
      'message',
      'alreadyEnrolled',
      'activeProgram.programId',
      'activeProgram.programName',
      'activeProgram.startDate',
      'activeProgram.currentPhase',
      'activeProgram.currentDay',
      'activeProgram.completedWorkouts',
      'activeProgram.totalWorkouts',
      'activeProgram.status',
    ],
  })
  // Same 200 as a fresh enrolment — `alreadyEnrolled` is the ONLY difference,
  // so one client-side schema has to parse both.
  assertContract({
    label: 'POST /api/programs/enroll (already enrolled, read as the fresh shape)',
    schema: ProgramEnrollResponseSchema,
    body: replay.body,
    expectKeys: ['message', 'activeProgram.programId'],
  })
  assert.equal(ProgramEnrollResponseSchema.parse(replay.body).alreadyEnrolled, true)

  // And the FRESH answer, on a program the member has never enrolled in.
  await ProgramModel.create({
    program_id: `${PROGRAM_ID}-second`,
    name: 'NP019 Contract Strength II',
    duration_weeks: 2,
    training_days_per_week: 2,
    goal: 'Build strength',
    target_user: 'Intermediate',
    phases: PHASES,
  })
  const fresh = await call(enrollPOST, 'POST', '/api/programs/enroll', {
    body: { programId: `${PROGRAM_ID}-second`, startDate: '2026-06-01' },
  })
  assert.equal(fresh.status, 200)
  assertContract({
    label: 'POST /api/programs/enroll (fresh)',
    schema: ProgramEnrollResponseSchema,
    body: fresh.body,
    expectKeys: [
      'message',
      'activeProgram.programId',
      'activeProgram.programName',
      'activeProgram.startDate',
      'activeProgram.currentPhase',
      'activeProgram.currentDay',
      'activeProgram.completedWorkouts',
      'activeProgram.totalWorkouts',
      'activeProgram.status',
    ],
  })
  const parsedFresh = ProgramEnrollResponseSchema.parse(fresh.body)
  assert.equal(parsedFresh.alreadyEnrolled, undefined)
  assert.equal(parsedFresh.activeProgram.status, 'in-progress')
  assert.equal(parsedFresh.activeProgram.currentPhase, 1, 'phases are 1-based on the wire')

  await ProgramModel.deleteOne({ program_id: `${PROGRAM_ID}-second` })
  await UserProgress.updateOne(
    { userId: MEMBER.id },
    { $pull: { activePrograms: { programId: `${PROGRAM_ID}-second` } } },
  )
})

test('PUT /api/programs/start-date matches ProgramStartDateResponseSchema and reports the regenerated schedule', async () => {
  const { status, body } = await call(startDatePUT, 'PUT', '/api/programs/start-date', {
    body: { programId: PROGRAM_ID, startDate: '2026-07-06' },
  })
  coverage.mark('PUT', '/api/programs/start-date')

  assert.equal(status, 200, JSON.stringify(body))
  assertContract({
    label: 'PUT /api/programs/start-date',
    schema: ProgramStartDateResponseSchema,
    body,
    expectKeys: ['message', 'startDate', 'totalScheduledWorkouts', 'futureWorkouts', 'nextWorkout'],
  })
  const parsed = ProgramStartDateResponseSchema.parse(body)
  assert.ok(parsed.totalScheduledWorkouts && parsed.totalScheduledWorkouts > 0)
})

test('POST|DELETE /api/programs/swap match ProgramSwapResponseSchema — { message }, no success flag', async () => {
  const saved = await call(swapPOST, 'POST', '/api/programs/swap', {
    body: {
      programId: PROGRAM_ID,
      originalSlug: SQUAT_SLUG,
      replacementSlug: CURL_SLUG,
      replacementName: 'Lying Hamstring Curl',
    },
  })
  coverage.mark('POST', '/api/programs/swap')
  assert.equal(saved.status, 200)
  assertContract({
    label: 'POST /api/programs/swap',
    schema: ProgramSwapResponseSchema,
    body: saved.body,
    expectKeys: ['message'],
  })

  // A permanent swap is applied to every later current-workout read, so the
  // hydrated exercise the app gets is the REPLACEMENT's.
  const after = await call(currentWorkoutGET, 'GET', '/api/programs/current-workout', {
    query: { programId: PROGRAM_ID },
  })
  const swapped = CurrentWorkoutResponseSchema.parse(after.body)
  assert.equal(swapped.workout.exercises[0]?.exerciseSlug, CURL_SLUG)

  const removed = await call(swapDELETE, 'DELETE', '/api/programs/swap', {
    // The DELETE takes QUERY parameters, not a body.
    query: { programId: PROGRAM_ID, originalSlug: SQUAT_SLUG },
  })
  coverage.mark('DELETE', '/api/programs/swap')
  assert.equal(removed.status, 200)
  assertContract({
    label: 'DELETE /api/programs/swap',
    schema: ProgramSwapResponseSchema,
    body: removed.body,
    expectKeys: ['message'],
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// The recap
// ═══════════════════════════════════════════════════════════════════════════

test('GET /api/programs/[programId]/journey matches ProgramJourneyResponseSchema', async () => {
  const { status, body } = await call(
    withProgramId(journeyGET as ParamHandler, PROGRAM_ID),
    'GET',
    `/api/programs/${PROGRAM_ID}/journey`,
  )
  coverage.mark('GET', '/api/programs/[programId]/journey')

  assert.equal(status, 200, JSON.stringify(body))
  assertContract({
    label: 'GET /api/programs/[programId]/journey',
    schema: ProgramJourneyResponseSchema,
    body,
    expectKeys: [
      'programName',
      'durationWeeks',
      'goal',
      'totalSessions',
      'totalVolumeLbs',
      'weightChange',
      'weightChange.startLbs',
      'weightChange.endLbs',
      'weightChange.change',
      'topPRs',
      'topPRs.0.name',
      'topPRs.0.weight',
      'topPRs.0.reps',
      'topPRs.0.date',
      'startDate',
      'endDate',
    ],
  })

  const parsed = ProgramJourneyResponseSchema.parse(body)
  assert.equal(parsed.totalSessions, 1)
  // 5x225 + 3x275 = 1950. Always POUNDS, whatever the member logs in.
  assert.equal(parsed.totalVolumeLbs, 1950)
  assert.equal(parsed.topPRs[0]?.weight, 275)
})

// ═══════════════════════════════════════════════════════════════════════════
// Saved programs
// ═══════════════════════════════════════════════════════════════════════════

test('GET|POST|PATCH|DELETE /api/programs/saved match their schemas', async () => {
  const saved = await call(savedPOST, 'POST', '/api/programs/saved', {
    body: { programId: PROGRAM_ID },
  })
  coverage.mark('POST', '/api/programs/saved')
  assert.equal(saved.status, 200, JSON.stringify(saved.body))
  assertContract({
    label: 'POST /api/programs/saved',
    schema: SaveToggleResponseSchema,
    body: saved.body,
    expectKeys: ['success', 'message'],
  })

  const list = await call(savedGET, 'GET', '/api/programs/saved')
  coverage.mark('GET', '/api/programs/saved')
  assert.equal(list.status, 200)
  assertContract({
    label: 'GET /api/programs/saved',
    schema: SavedProgramsResponseSchema,
    body: list.body,
    expectKeys: [
      'savedPrograms',
      'savedPrograms.0.program_id',
      'savedPrograms.0.name',
      // The two fields that make a saved program more than a program.
      'savedPrograms.0.savedAt',
      'savedPrograms.0.order',
    ],
  })
  assert.equal(
    SavedProgramsResponseSchema.parse(list.body).savedPrograms[0]?.program_id,
    PROGRAM_ID,
  )

  // PATCH reorders: the array IS the new order.
  const reordered = await call(savedPATCH, 'PATCH', '/api/programs/saved', {
    body: { programIds: [PROGRAM_ID] },
  })
  coverage.mark('PATCH', '/api/programs/saved')
  assert.equal(reordered.status, 200)
  assertContract({
    label: 'PATCH /api/programs/saved (reorder)',
    schema: SaveToggleResponseSchema,
    body: reordered.body,
    expectKeys: ['success', 'message'],
  })

  const unsaved = await call(savedDELETE, 'DELETE', '/api/programs/saved', {
    body: { programId: PROGRAM_ID },
  })
  coverage.mark('DELETE', '/api/programs/saved')
  assert.equal(unsaved.status, 200)
  assertContract({
    label: 'DELETE /api/programs/saved',
    schema: SaveToggleResponseSchema,
    body: unsaved.body,
    expectKeys: ['success', 'message'],
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// Custom programs
// ═══════════════════════════════════════════════════════════════════════════

test('POST /api/programs/custom answers 201 with CustomProgramResponseSchema and a server-minted id', async () => {
  const { status, body } = await call(customCreatePOST, 'POST', '/api/programs/custom', {
    body: {
      name: CUSTOM_SEED_NAME,
      description: 'Built by the contract test.',
      duration_weeks: 2,
      training_days_per_week: 2,
      goal: 'Build strength',
      target_user: 'Intermediate',
      equipment: ['barbell'],
      tags: ['np019'],
      phases: PHASES,
      // Server-controlled; sending them must change nothing.
      program_id: 'not-your-id',
      isCustom: false,
      sharedWith: ['6ab0190000000000000f7eff'],
    },
  })
  coverage.mark('POST', '/api/programs/custom')

  assert.equal(status, 201, JSON.stringify(body))
  assertContract({
    label: 'POST /api/programs/custom',
    schema: CustomProgramResponseSchema,
    body,
    expectKeys: ['_id', 'program_id', 'name', 'isCustom', 'createdBy', 'phases'],
  })

  const parsed = CustomProgramResponseSchema.parse(body)
  customProgramId = parsed.program_id ?? ''
  assert.ok(customProgramId.startsWith('custom-'), 'the id is minted, never the caller’s')
  assert.equal(parsed.isCustom, true)
  assert.deepEqual(parsed.sharedWith, [], 'sharedWith is not writable from a request body')
})

test('GET /api/programs/custom matches CustomProgramsResponseSchema and carries ownership', async () => {
  const { status, body } = await call(customListGET, 'GET', '/api/programs/custom')
  coverage.mark('GET', '/api/programs/custom')

  assert.equal(status, 200)
  assertContract({
    label: 'GET /api/programs/custom',
    schema: CustomProgramsResponseSchema,
    body,
    expectKeys: [
      'programs',
      'programs.0.program_id',
      'programs.0.name',
      'programs.0.isCustom',
      'programs.0.createdBy',
      // The one field the list adds that the document does not have.
      'programs.0.isOwner',
    ],
  })
  const parsed = CustomProgramsResponseSchema.parse(body)
  assert.equal(parsed.programs[0]?.isOwner, true)
})

test('GET|PUT|PATCH /api/programs/custom/[programId] match CustomProgramResponseSchema', async () => {
  assert.ok(customProgramId, 'the create test must run first')
  const bind = (handler: ParamHandler) => withProgramId(handler, customProgramId)
  const path = `/api/programs/custom/${customProgramId}`

  const read = await call(bind(customGET as ParamHandler), 'GET', path)
  coverage.mark('GET', '/api/programs/custom/[programId]')
  assert.equal(read.status, 200, JSON.stringify(read.body))
  assertContract({
    label: 'GET /api/programs/custom/[programId]',
    schema: CustomProgramResponseSchema,
    body: read.body,
    expectKeys: [
      'program_id',
      'name',
      'isCustom',
      'createdBy',
      // Hydrated here too — the custom-program editor reads the same fields.
      `${FIRST_EXERCISE}.trackingType`,
      `${FIRST_EXERCISE}.groupType`,
      `${FIRST_EXERCISE}.videoUrl`,
    ],
  })

  const replaced = await call(bind(customPUT as ParamHandler), 'PUT', path, {
    body: { name: `${CUSTOM_SEED_NAME} (renamed)`, phases: PHASES },
  })
  coverage.mark('PUT', '/api/programs/custom/[programId]')
  assert.equal(replaced.status, 200, JSON.stringify(replaced.body))
  assertContract({
    label: 'PUT /api/programs/custom/[programId]',
    schema: CustomProgramResponseSchema,
    body: replaced.body,
    expectKeys: ['program_id', 'name', 'isCustom', 'createdBy'],
  })
  assert.equal(
    CustomProgramResponseSchema.parse(replaced.body).name,
    `${CUSTOM_SEED_NAME} (renamed)`,
  )

  const patched = await call(bind(customPATCH as ParamHandler), 'PATCH', path, {
    body: { description: 'Patched by the contract test.' },
  })
  coverage.mark('PATCH', '/api/programs/custom/[programId]')
  assert.equal(patched.status, 200, JSON.stringify(patched.body))
  assertContract({
    label: 'PATCH /api/programs/custom/[programId]',
    schema: CustomProgramResponseSchema,
    body: patched.body,
    expectKeys: ['program_id', 'name', 'description', 'isCustom', 'createdBy'],
  })
})

test('DELETE /api/programs/custom/[programId] matches CustomProgramDeleteResponseSchema', async () => {
  assert.ok(customProgramId, 'the create test must run first')
  const { status, body } = await call(
    withProgramId(customDELETE as ParamHandler, customProgramId),
    'DELETE',
    `/api/programs/custom/${customProgramId}`,
  )
  coverage.mark('DELETE', '/api/programs/custom/[programId]')

  assert.equal(status, 200, JSON.stringify(body))
  assertContract({
    label: 'DELETE /api/programs/custom/[programId]',
    schema: CustomProgramDeleteResponseSchema,
    body,
    expectKeys: ['ok'],
  })
  assert.equal(CustomProgramDeleteResponseSchema.parse(body).ok, true)
})

// ═══════════════════════════════════════════════════════════════════════════
// Abandon — last, because it removes the enrolment everything above needs
// ═══════════════════════════════════════════════════════════════════════════

test('POST /api/programs/abandon matches ProgramAbandonResponseSchema', async () => {
  const { status, body } = await call(abandonPOST, 'POST', '/api/programs/abandon', {
    body: { programId: PROGRAM_ID },
  })
  coverage.mark('POST', '/api/programs/abandon')

  assert.equal(status, 200, JSON.stringify(body))
  assertContract({
    label: 'POST /api/programs/abandon',
    schema: ProgramAbandonResponseSchema,
    body,
    expectKeys: ['success', 'message'],
  })
  assert.equal(ProgramAbandonResponseSchema.parse(body).success, true)

  // Abandoning REMOVES the enrolment — there is no 'abandoned' status, which
  // is exactly what the deleted speculative enum claimed.
  const stillActive = await call(activeGET, 'GET', '/api/programs/active')
  const parsed = ActiveProgramsApiResponseSchema.parse(stillActive.body)
  assert.equal(
    parsed.activePrograms.some((p) => p.programId === PROGRAM_ID),
    false,
  )
})

// ═══════════════════════════════════════════════════════════════════════════
// The coverage gate. Keep this last.
// ═══════════════════════════════════════════════════════════════════════════

test('every route NP-019 covers was actually called with its schema', () => {
  assertEveryRouteCovered(NP019_ROUTES, coverage)
  // The manifest is not allowed to shrink quietly: 22 routes, the list above.
  assert.equal(NP019_ROUTES.length, 22)
  assert.equal(coverage.list().length, 22)
})
