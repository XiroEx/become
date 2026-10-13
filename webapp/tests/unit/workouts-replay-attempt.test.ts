// Run with: npm run test:file tests/unit/workouts-replay-attempt.test.ts
//
// ─── A program save has to be safe to send twice ─────────────────────────────
//
// POST /api/workouts recognised a repeated program save only while its log was
// still OPEN (the rolling IN_PROGRESS_WINDOW_MS) or dated TODAY in the
// member's local day. A completing save replayed after local midnight — from
// an offline queue, or a slow retry — matched neither: the log it wrote is
// completed (so the open-log window skips it) and "today" has moved on (so the
// local-day window skips it too). The route inserted a SECOND completed log
// and ran the completion side effects again: the program's completed count and
// day advanced twice, and another schedule slot with the same day label was
// marked completed.
//
// The fix gives each attempt a client-generated id (`attemptId`, the
// program-workout analogue of a quick session's `sessionId`), stores it on the
// log, and matches on it BEFORE any window rule. Saves that carry no id are
// left on exactly the old rules — the last test here is the control that says
// so, by reproducing the duplicate with the id removed.
//
// The route is driven for real: the model statics are replaced with in-memory
// fakes over a tiny subset of the query language the route actually uses, and
// `global.mongoose` is pre-seeded so `dbConnect()` never opens a socket (the
// pattern in workouts-slot-credit.test.ts).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { NextRequest } from 'next/server'
import Schedule from '../../models/Schedule'
import UserProgress from '../../models/UserProgress'
import ProgramModel from '../../models/Program'
import { signToken } from '../../lib/auth'
import { dateKey, localDateKey, localDayWindowForKey, utcMidnightDateKey } from '../../lib/dayWindow'

/** Minutes WEST of UTC — what a browser reports for US Eastern in summer. */
const TZ_EASTERN = 240
const DAY_MS = 24 * 60 * 60 * 1000
const PROGRAM_ID = 'prog-replay'
const DAY = 'Day 1'
const USER_ID = 'replay-user'

interface Log {
  programId?: string
  day?: string
  phase?: number
  date: Date
  completed: boolean
  attemptId?: string
  exercises?: unknown[]
  [k: string]: unknown
}

interface Slot { date: Date; dayLabel: string; status: string; completedAt?: Date }
interface UpdateCall { filter: Record<string, unknown>; update: Record<string, unknown>; options?: { arrayFilters?: Array<Record<string, unknown>> } }

/** A thenable that also answers the query-builder calls the route chains onto it. */
function chain(value: unknown): Promise<unknown> {
  const p = Promise.resolve(value) as Promise<unknown> & Record<string, unknown>
  for (const method of ['lean', 'select', 'sort', 'limit']) p[method] = () => chain(value)
  p.exec = () => chain(value)
  return p
}

const WRITE_RESULT = { acknowledged: true, matchedCount: 1, modifiedCount: 1, upsertedCount: 0 }

// ── The sliver of Mongo's query language this route speaks ───────────────────

function matchValue(actual: unknown, expected: unknown): boolean {
  if (expected instanceof Date) {
    return actual instanceof Date && actual.getTime() === expected.getTime()
  }
  if (expected !== null && typeof expected === 'object') {
    for (const [op, raw] of Object.entries(expected as Record<string, unknown>)) {
      if (op === '$in') {
        if (!(raw as unknown[]).includes(actual)) return false
        continue
      }
      const a = actual instanceof Date ? actual.getTime() : Number(actual)
      const b = raw instanceof Date ? raw.getTime() : Number(raw)
      if (op === '$gte' && !(a >= b)) return false
      else if (op === '$lte' && !(a <= b)) return false
      else if (op === '$lt' && !(a < b)) return false
      else if (!['$gte', '$lte', '$lt', '$in'].includes(op)) {
        throw new Error(`fake UserProgress: unsupported operator ${op}`)
      }
    }
    return true
  }
  if (typeof expected === 'boolean') return (actual === true) === expected
  return actual === expected
}

/** Does one workoutLogs entry satisfy an $elemMatch / arrayFilter condition? */
function logMatches(log: Log, cond: Record<string, unknown>): boolean {
  return Object.entries(cond).every(([key, expected]) =>
    matchValue(log[key.replace(/^elem\./, '')], expected),
  )
}

