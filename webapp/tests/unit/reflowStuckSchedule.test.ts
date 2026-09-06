// Run with: npm run test:file tests/unit/reflowStuckSchedule.test.ts
//
// Card: "Workout from program keeps on going onto the next day even tho I
// missed it." A user who fell behind (e.g. a week with no training) saw the
// SAME overdue workout re-appear as "today's" scheduled session, day after
// day, forever — never showing as missed.
//
// Root cause: reflowStuckSchedule() only preserved 'completed'/'skipped'
// slots as history and treated 'missed' as "remaining work", re-dating it
// onto `fromDate` (today) and resetting its status to 'scheduled'. The GET
// /api/schedule route calls this reflow every time nothing is left in the
// future — and the moment a freshly-reflowed "today" slot itself lapses,
// that condition is true again, so the same session kept sliding forward
// one day at a time with no end.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { reflowStuckSchedule, type PhaseData } from '../../lib/schedule'
import type { IScheduledWorkout } from '../../models/Schedule'

const PHASES_2_WEEKS: PhaseData[] = [{
  phase: 'Phase 1',
  weeks: '1-2', // 3-day split repeated 2 weeks → 6 sessions total
  focus: '',
  workouts: [
    { day: 'Day 1', title: 'A', exercises: [] },
    { day: 'Day 2', title: 'B', exercises: [] },
    { day: 'Day 3', title: 'C', exercises: [] },
  ],
}]
const ALL_DAYS = [0, 1, 2, 3, 4, 5, 6]
const past = (d: number) => new Date(Date.UTC(2026, 0, d)) // January 2026 — the past
const FROM = new Date(Date.UTC(2026, 6, 10))               // reflow target — the future

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const slot = (d: number, day: string, status: string): any =>
  ({ date: past(d), programId: 'p', phase: 1, dayLabel: day, workoutTitle: day, status })

test('REGRESSION: a missed session is never re-dated onto today — it stays missed at its true date', () => {
  const slots: IScheduledWorkout[] = [
    slot(1, 'Day 1', 'completed'),
    slot(2, 'Day 2', 'skipped'),
    slot(3, 'Day 3', 'missed'),
    slot(8, 'Day 1', 'missed'),
    slot(9, 'Day 2', 'missed'),
    slot(10, 'Day 3', 'missed'),
  ]
  // Every one of the program's 6 defined sessions already has a slot (some
  // missed, some resolved) — there is nothing genuinely undated to lay out,
  // so reflow must be a no-op, NOT resurrect the missed ones onto `FROM`.
  const out = reflowStuckSchedule(slots, PHASES_2_WEEKS, ALL_DAYS, FROM, 'p')
  assert.equal(out, null)
})

test('a missed session keeps its original date and status when the program HAS gained new content', () => {
  const PHASES_3_WEEKS: PhaseData[] = [{
    ...PHASES_2_WEEKS[0],
    weeks: '1-3', // the program grew a 3rd week after the schedule was first generated
  }]
  const slots: IScheduledWorkout[] = [
    slot(1, 'Day 1', 'completed'),
    slot(2, 'Day 2', 'skipped'),
    slot(3, 'Day 3', 'missed'),
    slot(8, 'Day 1', 'missed'),
    slot(9, 'Day 2', 'missed'),
    slot(10, 'Day 3', 'missed'),
  ]
  const out = reflowStuckSchedule(slots, PHASES_3_WEEKS, ALL_DAYS, FROM, 'p')
  assert.notEqual(out, null)

  // Every existing slot survives untouched — same date, same status.
  for (const original of slots) {
    const match = out!.find(
      (s) => s.dayLabel === original.dayLabel && new Date(s.date).getTime() === new Date(original.date).getTime(),
    )
    assert.ok(match, `expected ${original.dayLabel} on ${original.date.toISOString()} to survive`)
    assert.equal(match!.status, original.status)
  }

  // Only the 3 genuinely-new (week 3) sessions get appended, dated from FROM forward.
  const added = out!.filter((s) => new Date(s.date).getTime() >= FROM.getTime())
  assert.equal(added.length, 3)
  assert.ok(added.every((s) => s.status === 'scheduled'))
  assert.equal(out!.length, 9)
})

test('every session completed or skipped and nothing new added → null', () => {
  const slots: IScheduledWorkout[] = [
    slot(1, 'Day 1', 'completed'),
    slot(2, 'Day 2', 'skipped'),
    slot(3, 'Day 3', 'completed'),
    slot(8, 'Day 1', 'skipped'),
    slot(9, 'Day 2', 'completed'),
    slot(10, 'Day 3', 'skipped'),
  ]
  assert.equal(reflowStuckSchedule(slots, PHASES_2_WEEKS, ALL_DAYS, FROM, 'p'), null)
})

test('no training days configured → null', () => {
  const slots: IScheduledWorkout[] = [slot(1, 'Day 1', 'missed')]
  assert.equal(reflowStuckSchedule(slots, PHASES_2_WEEKS, [], FROM, 'p'), null)
})
