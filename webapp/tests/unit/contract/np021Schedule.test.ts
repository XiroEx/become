// Run with: npm run test:file tests/unit/contract/np021Schedule.test.ts
//
// THE SCHEDULE SURFACE, CHECKED AGAINST THE SHARED SCHEMAS (NP-021).
//
// Read tests/unit/contract/_contract.ts first — it explains why the schemas are
// imported by RELATIVE path, why "it parses" is not the whole check, and what a
// domain file has to end with.
//
// WHAT THIS FILE IS FOR
//
// shared/api-client's schedule schemas described an API that does not exist: a
// `{ schedule: [ { phaseIndex, workoutIndex } ] }` envelope no handler has ever
// answered with, beside a second pair of schemas for the real
// `{ schedules: [ … ] }` whose `settings` was `z.unknown()`. The native
// mutations hook sent `Record<string, unknown>` at PATCH /api/schedule and
// parsed the answer with `z.object({}).passthrough()`, so every action was
// untyped in both directions.
//
// So every route below is called for real — the exported handler, a signed
// token, the loopback test database — and parsed with the schema the native app
// reads it through. All EIGHT PATCH actions are exercised, because one manifest
// entry for `PATCH /api/schedule` would otherwise pass for coverage of a single
// action.
//
// ITS OWN FIXTURES, ON PURPOSE. The runner executes test FILES in parallel, so
// this file uses its own member (`@np021.contract.test`), its own program id and
// its own UserProgress/Schedule rows rather than the shared np015 ones.
//
// DATES. Every slot date is a DAY MARKER at 00:00Z, and the handlers anchor
// "today" to UTC midnight when no `tz` is sent (which is what these calls do).
// The fixture schedule therefore runs on CONSECUTIVE days from seven days ago,
// so `dayKey(n)` names exactly one slot and past/today/future are all populated.

import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import mongoose from 'mongoose'

// The routes. Real exported handlers.
import {
  GET as scheduleGET,
  POST as schedulePOST,
  PATCH as schedulePATCH,
} from '../../../app/api/schedule/route'
import { PUT as scheduleSettingsPUT } from '../../../app/api/schedule/settings/route'

// The contract. RELATIVE imports of shared/api-client — see _contract.ts.
import {
  SCHEDULE_PATCH_ACTIONS,
  ScheduleApiResponseSchema,
  ScheduleCreateRequestSchema,
  ScheduleCreateResponseSchema,
  SchedulePatchRequestSchema,
  ScheduleProgramActionResponseSchema,
  ScheduleSettingsUpdateRequestSchema,
  ScheduleSettingsUpdateResponseSchema,
  ScheduleSlotActionResponseSchema,
  slotDateKey,
  type SchedulePatchAction,
  type SchedulePatchRequest,
  type ScheduleCreateRequest,
  type ScheduleSettingsUpdateRequest,
} from '../../../../shared/api-client/src/schemas/schedule'

// The assertion + coverage gate.
import {
  Coverage,
  assertContract,
  assertEveryRouteCovered,
  getJson,
  sendJson,
  type ContractMember,
  type ContractRoute,
} from './_contract'

import User from '../../../models/User'
import UserProgress from '../../../models/UserProgress'
import ProgramModel from '../../../models/Program'
import Schedule from '../../../models/Schedule'
import { signToken } from '../../../lib/auth'

// ---------------------------------------------------------------------------
// The manifest: every route NP-021's schemas describe.
// ---------------------------------------------------------------------------

const NP021_ROUTES: readonly ContractRoute[] = [
  { method: 'GET', path: '/api/schedule', schema: 'ScheduleApiResponseSchema', note: '{ schedules: [...] } — PLURAL and nested' },
  { method: 'POST', path: '/api/schedule', schema: 'ScheduleCreateResponseSchema', note: 'upserts: posting again REPLACES the schedule' },
  { method: 'PATCH', path: '/api/schedule', schema: 'ScheduleSlotActionResponseSchema + ScheduleProgramActionResponseSchema', note: 'all eight actions; two answer shapes' },
  { method: 'PUT', path: '/api/schedule/settings', schema: 'ScheduleSettingsUpdateResponseSchema', note: 'PUT, not PATCH' },
]