/** Does the document-level filter match, given the logs this user has? */
function docMatches(filter: Record<string, unknown>, logs: Log[]): boolean {
  for (const [key, value] of Object.entries(filter)) {
    if (key === '$and') {
      if (!(value as Record<string, unknown>[]).every((f) => docMatches(f, logs))) return false
      continue
    }
    if (key !== 'workoutLogs') continue // userId / activePrograms.* — always this user
    const clause = value as Record<string, unknown>
    if (clause.$elemMatch) {
      if (!logs.some((l) => logMatches(l, clause.$elemMatch as Record<string, unknown>))) return false
      continue
    }
    if (clause.$not) {
      const inner = (clause.$not as Record<string, unknown>).$elemMatch as Record<string, unknown>
      if (logs.some((l) => logMatches(l, inner))) return false
      continue
    }
    throw new Error('fake UserProgress: unsupported workoutLogs filter')
  }
  return true
}

interface Fakes {
  logs: Log[]
  slots: Slot[]
  progressUpdates: UpdateCall[]
  scheduleUpdates: UpdateCall[]
  pushedLogs: Log[]
  restore: () => void
}

function installFakes(logs: Log[], slots: Slot[]): Fakes {
  const state: Fakes = {
    logs: logs.map((l) => ({ ...l })),
    slots: slots.map((s) => ({ ...s })),
    progressUpdates: [],
    scheduleUpdates: [],
    pushedLogs: [],
    restore: () => {},
  }

  const patched: Array<[Record<string, unknown>, string]> = []
  const patch = (model: unknown, name: string, impl: unknown) => {
    const target = model as Record<string, unknown>
    patched.push([target, name])
    target[name] = impl
  }

  patch(UserProgress, 'findOne', () =>
    chain({
      userId: USER_ID,
      workoutLogs: state.logs,
      // Nowhere near finished, so no save here ever completes the program.
      activePrograms: [{ programId: PROGRAM_ID, programName: 'Replay', completedWorkouts: 1, totalWorkouts: 12 }],
      exercisePRs: [],
      streakDays: 3,
      longestStreak: 3,
      lastActivityDate: new Date(),
      streakFreezes: 1,
      milestonesReached: [],
    }),
  )

  patch(UserProgress, 'findOneAndUpdate', (
    filter: Record<string, unknown>,
    update: Record<string, unknown>,
    options?: { arrayFilters?: Array<Record<string, unknown>> },
  ) => {
    if (!docMatches(filter, state.logs)) return chain(null)
    const before = state.logs.map((l) => ({ ...l }))
    const set = (update.$set ?? {}) as Record<string, unknown>
    const filters = options?.arrayFilters ?? []
    for (const log of state.logs) {
      if (!filters.every((f) => logMatches(log, f))) continue
      for (const [path, value] of Object.entries(set)) {
        const m = /^workoutLogs\.\$\[elem\]\.(.+)$/.exec(path)
        if (m) log[m[1]] = value
      }
    }
    return chain({ workoutLogs: before })
  })

  patch(UserProgress, 'updateOne', (filter: Record<string, unknown>, update: Record<string, unknown>) => {
    state.progressUpdates.push({ filter, update })
    const pushed = (update.$push as Record<string, unknown> | undefined)?.workoutLogs as Log | undefined
    if (pushed && docMatches(filter, state.logs)) {
      state.logs.push({ ...pushed })
      state.pushedLogs.push({ ...pushed })
    }
    return chain(WRITE_RESULT)
  })

  patch(UserProgress, 'create', async () => ({}))

  patch(Schedule, 'findOne', () => chain({ scheduledWorkouts: state.slots }))
  patch(Schedule, 'updateOne', (
    filter: Record<string, unknown>,
    update: Record<string, unknown>,
    options?: { arrayFilters?: Array<Record<string, unknown>> },
  ) => {
    state.scheduleUpdates.push({ filter, update, options })
    const cond = options?.arrayFilters?.[0] as Record<string, unknown> | undefined
    for (const slot of state.slots) {
      if (!cond) break
      const wantDate = cond['elem.date'] as Date
      if (new Date(slot.date).getTime() !== new Date(wantDate).getTime()) continue
      if (cond['elem.dayLabel'] !== slot.dayLabel) continue
      slot.status = 'completed'
      slot.completedAt = new Date()
    }
    return chain(WRITE_RESULT)
  })

  patch(ProgramModel, 'findOne', () => chain(null))

  state.restore = () => {
    for (const [target, name] of patched) delete target[name]
  }
  return state
}

interface SaveOptions {
  completed: boolean
  attemptId?: string
  /** Sent as the `Idempotency-Key` header instead of in the body. */
  idempotencyKey?: string
  tz?: number
}

