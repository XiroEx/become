// Run with: npx tsx --test tests/unit/allowance/tzCapture.test.ts
//
// THE MEMBER'S TIMEZONE IS A PAYWALL INPUT, AND IT ARRIVES IN A REQUEST BODY.
//
// UserProgress.timezoneOffset keys the local day/week every windowed allowance
// is charged in (lib/allowances.ts#windowTzOffset), and POST /api/workouts
// writes it from `tz` in the body. Two defects lived in this module:
//
//   • ANY number in ±14h was stored, so the field could be steered to whatever
//     local date suited the caller. (The bucket itself is now anchored — see
//     windowAnchor.test.ts — but a value that cannot describe a real place
//     should never have reached the database in the first place.)
//   • The write was an updateOne with NO upsert, and on POST /api/workouts it
//     runs BEFORE the member's UserProgress exists. A new member's FIRST
//     reported offset therefore hit nothing — while the process cache recorded
//     it as done for an hour, so the next 60 minutes of requests skipped it
//     too. Every new member keyed their allowance day (and their morning
//     reminder) to UTC.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import {
  captureUserTimezone,
  resolveCapturedTimezone,
  zoneOffsetMinutes,
  __clearTimezoneCache,
  type CapturedTimezone,
  type TimezoneWriteResult,
} from '../../../lib/captureUserTimezone'

const USER = '65f0000000000000000000aa'

/** A UserProgress that may or may not exist yet, as the writer sees it. */
function fakeWriter(opts: { exists?: boolean; upserts?: boolean; fails?: boolean } = {}) {
  const writes: Array<{ userId: string; patch: CapturedTimezone }> = []
  let stored: CapturedTimezone | null = null
  const write = async (userId: string, patch: CapturedTimezone): Promise<TimezoneWriteResult> => {
    writes.push({ userId, patch })
    if (opts.fails) throw new Error('mongo is down')
    // `upserts: false` models the OLD behaviour: no document, no write.
    if (!opts.exists && opts.upserts === false) return 'missing'
    stored = patch
    return 'written'
  }
  return { write, writes, get stored() { return stored } }
}

const settle = () => new Promise((r) => setTimeout(r, 0))

// ─── C2: the first report must survive ───────────────────────────────────────

test('a member with no UserProgress yet still gets their offset stored', async () => {
  __clearTimezoneCache()
  const w = fakeWriter({ exists: false })
  captureUserTimezone(USER, 240, undefined, { write: w.write })
  await settle()
  assert.deepEqual(w.stored, { timezoneOffset: 240 })
})

test('a write that landed nowhere is NOT remembered as done', async () => {
  // This is the half that turned a lost write into a lost hour: the cache was
  // stamped before the write, and a no-op update looks exactly like a success.
  __clearTimezoneCache()
  const w = fakeWriter({ exists: false, upserts: false })
  captureUserTimezone(USER, 240, undefined, { write: w.write })
  await settle()
  assert.equal(w.writes.length, 1)
  assert.equal(w.stored, null)

  // The very next request must try again rather than trusting the cache.
  captureUserTimezone(USER, 240, undefined, { write: w.write })
  await settle()
  assert.equal(w.writes.length, 2, 'the offset would otherwise be skipped for an hour')
})

test('a failed write is retried on the next request too', async () => {
  __clearTimezoneCache()
  const w = fakeWriter({ fails: true })
  captureUserTimezone(USER, 240, undefined, { write: w.write })
  await settle()
  captureUserTimezone(USER, 240, undefined, { write: w.write })
  await settle()
  assert.equal(w.writes.length, 2)
})

test('a write that landed IS remembered, so repeats cost nothing', async () => {
  __clearTimezoneCache()
  const w = fakeWriter({ exists: true })
  captureUserTimezone(USER, 240, undefined, { write: w.write })
  await settle()
  captureUserTimezone(USER, 240, undefined, { write: w.write })
  captureUserTimezone(USER, 240, undefined, { write: w.write })
  await settle()
  assert.equal(w.writes.length, 1)

  // A genuine move is still written through.
  captureUserTimezone(USER, 300, undefined, { write: w.write })
  await settle()
  assert.equal(w.writes.length, 2)
  assert.deepEqual(w.stored, { timezoneOffset: 300 })
})

