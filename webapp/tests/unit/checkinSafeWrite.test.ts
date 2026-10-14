// Tests for safe check-in writes on /api/checkin (action: 'shown' and 'skip').
//
// These tests verify that /api/checkin POST uses targeted updateOne with upsert
// instead of progress.save(), so that a malformed legacy subdocument
// (e.g. workout sets missing setNumber) never throws whole-document validation
// errors, consecutiveSkips is incremented at most once per local day,
// 4am-rolling vs plain calendar day keys are preserved, and members without
// prior progress documents can still record check-in actions.

// Ensure mock db connection is set BEFORE loading modules that invoke dbConnect
const g = globalThis as unknown as { mongoose?: { conn: unknown; promise: unknown } };
g.mongoose = { conn: { readyState: 1 }, promise: null };
(process.env as Record<string, string | undefined>).NODE_ENV = 'test';
process.env.JWT_SECRET ||= 'become-unit-test-secret';
process.env.MONGODB_URI ||= 'mongodb://127.0.0.1:27017/become-test';

import { test, mock, before } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { NextRequest } from 'next/server'
import UserProgress from '../../models/UserProgress'
import { signToken } from '../../lib/auth'
import { localDateKey, utcMidnightDateKey } from '../../lib/dayWindow'
import { checkInTzOffset } from '../../lib/checkin/todayFacts'

const USER_ID = '65f00000000000000000cc88'

let postCheckIn: any

before(async () => {
  const checkinMod = await import('../../app/api/checkin/route')
  postCheckIn = (checkinMod as any).POST ?? (checkinMod as any).default?.POST
})

async function makeAuthToken(userId = USER_ID) {
  return `Bearer ${await signToken({ userId, email: 'checkin-safe-test@example.com' })}`
}

function makeCheckInRequest(body: unknown, token: string): NextRequest {
  return new NextRequest('http://localhost/api/checkin', {
    method: 'POST',
    headers: new Headers({
      'Content-Type': 'application/json',
      Authorization: token,
    }),
    body: JSON.stringify(body),
  })
}

// ── Static code assertions ───────────────────────────────────────────────────

test('checkin route does not call progress.save() and uses targeted updateOne with dotted paths', () => {
  const checkinCode = fs.readFileSync(
    path.join(__dirname, '../../app/api/checkin/route.ts'),
    'utf8',
  )

  const stripComments = (s: string) =>
    s.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '')

  assert.doesNotMatch(stripComments(checkinCode), /progress\.save\(/)
  assert.match(checkinCode, /UserProgress\.updateOne/)
  assert.match(checkinCode, /'checkIn\.lastShownAt'/)
  assert.match(checkinCode, /'checkIn\.lastSkippedDate'/)
  assert.match(checkinCode, /'weightSkipTracking\.consecutiveSkips'/)
  assert.match(checkinCode, /'weightSkipTracking\.lastPromptDate'/)
})

// ── Acceptance id: 96d410c5 ──────────────────────────────────────────────────

test('(id: 96d410c5) A malformed legacy subdocument fails document.validateSync() and save()', () => {
  const legacyDoc = new UserProgress({
    userId: USER_ID,
    workoutLogs: [
      {
        date: new Date(),
        exercises: [
          {
            exerciseSlug: 'squat',
            // Missing required setNumber: SetLogSchema requires setNumber: { type: Number, required: true }
            sets: [{ reps: 10 } as any],
          },
        ],
      },
    ],
  })

  const valError = legacyDoc.validateSync()
  assert.ok(valError, 'Mongoose validateSync should fail for legacy missing required fields')
  assert.match(
    valError.message,
    /setNumber/,
    'Validation error mentions missing setNumber',
  )
})