// Deliberately NOT here: nothing else lives under /api/schedule.

const coverage = new Coverage()

/** Which PATCH actions were actually sent. The manifest cannot see these. */
const actionsExercised = new Set<SchedulePatchAction>()

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const MEMBER: ContractMember = {
  id: '6ab0210000000000000f7ee0',
  email: 'plus@np021.contract.test',
  label: 'plus',
  auth: '',
}

const PROGRAM_ID = 'np021-contract-schedule'
const PROGRAM_NAME = 'NP021 Contract Schedule'

const DAY_MS = 86_400_000

/** UTC midnight today — the same anchor the handlers use with no `tz`. */
function utcToday(): Date {
  const d = new Date()
  d.setUTCHours(0, 0, 0, 0)
  return d
}

/** The YYYY-MM-DD day marker `n` days from today. Negative is the past. */
function dayKey(n: number): string {
  return new Date(utcToday().getTime() + n * DAY_MS).toISOString().slice(0, 10)
}

/** Seven workouts a week, so slots land on CONSECUTIVE days. */
const EVERY_DAY = [0, 1, 2, 3, 4, 5, 6]

/**
 * Two phases of two weeks each, seven sessions a week: 28 slots, one per day
 * from `startDate`. Two phases so `phase` is seen at both 1 and 2 — it is
 * 1-BASED on the wire (NP-019 rule 1) and the native flattener turns it into a
 * 0-based index.
 */
const PHASES = [1, 2].map((phase) => ({
  phase: `Phase ${phase}`,
  weeks: '1-2',
  focus: phase === 1 ? 'Accumulation' : 'Intensification',
  workouts: [1, 2, 3, 4, 5, 6, 7].map((day) => ({
    day: `Day ${day}`,
    title: `P${phase} Session ${day}`,
    exercises: [],
  })),
}))

/** The schedule starts a week ago, so there are past AND future slots. */
const START_OFFSET = -7

async function cleanFixtures(): Promise<void> {
  const objectId = new mongoose.Types.ObjectId(MEMBER.id)
  await User.deleteMany({ $or: [{ _id: objectId }, { email: MEMBER.email }] })
  await UserProgress.deleteMany({ userId: MEMBER.id })
  await Schedule.deleteMany({ userId: objectId })
  await ProgramModel.deleteMany({ program_id: PROGRAM_ID })
}

before(async () => {
  process.env.JWT_SECRET ||= 'become-unit-test-secret'
  process.env.ENTITLEMENTS_ENFORCED = '1'

  await mongoose.connect(process.env.MONGODB_URI ?? 'mongodb://127.0.0.1:27017/become-test')
  await cleanFixtures()

  await User.create({
    _id: new mongoose.Types.ObjectId(MEMBER.id),
    email: MEMBER.email,
    // Legacy column, `required` on the model; magic-link members never use it.
    password: 'contract-test-unused',
    name: 'Contract Schedule',
    tier: 'plus',
    onboardingCompleted: true,
  })
  MEMBER.auth = `Bearer ${await signToken({ userId: MEMBER.id, email: MEMBER.email })}`

  await ProgramModel.create({
    program_id: PROGRAM_ID,
    name: PROGRAM_NAME,
    description: 'A fixture program with 28 sessions.',
    duration_weeks: 4,
    training_days_per_week: 7,
    goal: 'Build strength',
    target_user: 'Intermediate',
    phases: PHASES,
  })

  // POST /api/schedule refuses a program the member is not enrolled in, so the
  // enrolment row comes first.
  await UserProgress.create({
    userId: new mongoose.Types.ObjectId(MEMBER.id),
    activePrograms: [
      {
        programId: PROGRAM_ID,
        programName: PROGRAM_NAME,
        startDate: new Date(`${dayKey(START_OFFSET)}T00:00:00.000Z`),
        currentPhase: 1,
        currentDay: 'Day 1',
        completedWorkouts: 1,
        totalWorkouts: 28,
        status: 'in-progress',
        hasSchedule: false,
      },
    ],
  })
})

after(async () => {
  await cleanFixtures()
  await mongoose.disconnect()
})

