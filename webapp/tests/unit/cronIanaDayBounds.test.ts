// Run with: npm run test:file tests/unit/cronIanaDayBounds.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  localDayBoundsUtc,
  localOffsetForUser,
  localDateKeyForUser,
} from '../../lib/notifications/cronNotify'

// ─── 1. IANA-only member matches equivalent offset ───────────────────────────

test('an IANA-only member in America/New_York matches equivalent numeric offset in EDT', () => {
  // 2026-10-14 is EDT (UTC-4), corresponding to offset 240.
  const now = new Date('2026-10-14T18:00:00.000Z')

  const boundsIana = localDayBoundsUtc(now, undefined, 'America/New_York')
  const boundsOffset = localDayBoundsUtc(now, 240, undefined)

  assert.equal(boundsIana.start.toISOString(), '2026-10-14T04:00:00.000Z')
  assert.equal(boundsIana.end.toISOString(), '2026-10-15T04:00:00.000Z')

  assert.equal(boundsIana.start.getTime(), boundsOffset.start.getTime())
  assert.equal(boundsIana.end.getTime(), boundsOffset.end.getTime())
})

test('an IANA-only member in America/New_York matches equivalent numeric offset in EST', () => {
  // 2026-01-15 is EST (UTC-5), corresponding to offset 300.
  const now = new Date('2026-01-15T18:00:00.000Z')

  const boundsIana = localDayBoundsUtc(now, undefined, 'America/New_York')
  const boundsOffset = localDayBoundsUtc(now, 300, undefined)

  assert.equal(boundsIana.start.toISOString(), '2026-01-15T05:00:00.000Z')
  assert.equal(boundsIana.end.toISOString(), '2026-01-16T05:00:00.000Z')

  assert.equal(boundsIana.start.getTime(), boundsOffset.start.getTime())
  assert.equal(boundsIana.end.getTime(), boundsOffset.end.getTime())
})

// ─── 2. DST-shifted case differs from stale stored offset ────────────────────

test('DST shift: winter date with stale summer offset produces live winter bounds', () => {
  // In January, America/New_York is EST (offset 300, day starts at 05:00Z).
  // A member who last opened the app in summer still has offset 240 stored.
  const now = new Date('2026-01-15T12:00:00.000Z')

  const zoneFirstBounds = localDayBoundsUtc(now, 240, 'America/New_York')
  const staleOffsetBounds = localDayBoundsUtc(now, 240, undefined)

  assert.equal(zoneFirstBounds.start.toISOString(), '2026-01-15T05:00:00.000Z')
  assert.equal(staleOffsetBounds.start.toISOString(), '2026-01-15T04:00:00.000Z')

  // The true zone-first bounds differ from the stale offset bounds by exactly 60 minutes.
  const diffMs = zoneFirstBounds.start.getTime() - staleOffsetBounds.start.getTime()
  assert.equal(diffMs, 60 * 60 * 1000)
})

test('DST shift: summer date with stale winter offset produces live summer bounds', () => {
  // In July, America/New_York is EDT (offset 240, day starts at 04:00Z).
  // A member with stale winter offset 300 stored.
  const now = new Date('2026-07-15T12:00:00.000Z')

  const zoneFirstBounds = localDayBoundsUtc(now, 300, 'America/New_York')
  const staleOffsetBounds = localDayBoundsUtc(now, 300, undefined)

  assert.equal(zoneFirstBounds.start.toISOString(), '2026-07-15T04:00:00.000Z')
  assert.equal(staleOffsetBounds.start.toISOString(), '2026-07-15T05:00:00.000Z')

  const diffMs = staleOffsetBounds.start.getTime() - zoneFirstBounds.start.getTime()
  assert.equal(diffMs, 60 * 60 * 1000)
})

// ─── 3. localOffsetForUser resolution rules ─────────────────────────────────

test('localOffsetForUser resolves IANA zones correctly across seasons and hemispheres', () => {
  const summer = new Date('2026-07-15T12:00:00.000Z')
  const winter = new Date('2026-01-15T12:00:00.000Z')

  // America/New_York: EDT (240) in summer, EST (300) in winter
  assert.equal(localOffsetForUser(summer, undefined, 'America/New_York'), 240)
  assert.equal(localOffsetForUser(winter, undefined, 'America/New_York'), 300)

  // Europe/London: BST (-60) in summer, GMT (0) in winter
  assert.equal(localOffsetForUser(summer, undefined, 'Europe/London'), -60)
  assert.equal(localOffsetForUser(winter, undefined, 'Europe/London'), 0)

  // Asia/Tokyo: UTC+9 year-round (no DST, offset -540)
  assert.equal(localOffsetForUser(summer, undefined, 'Asia/Tokyo'), -540)
  assert.equal(localOffsetForUser(winter, undefined, 'Asia/Tokyo'), -540)
})