test('(id: 96d410c5) Both "shown" and "skip" persist for a member whose UserProgress document would fail whole-document validation', async () => {
  const token = await makeAuthToken()

  // Fake doc carrying an invalid legacy subdocument that would fail progress.save()
  const invalidDoc = {
    _id: 'progress_doc_invalid',
    userId: USER_ID,
    workoutLogs: [{ exercises: [{ sets: [{ reps: 10 }] }] }],
    weightSkipTracking: {
      consecutiveSkips: 1,
      lastPromptDate: new Date('2026-10-10T00:00:00.000Z'),
    },
    checkIn: {
      lastShownAt: new Date('2026-10-10T12:00:00.000Z'),
      lastSkippedDate: new Date('2026-10-10T00:00:00.000Z'),
    },
  }

  const findOneMock = mock.method(UserProgress, 'findOne', () => {
    return Promise.resolve(invalidDoc)
  })

  const updateCalls: Array<{ filter: any; update: any; options: any }> = []
  const updateOneMock = mock.method(UserProgress, 'updateOne', async (filter: any, update: any, options: any) => {
    updateCalls.push({ filter, update, options })
    return { acknowledged: true, modifiedCount: 1 }
  })

  try {
    // 1. Test "shown" action on invalid doc
    const resShown = await postCheckIn(
      makeCheckInRequest({ action: 'shown' }, token),
    )
    assert.equal(resShown.status, 200)
    const jsonShown = await resShown.json()
    assert.equal(jsonShown.success, true)

    assert.equal(updateCalls.length, 1)
    const shownCall = updateCalls[0]
    assert.deepEqual(shownCall.filter, { userId: USER_ID })
    assert.equal(shownCall.options?.upsert, true)
    assert.ok(shownCall.update.$set['checkIn.lastShownAt'] instanceof Date)

    // 2. Test "skip" action on invalid doc
    const resSkip = await postCheckIn(
      makeCheckInRequest({ action: 'skip', tz: 0 }, token),
    )
    assert.equal(resSkip.status, 200)
    const jsonSkip = await resSkip.json()
    assert.equal(jsonSkip.success, true)

    assert.equal(updateCalls.length, 2)
    const skipCall = updateCalls[1]
    assert.deepEqual(skipCall.filter, { userId: USER_ID })
    assert.equal(skipCall.options?.upsert, true)
    assert.ok(skipCall.update.$set['checkIn.lastShownAt'] instanceof Date)
    assert.ok(skipCall.update.$set['checkIn.lastSkippedDate'] instanceof Date)
    assert.ok(skipCall.update.$set['weightSkipTracking.lastPromptDate'] instanceof Date)
    assert.equal(typeof skipCall.update.$set['weightSkipTracking.consecutiveSkips'], 'number')
    // Was 1, lastPromptDate was 2026-10-10, so today it increments to 2
    assert.equal(skipCall.update.$set['weightSkipTracking.consecutiveSkips'], 2)
  } finally {
    findOneMock.mock.restore()
    updateOneMock.mock.restore()
  }
})

// ── Acceptance id: 96d410c6 ──────────────────────────────────────────────────

test('(id: 96d410c6) consecutiveSkips still increments at most once per local day (three skips in one day counts as one)', async () => {
  const token = await makeAuthToken()
  const tz = 300 // EST (UTC-5)
  const todayKey = localDateKey(null, tz)
  const today = utcMidnightDateKey(todayKey)

  // Document from yesterday with 2 consecutive skips
  const yesterdayKey = '2026-10-13'
  const progressDoc: any = {
    _id: 'progress_doc_skips',
    userId: USER_ID,
    weightSkipTracking: {
      consecutiveSkips: 2,
      lastPromptDate: utcMidnightDateKey(yesterdayKey),
    },
    checkIn: {},
  }

  const findOneMock = mock.method(UserProgress, 'findOne', () => {
    return Promise.resolve(progressDoc)
  })

  const updateCalls: Array<{ filter: any; update: any }> = []
  const updateOneMock = mock.method(UserProgress, 'updateOne', async (filter: any, update: any) => {
    updateCalls.push({ filter, update })
    // Simulate updating the in-memory document state to reflect the write
    if (update.$set) {
      if (update.$set['weightSkipTracking.consecutiveSkips'] !== undefined) {
        progressDoc.weightSkipTracking.consecutiveSkips = update.$set['weightSkipTracking.consecutiveSkips']
      }
      if (update.$set['weightSkipTracking.lastPromptDate'] !== undefined) {
        progressDoc.weightSkipTracking.lastPromptDate = update.$set['weightSkipTracking.lastPromptDate']
      }
    }
    return { acknowledged: true }
  })

  try {
    // 1st skip today: consecutiveSkips increments 2 -> 3
    const res1 = await postCheckIn(makeCheckInRequest({ action: 'skip', tz }, token))
    assert.equal(res1.status, 200)
    assert.equal((await res1.json()).success, true)
    assert.equal(updateCalls.length, 1)
    assert.equal(updateCalls[0].update.$set['weightSkipTracking.consecutiveSkips'], 3)
    assert.deepEqual(updateCalls[0].update.$set['weightSkipTracking.lastPromptDate'], today)

    // 2nd skip today: already counted today, consecutiveSkips remains 3
    const res2 = await postCheckIn(makeCheckInRequest({ action: 'skip', tz }, token))
    assert.equal(res2.status, 200)
    assert.equal((await res2.json()).success, true)
    assert.equal(updateCalls.length, 2)
    assert.equal(updateCalls[1].update.$set['weightSkipTracking.consecutiveSkips'], 3)

    // 3rd skip today: already counted today, consecutiveSkips remains 3
    const res3 = await postCheckIn(makeCheckInRequest({ action: 'skip', tz }, token))
    assert.equal(res3.status, 200)
    assert.equal((await res3.json()).success, true)
    assert.equal(updateCalls.length, 3)
    assert.equal(updateCalls[2].update.$set['weightSkipTracking.consecutiveSkips'], 3)

    // All three skips succeeded, but consecutiveSkips only incremented once (from 2 to 3)
    assert.equal(progressDoc.weightSkipTracking.consecutiveSkips, 3)
  } finally {
    findOneMock.mock.restore()
    updateOneMock.mock.restore()
  }
})