// ---------------------------------------------------------------------------
// Reading the stored schedule, so a test can name a real slot rather than
// guessing at one.
// ---------------------------------------------------------------------------

interface StoredSlot {
  key: string
  status: string
  dayLabel: string
  phase: number
}

async function storedSlots(): Promise<StoredSlot[]> {
  const doc = await Schedule.findOne({ userId: MEMBER.id, programId: PROGRAM_ID }).lean()
  return (doc?.scheduledWorkouts ?? []).map((w) => ({
    key: new Date(w.date).toISOString().slice(0, 10),
    status: w.status,
    dayLabel: w.dayLabel,
    phase: w.phase,
  }))
}

async function statusOn(key: string): Promise<string | undefined> {
  return (await storedSlots()).find((s) => s.key === key)?.status
}

// ═══════════════════════════════════════════════════════════════════════════
// POST /api/schedule — build the schedule everything below acts on
// ═══════════════════════════════════════════════════════════════════════════

test('POST /api/schedule matches ScheduleCreateResponseSchema', async () => {
  // Typed at the call site from the shared request schema: this body is a
  // ScheduleCreateRequest, not an object literal that hopes to be one.
  const body: ScheduleCreateRequest = {
    programId: PROGRAM_ID,
    trainingDays: EVERY_DAY,
    startDate: dayKey(START_OFFSET),
  }
  assert.equal(ScheduleCreateRequestSchema.safeParse(body).success, true)

  const { status, body: answer } = await sendJson(
    schedulePOST,
    'POST',
    '/api/schedule',
    MEMBER,
    body,
  )
  coverage.mark('POST', '/api/schedule')

  assert.equal(status, 200, JSON.stringify(answer))
  assertContract({
    label: 'POST /api/schedule',
    schema: ScheduleCreateResponseSchema,
    body: answer,
    expectKeys: [
      'message',
      'schedule._id',
      'schedule.programId',
      'schedule.programName',
      'schedule.settings',
      'schedule.settings.trainingDays',
      'schedule.settings.startDate',
      'schedule.totalScheduledWorkouts',
      'schedule.firstWorkout',
      'schedule.lastWorkout',
    ],
  })

  const parsed = ScheduleCreateResponseSchema.parse(answer)
  assert.equal(parsed.schedule.totalScheduledWorkouts, 28)
  assert.deepEqual(parsed.schedule.settings?.trainingDays, EVERY_DAY)
  // Day markers, read as days. 28 sessions on consecutive days.
  assert.equal(slotDateKey(parsed.schedule.firstWorkout!), dayKey(START_OFFSET))
  assert.equal(slotDateKey(parsed.schedule.lastWorkout!), dayKey(START_OFFSET + 27))

  // One completed slot with a note, so the GET below carries `completedAt` and
  // `notes` — two fields nothing would otherwise exercise.
  await Schedule.updateOne(
    { userId: MEMBER.id, programId: PROGRAM_ID },
    {
      $set: {
        'scheduledWorkouts.0.status': 'completed',
        'scheduledWorkouts.0.completedAt': new Date(`${dayKey(START_OFFSET)}T18:42:11.004Z`),
        'scheduledWorkouts.0.notes': 'Felt strong.',
        'scheduledWorkouts.1.status': 'completed',
        'scheduledWorkouts.1.completedAt': new Date(`${dayKey(START_OFFSET + 1)}T18:00:00.000Z`),
      },
    },
  )
})

// ═══════════════════════════════════════════════════════════════════════════
// GET /api/schedule — the response the whole native calendar is built on
// ═══════════════════════════════════════════════════════════════════════════

