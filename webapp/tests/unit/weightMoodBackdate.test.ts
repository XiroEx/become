// Run with: npm run test:file tests/unit/weightMoodBackdate.test.ts
//
// THE WEIGH-IN MADE BEFORE MIDNIGHT AND DELIVERED AFTER IT.
//
// POST /api/weight and POST /api/mood dated every entry from the server's
// clock in the member's offset. A write made offline at 11:50pm and replayed
// by the queue at 12:05am therefore landed on the following day — and since
// both routes keep exactly one entry per local day, the replay did not
// duplicate anything, it filed the value on the wrong day and could overwrite
// a newer one.
//
// Both routes now accept the day the write was MADE on (`date`, a YYYY-MM-DD
// local day key) and when it was made (`loggedAt`). These drive the REAL route
// handlers against the real (loopback, disposable) test database with the
// clock pinned, because the bug lives in the interaction between the request,
// the clock and the row that is already there.

import { test, before, after, beforeEach, mock } from 'node:test'
import assert from 'node:assert/strict'
import mongoose from 'mongoose'
import { NextRequest } from 'next/server'
import { POST as postWeight } from '../../app/api/weight/route'
import { POST as postMood, GET as getMood } from '../../app/api/mood/route'
import UserProgress from '../../models/UserProgress'
import { signToken } from '../../lib/auth'

const USER_ID = '65f00000000000000000ff52'

/** 11:00 in New York on 12 August 2026 (EDT). */
const NOW = new Date('2026-08-12T15:00:00.000Z')
/** `Date.getTimezoneOffset()` in New York in summer: minutes WEST of UTC. */
const NY = 240
const TODAY = '2026-08-12'
const YESTERDAY = '2026-08-11'
const TOMORROW = '2026-08-13'
/** Eight days back — one day outside the offline-queue window. */
const TOO_OLD = '2026-08-04'

const TODAY_MARKER = '2026-08-12T00:00:00.000Z'
const YESTERDAY_MARKER = '2026-08-11T00:00:00.000Z'

let auth: string

before(async () => {
  process.env.JWT_SECRET ||= 'become-unit-test-secret'
  await mongoose.connect(
    process.env.MONGODB_URI ?? 'mongodb://127.0.0.1:27017/become-test',
  )
  auth = `Bearer ${await signToken({ userId: USER_ID, email: 'backdate@example.com' })}`
})

after(async () => {
  mock.timers.reset()
  await UserProgress.deleteMany({ userId: USER_ID })
  await mongoose.disconnect()
})

beforeEach(async () => {
  mock.timers.reset()
  await UserProgress.deleteMany({ userId: USER_ID })
})

/** Freeze only `Date` — the driver's own timers stay real. */
function atUtc(when: Date) {
  mock.timers.enable({ apis: ['Date'], now: when })
}

function postReq(path: string, body: unknown) {
  return new NextRequest(`http://localhost${path}`, {
    method: 'POST',
    headers: new Headers({ 'Content-Type': 'application/json', Authorization: auth }),
    body: JSON.stringify(body),
  })
}

/** Run a POST with the clock pinned to `when`, and hand back status + body. */
async function post(
  handler: (r: NextRequest) => Promise<Response>,
  path: string,
  body: unknown,
  when: Date = NOW,
) {
  atUtc(when)
  try {
    const res = await handler(postReq(path, body))
    return { status: res.status, body: await res.json() }
  } finally {
    mock.timers.reset()
  }
}

const postW = (body: unknown, when?: Date) => post(postWeight, '/api/weight', body, when)
const postM = (body: unknown, when?: Date) => post(postMood, '/api/mood', body, when)

type StoredWeight = { date: Date; weight: number; loggedAt?: Date }
type StoredMood = { date: Date; mood: number; loggedAt?: Date }

async function stored() {
  const doc = await UserProgress.findOne({ userId: USER_ID }).lean<{
    weightHistory?: StoredWeight[]
    moodHistory?: StoredMood[]
    moodChangeHistory?: { date: Date; newMood: number }[]
    lastActivityDate?: Date
    streakDays?: number
  } | null>()
  return doc
}

const iso = (d: Date | undefined) => (d ? new Date(d).toISOString() : undefined)

// ─── A weight posted with yesterday's date lands on yesterday ────────────────

