import { test } from 'node:test'
import assert from 'node:assert/strict'
import { NextRequest } from 'next/server'
import {
  buildNutritionRollupPipeline,
  mapRollupRowsToNutritionDays,
  simulateNutritionRollup,
  computeNutritionRollupSince,
  NUTRITION_ROLLUP_DAYS,
} from '../../../lib/dashboardTiles/nutritionRollup'
import { readTzOffset } from '../../../lib/dayWindow'
import { tilesCacheKey } from '../../../lib/redis'
import { DATE_SCOPED_FAMILIES, isDateScopedPath } from '../../../../shared/api-client/src/tz'

// ---------------------------------------------------------------------------
// Acceptance criterion (id: 96d41068):
// The 14-day rollup buckets meal logs by the CALLER's local day, proven by
// a test where a member west of UTC logs at 8pm local and the row lands on
// that day, not the next.
// ---------------------------------------------------------------------------
test('96d41068: rollup buckets meal logs by caller local day (8pm EDT lands on that day, not tomorrow)', () => {
  // Member in New York (EDT, UTC-4): tz is 240 minutes WEST of UTC.
  const tzOffsetMinutes = 240

  // 8:00 PM local time on October 14, 2026 EDT is 00:00:00 UTC on October 15, 2026.
  const loggedAtLocal8pmEDT = new Date('2026-10-15T00:00:00.000Z')

  const logs = [
    {
      loggedAt: loggedAtLocal8pmEDT,
      untimed: false,
      totalNutrition: { calories: 650, protein: 45 },
    },
  ]

  // With the caller's timezone offset (tz = 240):
  const rolledUp = simulateNutritionRollup(logs, tzOffsetMinutes)
  assert.equal(rolledUp.length, 1)

  const day = rolledUp[0]
  // Noon-UTC anchor for October 14, 2026:
  assert.equal(day.date.toISOString(), '2026-10-14T12:00:00.000Z')
  assert.equal(day.calories, 650)
  assert.equal(day.protein, 45)
  assert.equal(day.logCount, 1)

  // Prove that WITHOUT tz offset (tz = 0, UTC bug), it would have landed on October 15 (tomorrow):
  const unshifted = simulateNutritionRollup(logs, 0)
  assert.equal(unshifted.length, 1)
  assert.equal(unshifted[0].date.toISOString(), '2026-10-15T12:00:00.000Z')
})

test('96d41068: east of UTC (e.g. Paris CET 00:30) lands on that day, not yesterday', () => {
  // Member in Paris (CET, UTC+1): tz is -60 minutes WEST of UTC.
  const tzOffsetMinutes = -60

  // 00:30 local time on October 15, 2026 CET is 23:30:00 UTC on October 14, 2026.
  const loggedAtLocal0030CET = new Date('2026-10-14T23:30:00.000Z')

  const logs = [
    {
      loggedAt: loggedAtLocal0030CET,
      untimed: false,
      totalNutrition: { calories: 300, protein: 20 },
    },
  ]

  const rolledUp = simulateNutritionRollup(logs, tzOffsetMinutes)
  assert.equal(rolledUp.length, 1)

  // Lands on October 15, 2026 (local day), not October 14:
  assert.equal(rolledUp[0].date.toISOString(), '2026-10-15T12:00:00.000Z')
  assert.equal(rolledUp[0].calories, 300)
  assert.equal(rolledUp[0].protein, 20)
})

// ---------------------------------------------------------------------------
// Acceptance criterion (id: 96d41069):
// GET /api/dashboard/tiles reads tz from the query string, and 'dashboard'
// is added to DATE_SCOPED_FAMILIES in shared/api-client/src/tz.ts.
// ---------------------------------------------------------------------------
test('96d41069: dashboard is in DATE_SCOPED_FAMILIES and isDateScopedPath recognizes it', () => {
  assert.ok(
    (DATE_SCOPED_FAMILIES as readonly string[]).includes('dashboard'),
    "DATE_SCOPED_FAMILIES must contain 'dashboard'",
  )
  assert.equal(isDateScopedPath('/api/dashboard/tiles'), true)
  assert.equal(isDateScopedPath('/api/dashboard/tiles?tz=240'), true)
})

