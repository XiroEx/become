// Run with: npx tsx --test tests/unit/cron-notify.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  WORKOUT_REMINDER_START_HOUR,
  WORKOUT_SCHEDULE_SELECT,
  isActiveProgramForSchedule,
  localDateKeyForUser,
  localHourForUser,
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
