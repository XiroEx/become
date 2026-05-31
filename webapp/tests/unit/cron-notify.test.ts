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