async function save(opts: SaveOptions): Promise<Response> {
  // Pre-seed the connection cache lib/mongodb.ts reads, so dbConnect() returns
  // without opening a socket. Set before the route is loaded.
  const g = globalThis as unknown as { mongoose?: { conn: unknown; promise: unknown } }
  g.mongoose = { conn: {}, promise: null }

  const { POST } = await import('../../app/api/workouts/route')
  const token = await signToken({ userId: USER_ID, email: 'replay@example.com' })
  const headers = new Headers({ 'Content-Type': 'application/json', Authorization: `Bearer ${token}` })
  if (opts.idempotencyKey) headers.set('Idempotency-Key', opts.idempotencyKey)
  const request = new NextRequest('http://localhost/api/workouts', {
    method: 'POST',
    headers,
    body: JSON.stringify({
      programId: PROGRAM_ID,
      phase: 1,
      day: DAY,
      tz: opts.tz ?? TZ_EASTERN,
      completed: opts.completed,
      ...(opts.attemptId ? { attemptId: opts.attemptId } : {}),
      exercises: [{ name: 'Back Squat', sets: [{ setNumber: 1, reps: 5, weight: 225, completed: true }] }],
    }),
  })
  return POST(request)
}

/** 23:58 in the member's local day YESTERDAY — two minutes before midnight. */
function justBeforeLocalMidnight(tz: number): Date {
  const { start } = localDayWindowForKey(localDateKey(null, tz), tz)
  return new Date(start.getTime() - 2 * 60 * 1000)
}

const completedSlots = (fakes: Fakes) => fakes.slots.filter((s) => s.status === 'completed')
const programIncs = (fakes: Fakes) =>
  fakes.progressUpdates.filter((u) => u.update.$inc !== undefined)

// ── The card's rule: a replay never doubles a completed workout ──────────────

test('replaying a completing save after local midnight leaves ONE completed log and ONE completed slot', async () => {
  const todayKey = localDateKey(null, TZ_EASTERN)
  const yesterdayKey = dateKey(new Date(utcMidnightDateKey(todayKey).getTime() - DAY_MS), 0)

  const fakes = installFakes(
    [{
      programId: PROGRAM_ID,
      day: DAY,
      phase: 1,
      // Written by the save that DID land, at 23:58 local yesterday.
      date: justBeforeLocalMidnight(TZ_EASTERN),
      completed: true,
      attemptId: 'attempt-across-midnight',
      exercises: [],
    }],
    [
      // Yesterday's slot, already credited by that save…
      { date: utcMidnightDateKey(yesterdayKey), dayLabel: DAY, status: 'completed', completedAt: justBeforeLocalMidnight(TZ_EASTERN) },
      // …and next week's, which the duplicate used to steal.
      { date: new Date(utcMidnightDateKey(todayKey).getTime() + 7 * DAY_MS), dayLabel: DAY, status: 'scheduled' },
    ],
  )

  try {
    // The queue flushes the very same completing save, now that it is tomorrow.
    const res = await save({ completed: true, attemptId: 'attempt-across-midnight' })
    assert.equal(res.status, 200)

    assert.equal(fakes.pushedLogs.length, 0, 'the replay must not insert a second log')
    assert.equal(fakes.logs.length, 1, 'still exactly one log for this attempt')
    assert.equal(fakes.logs[0].completed, true)
    assert.equal(fakes.logs[0].attemptId, 'attempt-across-midnight')

    assert.equal(programIncs(fakes).length, 0, 'the completed count / day advance must not run twice')
    assert.equal(fakes.scheduleUpdates.length, 0, 'no second schedule slot may be marked completed')
    assert.equal(completedSlots(fakes).length, 1, 'exactly one slot stays completed')
  } finally {
    fakes.restore()
  }
})

test('a save whose attempt the server has never seen is still logged, side effects and all', async () => {
  // The other half: the id must not make a genuinely FIRST save a no-op.
  const todayKey = localDateKey(null, TZ_EASTERN)
  const fakes = installFakes(
    [],
    [{ date: utcMidnightDateKey(todayKey), dayLabel: DAY, status: 'scheduled' }],
  )
  try {
    const res = await save({ completed: true, attemptId: 'attempt-first-ever' })
    assert.equal(res.status, 200)

    assert.equal(fakes.pushedLogs.length, 1, 'the first save inserts its log')
    assert.equal(fakes.pushedLogs[0].attemptId, 'attempt-first-ever', 'and the log carries the attempt id')
    assert.equal(programIncs(fakes).length, 1, 'completion side effects run exactly once')
    assert.equal(fakes.scheduleUpdates.length, 1)
    assert.equal(completedSlots(fakes).length, 1)
  } finally {
    fakes.restore()
  }
})

