// Run with: npm run test:file tests/unit/mind/sessionResumeTz.test.ts
//
// THE SESSION YOU BEGAN IN THE EVENING AND CAME BACK TO.
//
// The Mind home stores the session a member begins so that walking away and
// returning hands back the SAME one. The store is stamped with a day key, and
// `GET /api/mind/session?tz=` throws the session away (`new_day`) the moment
// that key disagrees with the caller's local day.
//
// The web sent the offset as `tzOffset` while the PUT read `tz`, so the stamp
// fell back to 0 = UTC. Nine at night in New York is 01:00 UTC TOMORROW: the
// session was filed under tomorrow's date and the very next load — the member
// simply reopening the tab — decided the day had rolled over and dropped it.
// Correct at UTC and east of it until midnight, which is why it survived.
//
// These tests drive the REAL route handlers against the real (loopback,
// disposable) test database with the clock pinned to that exact moment.

import { test, before, after, beforeEach, mock } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import mongoose from 'mongoose'
import { NextRequest } from 'next/server'
import { GET, PUT } from '../../../app/api/mind/session/route'
import MindProgress from '../../../models/MindProgress'
import MindSession from '../../../models/MindSession'
import { signToken } from '../../../lib/auth'
import { readTzOffsetFromBodyCompat } from '../../../lib/dayWindow'

const USER_ID = '65f00000000000000000ff31'

/** 9pm on 12 August in New York (EDT). The clock says 01:00 UTC, 13 August. */
const NY_EVENING = new Date('2026-08-13T01:00:00.000Z')
/** `Date.getTimezoneOffset()` in New York in summer: minutes WEST of UTC. */
const NY_OFFSET = 240
/** The day the member is living in when they press Begin. */
const NY_DAY = '2026-08-12'
/** The day the clock is in — what the broken PUT stamped. */
const UTC_DAY = '2026-08-13'

const SEED = 1755046800000
const PLAN = { moves: [{ kind: 'state-check' }, { kind: 'breath' }] }

let auth: string

before(async () => {
  process.env.JWT_SECRET ||= 'become-unit-test-secret'
  await mongoose.connect(
    process.env.MONGODB_URI ?? 'mongodb://127.0.0.1:27017/become-test',
  )
  auth = `Bearer ${await signToken({ userId: USER_ID, email: 'evening@example.com' })}`
})

after(async () => {
  mock.timers.reset()
  await MindProgress.deleteMany({ userId: USER_ID })
  await MindSession.deleteMany({ userId: USER_ID })
  await mongoose.disconnect()
})

beforeEach(async () => {
  mock.timers.reset()
  await MindProgress.deleteMany({ userId: USER_ID })
  await MindSession.deleteMany({ userId: USER_ID })
})

/** Freeze only `Date` — the driver's own timers stay real. */
function atUtc(when: Date) {
  mock.timers.enable({ apis: ['Date'], now: when })
}

function putReq(body: unknown) {
  return new NextRequest('http://localhost/api/mind/session', {
    method: 'PUT',
    headers: new Headers({ 'Content-Type': 'application/json', Authorization: auth }),
    body: JSON.stringify(body),
  })
}

function getReq(tz: number) {
  return new NextRequest(`http://localhost/api/mind/session?tz=${tz}`, {
    headers: new Headers({ Authorization: auth }),
  })
}

/** What the PUT actually filed the session under, read straight from the row. */
async function storedDateKey(): Promise<string | undefined> {
  const doc = await MindProgress.findOne({ userId: USER_ID })
    .select('activeSession.dateKey')
    .lean<{ activeSession?: { dateKey: string } } | null>()
  return doc?.activeSession?.dateKey
}

// ─── The reported journey ────────────────────────────────────────────────────

test('9pm in New York: the session begun is the session offered when the tab is reopened', async () => {
  atUtc(NY_EVENING)
  const put = await PUT(putReq({ seed: SEED, plan: PLAN, tz: NY_OFFSET }))
  mock.timers.reset()

  assert.equal(put.status, 200)
  const putBody = await put.json()
  assert.equal(putBody.dateKey, NY_DAY, 'the PUT must stamp the MEMBER\'s day, not the clock\'s')
  assert.equal(await storedDateKey(), NY_DAY)

  // Twenty minutes later, same evening, the member reopens the Mind tab.
  atUtc(new Date(NY_EVENING.getTime() + 20 * 60_000))
  const get = await GET(getReq(NY_OFFSET))
  mock.timers.reset()

  assert.equal(get.status, 200)
  const body = await get.json()
  assert.equal(body.dateKey, NY_DAY)
  assert.equal(body.resumeDropped, null, 'nothing about this session has gone stale')
  assert.ok(body.resume, 'the unfinished session must be offered again')
  assert.equal(body.resume.seed, SEED)
  assert.deepEqual(body.resume.plan, PLAN)
})

