// Run with: npm run test:file tests/unit/healthWeightImport.test.ts
//
// A WEIGH-IN THAT CAME FROM APPLE HEALTH / HEALTH CONNECT, NOT FROM THE MEMBER.
//
// `POST /api/weight` knew nothing about where a value came from or whether it
// had already been imported, and (before NP-189) dated every entry from the
// server's clock — so a sample recorded last week landed today, and every sync
// re-offering the same sample wrote it again.
//
// Two rules travel with an import, and both are tested against the REAL route
// handler with the clock pinned and a real (loopback, disposable) database,
// because they live in the interaction between the request, the clock and the
// rows that are already there:
//
//   1. the day comes from the SAMPLE's own local date, never from the time of
//      the import;
//   2. the same sample imported twice is one weigh-in — `externalId` is what
//      recognises it.
//
// Plus the decision the card asked for: an imported weigh-in does NOT credit a
// streak day. The member did nothing in Become.

import { test, before, after, beforeEach, mock } from 'node:test'
import assert from 'node:assert/strict'
import mongoose from 'mongoose'
import { NextRequest } from 'next/server'
import { POST as postWeight, GET as getWeight } from '../../app/api/weight/route'
import UserProgress from '../../models/UserProgress'
import { signToken } from '../../lib/auth'
import {
  HEALTH_IMPORT_BACKDATE_WINDOW_DAYS,
  findEntryByExternalId,
  readHealthImport,
} from '../../lib/healthImport'
import { BACKDATE_WINDOW_DAYS } from '../../lib/dayWindow'

const USER_ID = '65f00000000000000000fa17'

/** 11:00 in New York on 12 August 2026 (EDT). */
const NOW = new Date('2026-08-12T15:00:00.000Z')
/** `Date.getTimezoneOffset()` in New York in summer: minutes WEST of UTC. */
const NY = 240
const TODAY = '2026-08-12'
/** Three days back — the acceptance case. */
const THREE_DAYS_AGO = '2026-08-09'
/** Three weeks back: outside the offline-queue week, inside the import window. */
const THREE_WEEKS_AGO = '2026-07-22'
/** Half a year back: outside the import window too. */
const LONG_AGO = '2026-02-12'

const TODAY_MARKER = '2026-08-12T00:00:00.000Z'
const THREE_DAYS_AGO_MARKER = '2026-08-09T00:00:00.000Z'

let auth: string

