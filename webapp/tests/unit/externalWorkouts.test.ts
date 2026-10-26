// Run with: npm run test:file tests/unit/externalWorkouts.test.ts
//
// TRACKED WORKOUTS DONE OUTSIDE BECOME (card 6adf69c7, Part B).
//
// Jon, 2026-10-26: an outdoor walk Whoop recorded, synced in from Apple Health
// or Health Connect, should
//
//   1. show on the calendar as an EXTRA activity beside the program session;
//   2. tick off "I did a workout today" — the training widget, the streaks
//      `today.trained`, the weekly trained-days count;
//   3. NOT complete the scheduled program slot.
//
// Plus the import rules it shares with an imported weigh-in: the day is the
// SAMPLE's, a re-delivery is one session, and only a session from TODAY
// credits the streak day.

import { test, describe, before, after, beforeEach, mock } from 'node:test'
import assert from 'node:assert/strict'
import mongoose from 'mongoose'
import { NextRequest } from 'next/server'
import { POST as postExternal, GET as getExternal } from '../../app/api/workouts/external/route'
import UserProgress from '../../models/UserProgress'
import Schedule from '../../models/Schedule'
import { signToken } from '../../lib/auth'
import {
  EXTERNAL_WORKOUT_MAX_BATCH,
  normaliseActivityType,
  readExternalWorkout,
} from '../../lib/workout/externalWorkouts'
import { hasExternalWorkoutOn, trainedDayKeys } from '../../lib/workout/trainedDays'
import { loadWidgetFeed } from '../../lib/widgets/load'
import { computeStreaks } from '../../lib/streaks/compute'

const USER_ID = '65f00000000000000000e817'

/** 11:00 in New York on 12 August 2026 (EDT). */
const NOW = new Date('2026-08-12T15:00:00.000Z')
/** Minutes WEST of UTC, New York in summer. */
const NY = 240
const TODAY = '2026-08-12'
const THREE_DAYS_AGO = '2026-08-09'

let auth: string

before(async () => {
  process.env.JWT_SECRET ||= 'become-unit-test-secret'
  await mongoose.connect(process.env.MONGODB_URI ?? 'mongodb://127.0.0.1:27017/become-test')
  auth = `Bearer ${await signToken({ userId: USER_ID, email: 'external@example.com' })}`
})

after(async () => {
  mock.timers.reset()
  await UserProgress.deleteMany({ userId: USER_ID })
  await Schedule.deleteMany({ userId: USER_ID })
  await mongoose.disconnect()
})

beforeEach(async () => {
  mock.timers.reset()
  await UserProgress.deleteMany({ userId: USER_ID })
  await Schedule.deleteMany({ userId: USER_ID })
})

/** A 45-minute walk Whoop recorded this morning, New York time. */
function walk(overrides: Record<string, unknown> = {}) {
  return {
    source: 'healthkit',
    externalId: 'HK-WALK-1',
    date: TODAY,
    startedAt: '2026-08-12T11:00:00.000Z',
    endedAt: '2026-08-12T11:45:00.000Z',
    activityType: 'Walking',
    activityName: 'Walking',
    durationMin: 45,
    distanceKm: 3.4,
    energyKcal: 180,
    originApp: 'Whoop',
    ...overrides,
  }
}

async function post(workouts: unknown, when: Date = NOW) {
  mock.timers.enable({ apis: ['Date'], now: when })
  try {
    const res = await postExternal(new NextRequest('http://localhost/api/workouts/external', {
      method: 'POST',
      headers: new Headers({ 'Content-Type': 'application/json', Authorization: auth }),
      body: JSON.stringify({ tz: NY, workouts }),
    }))
    return { status: res.status, body: await res.json() }
  } finally {
    mock.timers.reset()
  }
}

async function get(query: string, when: Date = NOW) {
  mock.timers.enable({ apis: ['Date'], now: when })
  try {
    const res = await getExternal(new NextRequest(`http://localhost/api/workouts/external?${query}`, {
      headers: new Headers({ Authorization: auth }),
    }))
    return { status: res.status, body: await res.json() }
  } finally {
    mock.timers.reset()
  }
}

async function stored() {
  return UserProgress.findOne({ userId: USER_ID }).lean<{
    externalWorkouts?: Array<{ externalId: string; date: Date; activityType: string }>
    workoutLogs?: unknown[]
    streakDays?: number
    lastActivityDate?: Date
  } | null>()
}

// ─── The validation (pure) ───────────────────────────────────────────────────

