// Run with: npm run test:file tests/unit/workouts-slot-credit.test.ts
//
// ─── Which schedule slot a finished workout credits ──────────────────────────
//
// POST /api/workouts decides which Schedule slot a completion fulfills. Most
// web entry points (program detail, the dashboard's Continue card, the Workout
// tab's today link, Resume) send no `scheduledDate`, and every native save goes
// through the same route — so the ORDERING here, not the exact-slot shortcut,
// is what has to be right:
//
//     exact ?? todaySlot ?? overdue[0] ?? upcoming[0]
//
// A slot's `date` is a day MARKER stored at 00:00Z. Reading it through the
// member's offset (`dateKey(new Date(w.date), tzOffset)`) shifts it a day
// earlier for anyone WEST of UTC, so today's slot keyed as YESTERDAY, fell into
// `overdue`, and lost to an older outstanding slot with the same day label: the
// old one was marked "made up" and today's stayed Scheduled with nothing shown
// for the session the member had just done. Markers are read with
// `slotDateKey`; `completedAt` (an instant) keeps the offset.
//
// The route is driven for real here — the model statics are replaced with
// in-memory fakes and `global.mongoose` is pre-seeded so `dbConnect()`
// short-circuits, so no database is dialled.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { NextRequest } from 'next/server'
import Schedule from '../../models/Schedule'
import UserProgress from '../../models/UserProgress'
import ProgramModel from '../../models/Program'
import { signToken } from '../../lib/auth'
import { dateKey, localDateKey, utcMidnightDateKey } from '../../lib/dayWindow'
import { slotDateKey } from '../../lib/notifications/cronNotify'

/** Minutes WEST of UTC, exactly what a browser (and the native client) reports for EDT. */
const TZ_EASTERN = 240
const DAY_MS = 24 * 60 * 60 * 1000
const PROGRAM_ID = 'prog-slot-credit'

interface Slot { date: Date; dayLabel: string; status: string; completedAt?: Date }
interface UpdateCall {
  filter: unknown
  update: unknown
  options?: { arrayFilters?: Array<Record<string, unknown>> }
}

/** A thenable that also answers the query-builder calls the route chains onto it. */
function chain(value: unknown): Promise<unknown> {
  const p = Promise.resolve(value) as Promise<unknown> & Record<string, unknown>
  for (const method of ['lean', 'select', 'sort', 'limit']) p[method] = () => chain(value)
  p.exec = () => chain(value)
  return p
}

const WRITE_RESULT = { acknowledged: true, matchedCount: 1, modifiedCount: 1, upsertedCount: 0 }

/**
 * Swap every model static the POST path touches for an in-memory fake, and
 * hand back the Schedule writes it made. `restore()` deletes the own
 * properties again, putting the real Mongoose statics back.
 */
function installFakes(slots: Slot[]): { scheduleUpdates: UpdateCall[]; restore: () => void } {
  const scheduleUpdates: UpdateCall[] = []
  const scheduleDoc = { scheduledWorkouts: slots }

  const patched: Array<[Record<string, unknown>, string]> = []
  const patch = (model: unknown, name: string, impl: unknown) => {
    const target = model as Record<string, unknown>
    patched.push([target, name])
    target[name] = impl
  }

  patch(Schedule, 'findOne', () => chain(scheduleDoc))
  patch(Schedule, 'updateOne', (filter: unknown, update: unknown, options?: UpdateCall['options']) => {
    scheduleUpdates.push({ filter, update, options })
    return chain(WRITE_RESULT)
  })
  // No existing progress doc, no open log, no program definition: the save is a
  // fresh completion, which is the branch that syncs the schedule.
  patch(UserProgress, 'findOne', () => chain(null))
  patch(UserProgress, 'findOneAndUpdate', () => chain(null))
  patch(UserProgress, 'updateOne', () => chain(WRITE_RESULT))
  patch(UserProgress, 'create', async () => ({}))
  patch(ProgramModel, 'findOne', () => chain(null))

  return {
    scheduleUpdates,
    restore: () => {
      for (const [target, name] of patched) delete target[name]
    },
  }
}