test('GET /api/schedule matches ScheduleApiResponseSchema with `settings` TYPED', async () => {
  const { status, body } = await getJson(scheduleGET, '/api/schedule', MEMBER)
  coverage.mark('GET', '/api/schedule')

  assert.equal(status, 200, JSON.stringify(body))
  assertContract({
    label: 'GET /api/schedule',
    schema: ScheduleApiResponseSchema,
    body,
    expectKeys: [
      'schedules',
      'schedules.0._id',
      'schedules.0.programId',
      'schedules.0.programName',
      'schedules.0.programStatus',
      // The reason this ticket exists: `settings` was `z.unknown()`, so the
      // native settings screen cast it to read the training days back.
      'schedules.0.settings',
      'schedules.0.settings.trainingDays',
      'schedules.0.settings.startDate',
      'schedules.0.scheduledWorkouts',
      'schedules.0.scheduledWorkouts.0.date',
      'schedules.0.scheduledWorkouts.0.programId',
      'schedules.0.scheduledWorkouts.0.phase',
      'schedules.0.scheduledWorkouts.0.dayLabel',
      'schedules.0.scheduledWorkouts.0.workoutTitle',
      'schedules.0.scheduledWorkouts.0.status',
      'schedules.0.scheduledWorkouts.0.completedAt',
      'schedules.0.scheduledWorkouts.0.notes',
    ],
  })

  const parsed = ScheduleApiResponseSchema.parse(body)
  // Rule 2: PLURAL and nested. There is no flat top-level slot array, which is
  // exactly what the deleted ScheduleResponseSchema claimed.
  assert.equal(parsed.schedules.length, 1)
  const doc = parsed.schedules[0]
  assert.ok(doc)
  assert.equal(doc.programId, PROGRAM_ID)
  assert.equal(doc.programStatus, 'in-progress')

  // `settings`, read off the parsed object with no cast.
  assert.deepEqual(doc.settings?.trainingDays, EVERY_DAY)
  assert.equal(slotDateKey(doc.settings!.startDate!), dayKey(START_OFFSET))

  // Rule 1: the marker is read as a day. 28 slots on consecutive days.
  assert.equal(doc.scheduledWorkouts.length, 28)
  assert.deepEqual(
    doc.scheduledWorkouts.map((w) => slotDateKey(w.date)),
    Array.from({ length: 28 }, (_, i) => dayKey(START_OFFSET + i)),
  )

  // Rule 3: sessions are named by `phase` (1-based) and `dayLabel`.
  assert.equal(doc.scheduledWorkouts[0]?.phase, 1)
  assert.equal(doc.scheduledWorkouts[0]?.dayLabel, 'Day 1')
  assert.equal(doc.scheduledWorkouts[0]?.workoutTitle, 'P1 Session 1')
  assert.equal(doc.scheduledWorkouts[14]?.phase, 2, 'the second phase is phase 2, not 1')

  // The statuses the GET DERIVES rather than reads: the two seeded completions
  // stand, every other past slot is answered `missed`, today and later are
  // `scheduled`. A parse alone cannot see a renamed status; this can.
  const byKey = new Map(doc.scheduledWorkouts.map((w) => [slotDateKey(w.date), w.status]))
  assert.equal(byKey.get(dayKey(START_OFFSET)), 'completed')
  assert.equal(byKey.get(dayKey(START_OFFSET + 1)), 'completed')
  assert.equal(byKey.get(dayKey(-1)), 'missed', 'a past scheduled slot is answered missed')
  assert.equal(byKey.get(dayKey(0)), 'scheduled', 'today is not missed yet')
  assert.equal(byKey.get(dayKey(5)), 'scheduled')

  // `completedAt` is the other date species: an INSTANT, not a day marker.
  assert.equal(doc.scheduledWorkouts[0]?.completedAt, `${dayKey(START_OFFSET)}T18:42:11.004Z`)
  assert.equal(doc.scheduledWorkouts[0]?.notes, 'Felt strong.')

  // The stored document is NOT rewritten by the derivation above: a past
  // `scheduled` slot is still `scheduled` in Mongo.
  assert.equal(await statusOn(dayKey(-1)), 'scheduled')
})

test('GET /api/schedule?from&to filters the slots but keeps the shape', async () => {
  const { status, body } = await getJson(scheduleGET, '/api/schedule', MEMBER, {
    programId: PROGRAM_ID,
    from: dayKey(1),
    to: dayKey(4),
    view: 'month',
    // Minutes WEST of UTC — a NUMBER. The client never sends an IANA zone here.
    tz: '0',
  })

  assert.equal(status, 200, JSON.stringify(body))
  assertContract({
    label: 'GET /api/schedule?from&to',
    schema: ScheduleApiResponseSchema,
    body,
    expectKeys: ['schedules', 'schedules.0.scheduledWorkouts.0.date'],
  })
  const parsed = ScheduleApiResponseSchema.parse(body)
  // `from` is inclusive, `to` exclusive — three days, not four.
  assert.deepEqual(
    parsed.schedules[0]?.scheduledWorkouts.map((w) => slotDateKey(w.date)),
    [dayKey(1), dayKey(2), dayKey(3)],
  )
})