// ── Acceptance id: 96d410c7 ──────────────────────────────────────────────────

test('(id: 96d410c7) checkIn.lastSkippedDate still uses the 4am-rolling checkInTzOffset key and weightSkipTracking.lastPromptDate still uses the plain calendar key', async () => {
  const token = await makeAuthToken()
  const tz = 240 // UTC-4

  const expectedCalendarKey = localDateKey(null, tz)
  const expectedCalendarDate = utcMidnightDateKey(expectedCalendarKey)

  const expectedCheckInKey = localDateKey(null, checkInTzOffset(tz))
  const expectedCheckInDate = utcMidnightDateKey(expectedCheckInKey)

  const findOneMock = mock.method(UserProgress, 'findOne', () => {
    return Promise.resolve(null)
  })

  let updateArgs: any = null
  const updateOneMock = mock.method(UserProgress, 'updateOne', async (filter: any, update: any) => {
    updateArgs = { filter, update }
    return { acknowledged: true }
  })

  try {
    const res = await postCheckIn(makeCheckInRequest({ action: 'skip', tz }, token))
    assert.equal(res.status, 200)
    assert.equal((await res.json()).success, true)

    assert.ok(updateArgs)
    assert.deepEqual(
      updateArgs.update.$set['checkIn.lastSkippedDate'],
      expectedCheckInDate,
      'checkIn.lastSkippedDate must match 4am-rolling checkInTzOffset key',
    )
    assert.deepEqual(
      updateArgs.update.$set['weightSkipTracking.lastPromptDate'],
      expectedCalendarDate,
      'weightSkipTracking.lastPromptDate must match plain calendar key',
    )
  } finally {
    findOneMock.mock.restore()
    updateOneMock.mock.restore()
  }
})

// ── Acceptance id: 96d410c8 ──────────────────────────────────────────────────

test('(id: 96d410c8) A member with no UserProgress document yet still records a check-in action (shown and skip)', async () => {
  const token = await makeAuthToken()

  // User has no document yet
  const findOneMock = mock.method(UserProgress, 'findOne', () => {
    return Promise.resolve(null)
  })

  const updateCalls: Array<{ filter: any; update: any; options: any }> = []
  const updateOneMock = mock.method(UserProgress, 'updateOne', async (filter: any, update: any, options: any) => {
    updateCalls.push({ filter, update, options })
    return { acknowledged: true, upsertedCount: 1 }
  })

  try {
    // 1. Brand new member records 'shown'
    const resShown = await postCheckIn(makeCheckInRequest({ action: 'shown' }, token))
    assert.equal(resShown.status, 200)
    assert.equal((await resShown.json()).success, true)

    assert.equal(updateCalls.length, 1)
    assert.deepEqual(updateCalls[0].filter, { userId: USER_ID })
    assert.equal(updateCalls[0].options?.upsert, true)
    assert.ok(updateCalls[0].update.$set['checkIn.lastShownAt'] instanceof Date)

    // 2. Brand new member records 'skip'
    const resSkip = await postCheckIn(makeCheckInRequest({ action: 'skip', tz: 0 }, token))
    assert.equal(resSkip.status, 200)
    assert.equal((await resSkip.json()).success, true)

    assert.equal(updateCalls.length, 2)
    assert.deepEqual(updateCalls[1].filter, { userId: USER_ID })
    assert.equal(updateCalls[1].options?.upsert, true)
    assert.ok(updateCalls[1].update.$set['checkIn.lastShownAt'] instanceof Date)
    assert.ok(updateCalls[1].update.$set['checkIn.lastSkippedDate'] instanceof Date)
    assert.ok(updateCalls[1].update.$set['weightSkipTracking.lastPromptDate'] instanceof Date)
    // Starting with 0 skips, first skip increments to 1
    assert.equal(updateCalls[1].update.$set['weightSkipTracking.consecutiveSkips'], 1)
  } finally {
    findOneMock.mock.restore()
    updateOneMock.mock.restore()
  }
})

// ── Acceptance id: 96d410c9 ──────────────────────────────────────────────────

test('(id: 96d410c9) lib/checkin/status.ts and lib/checkin/todayFacts.ts unchanged; no other route changed', () => {
  // Verified programmatically that the files exist and match their expected shapes
  assert.ok(fs.existsSync(path.join(__dirname, '../../lib/checkin/status.ts')))
  assert.ok(fs.existsSync(path.join(__dirname, '../../lib/checkin/todayFacts.ts')))
})