async function finishWorkout(day: string, tz: number): Promise<Response> {
  // Pre-seed the connection cache lib/mongodb.ts reads, so dbConnect() returns
  // without opening a socket. Set before the route is loaded.
  const g = globalThis as unknown as { mongoose?: { conn: unknown; promise: unknown } }
  g.mongoose = { conn: {}, promise: null }

  const { POST } = await import('../../app/api/workouts/route')
  const token = await signToken({ userId: 'slot-credit-user', email: 'slot@example.com' })
  const request = new NextRequest('http://localhost/api/workouts', {
    method: 'POST',
    headers: new Headers({ 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }),
    body: JSON.stringify({
      programId: PROGRAM_ID,
      phase: 1,
      day,
      tz,
      completed: true,
      // No `scheduledDate` — the entry points this card is about don't send one.
      exercises: [{ name: 'Back Squat', sets: [{ setNumber: 1, reps: 5, weight: 225, completed: true }] }],
    }),
  })
  return POST(request)
}

/** The slot a schedule stores for the member's local day `key`: 00:00Z of it. */
function slotOn(key: string): Date {
  return utcMidnightDateKey(key)
}

test('tz 240: the slot the route credits is TODAY\'s Day 3, not the older outstanding Day 3', async () => {
  const todayKey = localDateKey(null, TZ_EASTERN)
  const todaySlot = slotOn(todayKey)
  const olderSlot = new Date(todaySlot.getTime() - 7 * DAY_MS)

  // The member really is west of UTC: the old reading calls today's marker
  // yesterday, which is what swept it into the overdue backlog.
  assert.notEqual(dateKey(todaySlot, TZ_EASTERN), todayKey)
  assert.equal(slotDateKey(todaySlot), todayKey)

  const fakes = installFakes([
    { date: olderSlot, dayLabel: 'Day 3', status: 'scheduled' },
    { date: todaySlot, dayLabel: 'Day 3', status: 'scheduled' },
  ])
  try {
    const res = await finishWorkout('Day 3', TZ_EASTERN)
    assert.equal(res.status, 200)

    assert.equal(fakes.scheduleUpdates.length, 1, 'exactly one slot is marked completed')
    const filter = fakes.scheduleUpdates[0].options?.arrayFilters?.[0] as Record<string, unknown>
    assert.equal(filter['elem.dayLabel'], 'Day 3')
    assert.equal(
      new Date(filter['elem.date'] as Date).toISOString(),
      todaySlot.toISOString(),
      'today\'s slot must be the one completed — the older one stays outstanding',
    )
  } finally {
    fakes.restore()
  }
})

test('tz 240: with no slot today, an older outstanding Day 3 is still made up', async () => {
  // The other half of the rule: backfilling an earlier miss is right when the
  // member trains on a day the schedule has nothing for.
  const todayKey = localDateKey(null, TZ_EASTERN)
  const olderSlot = new Date(slotOn(todayKey).getTime() - 7 * DAY_MS)
  const futureSlot = new Date(slotOn(todayKey).getTime() + 3 * DAY_MS)

  const fakes = installFakes([
    { date: futureSlot, dayLabel: 'Day 3', status: 'scheduled' },
    { date: olderSlot, dayLabel: 'Day 3', status: 'scheduled' },
  ])
  try {
    const res = await finishWorkout('Day 3', TZ_EASTERN)
    assert.equal(res.status, 200)

    assert.equal(fakes.scheduleUpdates.length, 1)
    const filter = fakes.scheduleUpdates[0].options?.arrayFilters?.[0] as Record<string, unknown>
    assert.equal(
      new Date(filter['elem.date'] as Date).toISOString(),
      olderSlot.toISOString(),
      'the oldest outstanding slot is made up before any upcoming one',
    )
  } finally {
    fakes.restore()
  }
})

test('tz 0: a member on UTC is unaffected — today\'s slot still wins', async () => {
  const todayKey = localDateKey(null, 0)
  const todaySlot = slotOn(todayKey)
  const olderSlot = new Date(todaySlot.getTime() - 14 * DAY_MS)

  const fakes = installFakes([
    { date: olderSlot, dayLabel: 'Day 1', status: 'missed' },
    { date: todaySlot, dayLabel: 'Day 1', status: 'scheduled' },
  ])
  try {
    const res = await finishWorkout('Day 1', 0)
    assert.equal(res.status, 200)

    assert.equal(fakes.scheduleUpdates.length, 1)
    const filter = fakes.scheduleUpdates[0].options?.arrayFilters?.[0] as Record<string, unknown>
    assert.equal(new Date(filter['elem.date'] as Date).toISOString(), todaySlot.toISOString())
  } finally {
    fakes.restore()
  }
})