test('96d41069: readTzOffset reads tz from searchParams correctly', () => {
  const req1 = new NextRequest('http://localhost/api/dashboard/tiles?tz=240')
  assert.equal(readTzOffset(req1.nextUrl.searchParams), 240)

  const req2 = new NextRequest('http://localhost/api/dashboard/tiles?tz=-60')
  assert.equal(readTzOffset(req2.nextUrl.searchParams), -60)

  const req3 = new NextRequest('http://localhost/api/dashboard/tiles')
  assert.equal(readTzOffset(req3.nextUrl.searchParams), 0)

  const req4 = new NextRequest('http://localhost/api/dashboard/tiles?tz=invalid')
  assert.equal(readTzOffset(req4.nextUrl.searchParams), 0)
})

// ---------------------------------------------------------------------------
// Acceptance criterion (id: 96d4106a):
// The tiles Redis cache key includes the offset, so a cached payload is
// never served to a request at a different offset.
// ---------------------------------------------------------------------------
test('96d4106a: tilesCacheKey includes the tz offset', () => {
  const userId = 'usr_test123'
  const keyEDT = tilesCacheKey(userId, 240)
  const keyUTC = tilesCacheKey(userId, 0)
  const keyCET = tilesCacheKey(userId, -60)
  const keyDefault = tilesCacheKey(userId)

  assert.equal(keyEDT, `tiles:v1:${userId}:240`)
  assert.equal(keyUTC, `tiles:v1:${userId}:0`)
  assert.equal(keyCET, `tiles:v1:${userId}:-60`)
  assert.equal(keyDefault, `tiles:v1:${userId}:0`)

  // Cache entries for different offsets must never collide:
  assert.notEqual(keyEDT, keyUTC)
  assert.notEqual(keyEDT, keyCET)
  assert.notEqual(keyCET, keyUTC)
})

// ---------------------------------------------------------------------------
// Acceptance criterion (id: 96d4106b):
// Untimed meal logs have ONE documented and tested behaviour in the rollup
// (excluded, or bucketed by their day anchor) - never by a meaningless clock reading.
// ---------------------------------------------------------------------------
test('96d4106b: untimed meal logs are excluded from the rollup and never bucketed by clock reading', () => {
  const now = new Date('2026-10-15T12:00:00Z')
  const logs = [
    // Untimed log entered at 1:00 AM (meaningless clock reading)
    {
      loggedAt: new Date('2026-10-15T01:00:00.000Z'),
      untimed: true,
      totalNutrition: { calories: 500, protein: 30 },
    },
    // Timed log
    {
      loggedAt: new Date('2026-10-15T13:00:00.000Z'),
      untimed: false,
      totalNutrition: { calories: 700, protein: 40 },
    },
  ]

  const rolledUp = simulateNutritionRollup(logs, 0)
  assert.equal(rolledUp.length, 1)
  assert.equal(rolledUp[0].calories, 700)
  assert.equal(rolledUp[0].protein, 40)
  assert.equal(rolledUp[0].logCount, 1)

  // MongoDB pipeline match stage must explicitly filter out untimed: true
  const pipeline = buildNutritionRollupPipeline('user1', computeNutritionRollupSince(now), 240)
  const matchStage = pipeline[0] as { $match: { untimed?: unknown; loggedAt?: unknown; user?: unknown } }
  assert.deepEqual(matchStage.$match.untimed, { $ne: true })
})

test('pipeline structure: shifts loggedAt by tzOffsetMinutes * 60000 and widens window by 1 day', () => {
  const now = new Date('2026-10-15T12:00:00Z')
  const since = computeNutritionRollupSince(now)
  assert.equal(NUTRITION_ROLLUP_DAYS, 15)
  assert.equal(since.getTime(), now.getTime() - 15 * 24 * 60 * 60 * 1000)

  const pipeline = buildNutritionRollupPipeline('u1', since, 240)
  const groupStage = pipeline[1] as {
    $group: {
      _id: { $dateToString: { format: string; date: { $subtract: [string, number] } } }
    }
  }

  assert.equal(groupStage.$group._id.$dateToString.format, '%Y-%m-%d')
  assert.deepEqual(groupStage.$group._id.$dateToString.date, {
    $subtract: ['$loggedAt', 240 * 60_000],
  })
})
