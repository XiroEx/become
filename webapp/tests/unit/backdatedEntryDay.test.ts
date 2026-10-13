// Run with: npm run test:file tests/unit/backdatedEntryDay.test.ts
//
// THE DAY A WRITE WAS MADE ON, NOT THE DAY IT ARRIVED.
//
// POST /api/weight and POST /api/mood dated every entry from the server's
// clock in the member's offset. A weigh-in made offline at 11:50pm and
// delivered when the phone reconnected at 12:05am therefore landed on the NEXT
// day — and because both routes keep one entry per local day, the replay did
// not duplicate anything, it overwrote the wrong day.
//
// resolveEntryDay is the whole decision: which local day an entry belongs to,
// when it was made, and whether the day it claims is one we are willing to
// accept. isStaleReplay is the second half — which of two deliveries for the
// SAME day is the one the member actually meant.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  BACKDATE_WINDOW_DAYS,
  resolveEntryDay,
  isStaleReplay,
} from '../../lib/dayWindow'

/** 11:00 in New York on 12 August 2026 (EDT). */
const NOW = new Date('2026-08-12T15:00:00.000Z')
/** `Date.getTimezoneOffset()` in New York in summer: minutes WEST of UTC. */
const NY = 240

function ok(result: ReturnType<typeof resolveEntryDay>) {
  assert.equal(result.ok, true, `expected acceptance, got: ${'error' in result ? result.error : ''}`)
  if (!result.ok) throw new Error('unreachable')
  return result
}

function refused(result: ReturnType<typeof resolveEntryDay>) {
  assert.equal(result.ok, false, 'expected a refusal')
  if (result.ok) throw new Error('unreachable')
  return result
}

// ─── No `date`: exactly today, exactly as before ─────────────────────────────

test('no date: the entry is today in the caller\'s offset', () => {
  const r = ok(resolveEntryDay({ weight: 180, tz: NY }, NY, { now: NOW }))
  assert.equal(r.dayKey, '2026-08-12')
  assert.equal(r.date.toISOString(), '2026-08-12T00:00:00.000Z')
  assert.equal(r.backdated, false)
  assert.equal(r.loggedAt.getTime(), NOW.getTime())
})

test('no date, evening west of UTC: still the member\'s day, not the clock\'s', () => {
  // 9pm on the 12th in New York is 01:00 UTC on the 13th.
  const nyEvening = new Date('2026-08-13T01:00:00.000Z')
  const r = ok(resolveEntryDay({ mood: 4 }, NY, { now: nyEvening }))
  assert.equal(r.dayKey, '2026-08-12')
  assert.equal(r.backdated, false)
})

test('a null or empty date is the same as sending none', () => {
  for (const date of [null, undefined, '']) {
    const r = ok(resolveEntryDay({ date }, NY, { now: NOW }))
    assert.equal(r.dayKey, '2026-08-12')
    assert.equal(r.backdated, false)
  }
})

// ─── Yesterday, and the rest of the window ───────────────────────────────────

test('yesterday\'s date keys the entry on yesterday', () => {
  const r = ok(resolveEntryDay({ date: '2026-08-11' }, NY, { now: NOW }))
  assert.equal(r.dayKey, '2026-08-11')
  assert.equal(r.date.toISOString(), '2026-08-11T00:00:00.000Z')
  assert.equal(r.backdated, true)
})

test('today\'s own date is accepted and is not back-dated', () => {
  const r = ok(resolveEntryDay({ date: '2026-08-12' }, NY, { now: NOW }))
  assert.equal(r.dayKey, '2026-08-12')
  assert.equal(r.backdated, false)
})

test('the edge of the window is inside it', () => {
  assert.equal(BACKDATE_WINDOW_DAYS, 7)
  const r = ok(resolveEntryDay({ date: '2026-08-05' }, NY, { now: NOW }))
  assert.equal(r.dayKey, '2026-08-05')
  assert.equal(r.backdated, true)
})

test('a day older than the window is refused', () => {
  const r = refused(resolveEntryDay({ date: '2026-08-04' }, NY, { now: NOW }))
  assert.match(r.error, /7 days old/)
})