before(async () => {
  process.env.JWT_SECRET ||= 'become-unit-test-secret'
  await mongoose.connect(
    process.env.MONGODB_URI ?? 'mongodb://127.0.0.1:27017/become-test',
  )
  auth = `Bearer ${await signToken({ userId: USER_ID, email: 'health@example.com' })}`
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

/** POST /api/weight with the clock pinned to `when`. */
async function postW(body: unknown, when: Date = NOW) {
  atUtc(when)
  try {
    const res = await postWeight(new NextRequest('http://localhost/api/weight', {
      method: 'POST',
      headers: new Headers({ 'Content-Type': 'application/json', Authorization: auth }),
      body: JSON.stringify(body),
    }))
    return { status: res.status, body: await res.json() }
  } finally {
    mock.timers.reset()
  }
}

type StoredWeight = {
  date: Date
  weight: number
  loggedAt?: Date
  source?: string
  externalId?: string
}

async function stored() {
  return UserProgress.findOne({ userId: USER_ID }).lean<{
    weightHistory?: StoredWeight[]
    weightSkipTracking?: { lastPromptDate?: Date; lastWeightDate?: Date; consecutiveSkips?: number }
    lastActivityDate?: Date
    streakDays?: number
  } | null>()
}

const iso = (d: Date | undefined) => (d ? new Date(d).toISOString() : undefined)

/** One HealthKit sample: 181.4 lb, recorded three days ago. */
const SAMPLE = {
  weight: 181.4,
  tz: NY,
  source: 'healthkit' as const,
  externalId: 'HK-1F2E3D4C-5B6A',
  date: THREE_DAYS_AGO,
  loggedAt: '2026-08-09T11:30:00.000Z',
}

// ─── The same sample imported twice is ONE weigh-in ───────────────────────────

test('importing the same sample twice creates one weigh-in', async () => {
  const first = await postW(SAMPLE)
  assert.equal(first.status, 200)
  assert.equal(first.body.applied, true)
  assert.equal(first.body.duplicate, undefined)

  // The next sync offers the same sample again — the usual case, not the edge
  // case: Health hands back the whole window every time.
  const again = await postW(SAMPLE, new Date(NOW.getTime() + 3_600_000))
  assert.equal(again.status, 200, 'a repeat is accepted — there is nothing to retry')
  assert.equal(again.body.applied, false)
  assert.equal(again.body.duplicate, true)

  const doc = await stored()
  assert.equal(doc?.weightHistory?.length, 1, 'one sample, one weigh-in')
  assert.equal(doc?.weightHistory?.[0].weight, 181.4)
  assert.equal(doc?.weightHistory?.[0].externalId, SAMPLE.externalId)
})

test('the repeat is recognised even when the sample is re-offered on another day', async () => {
  await postW(SAMPLE)
  // Same id, same value, delivered a week later by a sync that re-read the
  // window. The id is what says "this one again", not the day it claims.
  const again = await postW(
    { ...SAMPLE, date: TODAY },
    new Date('2026-08-19T15:00:00.000Z'),
  )
  assert.equal(again.body.applied, false)
  assert.equal(again.body.duplicate, true)

  const doc = await stored()
  assert.equal(doc?.weightHistory?.length, 1)
  assert.equal(iso(doc?.weightHistory?.[0].date), THREE_DAYS_AGO_MARKER)
})

test('a repeat does not overwrite a value the member has since corrected by hand', async () => {
  await postW(SAMPLE)

  // The scale was a pound out; the member fixes the day by hand.
  const typed = await postW(
    { weight: 179.2, tz: NY, date: THREE_DAYS_AGO, loggedAt: '2026-08-09T18:00:00.000Z' },
  )
  assert.equal(typed.body.applied, true)

  // The next sync re-offers the sample. It must change nothing.
  const again = await postW(SAMPLE, new Date(NOW.getTime() + 7_200_000))
  assert.equal(again.body.duplicate, true)

  const doc = await stored()
  assert.equal(doc?.weightHistory?.length, 1)
  assert.equal(doc?.weightHistory?.[0].weight, 179.2, 'the member\'s own correction survives')
})

test('two DIFFERENT samples for the same day are still one weigh-in for that day', async () => {
  await postW(SAMPLE)
  // A second sample the same day (a member who steps on the scale twice).
  const second = await postW({
    ...SAMPLE,
    externalId: 'HK-SECOND-SAMPLE',
    weight: 180.6,
    loggedAt: '2026-08-09T19:00:00.000Z',
  })
  assert.equal(second.body.applied, true)
  assert.equal(second.body.duplicate, undefined)

  const doc = await stored()
  assert.equal(doc?.weightHistory?.length, 1, 'one entry per day, as always')
  assert.equal(doc?.weightHistory?.[0].weight, 180.6, 'the later sample wins the day')
  assert.equal(
    doc?.weightHistory?.[0].externalId,
    'HK-SECOND-SAMPLE',
    'the row carries the id of the sample it now holds, so the next sync knows it',
  )
})

// ─── The sample's own day, never the day of the import ──────────────────────

test('a sample from three days ago lands on that day, not today', async () => {
  const res = await postW(SAMPLE)

  assert.equal(res.status, 200)
  assert.equal(res.body.date, THREE_DAYS_AGO)

  const doc = await stored()
  assert.equal(doc?.weightHistory?.length, 1)
  assert.equal(iso(doc?.weightHistory?.[0].date), THREE_DAYS_AGO_MARKER)
  assert.notEqual(iso(doc?.weightHistory?.[0].date), TODAY_MARKER)

  // ...and today is still empty, so the member is still asked for today.
  atUtc(NOW)
  try {
    const check = await getWeight(new NextRequest(`http://localhost/api/weight?tz=${NY}`, {
      headers: new Headers({ Authorization: auth }),
    }))
    const body = await check.json()
    assert.equal(body.needsWeightCheck, true)
    assert.equal(body.daysSinceLastEntry, 3)
  } finally {
    mock.timers.reset()
  }
})

test('the source and the sample id are stored on the entry', async () => {
  await postW({ ...SAMPLE, source: 'health-connect', externalId: 'HC-77' })

  const doc = await stored()
  assert.equal(doc?.weightHistory?.[0].source, 'health-connect')
  assert.equal(doc?.weightHistory?.[0].externalId, 'HC-77')
  assert.equal(iso(doc?.weightHistory?.[0].loggedAt), SAMPLE.loggedAt)
})

test('an import with no date is refused — the import clock may never date a sample', async () => {
  const res = await postW({ weight: 181.4, tz: NY, source: 'healthkit', externalId: 'HK-9' })
  assert.equal(res.status, 400)
  assert.match(res.body.error, /date is required/)
  assert.equal(await stored(), null, 'a refused import must not create a row')
})

// ─── How far back an import may reach ────────────────────────────────────────

test('a sample three weeks old is accepted, though a typed write that old is not', async () => {
  assert.equal(BACKDATE_WINDOW_DAYS, 7)
  assert.equal(HEALTH_IMPORT_BACKDATE_WINDOW_DAYS, 90)

  const typed = await postW({ weight: 190, tz: NY, date: THREE_WEEKS_AGO })
  assert.equal(typed.status, 400, 'the offline queue reaches back a week, no further')
  assert.match(typed.body.error, /7 days old/)

  const sample = await postW({
    ...SAMPLE, date: THREE_WEEKS_AGO, weight: 190, loggedAt: '2026-07-22T11:00:00.000Z',
  })
  assert.equal(sample.status, 200)
  assert.equal(sample.body.date, THREE_WEEKS_AGO)

  const doc = await stored()
  assert.equal(iso(doc?.weightHistory?.[0].date), '2026-07-22T00:00:00.000Z')
})

test('a sample older than the import window is still refused', async () => {
  const res = await postW({ ...SAMPLE, date: LONG_AGO })
  assert.equal(res.status, 400)
  assert.match(res.body.error, /90 days old/)
  assert.equal(await stored(), null)
})

test('a sample dated in the future is refused', async () => {
  const res = await postW({ ...SAMPLE, date: '2026-08-13' })
  assert.equal(res.status, 400)
  assert.match(res.body.error, /future/)
})

// ─── An import is not a thing the member did in Become ───────────────────────

test('an imported sample dated TODAY credits no streak day', async () => {
  const res = await postW({
    ...SAMPLE, date: TODAY, loggedAt: '2026-08-12T14:00:00.000Z',
  })

  assert.equal(res.status, 200)
  assert.equal(res.body.date, TODAY)
  assert.equal(res.body.streak, undefined, 'the member did nothing in Become to earn one')

  const doc = await stored()
  assert.equal(doc?.streakDays ?? 0, 0)
  assert.equal(doc?.lastActivityDate, undefined)
})

test('an imported sample does not answer the weight prompt', async () => {
  await postW({ ...SAMPLE, date: TODAY })

  const doc = await stored()
  // lastPromptDate means "we asked, and they answered". An import is neither.
  assert.equal(doc?.weightSkipTracking?.lastPromptDate, undefined)
  // The value itself is real history, so the newest weigh-in is still recorded.
  assert.equal(iso(doc?.weightSkipTracking?.lastWeightDate), TODAY_MARKER)
})

test('a weigh-in the member typed today still credits the streak', async () => {
  // The guard on imports must not have cost the ordinary case its streak day.
  const res = await postW({ weight: 180.2, tz: NY })
  assert.equal(res.body.date, TODAY)
  assert.ok(res.body.streak, 'a typed weigh-in for today is still activity')
})

// ─── What the route refuses outright ─────────────────────────────────────────

test('an unknown source is refused rather than stored', async () => {
  const res = await postW({ ...SAMPLE, source: 'fitbit' })
  assert.equal(res.status, 400)
  assert.match(res.body.error, /Invalid source/)
  assert.equal(await stored(), null)
})

test('a sample id with no source is refused — it de-duplicates against nothing', async () => {
  const res = await postW({ weight: 181.4, tz: NY, date: TODAY, externalId: 'HK-orphan' })
  assert.equal(res.status, 400)
  assert.match(res.body.error, /externalId requires a source/)
  assert.equal(await stored(), null)
})

test('an import carrying no weight, or a skip, is refused', async () => {
  const noWeight = await postW({ tz: NY, date: TODAY, source: 'healthkit', externalId: 'HK-x' })
  assert.equal(noWeight.status, 400)
  assert.match(noWeight.body.error, /must carry a weight/)

  const asSkip = await postW({ skip: true, tz: NY, date: TODAY, source: 'healthkit' })
  assert.equal(asSkip.status, 400)
  assert.match(asSkip.body.error, /must carry a weight/)
  assert.equal(await stored(), null)
})

// ─── readHealthImport, on its own ────────────────────────────────────────────

test('readHealthImport: no source and no id is an ordinary typed write', () => {
  for (const body of [{}, { weight: 180 }, { source: null }, { source: '', externalId: '' }]) {
    const r = readHealthImport(body)
    assert.equal(r.ok, true)
    assert.equal(r.ok && r.origin, null)
  }
})

test('readHealthImport: both platforms are accepted', () => {
  for (const source of ['healthkit', 'health-connect']) {
    const r = readHealthImport({ source, externalId: 'abc' })
    assert.equal(r.ok, true)
    assert.deepEqual(r.ok && r.origin, { source, externalId: 'abc' })
  }
})

test('readHealthImport: a source with no sample id is allowed (no de-duplication to do)', () => {
  const r = readHealthImport({ source: 'healthkit' })
  assert.equal(r.ok, true)
  assert.deepEqual(r.ok && r.origin, { source: 'healthkit' })
})

test('readHealthImport: anything else is refused', () => {
  for (const body of [{ source: 'fitbit' }, { source: 'HealthKit' }, { source: 7 }]) {
    const r = readHealthImport(body)
    assert.equal(r.ok, false)
    assert.match(!r.ok ? r.error : '', /Invalid source/)
  }

  const orphan = readHealthImport({ externalId: 'abc' })
  assert.equal(orphan.ok, false)

  for (const externalId of [42, { id: 1 }, 'x'.repeat(201)]) {
    const r = readHealthImport({ source: 'healthkit', externalId })
    assert.equal(r.ok, false)
    assert.match(!r.ok ? r.error : '', /Invalid externalId/)
  }
})

test('findEntryByExternalId: matches on the id alone, and never on an absent one', () => {
  const history = [
    { externalId: 'HK-1' },
    {},
    { externalId: 'HC-2' },
  ]
  assert.equal(findEntryByExternalId(history, 'HK-1'), 0)
  assert.equal(findEntryByExternalId(history, 'HC-2'), 2)
  assert.equal(findEntryByExternalId(history, 'HK-nope'), -1)
  assert.equal(findEntryByExternalId(history, ''), -1)
  assert.equal(findEntryByExternalId(undefined, 'HK-1'), -1)
})