// ═══════════════════════════════════════════════════════════════════════════
// PATCH /api/schedule — the eight actions, each with its own typed request
// ═══════════════════════════════════════════════════════════════════════════

/** Send one action's body, typed by the discriminated union, and record it. */
async function patch(body: SchedulePatchRequest) {
  // The union is the point: this fails to compile if an action is sent without
  // the fields the route requires for it.
  assert.equal(
    SchedulePatchRequestSchema.safeParse(body).success,
    true,
    `${body.action} does not satisfy its own request schema`,
  )
  const result = await sendJson(schedulePATCH, 'PATCH', '/api/schedule', MEMBER, body)
  coverage.mark('PATCH', '/api/schedule')
  actionsExercised.add(body.action)
  return result
}

const SLOT_ACTION_KEYS = [
  'message',
  'schedule.programId',
  'schedule.scheduledWorkouts.0.date',
  'schedule.scheduledWorkouts.0.programId',
  'schedule.scheduledWorkouts.0.phase',
  'schedule.scheduledWorkouts.0.dayLabel',
  'schedule.scheduledWorkouts.0.workoutTitle',
  'schedule.scheduledWorkouts.0.status',
]

test('PATCH skip then unskip match ScheduleSlotActionResponseSchema and move the slot’s status', async () => {
  const target = dayKey(18)

  const skipped = await patch({ programId: PROGRAM_ID, action: 'skip', workoutDate: target })
  assert.equal(skipped.status, 200, JSON.stringify(skipped.body))
  assertContract({
    label: 'PATCH /api/schedule (skip)',
    schema: ScheduleSlotActionResponseSchema,
    body: skipped.body,
    expectKeys: SLOT_ACTION_KEYS,
  })
  assert.equal(await statusOn(target), 'skipped')

  const unskipped = await patch({ programId: PROGRAM_ID, action: 'unskip', workoutDate: target })
  assert.equal(unskipped.status, 200, JSON.stringify(unskipped.body))
  assertContract({
    label: 'PATCH /api/schedule (unskip)',
    schema: ScheduleSlotActionResponseSchema,
    body: unskipped.body,
    expectKeys: SLOT_ACTION_KEYS,
  })
  assert.equal(await statusOn(target), 'scheduled')
})

test('PATCH uncomplete matches ScheduleSlotActionResponseSchema and gives the session back', async () => {
  const target = dayKey(START_OFFSET)
  assert.equal(await statusOn(target), 'completed', 'the POST test seeds this completion')

  const { status, body } = await patch({
    programId: PROGRAM_ID,
    action: 'uncomplete',
    workoutDate: target,
  })
  assert.equal(status, 200, JSON.stringify(body))
  assertContract({
    label: 'PATCH /api/schedule (uncomplete)',
    schema: ScheduleSlotActionResponseSchema,
    body,
    expectKeys: SLOT_ACTION_KEYS,
  })
  // Back to `scheduled` in the document; the GET derives `missed` from the date.
  assert.equal(await statusOn(target), 'scheduled')
})

test('PATCH reschedule matches ScheduleSlotActionResponseSchema and moves the day marker', async () => {
  const from = dayKey(19)
  const to = dayKey(25)
  assert.equal(await statusOn(to), undefined, 'the target day starts empty')

  const { status, body } = await patch({
    programId: PROGRAM_ID,
    action: 'reschedule',
    workoutDate: from,
    newDate: to,
  })
  assert.equal(status, 200, JSON.stringify(body))
  assertContract({
    label: 'PATCH /api/schedule (reschedule)',
    schema: ScheduleSlotActionResponseSchema,
    body,
    expectKeys: SLOT_ACTION_KEYS,
  })

  assert.equal(await statusOn(from), undefined, 'the old day is empty now')
  assert.equal(await statusOn(to), 'scheduled')

  // And the answer is re-sorted by date, which is what the calendar renders.
  const parsed = ScheduleSlotActionResponseSchema.parse(body)
  const keys = parsed.schedule.scheduledWorkouts.map((w) => slotDateKey(w.date))
  assert.deepEqual([...keys].sort(), keys, 'slots come back in date order')
})

