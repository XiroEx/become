// Run with: npm run test:file tests/unit/cron-notify.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  WORKOUT_REMINDER_START_HOUR,
  WORKOUT_SCHEDULE_SELECT,
  isActiveProgramForSchedule,
  localDateKeyForUser,
  localHourForUser,
  MIN_STREAK_DAYS_FOR_AT_RISK_NOTIFICATION,
} from '../../lib/notifications/cronNotify'

test('localHourForUser returns null when timezone offset is missing', () => {
  assert.equal(localHourForUser(new Date('2026-05-30T07:00:00Z'), undefined), null)
})

test('localHourForUser uses Date.getTimezoneOffset semantics', () => {
  // 12:00 UTC with EST-style offset 300 is 07:00 local.
  assert.equal(localHourForUser(new Date('2026-05-30T12:00:00Z'), 300), 7)
  // 07:00 UTC with EST-style offset 300 is 02:00 local and must not look
  // like the start of the user's notification window.
  assert.equal(localHourForUser(new Date('2026-05-30T07:00:00Z'), 300), 2)
})

test('workout reminder window starts at 7am local', () => {
  assert.equal(WORKOUT_REMINDER_START_HOUR, 7)
})

test('localDateKeyForUser compares the user local calendar day', () => {
  assert.equal(localDateKeyForUser(new Date('2026-05-30T04:30:00Z'), 300), '2026-05-29')
  assert.equal(localDateKeyForUser(new Date('2026-05-30T12:00:00Z'), 300), '2026-05-30')
})

test('workout reminder schedule query must select programId for active-program filtering', () => {
  assert.match(WORKOUT_SCHEDULE_SELECT, /\bprogramId\b/)
})

test('isActiveProgramForSchedule only allows active or in-progress matching programs', () => {
  const activePrograms = [
    { programId: 'paused-program', status: 'paused' },
    { programId: 'active-program', status: 'active' },
    { programId: 'in-progress-program', status: 'in-progress' },
    { programId: 'legacy-no-status' },
  ]

  assert.equal(isActiveProgramForSchedule(activePrograms, 'paused-program'), false)
  assert.equal(isActiveProgramForSchedule(activePrograms, 'active-program'), true)
  assert.equal(isActiveProgramForSchedule(activePrograms, 'in-progress-program'), true)
  assert.equal(isActiveProgramForSchedule(activePrograms, 'legacy-no-status'), true)
  assert.equal(isActiveProgramForSchedule(activePrograms, 'missing-program'), false)
  assert.equal(isActiveProgramForSchedule(activePrograms, undefined), false)
})

// ─── Mind reminder + delivery observability ──────────────────────────────────
//
// Context: the daily Mind session — the app's core ritual — had NO reminder at
// all, and the cron's counters could not distinguish "nobody qualified" from
// "19 users qualified and none of them has push enabled". Both reported 0.

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  MIND_REMINDER_START_HOUR,
  MIND_REMINDER_END_HOUR,
} from '../../lib/notifications/cronNotify'

const CRON_ROUTE = readFileSync(
  join(process.cwd(), 'app/api/cron/notify/route.ts'),
  'utf8',
)

test('the mind reminder fires in the local morning, staggered after the workout one', () => {
  // 8, not 7: the workout push owns 7am. They are separate reminders now (see
  // below), so they need separate hours or they arrive stacked in one minute.
  assert.equal(MIND_REMINDER_START_HOUR, 8)
  assert.equal(MIND_REMINDER_END_HOUR, 11)
})

test('a mind reminder exists at all', () => {
  assert.match(CRON_ROUTE, /tag: 'mind-reminder'/, 'the daily Mind session needs its own push')
  assert.match(CRON_ROUTE, /url: '\/dashboard\/mind'/, 'it must deep-link to the Mind tab')
})

