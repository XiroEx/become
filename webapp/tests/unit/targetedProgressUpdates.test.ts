//
// Tests for targeted updates on /api/mood and /api/program-nudge.
//
// These tests verify that neither route validates the whole UserProgress document
// via progress.save(), so malformed legacy subdocuments (e.g. workout sets missing
// setNumber) never block writing mood or program-nudge state.
//

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

const USER_ID = '65f00000000000000000ff99'
// Yesterday (UTC), not a fixed day: the mood route rejects backdated logs past its window, so a
// literal date here made these tests start failing a week after they were written.
const MOOD_DAY = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().slice(0, 10)

let postMood: any
let postNudge: any

before(async () => {
  const moodMod = await import('../../app/api/mood/route')
  postMood = (moodMod as any).POST ?? (moodMod as any).default?.POST

  const nudgeMod = await import('../../app/api/program-nudge/route')
  postNudge = (nudgeMod as any).POST ?? (nudgeMod as any).default?.POST
})

async function makeAuthToken(userId = USER_ID) {
  return `Bearer ${await signToken({ userId, email: 'targeted-test@example.com' })}`
}

function makeMoodRequest(body: unknown, token: string): NextRequest {
  return new NextRequest('http://localhost/api/mood', {
    method: 'POST',
    headers: new Headers({
      'Content-Type': 'application/json',
      Authorization: token,
    }),
    body: JSON.stringify(body),
  })
}

function makeNudgeRequest(body: unknown, token: string): NextRequest {
  return new NextRequest('http://localhost/api/program-nudge', {
    method: 'POST',
    headers: new Headers({
      'Content-Type': 'application/json',
      Authorization: token,
    }),
    body: JSON.stringify(body),
  })
}

// ── Static code assertions (acceptance id: 96d41071) ──────────────────────────

