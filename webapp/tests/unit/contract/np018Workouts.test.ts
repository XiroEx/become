// Run with: npm run test:file tests/unit/contract/np018Workouts.test.ts
//
// THE WORKOUTS SURFACE, CHECKED AGAINST THE SHARED SCHEMAS (NP-018).
//
// Read tests/unit/contract/_contract.ts first — it explains why the schemas are
// imported by RELATIVE path, why "it parses" is not the whole check, and what a
// domain file has to end with.
//
// WHAT THIS FILE IS FOR
//
// The live workout is the most-used screen in the app and its contract was the
// least typed: `WorkoutSaveRequestSchema` was missing half of what the web
// sends (`scheduledDate`, `performedAt`, `tz`, the swap trail, the grouping
// label/rounds, the prescription, `addedAdHoc`, and the whole `kind: 'quick'`
// variant), `WorkoutSaveResponseSchema` had no `streak`, and three schemas
// (`WorkoutLogSchema`, `WorkoutsListResponseSchema`,
// `SaveWorkoutResponseSchema`) described a `phaseIndex`/`workoutIndex` API no
// route has ever answered with. The resume, history and quick-session routes
// had no schema at all.
//
// So every route below is called for real — the exported handler, a signed
// token, the loopback test database — and parsed with the schema the native app
// reads it through.
//
// ITS OWN FIXTURES, ON PURPOSE. The runner executes test FILES in parallel, so
// this file uses its own members (`@np018.contract.test`), its own program id
// and its own catalog rows rather than the shared np015 ones. Two files sharing
// a fixture row would race.
//
// WHERE shared/api-client's FIXTURES CAME FROM. Run this file with
// `CONTRACT_DUMP=1` and every body is printed; those printings are what
// `shared/api-client/tests/workoutsSchemas.test.ts` holds as fixtures. They are
// recorded from the real beta HANDLERS against this disposable loopback
// database and never from the live beta site: beta and production share one
// MongoDB (see AGENTS.md, "Channels"), so a recording taken there would BE
// production member data.

import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import mongoose from 'mongoose'
import { NextRequest } from 'next/server'

// The webapp's hand copy of the shared contract — see the last test in this
// file for why the workouts domain must be absent from it.
import * as sharedApiTypes from '../../../lib/sharedApiTypes'

// The routes. Every one of these is a real exported handler.
import {
  GET as workoutsGET,
  POST as workoutsPOST,
  DELETE as workoutsDELETE,
} from '../../../app/api/workouts/route'
import { GET as inProgressGET } from '../../../app/api/workouts/in-progress/route'
import { GET as lastPerformanceGET } from '../../../app/api/workouts/last-performance/route'
import {
  GET as logsGET,
  PATCH as logsPATCH,
} from '../../../app/api/workouts/logs/route'
import { GET as logGET } from '../../../app/api/workouts/log/route'
import { GET as plannedGET } from '../../../app/api/workouts/planned/route'
import {
  GET as sessionGET,
  PATCH as sessionPATCH,
  DELETE as sessionDELETE,
} from '../../../app/api/workouts/session/route'
import { PATCH as favoriteOrderPATCH } from '../../../app/api/workouts/favorite-order/route'
import { POST as resolveIncompletePOST } from '../../../app/api/workouts/resolve-incomplete/route'
import { GET as exerciseSuggestionsGET } from '../../../app/api/workouts/exercise-suggestions/route'

// The contract. RELATIVE imports of shared/api-client — see _contract.ts.
import {
  ExerciseSuggestionsResponseSchema,
  FavoriteOrderRequestSchema,
  FavoriteOrderResponseSchema,
  LastPerformanceResponseSchema,
  PastWorkoutLogResponseSchema,
  PlannedWorkoutsResponseSchema,
  ProgramWorkoutLogsResponseSchema,
  QuickSessionDeleteResponseSchema,
  QuickSessionPatchRequestSchema,
  QuickSessionPatchResponseSchema,
  QuickSessionResponseSchema,
  ResolveIncompleteRequestSchema,
  ResolveIncompleteResponseSchema,
  WorkoutDiscardResponseSchema,
  WorkoutGatePayloadSchema,
  WorkoutHistoryResponseSchema,
  WorkoutInProgressResponseSchema,
  WorkoutLogCorrectionRequestSchema,
  WorkoutLogCorrectionResponseSchema,
  WorkoutResumeResponseSchema,
  WorkoutSaveRequestSchema,
  WorkoutSaveResponseSchema,
} from '../../../../shared/api-client/src/schemas/workouts'

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
// The manifest: every route NP-018's schemas describe.
// ---------------------------------------------------------------------------

const NP018_ROUTES: readonly ContractRoute[] = [
  // the live workout itself
  { method: 'POST', path: '/api/workouts', schema: 'WorkoutSaveRequestSchema + WorkoutSaveResponseSchema', note: 'BOTH halves of the union: a program day and a quick session' },
  { method: 'GET', path: '/api/workouts', schema: 'WorkoutResumeResponseSchema', note: 'workout / isResume / exerciseHistory / exercisePRs / staleIncomplete' },
  { method: 'DELETE', path: '/api/workouts', schema: 'WorkoutDiscardResponseSchema', note: 'discard the OPEN log for a program day' },
  { method: 'GET', path: '/api/workouts/in-progress', schema: 'WorkoutInProgressResponseSchema', note: 'both branches: `workout` and `planned`' },
  { method: 'GET', path: '/api/workouts/last-performance', schema: 'LastPerformanceResponseSchema', note: 'prefill + PRs, matched through the swap trail' },
  // history
  { method: 'GET', path: '/api/workouts/logs', schema: 'ProgramWorkoutLogsResponseSchema + WorkoutHistoryResponseSchema', note: 'TWO responses, chosen by ?programId' },
  { method: 'PATCH', path: '/api/workouts/logs', schema: 'WorkoutLogCorrectionResponseSchema', note: 'correct measurements in one completed log' },
  { method: 'GET', path: '/api/workouts/log', schema: 'PastWorkoutLogResponseSchema' },
  // quick sessions
  { method: 'GET', path: '/api/workouts/planned', schema: 'PlannedWorkoutsResponseSchema' },
  { method: 'GET', path: '/api/workouts/session', schema: 'QuickSessionResponseSchema' },
  { method: 'PATCH', path: '/api/workouts/session', schema: 'QuickSessionPatchResponseSchema + WorkoutGatePayloadSchema', note: 'success (200) and the starred-session gate (403)' },
  { method: 'DELETE', path: '/api/workouts/session', schema: 'QuickSessionDeleteResponseSchema' },
  { method: 'PATCH', path: '/api/workouts/favorite-order', schema: 'FavoriteOrderResponseSchema' },
  // resolving what was left open
  { method: 'POST', path: '/api/workouts/resolve-incomplete', schema: 'ResolveIncompleteResponseSchema' },
  { method: 'GET', path: '/api/workouts/exercise-suggestions', schema: 'ExerciseSuggestionsResponseSchema' },
]

const coverage = new Coverage()

/** Which halves of the save union were actually sent — the second gate. */
const savesSent = new Set<string>()

/**
 * Set CONTRACT_DUMP=1 to print every body. This is how the fixtures in
 * shared/api-client/tests/workoutsSchemas.test.ts were recorded — from the real
 * handlers, against this disposable database, never from the live beta site
 * (beta shares production's MongoDB).
 */