test('PATCH swap matches ScheduleSlotActionResponseSchema and exchanges two days', async () => {
  const a = dayKey(16)
  const b = dayKey(17)
  const before = await storedSlots()
  const labelA = before.find((s) => s.key === a)?.dayLabel
  const labelB = before.find((s) => s.key === b)?.dayLabel
  assert.ok(labelA && labelB && labelA !== labelB)

  const { status, body } = await patch({
    programId: PROGRAM_ID,
    action: 'swap',
    workoutDate: a,
    swapWithDate: b,
  })
  assert.equal(status, 200, JSON.stringify(body))
  assertContract({
    // The server has always accepted `swap`; no web screen sends it, which is
    // exactly why nothing was holding it to a shape.
    label: 'PATCH /api/schedule (swap)',
    schema: ScheduleSlotActionResponseSchema,
    body,
    expectKeys: SLOT_ACTION_KEYS,
  })

  const after = await storedSlots()
  assert.equal(after.find((s) => s.key === a)?.dayLabel, labelB)
  assert.equal(after.find((s) => s.key === b)?.dayLabel, labelA)
})

// ═══════════════════════════════════════════════════════════════════════════
// PUT /api/schedule/settings — before the program-level actions, which re-lay
// the calendar this reads
// ═══════════════════════════════════════════════════════════════════════════

test('PUT /api/schedule/settings matches ScheduleSettingsUpdateResponseSchema', async () => {
  const body: ScheduleSettingsUpdateRequest = {
    programId: PROGRAM_ID,
    // Mon/Wed/Fri. No startDate: the route then re-lays from the caller's local
    // today, which is why it reads `tz`.
    trainingDays: [1, 3, 5],
  }
  assert.equal(ScheduleSettingsUpdateRequestSchema.safeParse(body).success, true)

  const { status, body: answer } = await sendJson(
    scheduleSettingsPUT,
    'PUT',
    '/api/schedule/settings',
    MEMBER,
    body,
  )
  coverage.mark('PUT', '/api/schedule/settings')

  assert.equal(status, 200, JSON.stringify(answer))
  assertContract({
    label: 'PUT /api/schedule/settings',
    schema: ScheduleSettingsUpdateResponseSchema,
    body: answer,
    expectKeys: [
      'message',
      'schedule.programId',
      'schedule.settings',
      'schedule.settings.trainingDays',
      'schedule.settings.startDate',
      'schedule.totalScheduledWorkouts',
      'schedule.pastWorkouts',
      'schedule.futureWorkouts',
    ],
  })

  const parsed = ScheduleSettingsUpdateResponseSchema.parse(answer)
  assert.deepEqual(parsed.schedule.settings?.trainingDays, [1, 3, 5])
  assert.equal(
    parsed.schedule.pastWorkouts + parsed.schedule.futureWorkouts,
    parsed.schedule.totalScheduledWorkouts,
    'the counters are a partition of the schedule',
  )
  // The one remaining completion is a past slot, so it is PRESERVED where it is.
  assert.ok(parsed.schedule.pastWorkouts >= 1)
  // And the future is re-laid on Mon/Wed/Fri only.
  const futureDays = (await storedSlots())
    .filter((s) => s.key >= dayKey(0))
    .map((s) => new Date(`${s.key}T00:00:00.000Z`).getUTCDay())
  assert.ok(futureDays.length > 0)
  assert.deepEqual(
    [...new Set(futureDays)].sort(),
    [...new Set(futureDays)].sort().filter((d) => [1, 3, 5].includes(d)),
  )
})

// ═══════════════════════════════════════════════════════════════════════════
// The three PROGRAM-level actions — last, because each one re-lays the calendar
// ═══════════════════════════════════════════════════════════════════════════

const PROGRAM_ACTION_KEYS = ['message', 'programId']