test('(id: 96d41071) Neither /api/mood nor /api/program-nudge calls progress.save()', () => {
  const moodCode = fs.readFileSync(
    path.join(__dirname, '../../app/api/mood/route.ts'),
    'utf8',
  )
  const nudgeCode = fs.readFileSync(
    path.join(__dirname, '../../app/api/program-nudge/route.ts'),
    'utf8',
  )

  const stripComments = (s: string) =>
    s.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '')

  assert.doesNotMatch(stripComments(moodCode), /progress\.save\(/)
  assert.doesNotMatch(stripComments(nudgeCode), /progress\.save\(/)
  assert.match(moodCode, /UserProgress\.updateOne/)
  assert.match(nudgeCode, /UserProgress\.updateOne/)
})

// ── Evidence that legacy subdocument validation breaks save() but not updateOne() (acceptance id: 96d41075) ──

test('(id: 96d41075) A malformed legacy subdocument fails document.validateSync() and save()', () => {
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

// ── Mood Route tests (acceptance id: 96d41071, 96d41072, 96d41073, 96d41075, 96d41076) ──

test('(id: 96d41072, 96d41075) Mood: initial log on a day pushes new entry and moodChangeHistory without validating whole document', async () => {
  const token = await makeAuthToken()

  // Loaded document carrying an invalid legacy subdocument
  const fakeDoc = {
    _id: 'progress_doc_1',
    userId: USER_ID,
    workoutLogs: [{ date: new Date(), exercises: [{ sets: [{ reps: 10 }] }] }],
    moodHistory: [] as any[],
    moodChangeHistory: [] as any[],
  }

  const findOneMock = mock.method(UserProgress, 'findOne', () => {
    return Promise.resolve(fakeDoc)
  })

  let moodUpdateArgs: any = null
  const updateOneMock = mock.method(UserProgress, 'updateOne', async (filter: any, update: any) => {
    if (filter._id === 'progress_doc_1') {
      moodUpdateArgs = { filter, update }
    }
    return { acknowledged: true, modifiedCount: 1 }
  })

  try {
    const res = await postMood(
      makeMoodRequest({ mood: 4, date: MOOD_DAY }, token),
    )
    assert.equal(res.status, 200)
    const json = await res.json()
    assert.equal(json.success, true)
    assert.equal(json.mood, 4)
    assert.equal(json.applied, true)
    assert.equal(json.date, MOOD_DAY)

    assert.ok(moodUpdateArgs, 'UserProgress.updateOne must be called for progress_doc_1')
    assert.deepEqual(moodUpdateArgs.filter, { _id: 'progress_doc_1' })
    // Should be $push on moodHistory and moodChangeHistory
    assert.ok(moodUpdateArgs.update.$push)
    assert.equal(moodUpdateArgs.update.$push.moodHistory.mood, 4)
    assert.equal(moodUpdateArgs.update.$push.moodChangeHistory.newMood, 4)
    assert.equal(moodUpdateArgs.update.$push.moodChangeHistory.previousMood, null)
  } finally {
    findOneMock.mock.restore()
    updateOneMock.mock.restore()
  }
})

test('(id: 96d41072) Mood: a second log on the same local day UPDATES that day\'s entry via $set rather than pushing a duplicate', async () => {
  const token = await makeAuthToken()

  const firstLoggedAt = new Date(`${MOOD_DAY}T10:00:00.000Z`)
  const secondLoggedAt = `${MOOD_DAY}T14:00:00.000Z`

  const fakeDoc = {
    _id: 'progress_doc_1',
    userId: USER_ID,
    workoutLogs: [{ sets: [{ reps: 5 }] }], // legacy invalid
    moodHistory: [
      {
        date: new Date(`${MOOD_DAY}T00:00:00.000Z`),
        loggedAt: firstLoggedAt,
        mood: 3,
      },
    ],
    moodChangeHistory: [
      {
        timestamp: firstLoggedAt,
        date: new Date(`${MOOD_DAY}T00:00:00.000Z`),
        previousMood: null,
        newMood: 3,
      },
    ],
  }

  const findOneMock = mock.method(UserProgress, 'findOne', () => {
    return Promise.resolve(fakeDoc)
  })

  let moodUpdateArgs: any = null
  const updateOneMock = mock.method(UserProgress, 'updateOne', async (filter: any, update: any) => {
    if (filter._id === 'progress_doc_1') {
      moodUpdateArgs = { filter, update }
    }
    return { acknowledged: true, modifiedCount: 1 }
  })

  try {
    const res = await postMood(
      makeMoodRequest(
        { mood: 5, date: MOOD_DAY, loggedAt: secondLoggedAt },
        token,
      ),
    )
    assert.equal(res.status, 200)
    const json = await res.json()
    assert.equal(json.success, true)
    assert.equal(json.mood, 5)
    assert.equal(json.applied, true)

    assert.ok(moodUpdateArgs)
    assert.deepEqual(moodUpdateArgs.filter, { _id: 'progress_doc_1' })
    // Must update index 0 via $set, not push duplicate to moodHistory
    assert.equal(moodUpdateArgs.update.$set['moodHistory.0.mood'], 5)
    assert.equal(
      new Date(moodUpdateArgs.update.$set['moodHistory.0.loggedAt']).toISOString(),
      secondLoggedAt,
    )
    // moodChangeHistory is pushed
    assert.equal(moodUpdateArgs.update.$push.moodChangeHistory.newMood, 5)
    assert.equal(moodUpdateArgs.update.$push.moodChangeHistory.previousMood, 3)
  } finally {
    findOneMock.mock.restore()
    updateOneMock.mock.restore()
  }
})

test('(id: 96d41073) Mood: a stale replay (older loggedAt) loses, returns applied:false, and performs no mood DB write', async () => {
  const token = await makeAuthToken()

  const storedLoggedAt = new Date(`${MOOD_DAY}T14:00:00.000Z`)
  const olderLoggedAt = `${MOOD_DAY}T10:00:00.000Z`

  const fakeDoc = {
    _id: 'progress_doc_1',
    userId: USER_ID,
    moodHistory: [
      {
        date: new Date(`${MOOD_DAY}T00:00:00.000Z`),
        loggedAt: storedLoggedAt,
        mood: 4,
      },
    ],
    moodChangeHistory: [],
  }

  const findOneMock = mock.method(UserProgress, 'findOne', () => {
    return Promise.resolve(fakeDoc)
  })

  let moodUpdateCalled = false
  const updateOneMock = mock.method(UserProgress, 'updateOne', async (filter: any) => {
    if (filter._id === 'progress_doc_1') {
      moodUpdateCalled = true
    }
    return { acknowledged: true }
  })

  try {
    const res = await postMood(
      makeMoodRequest(
        { mood: 2, date: MOOD_DAY, loggedAt: olderLoggedAt },
        token,
      ),
    )
    assert.equal(res.status, 200)
    const json = await res.json()
    assert.equal(json.success, true)
    assert.equal(json.mood, 4) // retains previously stored mood
    assert.equal(json.applied, false)
    assert.equal(moodUpdateCalled, false, 'Stale replay should not write mood to DB')
  } finally {
    findOneMock.mock.restore()
    updateOneMock.mock.restore()
  }
})

test('(id: 96d41073, 96d41076) Mood: backdated mood credits no streak day (streak is omitted from response)', async () => {
  const token = await makeAuthToken()

  const fakeDoc = {
    _id: 'progress_doc_1',
    userId: USER_ID,
    moodHistory: [],
    moodChangeHistory: [],
  }

  const findOneMock = mock.method(UserProgress, 'findOne', () => {
    return Promise.resolve(fakeDoc)
  })

  const updateOneMock = mock.method(UserProgress, 'updateOne', async () => {
    return { acknowledged: true }
  })

  try {
    // 3 days ago
    const pastDate = new Date(Date.now() - 3 * 86400000).toISOString().slice(0, 10)
    const res = await postMood(
      makeMoodRequest({ mood: 3, date: pastDate }, token),
    )
    assert.equal(res.status, 200)
    const json = await res.json()
    assert.equal(json.applied, true)
    assert.equal(json.streak, undefined, 'Backdated mood must credit no streak day')
  } finally {
    findOneMock.mock.restore()
    updateOneMock.mock.restore()
  }
})

// ── Program Nudge Route tests (acceptance id: 96d41071, 96d41074, 96d41075) ──

test('(id: 96d41074, 96d41075) program-nudge: shown action updates shownCount with targeted updateOne on invalid document', async () => {
  const token = await makeAuthToken()

  const fakeDoc = {
    _id: 'progress_doc_nudge',
    userId: USER_ID,
    workoutLogs: [{ exercises: [{ sets: [{}] }] }], // legacy invalid
    programNudge: {
      dismissCount: 0,
      shownCount: 0,
    },
    currentProgram: null,
  }

  const findOneMock = mock.method(UserProgress, 'findOne', () => {
    return Promise.resolve(fakeDoc)
  })

  let updateArgs: any = null
  const updateOneMock = mock.method(UserProgress, 'updateOne', async (filter: any, update: any) => {
    updateArgs = { filter, update }
    return { acknowledged: true }
  })

  try {
    const res = await postNudge(makeNudgeRequest({ action: 'shown' }, token))
    assert.equal(res.status, 200)
    const json = await res.json()
    assert.equal(json.showings, 1)

    assert.ok(updateArgs)
    assert.deepEqual(updateArgs.filter, { _id: 'progress_doc_nudge' })
    assert.equal(updateArgs.update.$set.programNudge.shownCount, 1)
    assert.ok(updateArgs.update.$set.programNudge.lastShownAt)
  } finally {
    findOneMock.mock.restore()
    updateOneMock.mock.restore()
  }
})

test('(id: 96d41074) program-nudge: dismiss action updates dismissCount', async () => {
  const token = await makeAuthToken()

  const fakeDoc = {
    _id: 'progress_doc_nudge',
    userId: USER_ID,
    programNudge: {
      dismissCount: 1,
      shownCount: 2,
      lastDismissedAt: new Date(),
    },
    currentProgram: null,
  }

  const findOneMock = mock.method(UserProgress, 'findOne', () => {
    return Promise.resolve(fakeDoc)
  })

  let updateArgs: any = null
  const updateOneMock = mock.method(UserProgress, 'updateOne', async (filter: any, update: any) => {
    updateArgs = { filter, update }
    return { acknowledged: true }
  })

  try {
    const res = await postNudge(makeNudgeRequest({ action: 'dismiss' }, token))
    assert.equal(res.status, 200)
    const json = await res.json()
    assert.equal(json.dismissCount, 2)

    assert.ok(updateArgs)
    assert.equal(updateArgs.update.$set.programNudge.dismissCount, 2)
    assert.ok(updateArgs.update.$set.programNudge.lastDismissedAt)
  } finally {
    findOneMock.mock.restore()
    updateOneMock.mock.restore()
  }
})

test('(id: 96d41074) program-nudge: dismiss_forever sets dontShowAgain, and once set it is never cleared', async () => {
  const token = await makeAuthToken()

  const fakeDoc = {
    _id: 'progress_doc_nudge',
    userId: USER_ID,
    programNudge: {
      dismissCount: 2,
      shownCount: 2,
      lastDismissedAt: new Date(),
    },
    currentProgram: null,
  }

  const findOneMock = mock.method(UserProgress, 'findOne', () => {
    return Promise.resolve(fakeDoc)
  })

  let updateArgs: any = null
  const updateOneMock = mock.method(UserProgress, 'updateOne', async (filter: any, update: any) => {
    updateArgs = { filter, update }
    return { acknowledged: true }
  })

  try {
    // 1. dismiss_forever
    const res1 = await postNudge(
      makeNudgeRequest({ action: 'dismiss_forever' }, token),
    )
    assert.equal(res1.status, 200)
    const json1 = await res1.json()
    assert.equal(json1.dontShowAgain, true)
    assert.equal(updateArgs.update.$set.programNudge.dontShowAgain, true)

    // 2. subsequent shown action does NOT clear dontShowAgain
    fakeDoc.programNudge = updateArgs.update.$set.programNudge
    const res2 = await postNudge(makeNudgeRequest({ action: 'shown' }, token))
    assert.equal(res2.status, 200)
    const json2 = await res2.json()
    assert.equal(json2.dontShowAgain, true, 'dontShowAgain must not be cleared by shown action')
    assert.equal(updateArgs.update.$set.programNudge.dontShowAgain, true)
  } finally {
    findOneMock.mock.restore()
    updateOneMock.mock.restore()
  }
})

test('(id: 96d41074) program-nudge: adopt-only-when-no-server-state rule is respected', async () => {
  const token = await makeAuthToken()

  // Case 1: Server already has state -> adopt is refused (adopted: false)
  const docWithServerState = {
    _id: 'progress_doc_nudge',
    userId: USER_ID,
    programNudge: {
      dismissCount: 1,
      lastDismissedAt: new Date(),
    },
    currentProgram: null,
  }

  const findOneMock1 = mock.method(UserProgress, 'findOne', () => {
    return Promise.resolve(docWithServerState)
  })

  let updateCalled = false
  const updateOneMock1 = mock.method(UserProgress, 'updateOne', async () => {
    updateCalled = true
    return { acknowledged: true }
  })

  try {
    const res = await postNudge(
      makeNudgeRequest({ action: 'adopt', dismissCount: 5 }, token),
    )
    assert.equal(res.status, 200)
    const json = await res.json()
    assert.equal(json.adopted, false)
    assert.equal(updateCalled, false, 'Should not write when server already has state')
  } finally {
    findOneMock1.mock.restore()
    updateOneMock1.mock.restore()
  }

  // Case 2: Server has no state -> adopt succeeds (adopted: true)
  const docWithoutServerState = {
    _id: 'progress_doc_nudge_new',
    userId: USER_ID,
    programNudge: {
      dismissCount: 0,
      shownCount: 0,
    },
    currentProgram: null,
  }

  const findOneMock2 = mock.method(UserProgress, 'findOne', () => {
    return Promise.resolve(docWithoutServerState)
  })

  let updateArgs2: any = null
  const updateOneMock2 = mock.method(UserProgress, 'updateOne', async (filter: any, update: any) => {
    updateArgs2 = { filter, update }
    return { acknowledged: true }
  })

  try {
    const res = await postNudge(
      makeNudgeRequest(
        {
          action: 'adopt',
          dismissCount: 1,
          lastDismissedAt: new Date().toISOString(),
        },
        token,
      ),
    )
    assert.equal(res.status, 200)
    const json = await res.json()
    assert.equal(json.adopted, true)
    assert.ok(updateArgs2)
    assert.equal(updateArgs2.update.$set.programNudge.dismissCount, 1)
  } finally {
    findOneMock2.mock.restore()
    updateOneMock2.mock.restore()
  }
})
