// Run with: npm run test:file tests/unit/programs/enroll-restart-route.test.ts
//
// RE-ENROLLING IN A COMPLETED PROGRAM RESTARTS IT.
//
// POST /api/programs/enroll used to match ANY existing entry for the program —
// including a `completed` one — and answer `{ alreadyEnrolled: true }` without
// changing anything. Re-enrolling in a finished program was a silent no-op:
// the member landed on the calendar with nothing on it (their Schedule doc
// still held last season's slots, their entry still said `completed`).
//
// The route now resets a `completed` entry in place (fresh counters, the new
// start, `hasSchedule: false`, the member's exercise swaps kept) and answers
// the normal fresh-enrolment body. Any other status keeps today's
// `alreadyEnrolled` answer. History is untouched: the old Schedule doc and
// workout logs stay, and /api/programs/active only counts logs on/after the
// enrolment's startDate.
//
// These drive the REAL handler against the real (loopback, disposable) test
// database, with this file's OWN member and program — the runner executes test
// files in parallel, so a shared fixture row would race.

import { test, before, after, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import mongoose from 'mongoose'
import { NextRequest } from 'next/server'
import { POST as enrollPOST } from '../../app/api/programs/enroll/route'
import UserProgress from '../../models/UserProgress'
import ProgramModel from '../../models/Program'
import Schedule from '../../models/Schedule'
import { signToken } from '../../lib/auth'

const MEMBER_ID = new mongoose.Types.ObjectId()
const MEMBER_EMAIL = 'reenroll@reenroll.contract.test'
const PROGRAM_ID = 'reenroll-test-split'

let auth: string

function postReq(body: unknown) {
  return new NextRequest('http://localhost/api/programs/enroll', {
    method: 'POST',
    headers: new Headers({
      'Content-Type': 'application/json',
      Authorization: auth,
    }),
    body: JSON.stringify(body),
  })
}

async function storedEntry() {
  const doc = await UserProgress.findOne({ userId: MEMBER_ID }).lean() as unknown as {
    activePrograms?: Array<{
      programId: string
      status: string
      startDate: Date
      currentPhase: number
      currentDay: string
      completedWorkouts: number
      totalWorkouts: number
      hasSchedule?: boolean
      lastWorkoutDate?: Date
      exerciseSwaps?: Array<{ originalSlug: string; replacementSlug: string }>
    }>
  } | null
  return doc?.activePrograms?.find((p) => p.programId === PROGRAM_ID)
}

before(async () => {
  process.env.JWT_SECRET ||= 'become-unit-test-secret'
  await mongoose.connect(
    process.env.MONGODB_URI ?? 'mongodb://127.0.0.1:27017/become-test',
  )
  auth = `Bearer ${await signToken({ userId: MEMBER_ID.toString(), email: MEMBER_EMAIL })}`

  // One phase, weeks '1-2', two workouts a week: totalWorkouts === 2 * 2 === 4.
  await ProgramModel.create({
    program_id: PROGRAM_ID,
    name: 'Reenroll Test Split',
    description: 'A fixture program for the re-enrol restart.',
    duration_weeks: 2,
    training_days_per_week: 2,
    goal: 'Build strength',
    target_user: 'Intermediate',
    phases: [
      {
        phase: 'Phase 1',
        weeks: '1-2',
        focus: 'Accumulation',
        workouts: [
          { day: 'Day 1', title: 'Lower A', exercises: [] },
          { day: 'Day 2', title: 'Upper A', exercises: [] },
        ],
      },
    ],
  })
})

after(async () => {
  await UserProgress.deleteMany({ userId: MEMBER_ID })
  await Schedule.deleteMany({ userId: MEMBER_ID })
  await ProgramModel.deleteMany({ program_id: PROGRAM_ID })
  await mongoose.disconnect()
})

beforeEach(async () => {
  await UserProgress.deleteMany({ userId: MEMBER_ID })
  await Schedule.deleteMany({ userId: MEMBER_ID })
})

async function seedCompletedEntry() {
  await UserProgress.create({
    userId: MEMBER_ID,
    activePrograms: [
      {
        programId: PROGRAM_ID,
        programName: 'Reenroll Test Split',
        startDate: new Date('2026-08-03T00:00:00.000Z'),
        currentPhase: 2,
        currentDay: 'Day 2',
        completedWorkouts: 20,
        totalWorkouts: 20,
        status: 'completed',
        hasSchedule: true,
        lastWorkoutDate: new Date('2026-08-28T10:00:00.000Z'),
        exerciseSwaps: [
          {
            originalSlug: 'reenroll-barbell-row',
            replacementSlug: 'reenroll-dumbbell-row',
            replacementName: 'Dumbbell Row',
          },
        ],
      },
    ],
    workoutLogs: [
      {
        date: new Date('2026-08-05T00:00:00.000Z'),
        programId: PROGRAM_ID,
        phase: 1,
        day: 'Day 1',
        completed: true,
        duration: 45,
        exercises: [],
      },
    ],
  })
  // Last season's schedule: stale slots the re-enrolment must NOT touch.
  await Schedule.create({
    userId: MEMBER_ID,
    programId: PROGRAM_ID,
    programName: 'Reenroll Test Split',
    settings: {
      trainingDays: [1, 3],
      startDate: new Date('2026-08-03T00:00:00.000Z'),
    },
    scheduledWorkouts: [
      {
        date: new Date('2026-08-03T00:00:00.000Z'),
        programId: PROGRAM_ID,
        phase: 1,
        dayLabel: 'Day 1',
        workoutTitle: 'Lower A',
        status: 'completed',
      },
      {
        date: new Date('2026-08-05T00:00:00.000Z'),
        programId: PROGRAM_ID,
        phase: 1,
        dayLabel: 'Day 2',
        workoutTitle: 'Upper A',
        status: 'completed',
      },
    ],
  })
}

test('re-enrolling in a COMPLETED program restarts it in place with the fresh body', async () => {
  await seedCompletedEntry()

  const res = await enrollPOST(postReq({ programId: PROGRAM_ID, startDate: '2026-10-20' }))
  assert.equal(res.status, 200)
  const body = (await res.json()) as {
    message: string
    alreadyEnrolled?: boolean
    activeProgram: { status: string }
  }

  // The fresh-enrolment body — NO alreadyEnrolled — so ProgramEnrollResponseSchema parses.
  assert.equal(body.message, 'Successfully enrolled in program')
  assert.equal(body.alreadyEnrolled, undefined)
  assert.equal(body.activeProgram.status, 'in-progress')

  const entry = await storedEntry()
  assert.ok(entry, 'the entry is reset in place, not removed and re-pushed')
  assert.equal(entry.status, 'in-progress')
  assert.equal(new Date(entry.startDate).toISOString(), '2026-10-20T00:00:00.000Z')
  assert.equal(entry.currentPhase, 1)
  assert.equal(entry.currentDay, 'Day 1')
  assert.equal(entry.completedWorkouts, 0)
  assert.equal(entry.totalWorkouts, 4)
  assert.equal(entry.hasSchedule, false)
  assert.equal(entry.lastWorkoutDate, undefined)
  // The member's choices survive the restart.
  assert.equal(entry.exerciseSwaps?.length, 1)
  assert.equal(entry.exerciseSwaps?.[0]?.replacementSlug, 'reenroll-dumbbell-row')

  // History is untouched: the old Schedule doc and the old logs stay.
  const schedule = await Schedule.findOne({ userId: MEMBER_ID, programId: PROGRAM_ID }).lean() as unknown as {
    settings: { startDate: Date }
    scheduledWorkouts: unknown[]
  } | null
  assert.ok(schedule)
  assert.equal(new Date(schedule.settings.startDate).toISOString(), '2026-08-03T00:00:00.000Z')
  assert.equal(schedule.scheduledWorkouts.length, 2)
  const progress = await UserProgress.findOne({ userId: MEMBER_ID }).lean() as unknown as {
    workoutLogs: unknown[]
  } | null
  assert.equal(progress?.workoutLogs?.length, 1)
})

test('re-enrolling in an IN-PROGRESS program keeps the alreadyEnrolled answer and touches nothing', async () => {
  await seedCompletedEntry()
  // Same entry, but mid-program rather than finished.
  await UserProgress.updateOne(
    { userId: MEMBER_ID, 'activePrograms.programId': PROGRAM_ID },
    {
      $set: {
        'activePrograms.$.status': 'in-progress',
        'activePrograms.$.startDate': new Date('2026-10-01T00:00:00.000Z'),
        'activePrograms.$.hasSchedule': true,
      },
    },
  )

  const res = await enrollPOST(postReq({ programId: PROGRAM_ID, startDate: '2026-10-20' }))
  assert.equal(res.status, 200)
  const body = (await res.json()) as { message: string; alreadyEnrolled?: boolean }
  assert.equal(body.message, 'Already enrolled in this program')
  assert.equal(body.alreadyEnrolled, true)

  const entry = await storedEntry()
  assert.ok(entry)
  assert.equal(entry.status, 'in-progress')
  assert.equal(new Date(entry.startDate).toISOString(), '2026-10-01T00:00:00.000Z')
  assert.equal(entry.hasSchedule, true)
})