test('PATCH shift matches ScheduleProgramActionResponseSchema and reports the new next day', async () => {
  const beforeNext = (await storedSlots()).find((s) => s.key >= dayKey(0))
  assert.ok(beforeNext, 'there must be a future slot to shift')

  const { status, body } = await patch({ programId: PROGRAM_ID, action: 'shift', days: 2 })
  assert.equal(status, 200, JSON.stringify(body))
  assertContract({
    label: 'PATCH /api/schedule (shift)',
    schema: ScheduleProgramActionResponseSchema,
    body,
    expectKeys: [...PROGRAM_ACTION_KEYS, 'totalScheduledWorkouts', 'futureWorkouts', 'nextWorkout'],
  })
  const parsed = ScheduleProgramActionResponseSchema.parse(body)
  assert.ok(parsed.totalScheduledWorkouts && parsed.totalScheduledWorkouts > 0)
  assert.ok(parsed.nextWorkout, 'shift is the one action that reports nextWorkout')
  // The next session is on or after the day the earliest future slot moved to.
  assert.ok(
    slotDateKey(parsed.nextWorkout) >= dayKey(2),
    `${slotDateKey(parsed.nextWorkout)} should be on or after ${dayKey(2)}`,
  )
})

test('PATCH pause matches ScheduleProgramActionResponseSchema — { message, programId } alone', async () => {
  const { status, body } = await patch({ programId: PROGRAM_ID, action: 'pause' })
  assert.equal(status, 200, JSON.stringify(body))
  assertContract({
    label: 'PATCH /api/schedule (pause)',
    schema: ScheduleProgramActionResponseSchema,
    body,
    expectKeys: PROGRAM_ACTION_KEYS,
  })
  // No counters on this one: it does not touch the schedule at all.
  const parsed = ScheduleProgramActionResponseSchema.parse(body)
  assert.equal(parsed.totalScheduledWorkouts, undefined)
  assert.equal(parsed.futureWorkouts, undefined)

  // And the GET now reports the enrolment's status, which the schema knows.
  const read = await getJson(scheduleGET, '/api/schedule', MEMBER)
  assert.equal(ScheduleApiResponseSchema.parse(read.body).schedules[0]?.programStatus, 'paused')
})

test('PATCH resume matches ScheduleProgramActionResponseSchema and regenerates from resumeDate', async () => {
  const { status, body } = await patch({
    programId: PROGRAM_ID,
    action: 'resume',
    resumeDate: dayKey(3),
  })
  assert.equal(status, 200, JSON.stringify(body))
  assertContract({
    label: 'PATCH /api/schedule (resume)',
    schema: ScheduleProgramActionResponseSchema,
    body,
    expectKeys: [...PROGRAM_ACTION_KEYS, 'totalScheduledWorkouts', 'futureWorkouts'],
  })
  const parsed = ScheduleProgramActionResponseSchema.parse(body)
  assert.ok(parsed.futureWorkouts && parsed.futureWorkouts > 0)
  // `resume` regenerates but does NOT report nextWorkout — only `shift` does.
  assert.equal(parsed.nextWorkout, undefined)

  const resumed = await getJson(scheduleGET, '/api/schedule', MEMBER)
  assert.equal(
    ScheduleApiResponseSchema.parse(resumed.body).schedules[0]?.programStatus,
    'in-progress',
  )
})

// ═══════════════════════════════════════════════════════════════════════════
// The coverage gate. Keep this last.
// ═══════════════════════════════════════════════════════════════════════════

test('every route NP-021 covers was actually called with its schema', () => {
  assertEveryRouteCovered(NP021_ROUTES, coverage)
  // The manifest is not allowed to shrink quietly: four routes, the list above.
  assert.equal(NP021_ROUTES.length, 4)
  assert.equal(coverage.list().length, 4)
})

test('every PATCH action has a typed request that was actually sent', () => {
  // One manifest entry covers PATCH /api/schedule, so without this a single
  // action would pass for coverage of all eight.
  assert.deepEqual(
    [...SCHEDULE_PATCH_ACTIONS].filter((action) => !actionsExercised.has(action)),
    [],
    'these PATCH actions have a request schema that no test sends',
  )
})