describe('readExternalWorkout', () => {
  const ok = (raw: unknown) => readExternalWorkout(raw, NY, NOW)

  test('a tracked walk reads, filed on the day it CARRIES', () => {
    const r = ok(walk({ date: THREE_DAYS_AGO, startedAt: '2026-08-09T23:30:00.000Z', endedAt: '2026-08-10T00:10:00.000Z' }))
    assert.equal(r.ok, true)
    if (!r.ok) return
    assert.equal(r.entry.dayKey, THREE_DAYS_AGO)
    assert.equal(r.entry.date.toISOString(), '2026-08-09T00:00:00.000Z')
    assert.equal(r.entry.backdated, true)
    assert.equal(r.entry.activityType, 'walking')
  })

  test('the id and the day are required — a session without either cannot be placed or recognised', () => {
    assert.equal(ok(walk({ externalId: undefined })).ok, false)
    assert.equal(ok(walk({ date: undefined })).ok, false)
  })

  test('a future day, and one past the 90-day import window, are refused', () => {
    assert.match((ok(walk({ date: '2026-08-13' })) as { error: string }).error, /future/)
    assert.match((ok(walk({ date: '2026-04-01' })) as { error: string }).error, /90 days/)
  })

  test('an unknown source, a backwards span and a day-long session are refused', () => {
    assert.equal(ok(walk({ source: 'strava' })).ok, false)
    assert.equal(ok(walk({ endedAt: '2026-08-12T10:00:00.000Z' })).ok, false)
    assert.equal(ok(walk({ startedAt: '2026-08-10T11:00:00.000Z', durationMin: undefined })).ok, false)
  })

  test('the duration is never longer than the span', () => {
    const r = ok(walk({ durationMin: 2000 }))
    assert.equal(r.ok, false, 'past the duration bound is refused')
    const r2 = ok(walk({ durationMin: 120 }))
    assert.equal(r2.ok && r2.entry.durationMin, 45)
  })

  test('activity types normalise to kebab-case', () => {
    assert.equal(normaliseActivityType('TraditionalStrengthTraining'), 'traditional-strength-training')
    assert.equal(normaliseActivityType('RUNNING_TREADMILL'), 'running-treadmill')
    assert.equal(normaliseActivityType('***'), 'workout')
  })
})

describe('trainedDayKeys', () => {
  test('unions completed Become workouts with external ones, reading the marker at offset 0', () => {
    const days = trainedDayKeys({
      workoutLogs: [
        { date: '2026-08-10T23:30:00.000Z', completed: true }, // 7:30pm NY on the 10th
        { date: '2026-08-11T12:00:00.000Z', completed: false },
      ],
      // A day marker. Through the NY offset it would read as the 11th.
      externalWorkouts: [{ date: '2026-08-12T00:00:00.000Z' }],
    }, NY)
    assert.deepEqual([...days].sort(), ['2026-08-10', '2026-08-12'])
    assert.equal(hasExternalWorkoutOn([{ date: '2026-08-12T00:00:00.000Z' }], '2026-08-12'), true)
  })
})

// ─── The route ──────────────────────────────────────────────────────────────

test('a tracked walk is stored once, however many times Health re-offers it', async () => {
  const first = await post([walk()])
  assert.equal(first.status, 200)
  assert.equal(first.body.results[0].applied, true)
  assert.equal(first.body.results[0].date, TODAY)

  const again = await post([walk()], new Date(NOW.getTime() + 3_600_000))
  assert.equal(again.status, 200)
  assert.equal(again.body.results[0].applied, false)
  assert.equal(again.body.results[0].duplicate, true)

  const doc = await stored()
  assert.equal(doc?.externalWorkouts?.length, 1)
  assert.equal(doc?.externalWorkouts?.[0]?.activityType, 'walking')
  assert.equal((doc?.workoutLogs ?? []).length, 0, 'never a workoutLogs row')
})

test('the same id from the OTHER platform is a different session', async () => {
  await post([walk()])
  const res = await post([walk({ source: 'health-connect' })])
  assert.equal(res.body.results[0].applied, true)
  assert.equal((await stored())?.externalWorkouts?.length, 2)
})

test('one bad item is refused on its own; the rest of the batch lands', async () => {
  const res = await post([walk(), walk({ externalId: 'HK-2', date: '2026-08-20' }), walk({ externalId: 'HK-3', date: THREE_DAYS_AGO, startedAt: '2026-08-09T12:00:00.000Z', endedAt: '2026-08-09T12:30:00.000Z' })])
  assert.equal(res.status, 200)
  assert.deepEqual(res.body.results.map((r: { applied: boolean }) => r.applied), [true, false, true])
  assert.match(res.body.results[1].error, /future/)
})