test('the Mongo writer upserts', () => {
  // The fake above cannot prove the real one creates the document. One scan,
  // on the single line the whole defect was.
  const src = fs.readFileSync(
    path.join(__dirname, '../../..', 'lib/captureUserTimezone.ts'),
    'utf8',
  )
  assert.match(src, /UserProgress\.updateOne\(\s*\{ userId \},\s*\{ \$set: patch \},\s*\{ upsert: true \}/)
  assert.match(src, /isDuplicateKey/, 'the insert can lose a race with the route\'s own upsert')
})

// ─── C1: only a value that could be a real timezone is stored ────────────────

test('offsets outside the real-world range are refused', () => {
  assert.equal(resolveCapturedTimezone(-841), null) // east of UTC+14
  assert.equal(resolveCapturedTimezone(721), null) // west of UTC-12
  assert.equal(resolveCapturedTimezone(840), null) // the old ±14h clamp both ways
  assert.equal(resolveCapturedTimezone(NaN), null)
})

test('offsets that are not a whole quarter hour are refused', () => {
  assert.equal(resolveCapturedTimezone(241), null)
  assert.equal(resolveCapturedTimezone(-7), null)
})

test('every real offset is preserved, including the awkward ones', () => {
  assert.deepEqual(resolveCapturedTimezone(0), { timezoneOffset: 0 }) // real UTC
  assert.deepEqual(resolveCapturedTimezone(240), { timezoneOffset: 240 }) // EDT
  assert.deepEqual(resolveCapturedTimezone(-330), { timezoneOffset: -330 }) // India, UTC+5:30
  assert.deepEqual(resolveCapturedTimezone(-825), { timezoneOffset: -825 }) // Chatham, UTC+13:45
  assert.deepEqual(resolveCapturedTimezone(-840), { timezoneOffset: -840 }) // Kiritimati, UTC+14
  assert.deepEqual(resolveCapturedTimezone(720), { timezoneOffset: 720 }) // UTC-12
})

test('a real zone name outranks the number beside it', () => {
  // The zone is the half of the report the server can check. A caller sending
  // a New York zone with a New Zealand offset gets New York.
  const now = new Date('2026-09-03T12:00:00Z')
  const out = resolveCapturedTimezone(-720, 'America/New_York', now)
  assert.deepEqual(out, { timezoneOffset: 240, timezone: 'America/New_York' })
  assert.equal(zoneOffsetMinutes('America/New_York', now), 240)
})

test('an unknown zone is dropped, not fatal', () => {
  const out = resolveCapturedTimezone(240, 'Mars/Olympus_Mons')
  assert.deepEqual(out, { timezoneOffset: 240 })
})

test('a rejected report writes nothing at all', async () => {
  __clearTimezoneCache()
  const w = fakeWriter({ exists: true })
  captureUserTimezone(USER, 241, undefined, { write: w.write })
  captureUserTimezone(USER, 5000, undefined, { write: w.write })
  await settle()
  assert.equal(w.writes.length, 0, 'an offset we refuse to store must not re-key the member\'s day')
})

test('zoneOffsetMinutes follows DST rather than a fixed number', () => {
  assert.equal(zoneOffsetMinutes('America/New_York', new Date('2026-01-15T12:00:00Z')), 300)
  assert.equal(zoneOffsetMinutes('America/New_York', new Date('2026-07-15T12:00:00Z')), 240)
  assert.equal(zoneOffsetMinutes('Asia/Kolkata', new Date('2026-07-15T12:00:00Z')), -330)
  assert.equal(zoneOffsetMinutes('Nowhere/Real', new Date()), null)
})