test('a PUT carrying only the old `tzOffset` spelling still stores the local date', async () => {
  // A browser running the bundle from before this fix. Its session is still the
  // member's, so it is still filed under the member's day.
  atUtc(NY_EVENING)
  const put = await PUT(putReq({ seed: SEED, plan: PLAN, tzOffset: NY_OFFSET }))
  mock.timers.reset()

  assert.equal(put.status, 200)
  assert.equal((await put.json()).dateKey, NY_DAY)
  assert.equal(await storedDateKey(), NY_DAY)

  atUtc(NY_EVENING)
  const body = await (await GET(getReq(NY_OFFSET))).json()
  mock.timers.reset()
  assert.equal(body.resumeDropped, null)
  assert.ok(body.resume)
  assert.equal(body.resume.seed, SEED)
})

test('`tz` wins when a client sends both', async () => {
  atUtc(NY_EVENING)
  const put = await PUT(putReq({ seed: SEED, plan: PLAN, tz: NY_OFFSET, tzOffset: 0 }))
  mock.timers.reset()
  assert.equal((await put.json()).dateKey, NY_DAY)
})

// ─── The mechanism that lost it ──────────────────────────────────────────────

test('a PUT with no offset at all is still dated UTC, and the GET still drops it', async () => {
  // Not a regression to fix — a client that tells us nothing gets UTC, exactly
  // as every other date-scoped route treats a missing `tz`. It is here because
  // it is the failure the two tests above rule out: this is what the web did.
  atUtc(NY_EVENING)
  const put = await PUT(putReq({ seed: SEED, plan: PLAN }))
  mock.timers.reset()
  assert.equal((await put.json()).dateKey, UTC_DAY)

  atUtc(NY_EVENING)
  const body = await (await GET(getReq(NY_OFFSET))).json()
  mock.timers.reset()
  assert.equal(body.resume, null)
  assert.equal(body.resumeDropped, 'new_day')
})

// ─── The rule that travels ───────────────────────────────────────────────────

test('PUT and GET compute the day key from the same numeric offset', async () => {
  // Native will send the same `tz` to the same route. The contract is not "the
  // web happens to agree with the server"; it is that one number, the minutes
  // west of UTC, decides the day on both sides of the round trip.
  atUtc(NY_EVENING)
  await PUT(putReq({ seed: SEED, plan: PLAN, tz: NY_OFFSET }))
  const stored = await storedDateKey()
  const get = await (await GET(getReq(NY_OFFSET))).json()
  mock.timers.reset()
  assert.equal(stored, get.dateKey)
})

test('the web sends the spelling the route reads', () => {
  // The other half of the bug, and the half no route test can see: the route
  // was right about `tz` all along, the Begin button was the one sending
  // `tzOffset`. The fallback above forgives an old bundle; it must not become
  // the way the current one works.
  const src = readFileSync(
    path.resolve(__dirname, '../../../components/mind/MindJourney.tsx'),
    'utf8',
  )
  const put = /fetch\('\/api\/mind\/session',\s*\{[\s\S]*?\}\)/.exec(src)?.[0] ?? ''
  assert.match(put, /method:\s*'PUT'/, 'expected to find the PUT that stores the session')
  // The literal that is actually sent — the prose around it is free to name
  // the old spelling, the request body is not.
  const body = /body:\s*JSON\.stringify\((\{[^}]*\})\)/.exec(put)?.[1] ?? ''
  assert.match(body, /\btz:\s*new Date\(\)\.getTimezoneOffset\(\)/)
  assert.doesNotMatch(body, /\btzOffset\b/)
})

test('the body reader: `tz` first, numeric `tzOffset` second, anything else is UTC', () => {
  assert.equal(readTzOffsetFromBodyCompat({ tz: NY_OFFSET }), NY_OFFSET)
  assert.equal(readTzOffsetFromBodyCompat({ tzOffset: NY_OFFSET }), NY_OFFSET)
  assert.equal(readTzOffsetFromBodyCompat({ tz: 0, tzOffset: NY_OFFSET }), 0, 'a real 0 is UTC, not "missing"')
  assert.equal(readTzOffsetFromBodyCompat({ tz: -60 }), -60, 'east of UTC is negative')
  // A string is not a number: `tz=240` off a query string never means 240 here.
  assert.equal(readTzOffsetFromBodyCompat({ tzOffset: '240' }), 0)
  assert.equal(readTzOffsetFromBodyCompat({ tzOffset: Number.NaN }), 0)
  assert.equal(readTzOffsetFromBodyCompat({}), 0)
  assert.equal(readTzOffsetFromBodyCompat(null), 0)
  // Clamped to ±14h, same as every other reader in lib/dayWindow.
  assert.equal(readTzOffsetFromBodyCompat({ tzOffset: 5000 }), 840)
  assert.equal(readTzOffsetFromBodyCompat({ tzOffset: -5000 }), -840)
})