test('weight: a write carrying yesterday\'s date lands on yesterday, not today', async () => {
  const res = await postW({
    weight: 181.4,
    tz: NY,
    date: YESTERDAY,
    // 11:50pm in New York on the 11th — the moment it was actually made.
    loggedAt: '2026-08-12T03:50:00.000Z',
  })

  assert.equal(res.status, 200)
  assert.equal(res.body.success, true)
  assert.equal(res.body.date, YESTERDAY)
  assert.equal(res.body.applied, true)

  const doc = await stored()
  assert.equal(doc?.weightHistory?.length, 1)
  assert.equal(iso(doc?.weightHistory?.[0].date), YESTERDAY_MARKER)
  assert.equal(doc?.weightHistory?.[0].weight, 181.4)
  assert.equal(iso(doc?.weightHistory?.[0].loggedAt), '2026-08-12T03:50:00.000Z')
})

test('weight: the back-dated entry does not become today\'s — today is still empty', async () => {
  await postW({ weight: 181.4, tz: NY, date: YESTERDAY })

  // Today's weigh-in arrives normally, and gets its own row.
  const res = await postW({ weight: 180.2, tz: NY })
  assert.equal(res.status, 200)
  assert.equal(res.body.date, TODAY)

  const doc = await stored()
  const days = (doc?.weightHistory ?? []).map(e => iso(e.date)).sort()
  assert.deepEqual(days, [YESTERDAY_MARKER, TODAY_MARKER])
  const yesterdayRow = doc?.weightHistory?.find(e => iso(e.date) === YESTERDAY_MARKER)
  assert.equal(yesterdayRow?.weight, 181.4, 'yesterday keeps the value it was posted with')
})

test('mood: a write carrying yesterday\'s date lands on yesterday', async () => {
  const res = await postM({ mood: 2, tz: NY, date: YESTERDAY, loggedAt: '2026-08-12T03:50:00.000Z' })

  assert.equal(res.status, 200)
  assert.equal(res.body.date, YESTERDAY)
  assert.equal(res.body.applied, true)

  const doc = await stored()
  assert.equal(doc?.moodHistory?.length, 1)
  assert.equal(iso(doc?.moodHistory?.[0].date), YESTERDAY_MARKER)
  assert.equal(doc?.moodHistory?.[0].mood, 2)

  // ...and today is untouched: the member is still asked for today's mood.
  atUtc(NOW)
  try {
    const check = await getMood(new NextRequest(`http://localhost/api/mood?tz=${NY}`, {
      headers: new Headers({ Authorization: auth }),
    }))
    const body = await check.json()
    assert.equal(body.needsMoodCheck, true)
    assert.equal(body.todaysMood, null)
  } finally {
    mock.timers.reset()
  }
})

test('a back-dated entry does not credit a streak day for today', async () => {
  const res = await postW({ weight: 181.4, tz: NY, date: YESTERDAY })
  assert.equal(res.body.streak, undefined, 'no streak is claimed for a day the member did not log')

  const doc = await stored()
  assert.equal(doc?.lastActivityDate, undefined)
  assert.equal(doc?.streakDays ?? 0, 0)
})

// ─── A future date, or one outside the window, is refused ────────────────────

test('weight: tomorrow\'s date is refused with 400 and writes nothing', async () => {
  const res = await postW({ weight: 180, tz: NY, date: TOMORROW })
  assert.equal(res.status, 400)
  assert.match(res.body.error, /future/)
  assert.equal(await stored(), null, 'a refused write must not create a row')
})

test('weight: a date older than the offline-queue window is refused with 400', async () => {
  const res = await postW({ weight: 180, tz: NY, date: TOO_OLD })
  assert.equal(res.status, 400)
  assert.match(res.body.error, /7 days old/)
  assert.equal(await stored(), null)
})

test('weight: a malformed date is refused with 400 rather than filed under today', async () => {
  const res = await postW({ weight: 180, tz: NY, date: '08/11/2026' })
  assert.equal(res.status, 400)
  assert.match(res.body.error, /Invalid date/)
  assert.equal(await stored(), null)
})

test('mood: tomorrow\'s date is refused with 400 and writes nothing', async () => {
  const res = await postM({ mood: 5, tz: NY, date: TOMORROW })
  assert.equal(res.status, 400)
  assert.match(res.body.error, /future/)
  assert.equal(await stored(), null)
})

test('mood: a date older than the window is refused with 400', async () => {
  const res = await postM({ mood: 5, tz: NY, date: TOO_OLD })
  assert.equal(res.status, 400)
  assert.match(res.body.error, /7 days old/)
  assert.equal(await stored(), null)
})