test('a month-old day is outside the default window', () => {
  const r = refused(resolveEntryDay({ date: '2026-07-20' }, NY, { now: NOW }))
  assert.match(r.error, /7 days old/)
})

test('an explicit maxBackdateDays widens it (Health imports, NP-184)', () => {
  const r = ok(resolveEntryDay({ date: '2026-07-20' }, NY, { now: NOW, maxBackdateDays: 90 }))
  assert.equal(r.dayKey, '2026-07-20')
  assert.equal(r.backdated, true)
})

// ─── The future ──────────────────────────────────────────────────────────────

test('tomorrow is refused', () => {
  const r = refused(resolveEntryDay({ date: '2026-08-13' }, NY, { now: NOW }))
  assert.match(r.error, /future/)
})

test('the UTC day is the future for a member west of UTC', () => {
  // 9pm on the 12th in New York. The clock says the 13th; the member does not.
  const nyEvening = new Date('2026-08-13T01:00:00.000Z')
  const r = refused(resolveEntryDay({ date: '2026-08-13' }, NY, { now: nyEvening }))
  assert.match(r.error, /future/)
  // ...and is a perfectly ordinary today for a member east of it (Berlin, -120).
  const berlin = ok(resolveEntryDay({ date: '2026-08-13' }, -120, { now: nyEvening }))
  assert.equal(berlin.dayKey, '2026-08-13')
  assert.equal(berlin.backdated, false)
})

// ─── Malformed keys ──────────────────────────────────────────────────────────

test('a malformed date is refused rather than quietly filed under today', () => {
  for (const date of ['2026-8-1', '08/11/2026', 'yesterday', '2026-08-11T00:00:00Z', 20260811]) {
    const r = refused(resolveEntryDay({ date }, NY, { now: NOW }))
    assert.match(r.error, /Invalid date/)
  }
})

test('a well-formed key that is not a calendar day is refused', () => {
  // Date.UTC(2026, 1, 31) rolls into March, so shape alone is not enough.
  const r = refused(resolveEntryDay({ date: '2026-02-31' }, NY, { now: NOW }))
  assert.match(r.error, /not a calendar day/)
})

// ─── loggedAt ────────────────────────────────────────────────────────────────

test('loggedAt is taken from the body when it parses', () => {
  const r = ok(resolveEntryDay(
    { date: '2026-08-11', loggedAt: '2026-08-12T03:50:00.000Z' },
    NY,
    { now: NOW },
  ))
  assert.equal(r.loggedAt.toISOString(), '2026-08-12T03:50:00.000Z')
})

test('a loggedAt in the future is clamped to now', () => {
  // A phone whose clock runs fast must not be able to pin a day's value
  // against every later write.
  const r = ok(resolveEntryDay({ loggedAt: '2027-01-01T00:00:00.000Z' }, NY, { now: NOW }))
  assert.equal(r.loggedAt.getTime(), NOW.getTime())
})

test('an unparseable loggedAt is refused', () => {
  const r = refused(resolveEntryDay({ loggedAt: 'whenever' }, NY, { now: NOW }))
  assert.match(r.error, /Invalid loggedAt/)
})

// ─── Which delivery wins ─────────────────────────────────────────────────────

test('isStaleReplay: an older delivery loses to the newer stored value', () => {
  const stored = new Date('2026-08-11T20:00:00.000Z')
  const incoming = new Date('2026-08-11T08:00:00.000Z')
  assert.equal(isStaleReplay(stored, incoming), true)
})

test('isStaleReplay: a newer delivery wins', () => {
  const stored = new Date('2026-08-11T08:00:00.000Z')
  const incoming = new Date('2026-08-11T20:00:00.000Z')
  assert.equal(isStaleReplay(stored, incoming), false)
})

test('isStaleReplay: a row with no loggedAt (or an unreadable one) never blocks a write', () => {
  const incoming = new Date('2026-08-11T20:00:00.000Z')
  assert.equal(isStaleReplay(undefined, incoming), false)
  assert.equal(isStaleReplay(null, incoming), false)
  assert.equal(isStaleReplay('not a date', incoming), false)
})

test('isStaleReplay: an identical loggedAt lets the incoming write through', () => {
  const at = new Date('2026-08-11T20:00:00.000Z')
  assert.equal(isStaleReplay(at, new Date(at)), false)
})