test('the mind reminder respects the 20h main-session cooldown', () => {
  // Nudging toward a locked session sends them to Training Grounds, not a session.
  assert.match(CRON_ROUTE, /mainSessionAvailable\(mind\?\.lastMainSessionAt/)
})

test('the mind reminder skips users who already did today', () => {
  assert.match(CRON_ROUTE, /MindSession\.exists\(\{ userId: progress\.userId, dateKey: userLocalDateKey \}\)/)
})

test('the workout reminder no longer suppresses the mind one', () => {
  // This test used to assert the OPPOSITE, and the old behaviour was the bug:
  // the mind nudge was skipped on any day a workout reminder went out, and
  // training days are most days, so members effectively never received it. A
  // member asked for mindset notifications and this was why they had none.
  // Staggering the windows (7am / 8am) solves the stacking that suppression was
  // there to prevent. Do not restore it.
  const mindBlock = CRON_ROUTE.slice(CRON_ROUTE.indexOf('2.6 Daily Mind session'))
  assert.doesNotMatch(mindBlock, /One morning push total/)
  assert.doesNotMatch(
    mindBlock.slice(0, mindBlock.indexOf('deliver(')),
    /if \(lastWorkout &&/,
    'the mind block must not skip on a same-day workout push',
  )
})

test('an in-progress program with no schedule is counted, not silently ignored', () => {
  assert.match(CRON_ROUTE, /activeProgramsWithoutSchedule\+\+/)
  assert.match(CRON_ROUTE, /tag: 'schedule-setup'/)
})

test('the schedule-setup nudge is weekly, not daily', () => {
  assert.match(CRON_ROUTE, /lastPushSentAt\?\.scheduleSetup/)
  assert.match(CRON_ROUTE, /7 \* 24 \* 60 \* 60 \* 1000/)
})

test('every send routes through deliver() so outcomes are counted', () => {
  // A raw sendPushToUser call inside the handler would bypass the
  // qualified/noSubscription split and reintroduce the blind spot this refactor
  // exists to remove. The one call inside deliver() itself is the intended one, so
  // only the handler body is checked.
  const body = CRON_ROUTE.slice(CRON_ROUTE.indexOf('export async function GET'))
  const rawSends = body.match(/sendPushToUser\(/g) ?? []
  assert.equal(rawSends.length, 0, 'use deliver(), not sendPushToUser, inside the handler')
  const delivers = body.match(/await deliver\(t\./g) ?? []
  assert.ok(delivers.length >= 6, `expected 6+ deliver() calls, found ${delivers.length}`)
})

test('the response separates qualified from delivered from unreachable', () => {
  for (const field of ['qualified', 'delivered', 'noSubscription', 'failed']) {
    assert.match(CRON_ROUTE, new RegExp(`${field}: `), `Tally must track ${field}`)
  }
  assert.match(CRON_ROUTE, /notifications: t/, 'the per-type tallies must be returned')
})

// ─── Daily check-in reminder ──────────────────────────────────────────────────
//
// Context: the mood + weight check-in only ever appeared in the in-app modal,
// which fires whenever a member happens to open the app — never on a
// schedule. That is why some members reported never seeing it (they weren't
// in the app while it was due) and others reported getting it at night
// (whenever they happened to open the app then). This gives it a real push,
// restricted to daytime hours like every other reminder.

import { CHECK_IN_REMINDER_START_HOUR, CHECK_IN_REMINDER_END_HOUR } from '../../lib/notifications/cronNotify'

test('the check-in reminder window is restricted to daytime hours, never night', () => {
  assert.ok(CHECK_IN_REMINDER_START_HOUR >= 6, 'must not start before 6am local')
  assert.ok(CHECK_IN_REMINDER_END_HOUR <= 20, 'must not run into the evening/night')
  assert.ok(CHECK_IN_REMINDER_START_HOUR < CHECK_IN_REMINDER_END_HOUR)
})

test('a check-in reminder push exists and deep-links to the dashboard', () => {
  assert.match(CRON_ROUTE, /tag: 'checkin-reminder'/, 'the daily check-in needs its own push')
  assert.match(CRON_ROUTE, /url: '\/dashboard'/)
})

test('the check-in reminder is pref-gated and only fires once local timezone is known', () => {
  const block = CRON_ROUTE.slice(
    CRON_ROUTE.indexOf('2.66 Daily check-in reminder'),
    CRON_ROUTE.indexOf('2.7 Program with no schedule'),
  )
  assert.match(block, /notificationPrefs\.checkInReminder.*\$ne: false/)
  // "Known timezone" means EITHER clock — see the zone-only tests at the
  // bottom of this file. It used to mean `timezoneOffset` alone, which dropped
  // every member who has an IANA zone but no captured offset.
  assert.match(block, /\$or: \[\{ timezoneOffset: \{ \$exists: true \} \}, \{ timezone: \{ \$exists: true \} \}\]/)
})

test('the check-in reminder skips members who already completed or skipped today', () => {
  const block = CRON_ROUTE.slice(
    CRON_ROUTE.indexOf('2.66 Daily check-in reminder'),
    CRON_ROUTE.indexOf('2.7 Program with no schedule'),
  )
  assert.match(block, /checkInFactsForToday\(/, 'must reuse the same "logged today" rule as the modal')
  assert.match(block, /if \(skippedToday \|\| \(moodLoggedToday && weightLoggedToday\)\) continue/)
})

test('the check-in reminder is rate-limited to once per local day', () => {
  const block = CRON_ROUTE.slice(
    CRON_ROUTE.indexOf('2.66 Daily check-in reminder'),
    CRON_ROUTE.indexOf('2.7 Program with no schedule'),
  )
  assert.match(block, /lastPushSentAt\?\.checkInReminder/)
  assert.match(block, /lastPushSentAt\.checkInReminder': now/)
})

// ─── Streak-at-risk minimum streak ─────────────────────────────────────────
//
// Context: a brand-new member's very first logged day already sets
// streakDays to 1, so the at-risk sweep (23-47h after that log) fired
// "Don't break your 1-day streak" before the member had anything a product
// milestone would call a streak (STREAK_MILESTONES starts at 3). Gate the
// notification on the same 3-day floor.

test('a 1-day streak does not qualify for the at-risk notification', () => {
  assert.equal(MIN_STREAK_DAYS_FOR_AT_RISK_NOTIFICATION, 3)
})

test('the streak-at-risk query is gated on the minimum streak, not any streak', () => {
  const block = CRON_ROUTE.slice(
    CRON_ROUTE.indexOf('1. Streak at-risk'),
    CRON_ROUTE.indexOf('2. Workout reminder'),
  )
  assert.match(block, /streakDays: \{ \$gte: MIN_STREAK_DAYS_FOR_AT_RISK_NOTIFICATION \}/)
  assert.doesNotMatch(block, /streakDays: \{ \$gte: 1 \}/)
})

// ─── Re-engagement: nobody ever got the "We miss you" push ───────────────────
//
// Context: the sweep selected `{ streakDays: 0 }`, and NOTHING in the codebase
// ever writes a 0 — lib/streak.ts bootstraps a progress doc at 1, extends on a
// consecutive day, freezes a single missed day, and otherwise resets to 1. So
// every member who had ever logged one activity was permanently excluded from
// the only sweep here that is actually keyed on having gone quiet
// (RETENTION_INACTIVITY_AUDIT.md §1.10). Lapse is read off `lastActivityDate`
// alone now; stored streakDays is neither read nor written by this sweep.

import {
  buildReEngagementFilter,
  REENGAGEMENT_INACTIVITY_DAYS,
  REENGAGEMENT_RATE_LIMIT_DAYS,
  REENGAGEMENT_START_HOUR,
  REENGAGEMENT_END_HOUR,
} from '../../lib/notifications/cronNotify'

const NOW = new Date('2026-10-14T15:00:00Z')
const DAY_MS = 24 * 60 * 60 * 1000
const daysAgo = (n: number) => new Date(NOW.getTime() - n * DAY_MS)
const REENGAGE_FILTER = buildReEngagementFilter(NOW) as MongoFilter

type MongoFilter = Record<string, unknown>
type ProgressDoc = Record<string, unknown>

/**
 * A deliberately tiny MongoDB filter evaluator: just the operators this one
 * selector uses, so the tests below can assert on MEMBERS rather than on the
 * shape of a query object. `operatorsIn` guards it — if the filter ever grows
 * an operator this cannot judge, the last test in this group fails rather than
 * the matcher quietly answering wrong.
 */
const SUPPORTED_OPERATORS = new Set(['$and', '$or', '$ne', '$lte', '$exists'])

function valueAt(doc: ProgressDoc, path: string): unknown {
  let cur: unknown = doc
  for (const key of path.split('.')) {
    if (cur === null || typeof cur !== 'object') return undefined
    cur = (cur as ProgressDoc)[key]
  }
  return cur
}

function existsAt(doc: ProgressDoc, path: string): boolean {
  return valueAt(doc, path) !== undefined
}

function asTime(value: unknown): number {
  return value instanceof Date ? value.getTime() : new Date(String(value)).getTime()
}

function matchesCondition(doc: ProgressDoc, path: string, condition: unknown): boolean {
  if (condition !== null && typeof condition === 'object' && !(condition instanceof Date)) {
    return Object.entries(condition as ProgressDoc).every(([op, operand]) => {
      const actual = valueAt(doc, path)
      switch (op) {
        case '$exists':
          return existsAt(doc, path) === operand
        case '$ne':
          return actual !== operand
        case '$lte':
          return actual === undefined || actual === null ? false : asTime(actual) <= asTime(operand)
        default:
          throw new Error(`test matcher does not implement ${op}`)
      }
    })
  }
  const actual = valueAt(doc, path)
  // Mongo's `{ field: null }` matches a null AND a missing field.
  if (condition === null) return actual === null || actual === undefined
  return actual === condition
}

function matchesFilter(doc: ProgressDoc, filter: MongoFilter): boolean {
  return Object.entries(filter).every(([key, condition]) => {
    if (key === '$and') return (condition as MongoFilter[]).every((f) => matchesFilter(doc, f))
    if (key === '$or') return (condition as MongoFilter[]).some((f) => matchesFilter(doc, f))
    return matchesCondition(doc, key, condition)
  })
}

function operatorsIn(value: unknown, found = new Set<string>()): Set<string> {
  if (Array.isArray(value)) {
    for (const item of value) operatorsIn(item, found)
    return found
  }
  if (value !== null && typeof value === 'object' && !(value instanceof Date)) {
    for (const [key, child] of Object.entries(value as ProgressDoc)) {
      if (key.startsWith('$')) found.add(key)
      operatorsIn(child, found)
    }
  }
  return found
}

/** The member the old query could never reach: a real streak, now gone quiet. */
const lapsedWithStreak: ProgressDoc = {
  userId: 'lapsed-with-streak',
  streakDays: 12,
  longestStreak: 30,
  lastActivityDate: daysAgo(7),
  timezoneOffset: 300,
}

test('a lapsed member with a 12-day stored streak qualifies for re-engagement', () => {
  // FAILS against the old `{ streakDays: 0 }` query — this is the whole bug.
  assert.equal(matchesFilter(lapsedWithStreak, REENGAGE_FILTER), true)
})

test('re-engagement ignores stored streakDays entirely, at any value', () => {
  for (const streakDays of [0, 1, 12, 365]) {
    assert.equal(
      matchesFilter({ ...lapsedWithStreak, streakDays }, REENGAGE_FILTER),
      true,
      `streakDays ${streakDays} must not decide whether a quiet member is reachable`,
    )
  }
  // And the selector must not mention the field at all, in either direction.
  assert.ok(
    !JSON.stringify(REENGAGE_FILTER).includes('streakDays'),
    'the re-engagement filter must not key on streakDays',
  )
})

test('a member who logged yesterday is not lapsed', () => {
  assert.equal(
    matchesFilter({ ...lapsedWithStreak, lastActivityDate: daysAgo(1) }, REENGAGE_FILTER),
    false,
  )
})

test('the 3-day inactivity threshold is unchanged and inclusive at the boundary', () => {
  assert.equal(REENGAGEMENT_INACTIVITY_DAYS, 3)
  assert.equal(
    matchesFilter({ ...lapsedWithStreak, lastActivityDate: daysAgo(3) }, REENGAGE_FILTER),
    true,
  )
  // Just inside 3 days is still active.
  assert.equal(
    matchesFilter(
      { ...lapsedWithStreak, lastActivityDate: new Date(NOW.getTime() - 3 * DAY_MS + 60_000) },
      REENGAGE_FILTER,
    ),
    false,
  )
})

test('a member who has never recorded an activity still qualifies', () => {
  assert.equal(matchesFilter({ userId: 'never-logged', timezoneOffset: 0 }, REENGAGE_FILTER), true)
})

test('the 7-day re-engagement rate limit still holds', () => {
  assert.equal(REENGAGEMENT_RATE_LIMIT_DAYS, 7)
  const pushed = (n: number) => ({
    ...lapsedWithStreak,
    lastActivityDate: daysAgo(30),
    lastPushSentAt: { reEngagement: daysAgo(n) },
  })
  assert.equal(matchesFilter(pushed(2), REENGAGE_FILTER), false, 'pushed 2 days ago: stay quiet')
  assert.equal(matchesFilter(pushed(6), REENGAGE_FILTER), false, 'pushed 6 days ago: stay quiet')
  assert.equal(matchesFilter(pushed(8), REENGAGE_FILTER), true, 'pushed 8 days ago: due again')
  assert.equal(
    matchesFilter({ ...lapsedWithStreak, lastPushSentAt: { reEngagement: null } }, REENGAGE_FILTER),
    true,
    'a null stamp is "never pushed"',
  )
})

test('opting out of re-engagement still silences it', () => {
  assert.equal(
    matchesFilter(
      { ...lapsedWithStreak, notificationPrefs: { reEngagement: false } },
      REENGAGE_FILTER,
    ),
    false,
  )
  // Absent pref = on, as every other sweep here treats it.
  assert.equal(
    matchesFilter({ ...lapsedWithStreak, notificationPrefs: {} }, REENGAGE_FILTER),
    true,
  )
})

test('the re-engagement filter only uses operators this test can evaluate', () => {
  for (const op of operatorsIn(REENGAGE_FILTER)) {
    assert.ok(SUPPORTED_OPERATORS.has(op), `matchesFilter above cannot judge ${op}`)
  }
})

test('the re-engagement sweep does not read or write streakDays', () => {
  // Code only — the block's comments describe the old `streakDays: 0` query on
  // purpose, so that the next reader knows why it is gone.
  const code = CRON_ROUTE.slice(CRON_ROUTE.indexOf('3. Re-engagement'))
    .split('\n')
    .filter((line) => !line.trim().startsWith('//'))
    .join('\n')
  assert.doesNotMatch(code, /streakDays/, 'streak history is not this sweep\'s business')
})

// ─── Zone-only members get their own local day ───────────────────────────────

test('a member with an IANA zone but no stored offset can be placed in their day', () => {
  // The old call shape — offset only — returns null for this member, and null
  // is what lands them in results.skippedByWindow forever.
  assert.equal(localHourForUser(NOW, undefined), null)
  // With the zone passed through, 15:00Z is 17:00 in Berlin: inside the
  // 12:00-18:00 re-engagement window.
  const hour = localHourForUser(NOW, undefined, 'Europe/Berlin')
  assert.equal(hour, 17)
  assert.ok(hour !== null && hour >= REENGAGEMENT_START_HOUR && hour <= REENGAGEMENT_END_HOUR)
})

test('the re-engagement sweep selects and passes the zone, not just the offset', () => {
  const block = CRON_ROUTE.slice(CRON_ROUTE.indexOf('3. Re-engagement'))
  assert.match(block, /\.select\('userId timezoneOffset timezone'\)/)
  assert.match(block, /localHourForUser\(now, u\.timezoneOffset, u\.timezone\)/)
})

test('every sweep that filters on a known timezone accepts either clock', () => {
  const bounds: Array<[string, string, string]> = [
    ['daily glance', '0.5 Daily glance', '1. Streak at-risk'],
    ['mind reminder', '2.6 Daily Mind session', '2.6b Super streak at risk'],
    ['super streak', '2.6b Super streak at risk', '2.65 Goal nudges'],
    ['goal nudge', '2.65 Goal nudges', '2.66 Daily check-in reminder'],
    ['check-in', '2.66 Daily check-in reminder', '2.7 Program with no schedule'],
  ]
  for (const [name, from, to] of bounds) {
    const block = CRON_ROUTE.slice(CRON_ROUTE.indexOf(from), CRON_ROUTE.indexOf(to))
    assert.ok(block.length > 0, `could not locate the ${name} sweep`)
    assert.match(
      block,
      /\$or: \[\{ timezoneOffset: \{ \$exists: true \} \}, \{ timezone: \{ \$exists: true \} \}\]/,
      `${name} must not require a captured offset`,
    )
    assert.doesNotMatch(
      block,
      /^\s+timezoneOffset: \{ \$exists: true \},$/m,
      `${name} still has an offset-only filter`,
    )
  }
})

test('every sweep that reads a local hour also selects the zone it reads', () => {
  // Passing progress?.timezone to localHourForUser while selecting only the
  // offset is a silent no-op: the field is simply absent from the lean doc.
  const body = CRON_ROUTE.slice(CRON_ROUTE.indexOf('export async function GET'))
  for (const select of body.match(/\.select\('[^']*timezoneOffset[^']*'\)/g) ?? []) {
    assert.match(select, /\btimezone\b(?!Offset)/, `${select} reads an offset but not the zone`)
  }
})

// ─── Copy and thresholds are untouched ───────────────────────────────────────

test('the re-engagement copy, window and rate limit are exactly what they were', () => {
  assert.equal(REENGAGEMENT_START_HOUR, 12)
  assert.equal(REENGAGEMENT_END_HOUR, 18)
  assert.match(CRON_ROUTE, /title: 'We miss you 👋'/)
  assert.match(CRON_ROUTE, /body: 'Come back and keep building your best self\.'/)
  assert.match(CRON_ROUTE, /tag: 're-engagement'/)
  assert.match(CRON_ROUTE, /url: '\/dashboard'/)
})