test('the UTC day is still the future for a member west of UTC', async () => {
  // 9pm on the 12th in New York: the clock says the 13th, the member does not.
  const nyEvening = new Date('2026-08-13T01:00:00.000Z')
  const res = await postW({ weight: 180, tz: NY, date: TOMORROW }, nyEvening)
  assert.equal(res.status, 400)
  assert.match(res.body.error, /future/)
})

// ─── A replay with an older loggedAt does not overwrite a newer value ────────

test('weight: a replay carrying an older loggedAt leaves the newer value alone', async () => {
  // The evening weigh-in the member actually kept.
  const first = await postW({
    weight: 181.4, tz: NY, date: YESTERDAY, loggedAt: '2026-08-11T22:00:00.000Z',
  })
  assert.equal(first.body.applied, true)

  // The morning one, stuck in the offline queue, arriving second.
  const replay = await postW({
    weight: 174.9, tz: NY, date: YESTERDAY, loggedAt: '2026-08-11T07:00:00.000Z',
  })
  assert.equal(replay.status, 200, 'a stale replay is accepted — there is nothing to retry')
  assert.equal(replay.body.applied, false)

  const doc = await stored()
  assert.equal(doc?.weightHistory?.length, 1, 'still one entry for the day')
  assert.equal(doc?.weightHistory?.[0].weight, 181.4, 'the newer weigh-in survives the replay')
  assert.equal(iso(doc?.weightHistory?.[0].loggedAt), '2026-08-11T22:00:00.000Z')
})

test('weight: a replay carrying a NEWER loggedAt does overwrite', async () => {
  await postW({ weight: 174.9, tz: NY, date: YESTERDAY, loggedAt: '2026-08-11T07:00:00.000Z' })
  const later = await postW({
    weight: 181.4, tz: NY, date: YESTERDAY, loggedAt: '2026-08-11T22:00:00.000Z',
  })

  assert.equal(later.body.applied, true)
  const doc = await stored()
  assert.equal(doc?.weightHistory?.length, 1)
  assert.equal(doc?.weightHistory?.[0].weight, 181.4)
})

test('mood: a replay carrying an older loggedAt leaves the newer mood alone', async () => {
  await postM({ mood: 5, tz: NY, date: YESTERDAY, loggedAt: '2026-08-11T22:00:00.000Z' })

  const replay = await postM({
    mood: 1, tz: NY, date: YESTERDAY, loggedAt: '2026-08-11T07:00:00.000Z',
  })
  assert.equal(replay.status, 200)
  assert.equal(replay.body.applied, false)
  assert.equal(replay.body.mood, 5, 'the response reports the mood the member keeps')

  const doc = await stored()
  assert.equal(doc?.moodHistory?.length, 1)
  assert.equal(doc?.moodHistory?.[0].mood, 5)
  assert.equal(
    doc?.moodChangeHistory?.length,
    1,
    'a replay that changed nothing records no change',
  )
})

// ─── A request without `date` behaves exactly as it does today ───────────────

test('weight: no date — the entry is today\'s and the streak is credited', async () => {
  const res = await postW({ weight: 180.2, tz: NY })

  assert.equal(res.status, 200)
  assert.equal(res.body.date, TODAY)
  assert.equal(res.body.applied, true)

  const doc = await stored()
  assert.equal(doc?.weightHistory?.length, 1)
  assert.equal(iso(doc?.weightHistory?.[0].date), TODAY_MARKER)
  assert.ok(res.body.streak, 'a weigh-in for today still records streak activity')
})

test('weight: no date, twice in a day — one row, the last value wins', async () => {
  await postW({ weight: 180.2, tz: NY })
  await postW({ weight: 179.8, tz: NY }, new Date(NOW.getTime() + 3 * 3_600_000))

  const doc = await stored()
  assert.equal(doc?.weightHistory?.length, 1)
  assert.equal(doc?.weightHistory?.[0].weight, 179.8)
})

test('mood: no date — the entry is today\'s and the streak is credited', async () => {
  const res = await postM({ mood: 4, tz: NY })

  assert.equal(res.status, 200)
  assert.equal(res.body.date, TODAY)
  assert.equal(res.body.mood, 4)

  const doc = await stored()
  assert.equal(doc?.moodHistory?.length, 1)
  assert.equal(iso(doc?.moodHistory?.[0].date), TODAY_MARKER)
  assert.ok(res.body.streak, 'a mood for today still records streak activity')
})

test('mood: an invalid mood value is still refused before any of this', async () => {
  const res = await postM({ mood: 9, tz: NY, date: YESTERDAY })
  assert.equal(res.status, 400)
  assert.match(res.body.error, /Invalid mood/)
})