function record(label: string, body: unknown): void {
  if (process.env.CONTRACT_DUMP) {
    console.log(`\n### ${label}\n${JSON.stringify(body, null, 2)}`)
  }
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

/** Plus, uncapped: the program day and the starred quick session. */
const MEMBER: ContractMember = {
  id: '6ab0180000000000000f7ee0',
  email: 'plus@np018.contract.test',
  label: 'plus',
  auth: '',
}

/** Free and AT the custom-sessions cap: the two gate surfaces. */
const CAPPED: ContractMember = {
  id: '6ab0180000000000000f7ee1',
  email: 'capped@np018.contract.test',
  label: 'free',
  auth: '',
}

/** A member with no UserProgress document at all — the one early answer. */
const FRESH: ContractMember = {
  id: '6ab0180000000000000f7ee2',
  email: 'fresh@np018.contract.test',
  label: 'free',
  auth: '',
}

const ALL_MEMBERS = [MEMBER, CAPPED, FRESH]

const PROGRAM_ID = 'np018-contract-strength'
const PROGRAM_NAME = 'NP018 Contract Strength'
const BENCH_SLUG = 'np018-barbell-bench-press'
const TREADMILL_SLUG = 'np018-treadmill-run'
const PRESS_SLUG = 'np018-overhead-press'

const DAY_ONE = 'Day 1'
const DAY_TWO = 'Day 2'

/** The MEMBER's quick session, saved by the quick half of the union. */
const QUICK_SESSION_ID = 'np018-quick-session'
/** A quick session planned three days out — GET /api/workouts/planned. */
const PLANNED_SESSION_ID = 'np018-planned-session'
/** The CAPPED member's quick session, created by the favoriteDenied save. */
const CAPPED_SESSION_ID = 'np018-capped-session'

const DAY_MS = 86_400_000
const now = Date.now()
/** The log GET /api/workouts/log is asked for. */
const RECENT_LOG_DATE = new Date(now - 10 * DAY_MS)
/** Older still, so the log above has an exerciseHistory to sit on top of. */
const OLDER_LOG_DATE = new Date(now - 20 * DAY_MS)
const RECENT_LOG_DAY_KEY = RECENT_LOG_DATE.toISOString().slice(0, 10)
/** Outside the 24h rolling in-progress window, inside the 30-day cutoff. */
const STALE_LOG_DATE = new Date(now - 3 * DAY_MS)

/** Minutes WEST of UTC — rule 5. A NUMBER, always, and never a stand-in 0. */
const TZ = 240

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

/**
 * A signed call. `query` goes on the URL, `body` is JSON-encoded — DELETE takes
 * both here, because DELETE /api/workouts is addressed by query parameters.
 */
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
// The save bodies, exactly as LiveWorkoutClient builds them
// ---------------------------------------------------------------------------

/**
 * One program-day save body, copied field for field from
 * webapp/app/dashboard/workout/[programId]/workout/live/LiveWorkoutClient.tsx
 * (`saveWorkout`, the non-quick branch).
 *
 * Three rules are visible in it:
 *   rule 1 — the treadmill's work is in `duration`/`distance`/`speed` with
 *            `reps: 0, weight: 0`, never in reps/weight;
 *   rule 2 — the skipped bench set is `completed: true` with reps 0, weight 0;
 *   rule 4 — `performedAt` appears only on the completing save.
 */
function programSaveBody(options: {
  completed: boolean
  attemptId: string
  performedAt?: string
  scheduledDate?: string
}): Record<string, unknown> {
  return {
    programId: PROGRAM_ID,
    phase: 1, // 1-BASED — rule 3
    day: DAY_ONE,
    exercises: [
      {
        name: 'Barbell Bench Press',
        exerciseSlug: BENCH_SLUG,
        sets: [
          { setNumber: 1, reps: 5, weight: 315, completed: true },
          { setNumber: 2, reps: 5, weight: 315, completed: true },
          // A SKIPPED set — rule 2. PR detection ignores reps 0.
          { setNumber: 3, reps: 0, weight: 0, completed: true },
        ],
        groupId: 'np018-g1',
        groupType: 'superset',
        groupLabel: 'A',
        groupRounds: 3,
        prescription: { sets: 3, reps: '5', rest: '3 min', trackingType: 'reps_weight' },
        // The swap trail: the member replaced the prescribed overhead press.
        originalExerciseSlug: PRESS_SLUG,
        swappedFromName: 'Overhead Press',
      },
      {
        name: 'Treadmill Run',
        exerciseSlug: TREADMILL_SLUG,
        sets: [
          // rule 1: timed work never lands in reps/weight.
          { setNumber: 1, reps: 0, weight: 0, duration: 600, distance: 1600, speed: 6.5, completed: true },
        ],
        prescription: { sets: 1, duration: '10 min', trackingType: 'time_distance' },
        addedAdHoc: true,
      },
    ],
    completed: options.completed,
    activeSeconds: 2_400,
    ...(options.scheduledDate && { scheduledDate: options.scheduledDate }),
    ...(options.completed && { duration: 40 }),
    ...(options.performedAt && { performedAt: options.performedAt }),
    attemptId: options.attemptId,
    tz: TZ, // a NUMBER — rule 5
  }
}

/**
 * One quick-session save body, copied field for field from the same function's
 * `isQuick` branch. Note `tzZone` beside `tz`: an offset is wrong for half the
 * year the moment daylight saving moves.
 */
function quickSaveBody(options: {
  sessionId: string
  completed: boolean
  favorite?: boolean
}): Record<string, unknown> {
  return {
    kind: 'quick' as const,
    sessionId: options.sessionId,
    title: 'Contract Quick Session',
    needsName: false,
    focus: 'upper',
    ...(options.favorite && { favorite: true }),
    exercises: [
      {
        name: 'Barbell Bench Press',
        exerciseSlug: BENCH_SLUG,
        sets: [{ setNumber: 1, reps: 8, weight: 200, completed: true }],
        prescription: { sets: 1, reps: '8', rest: '90 sec', trackingType: 'reps_weight' },
      },
      {
        name: 'Treadmill Run',
        exerciseSlug: TREADMILL_SLUG,
        sets: [
          { setNumber: 1, reps: 0, weight: 0, duration: 900, distance: 2400, speed: 6, completed: true },
        ],
        prescription: { sets: 1, duration: '15 min', trackingType: 'time_distance' },
      },
    ],
    completed: options.completed,
    activeSeconds: 1_500,
    ...(options.completed && { duration: 25 }),
    started: true,
    tz: TZ,
    tzZone: 'America/New_York',
  }
}

// ---------------------------------------------------------------------------
// Seeding
// ---------------------------------------------------------------------------

async function cleanFixtures(): Promise<void> {
  const ids = ALL_MEMBERS.map((m) => new mongoose.Types.ObjectId(m.id))
  const emails = ALL_MEMBERS.map((m) => m.email)
  await User.deleteMany({ $or: [{ _id: { $in: ids } }, { email: { $in: emails } }] })
  await UserProgress.deleteMany({ userId: { $in: ALL_MEMBERS.map((m) => m.id) } })
  await Schedule.deleteMany({ userId: { $in: ids } })
  await ProgramModel.deleteMany({ program_id: PROGRAM_ID })
  await ExerciseModel.deleteMany({ slug: { $in: [BENCH_SLUG, TREADMILL_SLUG, PRESS_SLUG] } })
}

before(async () => {
  process.env.JWT_SECRET ||= 'become-unit-test-secret'
  // With the kill-switch off, `peekQuota`/`requireQuota` always allow and
  // neither `favoriteDenied` nor the 403 gate ever appears in a response.
  process.env.ENTITLEMENTS_ENFORCED = '1'

  await mongoose.connect(process.env.MONGODB_URI ?? 'mongodb://127.0.0.1:27017/become-test')
  await cleanFixtures()

  for (const member of ALL_MEMBERS) {
    await User.create({
      _id: new mongoose.Types.ObjectId(member.id),
      email: member.email,
      // Legacy column, `required` on the model; magic-link members never use it.
      password: 'contract-test-unused',
      name: `Contract ${member.label}`,
      tier: member.label,
      profile: { fitnessGoal: 'gain_muscle', weightUnit: 'lbs' },
      onboardingCompleted: true,
    })
    member.auth = `Bearer ${await signToken({ userId: member.id, email: member.email })}`
  }

  // The catalog rows the saved slugs resolve to. equipment / laterality /
  // movementPatterns are populated because the session-rebuild routes read them
  // back out of the CATALOG (a log only ever kept the slug), and a field the
  // fixture leaves empty is a field this file never checks.
  await ExerciseModel.create({
    slug: BENCH_SLUG,
    name: 'Barbell Bench Press',
    category: 'strength',
    role: 'compound',
    movementPatterns: ['horizontal_push'],
    laterality: 'bilateral',
    difficulty: 'intermediate',
    primaryMuscles: ['chest'],
    equipment: ['barbell', 'flat_bench'],
    trackingType: 'reps_weight',
    bodyRegion: 'upper_body',
  })
  await ExerciseModel.create({
    slug: TREADMILL_SLUG,
    name: 'Treadmill Run',
    category: 'cardio',
    role: 'accessory',
    movementPatterns: ['gait'],
    laterality: 'bilateral',
    difficulty: 'beginner',
    primaryMuscles: ['quads'],
    equipment: ['treadmill'],
    trackingType: 'time_distance',
    bodyRegion: 'lower_body',
  })
  await ExerciseModel.create({
    slug: PRESS_SLUG,
    name: 'Overhead Press',
    category: 'strength',
    role: 'compound',
    movementPatterns: ['vertical_push'],
    laterality: 'bilateral',
    difficulty: 'intermediate',
    primaryMuscles: ['front_delts'],
    equipment: ['barbell'],
    trackingType: 'reps_weight',
    bodyRegion: 'upper_body',
  })
  // The catalog is cached per process; a row created after the first hydrate
  // would be invisible to it.
  invalidateExerciseCache()

  await ProgramModel.create({
    program_id: PROGRAM_ID,
    name: PROGRAM_NAME,
    description: 'A two-day fixture program.',
    duration_weeks: 2,
    training_days_per_week: 2,
    goal: 'Build strength',
    target_user: 'Intermediate',
    equipment: ['barbell'],
    tags: ['np018'],
    phases: [
      {
        phase: 'Phase 1',
        weeks: '1-2',
        focus: 'Accumulation',
        workouts: [
          { day: DAY_ONE, title: 'Upper A', exercises: [{ exerciseSlug: BENCH_SLUG, sets: 3, reps: '5' }] },
          { day: DAY_TWO, title: 'Lower A', exercises: [{ exerciseSlug: BENCH_SLUG, sets: 3, reps: '8' }] },
        ],
      },
    ],
  })

  await UserProgress.create({
    userId: MEMBER.id,
    streakDays: 4,
    longestStreak: 9,
    streakFreezes: 1,
    lastActivityDate: new Date(now - 2 * DAY_MS),
    activePrograms: [
      {
        programId: PROGRAM_ID,
        programName: PROGRAM_NAME,
        status: 'in-progress',
        startDate: new Date(now - 21 * DAY_MS),
        currentPhase: 1,
        currentDay: DAY_ONE,
        completedWorkouts: 1,
        totalWorkouts: 1,
      },
    ],
    // The persisted records GET /api/workouts (?includeHistory=true) and
    // /last-performance project — read, never recomputed, on a GET.
    exercisePRs: [
      {
        exerciseSlug: BENCH_SLUG,
        exerciseName: 'Barbell Bench Press',
        maxWeight: { weight: 225, reps: 5, e1rm: 262.5, date: OLDER_LOG_DATE, programId: PROGRAM_ID },
        maxReps: null,
        maxE1RM: null,
      },
    ],
    favoriteSessionOrder: [],
    workoutLogs: [
      // Oldest: gives the log below an exerciseHistory to sit on top of.
      {
        date: OLDER_LOG_DATE,
        programId: PROGRAM_ID,
        phase: 1,
        day: DAY_TWO,
        kind: 'program',
        completed: true,
        duration: 44,
        startedAt: OLDER_LOG_DATE,
        activeSeconds: 2_640,
        exercises: [
          {
            name: 'Barbell Bench Press',
            exerciseSlug: BENCH_SLUG,
            sets: [{ setNumber: 1, reps: 5, weight: 205, completed: true }],
          },
        ],
      },
      // The one GET /api/workouts/log is asked for.
      {
        date: RECENT_LOG_DATE,
        programId: PROGRAM_ID,
        phase: 1,
        day: DAY_ONE,
        kind: 'program',
        completed: true,
        duration: 48,
        startedAt: RECENT_LOG_DATE,
        activeSeconds: 2_880,
        notes: 'Felt strong.',
        exercises: [
          {
            name: 'Barbell Bench Press',
            exerciseSlug: BENCH_SLUG,
            sets: [
              { setNumber: 1, reps: 5, weight: 225, completed: true },
              { setNumber: 2, reps: 3, weight: 245, completed: true },
            ],
          },
        ],
      },
      // Abandoned, old enough to need a decision: GET /api/workouts surfaces it
      // as `staleIncomplete` and resolve-incomplete settles it.
      {
        date: STALE_LOG_DATE,
        programId: PROGRAM_ID,
        phase: 1,
        day: DAY_TWO,
        kind: 'program',
        completed: false,
        startedAt: STALE_LOG_DATE,
        activeSeconds: 300,
        exercises: [
          {
            name: 'Barbell Bench Press',
            exerciseSlug: BENCH_SLUG,
            sets: [
              { setNumber: 1, reps: 5, weight: 185, completed: true },
              { setNumber: 2, reps: 0, weight: 0, completed: false },
            ],
          },
        ],
      },
      // A quick session PLANNED three days out, with the prescription a
      // rebuild needs — GET /api/workouts/planned.
      {
        date: new Date(now + 3 * DAY_MS),
        kind: 'quick',
        sessionId: PLANNED_SESSION_ID,
        title: 'Planned Upper',
        needsName: false,
        focus: 'upper',
        completed: false,
        activeSeconds: 0,
        exercises: [
          {
            name: 'Barbell Bench Press',
            exerciseSlug: BENCH_SLUG,
            sets: [{ setNumber: 1, reps: 0, weight: 0, completed: false }],
            groupId: 'np018-p1',
            groupType: 'superset',
            groupLabel: 'A',
            groupRounds: 2,
            prescription: { sets: 3, reps: '8', rest: '90 sec', trackingType: 'reps_weight' },
          },
        ],
      },
    ],
  })

  // ONE non-rest slot, dated today, so the completing save resolves it and the
  // program reports `programCompleted` with its name.
  await Schedule.create({
    userId: new mongoose.Types.ObjectId(MEMBER.id),
    programId: PROGRAM_ID,
    programName: PROGRAM_NAME,
    settings: { trainingDays: [1, 3], startDate: new Date(now - 21 * DAY_MS) },
    scheduledWorkouts: [
      {
        date: new Date(`${new Date().toISOString().slice(0, 10)}T00:00:00.000Z`),
        programId: PROGRAM_ID,
        phase: 1,
        dayLabel: DAY_ONE,
        workoutTitle: 'Upper A',
        status: 'scheduled',
      },
    ],
  })

  // AT the cap: three STARRED quick sessions is exactly FREE_LIMITS
  // ['custom-sessions'].limit, plus one never-started plan for TODAY so
  // GET /api/workouts/in-progress can answer `planned` rather than `workout`.
  await UserProgress.create({
    userId: CAPPED.id,
    workoutLogs: [
      ...[1, 2, 3].map((n) => ({
        date: new Date(now - (n + 4) * DAY_MS),
        kind: 'quick' as const,
        sessionId: `np018-starred-${n}`,
        title: `Starred ${n}`,
        completed: true,
        favorite: true,
        duration: 30,
        startedAt: new Date(now - (n + 4) * DAY_MS),
        activeSeconds: 1_800,
        exercises: [],
      })),
      {
        date: new Date(),
        kind: 'quick' as const,
        sessionId: 'np018-plan-today',
        title: 'Planned for today',
        completed: false,
        // No startedAt: this is a "Plan it" placeholder, not a workout in
        // progress. That distinction is the whole point of `planned`.
        activeSeconds: 0,
        exercises: [],
      },
    ],
  })
})

after(async () => {
  await cleanFixtures()
  await mongoose.disconnect()
})

// ═══════════════════════════════════════════════════════════════════════════
// POST /api/workouts — the program half of the union
// ═══════════════════════════════════════════════════════════════════════════

test('the program save body the web builds validates as the program half of the union', () => {
  const body = programSaveBody({ completed: false, attemptId: 'np018-attempt-1' })
  const parsed = WorkoutSaveRequestSchema.safeParse(body)
  assert.ok(
    parsed.success,
    `the body LiveWorkoutClient builds for a program day must validate:\n${JSON.stringify(parsed.error?.issues, null, 2)}`,
  )
  assert.notEqual(parsed.data?.kind, 'quick', 'a program save is not the quick half')
  // Rule 5: `tz` is a NUMBER, and a string is not a near-enough answer.
  const asString = WorkoutSaveRequestSchema.safeParse({ ...body, tz: '240' })
  assert.equal(asString.success, false, 'tz is minutes west of UTC as a NUMBER — rule 5')
})

test('POST /api/workouts autosaves an open program day (WorkoutSaveResponseSchema)', async () => {
  const { status, body } = await call(workoutsPOST, 'POST', '/api/workouts', MEMBER, {
    body: programSaveBody({ completed: false, attemptId: 'np018-attempt-1' }),
  })
  coverage.mark('POST', '/api/workouts')
  savesSent.add('program')
  record('POST /api/workouts (program autosave)', body)
  assert.equal(status, 200, JSON.stringify(body))
  assertContract({
    label: 'POST /api/workouts (program autosave)',
    schema: WorkoutSaveResponseSchema,
    body,
    expectKeys: ['message', 'completed', 'programCompleted'],
  })
  const parsed = WorkoutSaveResponseSchema.parse(body)
  assert.equal(parsed.completed, false)
  assert.equal(parsed.streak, undefined, 'an autosave records no streak activity')
})

// ═══════════════════════════════════════════════════════════════════════════
// GET /api/workouts — open or resume the day
// ═══════════════════════════════════════════════════════════════════════════

test('GET /api/workouts resumes the open log with history, PRs and the stale prompt', async () => {
  const { status, body } = await call(workoutsGET, 'GET', '/api/workouts', MEMBER, {
    query: { programId: PROGRAM_ID, day: DAY_ONE, includeHistory: 'true', tz: String(TZ) },
  })
  coverage.mark('GET', '/api/workouts')
  record('GET /api/workouts?includeHistory=true', body)
  assert.equal(status, 200, JSON.stringify(body))
  assertContract({
    label: 'GET /api/workouts',
    schema: WorkoutResumeResponseSchema,
    body,
    expectKeys: [
      'workout',
      'workout.date',
      'workout.programId',
      'workout.phase',
      'workout.day',
      'workout.completed',
      'workout.exercises.0.name',
      'workout.exercises.0.sets.0.completed',
      'isResume',
      'exerciseHistory',
      'exercisePRs',
      'staleIncomplete',
      'staleIncomplete.day',
      'staleIncomplete.completedExerciseCount',
      'staleIncomplete.totalExerciseCount',
    ],
  })

  const parsed = WorkoutResumeResponseSchema.parse(body)
  assert.equal(parsed.isResume, true, 'an OPEN log is a resume')
  assert.equal(parsed.workout?.attemptId, 'np018-attempt-1')
  // Rule 3: the wire carries a 1-based phase, never an array index.
  assert.equal(parsed.workout?.phase, 1)
  // Rule 1: the treadmill's work came back where it was saved.
  const treadmill = parsed.workout?.exercises.find((ex) => ex.exerciseSlug === TREADMILL_SLUG)
  assert.equal(treadmill?.sets[0]?.duration, 600)
  assert.equal(treadmill?.sets[0]?.distance, 1600)
  assert.equal(treadmill?.sets[0]?.reps, 0, 'timed work never lands in reps — rule 1')
  // The swap trail survives the round trip, which is what last-performance
  // matches the original lift's history on.
  const bench = parsed.workout?.exercises.find((ex) => ex.exerciseSlug === BENCH_SLUG)
  assert.equal(bench?.originalExerciseSlug, PRESS_SLUG)
  assert.equal(bench?.swappedFromName, 'Overhead Press')
  // History is keyed by exercise NAME, from logs before today.
  assert.ok(parsed.exerciseHistory['Barbell Bench Press'], 'the past log feeds exerciseHistory')
  assert.equal(parsed.exercisePRs?.['Barbell Bench Press']?.weight, 225)
  // The stale prompt is the DAY 2 log, and never the one being resumed.
  assert.equal(parsed.staleIncomplete?.day, DAY_TWO)
  assert.equal(parsed.staleIncomplete?.totalExerciseCount, 1)
})

test('GET /api/workouts answers a member with no progress document at all', async () => {
  const { status, body } = await call(workoutsGET, 'GET', '/api/workouts', FRESH, {
    query: { programId: PROGRAM_ID, day: DAY_ONE, tz: String(TZ) },
  })
  record('GET /api/workouts (no progress document)', body)
  assert.equal(status, 200, JSON.stringify(body))
  // This is the one answer that carries neither `exercisePRs` nor
  // `staleIncomplete`, which is why both are optional on the schema.
  assertContract({
    label: 'GET /api/workouts (fresh member)',
    schema: WorkoutResumeResponseSchema,
    body,
    expectKeys: ['workout', 'isResume', 'exerciseHistory'],
  })
  const parsed = WorkoutResumeResponseSchema.parse(body)
  assert.equal(parsed.workout, null)
  assert.equal(parsed.isResume, false)
})

// ═══════════════════════════════════════════════════════════════════════════
// DELETE /api/workouts — discard the open log
// ═══════════════════════════════════════════════════════════════════════════

test('DELETE /api/workouts discards the OPEN log for a program day', async () => {
  const { status, body } = await call(workoutsDELETE, 'DELETE', '/api/workouts', MEMBER, {
    query: { programId: PROGRAM_ID, day: DAY_ONE, tz: String(TZ) },
  })
  coverage.mark('DELETE', '/api/workouts')
  record('DELETE /api/workouts', body)
  assert.equal(status, 200, JSON.stringify(body))
  assertContract({
    label: 'DELETE /api/workouts',
    schema: WorkoutDiscardResponseSchema,
    body,
    expectKeys: ['success'],
  })

  // Scoped to the rolling in-progress window, so a second discard 404s rather
  // than reporting a success that removed nothing.
  const again = await call(workoutsDELETE, 'DELETE', '/api/workouts', MEMBER, {
    query: { programId: PROGRAM_ID, day: DAY_ONE, tz: String(TZ) },
  })
  assert.equal(again.status, 404, JSON.stringify(again.body))
})

// ═══════════════════════════════════════════════════════════════════════════
// GET /api/workouts/in-progress — both branches
// ═══════════════════════════════════════════════════════════════════════════

test('GET /api/workouts/in-progress reports the workout the member is genuinely in', async () => {
  // Re-open the day the discard above removed.
  const reopened = await call(workoutsPOST, 'POST', '/api/workouts', MEMBER, {
    body: programSaveBody({ completed: false, attemptId: 'np018-attempt-2' }),
  })
  assert.equal(reopened.status, 200, JSON.stringify(reopened.body))

  const { status, body } = await call(inProgressGET, 'GET', '/api/workouts/in-progress', MEMBER, {
    query: { tz: String(TZ) },
  })
  coverage.mark('GET', '/api/workouts/in-progress')
  record('GET /api/workouts/in-progress (workout)', body)
  assert.equal(status, 200, JSON.stringify(body))
  assertContract({
    label: 'GET /api/workouts/in-progress (workout)',
    schema: WorkoutInProgressResponseSchema,
    body,
    expectKeys: [
      'workout',
      'workout.kind',
      'workout.programId',
      'workout.day',
      'workout.phase',
      'workout.sessionId',
      'workout.title',
      'workout.exerciseCount',
      'workout.startedAt',
      'planned',
    ],
  })
  const parsed = WorkoutInProgressResponseSchema.parse(body)
  assert.equal(parsed.workout?.kind, 'program')
  assert.equal(parsed.workout?.day, DAY_ONE)
  assert.equal(parsed.workout?.exerciseCount, 2)
  assert.equal(parsed.planned, null)
})

test('GET /api/workouts/in-progress reports a never-started plan as `planned`, not `workout`', async () => {
  const { status, body } = await call(inProgressGET, 'GET', '/api/workouts/in-progress', CAPPED, {
    query: { tz: String(TZ) },
  })
  record('GET /api/workouts/in-progress (planned)', body)
  assert.equal(status, 200, JSON.stringify(body))
  assertContract({
    label: 'GET /api/workouts/in-progress (planned)',
    schema: WorkoutInProgressResponseSchema,
    body,
    expectKeys: ['workout', 'planned', 'planned.kind', 'planned.sessionId', 'planned.title', 'planned.exerciseCount'],
  })
  const parsed = WorkoutInProgressResponseSchema.parse(body)
  assert.equal(parsed.workout, null, 'a plan nobody opened is not a workout in progress')
  assert.equal(parsed.planned?.sessionId, 'np018-plan-today')
})

// ═══════════════════════════════════════════════════════════════════════════
// POST /api/workouts — the completing save, and the quick half of the union
// ═══════════════════════════════════════════════════════════════════════════

test('POST /api/workouts completes the day with programCompleted, PRs and streak', async () => {
  const { status, body } = await call(workoutsPOST, 'POST', '/api/workouts', MEMBER, {
    body: programSaveBody({
      completed: true,
      attemptId: 'np018-attempt-2',
      // Rule 4: only the completing save carries these two.
      performedAt: new Date().toISOString(),
      scheduledDate: `${new Date().toISOString().slice(0, 10)}T00:00:00.000Z`,
    }),
  })
  record('POST /api/workouts (program completing save)', body)
  assert.equal(status, 200, JSON.stringify(body))
  assertContract({
    label: 'POST /api/workouts (program completing save)',
    schema: WorkoutSaveResponseSchema,
    body,
    expectKeys: [
      'message',
      'completed',
      'programCompleted',
      'programName',
      'newPRsAchieved',
      'newPRsAchieved.0.exerciseSlug',
      'newPRsAchieved.0.exerciseName',
      'newPRsAchieved.0.dimensions',
      'streak',
      'streak.streakDays',
      'streak.streakExtended',
      'streak.freezeUsed',
      'streak.newMilestone',
      'streak.longestStreak',
    ],
  })
  const parsed = WorkoutSaveResponseSchema.parse(body)
  assert.equal(parsed.completed, true)
  assert.equal(parsed.programCompleted, true)
  assert.equal(parsed.programName, PROGRAM_NAME)
  // 315 × 5 beats the persisted 225 × 5; the skipped set (reps 0) is ignored.
  assert.ok(parsed.newPRsAchieved?.some((pr) => pr.exerciseSlug === BENCH_SLUG))
  assert.equal(
    parsed.newPRsAchieved?.some((pr) => pr.exerciseSlug === TREADMILL_SLUG),
    false,
    'PR detection ignores a set with reps 0 — rule 2',
  )
})

test('the quick save body the web builds validates as the quick half of the union', () => {
  const body = quickSaveBody({ sessionId: QUICK_SESSION_ID, completed: true, favorite: true })
  const parsed = WorkoutSaveRequestSchema.safeParse(body)
  assert.ok(
    parsed.success,
    `the body LiveWorkoutClient builds for a quick session must validate:\n${JSON.stringify(parsed.error?.issues, null, 2)}`,
  )
  assert.equal(parsed.data?.kind, 'quick')
  // The discriminator is what keeps the two halves apart: a quick body with no
  // sessionId is refused HERE rather than by a 400 from a device.
  const noSession = { ...body } as Record<string, unknown>
  delete noSession.sessionId
  assert.equal(WorkoutSaveRequestSchema.safeParse(noSession).success, false)
})

test('POST /api/workouts saves a quick session (kind: quick)', async () => {
  const { status, body } = await call(workoutsPOST, 'POST', '/api/workouts', MEMBER, {
    body: quickSaveBody({ sessionId: QUICK_SESSION_ID, completed: true, favorite: true }),
  })
  savesSent.add('quick')
  record('POST /api/workouts (quick session)', body)
  assert.equal(status, 200, JSON.stringify(body))
  assertContract({
    label: 'POST /api/workouts (quick session)',
    schema: WorkoutSaveResponseSchema,
    body,
    expectKeys: ['message', 'completed', 'streak'],
  })
  const parsed = WorkoutSaveResponseSchema.parse(body)
  assert.equal(parsed.completed, true)
  assert.equal(parsed.favoriteDenied, undefined, 'a Plus member is not capped')
})

test('POST /api/workouts soft-drops the star at the free cap and says so (favoriteDenied)', async () => {
  const { status, body } = await call(workoutsPOST, 'POST', '/api/workouts', CAPPED, {
    body: quickSaveBody({ sessionId: CAPPED_SESSION_ID, completed: true, favorite: true }),
  })
  record('POST /api/workouts (quick session, favoriteDenied)', body)
  // A workout save must NEVER fail for a plan reason: logging is history, and
  // history is not a paid feature.
  assert.equal(status, 200, JSON.stringify(body))
  assertContract({
    label: 'POST /api/workouts (favoriteDenied)',
    schema: WorkoutSaveResponseSchema,
    body,
    expectKeys: [
      'message',
      'completed',
      'favoriteDenied',
      'favoriteDenied.error',
      'favoriteDenied.feature',
      'favoriteDenied.requiresTier',
    ],
  })
  const parsed = WorkoutSaveResponseSchema.parse(body)
  assert.equal(parsed.favoriteDenied?.feature, 'custom-sessions')
  assert.equal(parsed.favoriteDenied?.requiresTier, 'plus')
})

// ═══════════════════════════════════════════════════════════════════════════
// GET /api/workouts/last-performance
// ═══════════════════════════════════════════════════════════════════════════

test('GET /api/workouts/last-performance prefills from the last completed set, PRs included', async () => {
  const { status, body } = await call(
    lastPerformanceGET,
    'GET',
    '/api/workouts/last-performance',
    MEMBER,
    { query: { slugs: `${BENCH_SLUG},${TREADMILL_SLUG},${PRESS_SLUG}` } },
  )
  coverage.mark('GET', '/api/workouts/last-performance')
  record('GET /api/workouts/last-performance', body)
  assert.equal(status, 200, JSON.stringify(body))
  assertContract({
    label: 'GET /api/workouts/last-performance',
    schema: LastPerformanceResponseSchema,
    body,
    expectKeys: [
      'performances',
      `performances.${BENCH_SLUG}`,
      `performances.${TREADMILL_SLUG}`,
      `performances.${PRESS_SLUG}`,
      'prs',
    ],
  })
  const parsed = LastPerformanceResponseSchema.parse(body)
  // Rule 1 again, read back: the treadmill's numbers are duration/distance.
  assert.equal(parsed.performances[TREADMILL_SLUG]?.duration, 900)
  assert.equal(parsed.performances[TREADMILL_SLUG]?.distance, 2400)
  // The swap trail: the member never logged PRESS_SLUG under its own name, but
  // the bench set carries it as `originalExerciseSlug`, so its history counts.
  assert.ok(
    parsed.performances[PRESS_SLUG],
    'a swap-tracked set is still "last time you did the original lift"',
  )
})

// ═══════════════════════════════════════════════════════════════════════════
// GET /api/workouts/logs — two responses, one route
// ═══════════════════════════════════════════════════════════════════════════

test('GET /api/workouts/logs?programId= answers one program\'s logs', async () => {
  const { status, body } = await call(logsGET, 'GET', '/api/workouts/logs', MEMBER, {
    query: { programId: PROGRAM_ID },
  })
  coverage.mark('GET', '/api/workouts/logs')
  record('GET /api/workouts/logs?programId=', body)
  assert.equal(status, 200, JSON.stringify(body))
  assertContract({
    label: 'GET /api/workouts/logs?programId=',
    schema: ProgramWorkoutLogsResponseSchema,
    body,
    expectKeys: ['logs', 'logs.0.day', 'logs.0.phase', 'logs.0.completed', 'logs.0.date'],
  })
  const parsed = ProgramWorkoutLogsResponseSchema.parse(body)
  assert.ok(parsed.logs.length >= 3)
  assert.equal(
    parsed.logs.every((log) => log.phase === 1),
    true,
    'phase is 1-based on the wire — rule 3',
  )
})

test('GET /api/workouts/logs answers the full history, with reopenable exercises', async () => {
  const { status, body } = await call(logsGET, 'GET', '/api/workouts/logs', MEMBER, {
    query: { includeIncomplete: 'true', withExercises: 'true' },
  })
  record('GET /api/workouts/logs (history, withExercises)', body)
  assert.equal(status, 200, JSON.stringify(body))
  assertContract({
    label: 'GET /api/workouts/logs (history)',
    schema: WorkoutHistoryResponseSchema,
    body,
    expectKeys: [
      'logs',
      'logs.0.kind',
      'logs.0.title',
      'logs.0.completed',
      'logs.0.skipped',
      'logs.0.favorite',
      'logs.0.date',
      'logs.0.exerciseCount',
      'logs.0.completedSets',
      'favoriteSessionOrder',
    ],
  })
  const parsed = WorkoutHistoryResponseSchema.parse(body)
  const quick = parsed.logs.find((log) => log.sessionId === QUICK_SESSION_ID)
  assert.ok(quick, 'the quick session is in the history')
  assert.equal(quick?.kind, 'quick')
  assert.equal(quick?.favorite, true, 'a Plus member\'s star was kept')
  // `?withExercises=true` is what makes a saved session REOPENABLE rather than
  // regenerated: the draft shape, with its prescription and its grouping.
  assert.equal(quick?.exercises?.length, 2)
  assert.equal(quick?.exercises?.[0]?.trackingType, 'reps_weight')
  assert.deepEqual(quick?.exercises?.[0]?.equipment, ['barbell', 'flat_bench'])
  assert.equal(quick?.exercises?.[0]?.reps, '8', 'the draft carries the PRESCRIPTION string')
  // A program day is resolved from the program itself and carries no draft.
  const program = parsed.logs.find((log) => log.kind === 'program')
  assert.equal(program?.exercises, undefined)
  assert.ok(program?.title?.includes(PROGRAM_NAME))
})

// ═══════════════════════════════════════════════════════════════════════════
// PATCH /api/workouts/logs — a correction
// ═══════════════════════════════════════════════════════════════════════════

test('PATCH /api/workouts/logs corrects one completed log and replays every PR', async () => {
  const requestBody = {
    locator: { kind: 'quick' as const, sessionId: QUICK_SESSION_ID },
    correction: {
      title: 'Corrected Quick Session',
      duration: 26,
      notes: 'Weight was wrong on the bench.',
      exercises: [
        {
          name: 'Barbell Bench Press',
          exerciseSlug: BENCH_SLUG,
          sets: [{ setNumber: 1, reps: 8, weight: 190, completed: true }],
        },
        {
          name: 'Treadmill Run',
          exerciseSlug: TREADMILL_SLUG,
          sets: [
            { setNumber: 1, reps: 0, weight: 0, duration: 960, distance: 2500, speed: 6.2, completed: true },
          ],
        },
      ],
    },
  }
  // The body the correction modal builds is the schema, not a near-relative.
  const parsedRequest = WorkoutLogCorrectionRequestSchema.safeParse(requestBody)
  assert.ok(
    parsedRequest.success,
    `the correction body must validate:\n${JSON.stringify(parsedRequest.error?.issues, null, 2)}`,
  )
  assert.equal(parsedRequest.data?.locator.kind, 'quick')

  const { status, body } = await call(logsPATCH, 'PATCH', '/api/workouts/logs', MEMBER, {
    body: requestBody,
  })
  coverage.mark('PATCH', '/api/workouts/logs')
  record('PATCH /api/workouts/logs', body)
  assert.equal(status, 200, JSON.stringify(body))
  assertContract({
    label: 'PATCH /api/workouts/logs',
    schema: WorkoutLogCorrectionResponseSchema,
    body,
    expectKeys: ['success', 'recalculatedPRs'],
  })
  const parsed = WorkoutLogCorrectionResponseSchema.parse(body)
  assert.equal(parsed.success, true)
  // A COUNT of the exercises the member now holds a record for, not a boolean
  // and not a list. What the number should be for a given history is the
  // replay's business (lib/exercisePRs.ts); the contract is that it is one.
  assert.equal(typeof parsed.recalculatedPRs, 'number')
  assert.ok(parsed.recalculatedPRs >= 0)
})

// ═══════════════════════════════════════════════════════════════════════════
// GET /api/workouts/log — one past program day
// ═══════════════════════════════════════════════════════════════════════════

test('GET /api/workouts/log answers one past log plus the history that predates it', async () => {
  const { status, body } = await call(logGET, 'GET', '/api/workouts/log', MEMBER, {
    query: { programId: PROGRAM_ID, date: RECENT_LOG_DAY_KEY },
  })
  coverage.mark('GET', '/api/workouts/log')
  record('GET /api/workouts/log', body)
  assert.equal(status, 200, JSON.stringify(body))
  assertContract({
    label: 'GET /api/workouts/log',
    schema: PastWorkoutLogResponseSchema,
    body,
    expectKeys: [
      'log',
      'log.date',
      'log.day',
      'log.phase',
      'log.completed',
      'log.exercises.0.name',
      'exerciseHistory',
    ],
  })
  const parsed = PastWorkoutLogResponseSchema.parse(body)
  assert.equal(parsed.log?.day, DAY_ONE)
  assert.equal(parsed.log?.notes, 'Felt strong.')
  // The 20-day-old log is what sits underneath this one.
  assert.equal(parsed.exerciseHistory['Barbell Bench Press']?.weight, 205)
})

// ═══════════════════════════════════════════════════════════════════════════
// The quick-session routes
// ═══════════════════════════════════════════════════════════════════════════

test('GET /api/workouts/planned answers future-dated quick sessions, rebuildable', async () => {
  const { status, body } = await call(plannedGET, 'GET', '/api/workouts/planned', MEMBER)
  coverage.mark('GET', '/api/workouts/planned')
  record('GET /api/workouts/planned', body)
  assert.equal(status, 200, JSON.stringify(body))
  assertContract({
    label: 'GET /api/workouts/planned',
    schema: PlannedWorkoutsResponseSchema,
    body,
    expectKeys: [
      'planned',
      'planned.0.sessionId',
      'planned.0.title',
      'planned.0.date',
      'planned.0.exerciseCount',
      'planned.0.exercises.0.exerciseSlug',
      'planned.0.exercises.0.trackingType',
      'planned.0.exercises.0.sets',
      'planned.0.exercises.0.reps',
    ],
  })
  const parsed = PlannedWorkoutsResponseSchema.parse(body)
  const plan = parsed.planned.find((p) => p.sessionId === PLANNED_SESSION_ID)
  assert.ok(plan, 'the future-dated plan is here and the past sessions are not')
  // The grouping has to survive, or a planned superset starts as two unrelated
  // exercises.
  assert.equal(plan?.exercises[0]?.groupId, 'np018-p1')
  assert.equal(plan?.exercises[0]?.groupRounds, 2)
})

test('GET /api/workouts/session answers one quick session with its logged sets', async () => {
  const { status, body } = await call(sessionGET, 'GET', '/api/workouts/session', MEMBER, {
    query: { id: QUICK_SESSION_ID },
  })
  coverage.mark('GET', '/api/workouts/session')
  record('GET /api/workouts/session', body)
  assert.equal(status, 200, JSON.stringify(body))
  assertContract({
    label: 'GET /api/workouts/session',
    schema: QuickSessionResponseSchema,
    body,
    expectKeys: [
      'session',
      'session.sessionId',
      'session.title',
      'session.date',
      'session.completed',
      'session.exercises.0.name',
      'session.exercises.0.exerciseSlug',
      'session.exercises.0.trackingType',
      'session.exercises.0.sets.0.reps',
      'session.exercises.0.sets.0.weight',
      'session.exercises.0.sets.0.duration',
      'session.exercises.0.sets.0.distance',
      'session.exercises.0.sets.0.speed',
      'session.exercises.0.sets.0.completed',
    ],
  })
  const parsed = QuickSessionResponseSchema.parse(body)
  assert.equal(parsed.session?.title, 'Corrected Quick Session', 'the correction stuck')
  const treadmill = parsed.session?.exercises.find((ex) => ex.exerciseSlug === TREADMILL_SLUG)
  // Cardio is a distance and a speed, not a load — and both come back.
  assert.equal(treadmill?.sets[0]?.distance, 2500)
  assert.equal(treadmill?.sets[0]?.speed, 6.2)
  assert.equal(treadmill?.trackingType, 'time_distance')

  // A session that does not exist answers the SAME shape, so a client has one
  // branch rather than two.
  const missing = await call(sessionGET, 'GET', '/api/workouts/session', MEMBER, {
    query: { id: 'np018-no-such-session' },
  })
  assert.equal(missing.status, 404)
  assertContract({
    label: 'GET /api/workouts/session (404)',
    schema: QuickSessionResponseSchema,
    body: missing.body,
    expectKeys: ['session'],
  })
  assert.equal(QuickSessionResponseSchema.parse(missing.body).session, null)
})

test('PATCH /api/workouts/session renames, re-dates and stars a session', async () => {
  const requestBody = {
    id: QUICK_SESSION_ID,
    title: 'Renamed Quick Session',
    date: new Date(now - DAY_MS).toISOString().slice(0, 10),
    favorite: true,
    tz: TZ,
  }
  assert.ok(QuickSessionPatchRequestSchema.safeParse(requestBody).success)

  const { status, body } = await call(sessionPATCH, 'PATCH', '/api/workouts/session', MEMBER, {
    body: requestBody,
  })
  coverage.mark('PATCH', '/api/workouts/session')
  record('PATCH /api/workouts/session', body)
  assert.equal(status, 200, JSON.stringify(body))
  assertContract({
    label: 'PATCH /api/workouts/session',
    schema: QuickSessionPatchResponseSchema,
    body,
    expectKeys: ['success'],
  })
})

test('PATCH /api/workouts/session refuses a star at the free cap with the canonical 403', async () => {
  const { status, body } = await call(sessionPATCH, 'PATCH', '/api/workouts/session', CAPPED, {
    body: { id: CAPPED_SESSION_ID, favorite: true, tz: TZ },
  })
  record('PATCH /api/workouts/session (403 gate)', body)
  assert.equal(status, 403, JSON.stringify(body))
  assertContract({
    label: 'PATCH /api/workouts/session (403 gate)',
    schema: WorkoutGatePayloadSchema,
    body,
    expectKeys: ['error', 'feature', 'requiresTier'],
  })
  const gate = WorkoutGatePayloadSchema.parse(body)
  assert.equal(gate.feature, 'custom-sessions')
  assert.equal(gate.requiresTier, 'plus')

  // UNstarring is always free, so a member at 3/3 always has a way back under
  // the cap — and it answers the ordinary success shape.
  const unstar = await call(sessionPATCH, 'PATCH', '/api/workouts/session', CAPPED, {
    body: { id: 'np018-starred-1', favorite: false, tz: TZ },
  })
  assert.equal(unstar.status, 200, JSON.stringify(unstar.body))
  assertContract({
    label: 'PATCH /api/workouts/session (unstar)',
    schema: QuickSessionPatchResponseSchema,
    body: unstar.body,
    expectKeys: ['success'],
  })
})

test('DELETE /api/workouts/session removes a quick session log', async () => {
  const { status, body } = await call(sessionDELETE, 'DELETE', '/api/workouts/session', MEMBER, {
    query: { id: PLANNED_SESSION_ID },
  })
  coverage.mark('DELETE', '/api/workouts/session')
  record('DELETE /api/workouts/session', body)
  assert.equal(status, 200, JSON.stringify(body))
  assertContract({
    label: 'DELETE /api/workouts/session',
    schema: QuickSessionDeleteResponseSchema,
    body,
    expectKeys: ['success'],
  })
})

test('PATCH /api/workouts/favorite-order answers with the order it STORED', async () => {
  // The server normalises: blanks dropped, duplicates collapsed to the first
  // occurrence. The client renders what came back, not its optimistic list.
  const requestBody = { order: [QUICK_SESSION_ID, '  ', QUICK_SESSION_ID, 'np018-other-session'] }
  assert.ok(FavoriteOrderRequestSchema.safeParse(requestBody).success)

  const { status, body } = await call(
    favoriteOrderPATCH,
    'PATCH',
    '/api/workouts/favorite-order',
    MEMBER,
    { body: requestBody },
  )
  coverage.mark('PATCH', '/api/workouts/favorite-order')
  record('PATCH /api/workouts/favorite-order', body)
  assert.equal(status, 200, JSON.stringify(body))
  assertContract({
    label: 'PATCH /api/workouts/favorite-order',
    schema: FavoriteOrderResponseSchema,
    body,
    expectKeys: ['success', 'favoriteSessionOrder'],
  })
  const parsed = FavoriteOrderResponseSchema.parse(body)
  assert.deepEqual(parsed.favoriteSessionOrder, [QUICK_SESSION_ID, 'np018-other-session'])
})

// ═══════════════════════════════════════════════════════════════════════════
// POST /api/workouts/resolve-incomplete
// ═══════════════════════════════════════════════════════════════════════════

test('POST /api/workouts/resolve-incomplete counts a stale log and advances the day', async () => {
  const requestBody = {
    programId: PROGRAM_ID,
    day: DAY_TWO,
    phase: 1, // 1-BASED — rule 3
    action: 'count' as const,
    tz: TZ,
  }
  assert.ok(ResolveIncompleteRequestSchema.safeParse(requestBody).success)

  const { status, body } = await call(
    resolveIncompletePOST,
    'POST',
    '/api/workouts/resolve-incomplete',
    MEMBER,
    { body: requestBody },
  )
  coverage.mark('POST', '/api/workouts/resolve-incomplete')
  record('POST /api/workouts/resolve-incomplete (count)', body)
  assert.equal(status, 200, JSON.stringify(body))
  assertContract({
    label: 'POST /api/workouts/resolve-incomplete (count)',
    schema: ResolveIncompleteResponseSchema,
    body,
    expectKeys: ['action', 'nextDay', 'nextPhase'],
  })
  const parsed = ResolveIncompleteResponseSchema.parse(body)
  assert.equal(parsed.action, 'count')
  assert.equal(typeof parsed.nextDay, 'string')

  // `continue` and `restart` resolve the log WITHOUT moving the program on, so
  // they answer both fields as null — the other half of the shape.
  const continued = await call(
    resolveIncompletePOST,
    'POST',
    '/api/workouts/resolve-incomplete',
    MEMBER,
    { body: { ...requestBody, action: 'continue' } },
  )
  record('POST /api/workouts/resolve-incomplete (continue)', continued.body)
  assert.equal(continued.status, 200, JSON.stringify(continued.body))
  assertContract({
    label: 'POST /api/workouts/resolve-incomplete (continue)',
    schema: ResolveIncompleteResponseSchema,
    body: continued.body,
    expectKeys: ['action', 'nextDay', 'nextPhase'],
  })
  const parsedContinue = ResolveIncompleteResponseSchema.parse(continued.body)
  assert.equal(parsedContinue.nextDay, null)
  assert.equal(parsedContinue.nextPhase, null)
})

// ═══════════════════════════════════════════════════════════════════════════
// GET /api/workouts/exercise-suggestions
// ═══════════════════════════════════════════════════════════════════════════

test('GET /api/workouts/exercise-suggestions answers exercise-scoped nudges', async () => {
  const { status, body } = await call(
    exerciseSuggestionsGET,
    'GET',
    '/api/workouts/exercise-suggestions',
    MEMBER,
    { query: { slugs: `${BENCH_SLUG},${TREADMILL_SLUG}` } },
  )
  coverage.mark('GET', '/api/workouts/exercise-suggestions')
  record('GET /api/workouts/exercise-suggestions', body)
  assert.equal(status, 200, JSON.stringify(body))
  assertContract({
    label: 'GET /api/workouts/exercise-suggestions',
    schema: ExerciseSuggestionsResponseSchema,
    body,
    expectKeys: ['suggestions'],
  })
  const parsed = ExerciseSuggestionsResponseSchema.parse(body)
  assert.ok(Array.isArray(parsed.suggestions))
  // Every suggestion this route answers with is scoped to a requested exercise
  // — that is the whole reason it is not the dashboard engine.
  for (const suggestion of parsed.suggestions) {
    assert.equal(suggestion.placement, 'exercise')
  }
})

// ═══════════════════════════════════════════════════════════════════════════
// The gates. Keep these last.
// ═══════════════════════════════════════════════════════════════════════════

test('both halves of the POST /api/workouts union were actually sent', () => {
  // One manifest entry for POST /api/workouts would otherwise pass for coverage
  // of a single branch — and the quick variant is the half that had no schema
  // at all before NP-018.
  assert.deepEqual([...savesSent].sort(), ['program', 'quick'])
})

test('every route NP-018 covers was actually called with its schema', () => {
  assertEveryRouteCovered(NP018_ROUTES, coverage)
  assert.equal(NP018_ROUTES.length, 15)
  assert.equal(coverage.list().length, 15)
})

test('webapp/lib/sharedApiTypes.ts does not hold a second copy of the workouts contract', () => {
  // THE DISAGREEMENT THIS CATCHES.
  //
  // `webapp/lib/sharedApiTypes.ts` used to carry a hand-written `WorkoutLog`
  // keyed by `logs` / `day` / `phase` while `shared/api-client` described the
  // same wire with `phaseIndex` / `workoutIndex`. Two contracts for one
  // response, neither of them tested against the route, and the native app read
  // the one the web did not. NP-016 retired the workouts half of that copy and
  // `shared/api-client` owns the domain outright — so the agreement is that the
  // copy carries NOTHING of it, and this is where that is enforced from the
  // workouts side.
  //
  // `tests/unit/contract/sharedApiTypes.test.ts` compares what IS left in that
  // file (the auth/account shapes) with `shared/api-client` key for key. This
  // test is the other half: it fails the moment a workouts shape is copied back
  // in, even an identical one, because a second copy of a contract reads like
  // the truth and drifts in silence.
  const source = fs.readFileSync(
    path.join(__dirname, '..', '..', '..', 'lib', 'sharedApiTypes.ts'),
    'utf8',
  )
  const OWNED_BY_SHARED = [
    'WorkoutLog',
    'WorkoutSave',
    'WorkoutResume',
    'WorkoutHistory',
    'WorkoutDraftExercise',
    'StoredWorkout',
    'QuickSession',
    'PlannedQuickSession',
    'LastPerformance',
    'ExerciseHistoryEntry',
    'ExercisePRSummary',
    'StaleIncompleteWorkout',
    'ProgramWorkoutLog',
    'FavoriteOrder',
    'ResolveIncomplete',
    'ExerciseSuggestion',
    'phaseIndex',
    'workoutIndex',
  ]
  for (const name of OWNED_BY_SHARED) {
    assert.equal(
      source.includes(name),
      false,
      `webapp/lib/sharedApiTypes.ts mentions '${name}'. The /api/workouts contract lives in `
        + 'shared/api-client/src/schemas/workouts.ts and nowhere else — a hand copy here is a '
        + 'second contract no test can hold to the route. Put the shape on the native side of '
        + 'the wire, where @become/api-client is a real dependency.',
    )
  }

  // And the runtime export list stays exactly the four shapes
  // sharedApiTypes.test.ts compares, so a workouts schema cannot be smuggled in
  // under a name this list does not spell out either.
  assert.deepEqual(Object.keys(sharedApiTypes).sort(), [
    'MeResponseSchema',
    'UserProfileSchema',
    'UserSchema',
    'UserSubscriptionSchema',
  ])
})