test('an Idempotency-Key header does the same job, for a queue that keys writes at the transport level', async () => {
  const fakes = installFakes(
    [{
      programId: PROGRAM_ID,
      day: DAY,
      phase: 1,
      date: justBeforeLocalMidnight(TZ_EASTERN),
      completed: true,
      attemptId: 'attempt-by-header',
      exercises: [],
    }],
    [{ date: utcMidnightDateKey(localDateKey(null, TZ_EASTERN)), dayLabel: DAY, status: 'scheduled' }],
  )
  try {
    const res = await save({ completed: true, idempotencyKey: 'attempt-by-header' })
    assert.equal(res.status, 200)

    assert.equal(fakes.pushedLogs.length, 0, 'the header identifies the attempt just as the body field does')
    assert.equal(programIncs(fakes).length, 0)
    assert.equal(fakes.scheduleUpdates.length, 0)
  } finally {
    fakes.restore()
  }
})

// ── Autosaves ────────────────────────────────────────────────────────────────

test('replaying an autosave never creates a log, even once its log has aged out of every window', async () => {
  // 30 hours old: past the rolling in-progress window AND outside today's
  // local day, which is precisely where the route used to insert a duplicate.
  const staleOpen = new Date(Date.now() - 30 * 60 * 60 * 1000)
  const fakes = installFakes(
    [{ programId: PROGRAM_ID, day: DAY, phase: 1, date: staleOpen, completed: false, attemptId: 'attempt-autosave', exercises: [] }],
    [],
  )
  try {
    const res = await save({ completed: false, attemptId: 'attempt-autosave' })
    assert.equal(res.status, 200)

    assert.equal(fakes.pushedLogs.length, 0, 'no log is created by a replayed autosave')
    assert.equal(fakes.logs.length, 1)
    assert.equal(fakes.logs[0].completed, false, 'it is still the open log it always was')
    assert.equal(programIncs(fakes).length, 0)
  } finally {
    fakes.restore()
  }
})

test('an autosave replayed AFTER the completing save neither un-completes the log nor adds one', async () => {
  // Queues do not promise order. A stale autosave arriving last must not
  // reopen a finished workout — the window path gets that for free by only
  // ever matching completed:false logs.
  const fakes = installFakes(
    [{
      programId: PROGRAM_ID,
      day: DAY,
      phase: 1,
      date: justBeforeLocalMidnight(TZ_EASTERN),
      completed: true,
      attemptId: 'attempt-out-of-order',
      exercises: [{ name: 'Back Squat', sets: [{ setNumber: 1, reps: 5, weight: 225, completed: true }] }],
    }],
    [],
  )
  try {
    const res = await save({ completed: false, attemptId: 'attempt-out-of-order' })
    assert.equal(res.status, 200)

    assert.equal(fakes.pushedLogs.length, 0)
    assert.equal(fakes.logs.length, 1)
    assert.equal(fakes.logs[0].completed, true, 'the finished log stays finished')
  } finally {
    fakes.restore()
  }
})

// ── Control: without the id, nothing about the old behaviour changed ─────────

test('the SAME replay with no attemptId still forks — unchanged behaviour for clients that send none', async () => {
  const todayKey = localDateKey(null, TZ_EASTERN)
  const yesterdayKey = dateKey(new Date(utcMidnightDateKey(todayKey).getTime() - DAY_MS), 0)

  const fakes = installFakes(
    [{
      programId: PROGRAM_ID,
      day: DAY,
      phase: 1,
      date: justBeforeLocalMidnight(TZ_EASTERN),
      completed: true,
      exercises: [],
    }],
    [
      { date: utcMidnightDateKey(yesterdayKey), dayLabel: DAY, status: 'completed', completedAt: justBeforeLocalMidnight(TZ_EASTERN) },
      { date: new Date(utcMidnightDateKey(todayKey).getTime() + 7 * DAY_MS), dayLabel: DAY, status: 'scheduled' },
    ],
  )

  try {
    const res = await save({ completed: true })
    assert.equal(res.status, 200)

    // This is the bug the card describes, reproduced: it is what every
    // pre-existing client still gets, and what the attempt id above prevents.
    assert.equal(fakes.pushedLogs.length, 1, 'no id, no way to tell a replay from a new workout')
    assert.equal(programIncs(fakes).length, 1)
    assert.equal(fakes.scheduleUpdates.length, 1)
  } finally {
    fakes.restore()
  }
})