test('a batch that is not a list, or is too long, is a 400', async () => {
  assert.equal((await post(undefined)).status, 400)
  assert.equal((await post([])).status, 400)
  const many = Array.from({ length: EXTERNAL_WORKOUT_MAX_BATCH + 1 }, (_, i) => walk({ externalId: `HK-${i}` }))
  assert.equal((await post(many)).status, 400)
})

test('a walk from TODAY credits the streak day, once', async () => {
  const first = await post([walk()])
  assert.ok(first.body.streak, 'the member trained today')
  assert.equal((await stored())?.streakDays, 1)

  const again = await post([walk()])
  assert.equal(again.body.streak, undefined, 'a re-delivery credits nothing twice')
})

test('a walk from an EARLIER day credits no streak day', async () => {
  const res = await post([walk({ date: THREE_DAYS_AGO, startedAt: '2026-08-09T12:00:00.000Z', endedAt: '2026-08-09T12:30:00.000Z' })])
  assert.equal(res.body.results[0].applied, true)
  assert.equal(res.body.streak, undefined)
  const doc = await stored()
  assert.equal(doc?.streakDays ?? 0, 0)
  assert.equal(doc?.lastActivityDate, undefined)
})

test('an unauthenticated request is refused', async () => {
  const res = await postExternal(new NextRequest('http://localhost/api/workouts/external', {
    method: 'POST',
    headers: new Headers({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ workouts: [walk()] }),
  }))
  assert.equal(res.status, 401)
})

test('GET answers the sessions on an inclusive range of local days', async () => {
  await post([
    walk(),
    walk({ externalId: 'HK-OLD', date: THREE_DAYS_AGO, startedAt: '2026-08-09T12:00:00.000Z', endedAt: '2026-08-09T12:30:00.000Z' }),
  ])
  const both = await get(`from=${THREE_DAYS_AGO}&to=${TODAY}&tz=${NY}`)
  assert.equal(both.status, 200)
  assert.deepEqual(both.body.workouts.map((w: { date: string }) => w.date), [THREE_DAYS_AGO, TODAY])
  assert.equal(both.body.workouts[1].originApp, 'Whoop')

  const one = await get(`from=${TODAY}&to=${TODAY}`)
  assert.equal(one.body.workouts.length, 1)

  assert.equal((await get('from=2026-08-40')).status, 400)
  assert.equal((await get(`from=${TODAY}&to=${THREE_DAYS_AGO}`)).status, 400)
  assert.equal((await get('from=2025-01-01&to=2026-08-12')).status, 400, 'over the range bound')
})

// ─── What it ticks off, and what it does not ─────────────────────────────────

test('it ticks off today on the widget and in streaks, and leaves the program slot scheduled', async () => {
  await Schedule.create({
    userId: new mongoose.Types.ObjectId(USER_ID),
    programId: 'ext-contract-program',
    programName: 'Ext Program',
    settings: { trainingDays: [0, 1, 2, 3, 4, 5, 6], startDate: new Date(`${TODAY}T00:00:00.000Z`) },
    scheduledWorkouts: [{
      date: new Date(`${TODAY}T00:00:00.000Z`),
      programId: 'ext-contract-program',
      phase: 1,
      dayLabel: 'Day 1',
      workoutTitle: 'Push Day',
      status: 'scheduled',
    }],
  })

  const before = await loadWidgetFeed(USER_ID, NY, NOW)
  assert.equal(before.widgets.find((w) => w.key === 'training')?.state, 'todo')
  assert.equal((await computeStreaks(USER_ID, NY, NOW)).pillars.super.today.trained, false)

  await post([walk()])

  const after = await loadWidgetFeed(USER_ID, NY, NOW)
  const training = after.widgets.find((w) => w.key === 'training')
  assert.equal(training?.state, 'done', 'the walk is "I did a workout today"')
  assert.equal(training?.caption, 'Walking', 'and it is named as the walk, not as the program day')

  const streaks = await computeStreaks(USER_ID, NY, NOW)
  assert.equal(streaks.pillars.super.today.trained, true)
  assert.equal(streaks.pillars.workout.thisWeek, 1)

  const schedule = await Schedule.findOne({ userId: USER_ID }).lean()
  assert.equal(schedule?.scheduledWorkouts[0]?.status, 'scheduled', 'the program slot is NOT completed')
})