test('localOffsetForUser falls back to offset when zone is absent or invalid', () => {
  const now = new Date('2026-10-14T12:00:00.000Z')

  assert.equal(localOffsetForUser(now, 240, undefined), 240)
  assert.equal(localOffsetForUser(now, -120, 'Not/A_Real_Zone'), -120)
  assert.equal(localOffsetForUser(now, undefined, undefined), 0)
  assert.equal(localOffsetForUser(now, undefined, 'Invalid/Zone'), 0)
})

// ─── 4. Fallback when both zone and offset are missing ────────────────────────

test('localDayBoundsUtc falls back to UTC midnight bounds when neither clock is set', () => {
  const now = new Date('2026-10-14T15:30:00.000Z')
  const bounds = localDayBoundsUtc(now, undefined, undefined)

  assert.equal(bounds.start.toISOString(), '2026-10-14T00:00:00.000Z')
  assert.equal(bounds.end.toISOString(), '2026-10-15T00:00:00.000Z')
  assert.equal(bounds.end.getTime() - bounds.start.getTime(), 24 * 60 * 60 * 1000)
})

test('localDayBoundsUtc handles zones east of UTC correctly', () => {
  // Asia/Tokyo is UTC+9 (-540 minutes).
  // At 2026-10-14T16:00:00Z, Tokyo is 2026-10-15 01:00 (next calendar day).
  const now = new Date('2026-10-14T16:00:00.000Z')
  const bounds = localDayBoundsUtc(now, undefined, 'Asia/Tokyo')

  assert.equal(localDateKeyForUser(now, undefined, 'Asia/Tokyo'), '2026-10-15')
  // Oct 15 in Tokyo starts at Oct 14 15:00:00Z.
  assert.equal(bounds.start.toISOString(), '2026-10-14T15:00:00.000Z')
  assert.equal(bounds.end.toISOString(), '2026-10-15T15:00:00.000Z')
})

// ─── 5. Route integration contract assertions ────────────────────────────────

test('route.ts meal reminder uses localDayBoundsUtc and not naive offset math', () => {
  const routeCode = readFileSync(
    join(process.cwd(), 'app/api/cron/notify/route.ts'),
    'utf8',
  )
  const mealBlock = routeCode.slice(
    routeCode.indexOf('2.5 Meal-log reminder'),
    routeCode.indexOf('2.6 Daily Mind session'),
  )

  assert.match(
    mealBlock,
    /localDayBoundsUtc\(\s*now,\s*progress\?\.timezoneOffset,\s*progress\?\.timezone,?\s*\)/,
    'meal reminder must use localDayBoundsUtc zone-first',
  )
  assert.doesNotMatch(
    mealBlock,
    /offset \* 60 \* 1000/,
    'meal reminder must not compute dayStartUtc from offset ?? 0',
  )
})

test('route.ts super-streak and goal-nudge resolve offset zone-first', () => {
  const routeCode = readFileSync(
    join(process.cwd(), 'app/api/cron/notify/route.ts'),
    'utf8',
  )

  const superBlock = routeCode.slice(
    routeCode.indexOf('2.6b Super streak at risk'),
    routeCode.indexOf('2.65 Goal nudges'),
  )
  assert.match(
    superBlock,
    /localOffsetForUser\(now, progress\?\.timezoneOffset, progress\?\.timezone\)/,
    'super-streak must resolve offset zone-first',
  )
  assert.doesNotMatch(
    superBlock,
    /computeStreaks\([^,]+,\s*progress\.timezoneOffset \?\? 0/,
    'super-streak must not pass progress.timezoneOffset ?? 0',
  )

  const goalBlock = routeCode.slice(
    routeCode.indexOf('2.65 Goal nudges'),
    routeCode.indexOf('2.66 Daily check-in reminder'),
  )
  assert.match(
    goalBlock,
    /localOffsetForUser\(now, progress\?\.timezoneOffset, progress\?\.timezone\)/,
    'goal-nudge must resolve offset zone-first',
  )
  assert.doesNotMatch(
    goalBlock,
    /computeGoalProgress\([^,]+,\s*progress\.timezoneOffset \?\? 0/,
    'goal-nudge must not pass progress.timezoneOffset ?? 0',
  )
})

test('route.ts check-in reminder resolves offset zone-first', () => {
  const routeCode = readFileSync(
    join(process.cwd(), 'app/api/cron/notify/route.ts'),
    'utf8',
  )
  const checkInBlock = routeCode.slice(
    routeCode.indexOf('2.66 Daily check-in reminder'),
    routeCode.indexOf('2.7 Program with no schedule'),
  )

  assert.match(
    checkInBlock,
    /checkInFactsForToday\(\s*progress,\s*userLocalDateKey,\s*userTzOffset,?/,
    'check-in sweep must pass zone-resolved userTzOffset',
  )
  assert.doesNotMatch(
    checkInBlock,
    /progress\?\.timezoneOffset \?\? 0/,
    'check-in sweep must not fall back to 0 when offset is missing',
  )
})
