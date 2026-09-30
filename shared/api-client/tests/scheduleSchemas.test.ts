// Run with: npx tsx --test tests/scheduleSchemas.test.ts
//
// NP-021 — the schedule domain, re-aligned with the live routes.
//
// These are HAND-WRITTEN fixtures, so they agree with the schemas by
// construction and prove only that the shapes are internally coherent (the
// discriminated union, the 1-based phase, the day-marker rule, `settings`
// actually being typed). What the routes ACTUALLY send is checked by
// webapp/tests/unit/contract/np021Schedule.test.ts, which calls the real
// handlers against a real database. Both exist on purpose; neither replaces
// the other.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  ACTIVE_PROGRAM_STATUSES,
  SCHEDULED_WORKOUT_STATUSES,
  SCHEDULE_PATCH_ACTIONS,
  SCHEDULE_PROGRAM_LEVEL_ACTIONS,
  SCHEDULE_PROGRAM_STATUSES,
  SCHEDULE_VIEWS,
  ScheduleApiResponseSchema,
  ScheduleCreateRequestSchema,
  ScheduleCreateResponseSchema,
  SchedulePatchRequestSchema,
  SchedulePatchResponseSchema,
  ScheduleProgramActionResponseSchema,
  ScheduleQuerySchema,
  ScheduleSettingsSchema,
  ScheduleSettingsUpdateRequestSchema,
  ScheduleSettingsUpdateResponseSchema,
  ScheduleSlotActionResponseSchema,
  slotDateKey,
} from '../src/index';

// ---------------------------------------------------------------------------
// The fixture: GET /api/schedule as the BETA channel answers it.
//
// Shaped field for field from the response projection in
// webapp/app/api/schedule/route.ts — the handler `beta` (become-beta.redbtn.io,
// the `beta` branch) serves — with Mongoose's JSON rendering applied: `_id` is
// a hex string, every Date is an ISO instant, and each slot `date` is the 00:00Z
// DAY MARKER lib/schedule.ts writes.
//
// Two things about it matter beyond "it parses":
//   - `settings` is a real object with the member's training days in it. It
//     used to be `z.unknown()`, which is why the native settings screen had to
//     cast it to read them back.
//   - the statuses here are the ones the GET DERIVES (a past `scheduled` slot
//     is answered `missed`), not only the ones stored.
// ---------------------------------------------------------------------------

const BETA_GET_SCHEDULE = {
  schedules: [
    {
      _id: '68f1c2a9b4d3e10012ab34cd',
      programId: 'strength-foundation',
      programName: 'Strength Foundation',
      programStatus: 'in-progress',
      settings: {
        trainingDays: [1, 3, 5],
        startDate: '2026-09-07T00:00:00.000Z',
      },
      scheduledWorkouts: [
        {
          date: '2026-09-07T00:00:00.000Z',
          programId: 'strength-foundation',
          phase: 1,
          dayLabel: 'Day 1',
          workoutTitle: 'Lower Body Strength',
          status: 'completed',
          completedAt: '2026-09-07T18:42:11.004Z',
        },
        {
          date: '2026-09-09T00:00:00.000Z',
          programId: 'strength-foundation',
          phase: 1,
          dayLabel: 'Day 2',
          workoutTitle: 'Upper Body Strength',
          // Derived on read: a past `scheduled` slot is answered as missed.
          status: 'missed',
        },
        {
          date: '2026-09-11T00:00:00.000Z',
          programId: 'strength-foundation',
          phase: 1,
          dayLabel: 'Day 3',
          workoutTitle: 'Full Body',
          status: 'skipped',
          notes: 'Travelling.',
        },
        {
          date: '2026-09-14T00:00:00.000Z',
          programId: 'strength-foundation',
          phase: 2,
          dayLabel: 'Day 1',
          workoutTitle: 'Lower Body Power',
          status: 'scheduled',
        },
      ],
    },
  ],
} as const;

test('the beta GET /api/schedule body parses, with `settings` TYPED', () => {
  const parsed = ScheduleApiResponseSchema.parse(BETA_GET_SCHEDULE);
  const doc = parsed.schedules[0];
  assert.ok(doc);

  // The point of the ticket: `settings` is no longer `z.unknown()`, so this
  // reads off the parsed object with no cast at the call site.
  assert.deepEqual(doc.settings?.trainingDays, [1, 3, 5]);
  assert.equal(doc.settings?.startDate, '2026-09-07T00:00:00.000Z');
  assert.equal(typeof doc.settings?.trainingDays[0], 'number');

  // Rule 2: plural, nested.
  assert.equal(parsed.schedules.length, 1);
  assert.equal(doc.scheduledWorkouts.length, 4);

  // Rule 3: phase is 1-based, and the session is named by LABEL.
  assert.equal(doc.scheduledWorkouts[0]?.phase, 1);
  assert.equal(doc.scheduledWorkouts[3]?.phase, 2);
  assert.equal(doc.scheduledWorkouts[0]?.dayLabel, 'Day 1');

  // Every status in the fixture is one the enum knows.
  assert.deepEqual(
    doc.scheduledWorkouts.map((w) => w.status),
    ['completed', 'missed', 'skipped', 'scheduled'],
  );
  assert.equal(doc.programStatus, 'in-progress');
});

test('slotDateKey reads a slot marker as a plain day, never through an offset', () => {
  // Rule 1. The marker is 00:00Z, so the day is the date part and nothing else.
  assert.equal(slotDateKey('2026-09-07T00:00:00.000Z'), '2026-09-07');
  assert.equal(slotDateKey('2026-09-07'), '2026-09-07');

  const parsed = ScheduleApiResponseSchema.parse(BETA_GET_SCHEDULE);
  assert.deepEqual(
    parsed.schedules[0]?.scheduledWorkouts.map((w) => slotDateKey(w.date)),
    ['2026-09-07', '2026-09-09', '2026-09-11', '2026-09-14'],
  );

  // And the bug the rule exists to stop, kept as an assertion: reading the
  // marker as a local instant lands on the day BEFORE for anyone west of UTC.
  const westOfUtc = new Date('2026-09-07T00:00:00.000Z');
  const asLocalInstant = new Date(westOfUtc.getTime() - 300 * 60_000); // UTC-5
  assert.notEqual(asLocalInstant.toISOString().slice(0, 10), '2026-09-07');
});

test('ScheduleApiResponseSchema: defaults schedules to [], and a slot needs a date', () => {
  // A member with no schedule gets exactly this.
  assert.deepEqual(ScheduleApiResponseSchema.parse({ schedules: [] }).schedules, []);
  assert.equal(ScheduleApiResponseSchema.safeParse({}).success, true);

  const noDate = ScheduleApiResponseSchema.safeParse({
    schedules: [{ programId: 'p', scheduledWorkouts: [{ dayLabel: 'Day 1' }] }],
  });
  assert.equal(noDate.success, false, 'a slot with no date is not a slot');
});

test('an unrecognised slot status reads as `scheduled` instead of losing the calendar', () => {
  // A shipped store build outlives the server it was written against. A sixth
  // status must cost that build one slot's colour, not the whole response.
  const parsed = ScheduleApiResponseSchema.parse({
    schedules: [
      {
        programId: 'p',
        scheduledWorkouts: [{ date: '2026-09-07T00:00:00.000Z', status: 'mystery' }],
      },
    ],
  });
  assert.equal(parsed.schedules[0]?.scheduledWorkouts[0]?.status, 'scheduled');
  assert.deepEqual(SCHEDULED_WORKOUT_STATUSES, [
    'scheduled',
    'completed',
    'missed',
    'skipped',
    'rest',
  ]);
});

test('programStatus is the enrolment status plus the `unknown` the GET substitutes', () => {
  // One source of truth: the four statuses come from the programs domain, so a
  // rename there cannot leave this enum behind.
  assert.deepEqual(SCHEDULE_PROGRAM_STATUSES, [...ACTIVE_PROGRAM_STATUSES, 'unknown']);
  for (const status of SCHEDULE_PROGRAM_STATUSES) {
    const parsed = ScheduleApiResponseSchema.parse({
      schedules: [{ programId: 'p', programStatus: status, scheduledWorkouts: [] }],
    });
    assert.equal(parsed.schedules[0]?.programStatus, status);
  }
  // There is no 'abandoned' — abandoning REMOVES the enrolment (NP-019 rule 3).
  assert.equal(SCHEDULE_PROGRAM_STATUSES.includes('abandoned' as never), false);
});

test('ScheduleSettingsSchema keeps a field it has never heard of', () => {
  const parsed = ScheduleSettingsSchema.parse({
    trainingDays: [0, 6],
    startDate: '2026-09-07T00:00:00.000Z',
    somethingNew: true,
  });
  assert.deepEqual(parsed.trainingDays, [0, 6]);
  assert.equal((parsed as Record<string, unknown>).somethingNew, true);
  // trainingDays is 0-6; 7 is not a day of the week.
  assert.equal(ScheduleSettingsSchema.safeParse({ trainingDays: [7] }).success, false);
});

test('ScheduleQuerySchema: tz is a NUMBER of minutes west of UTC, never a zone name', () => {
  const q = ScheduleQuerySchema.parse({
    programId: 'strength-foundation',
    from: '2026-09-01',
    to: '2026-10-01',
    view: 'month',
    tz: 240,
  });
  assert.equal(q.tz, 240);
  assert.equal(
    ScheduleQuerySchema.safeParse({ tz: 'America/New_York' }).success,
    false,
    'the IANA zone is tzZone, and only ever in a body — see src/tz.ts',
  );
  assert.deepEqual(SCHEDULE_VIEWS, ['week', 'month', 'upcoming', 'all']);
});

// ---------------------------------------------------------------------------
// PATCH /api/schedule — one typed request per action
// ---------------------------------------------------------------------------

test('every PATCH action the route accepts has a request shape, and no more', () => {
  assert.deepEqual(SCHEDULE_PATCH_ACTIONS, [
    'skip',
    'unskip',
    'uncomplete',
    'reschedule',
    'swap',
    'shift',
    'pause',
    'resume',
  ]);
  // The three that need no workoutDate, per the route's programLevelActions.
  assert.deepEqual(SCHEDULE_PROGRAM_LEVEL_ACTIONS, ['shift', 'pause', 'resume']);

  // The union is discriminated on `action`, so it covers exactly those eight.
  for (const action of SCHEDULE_PATCH_ACTIONS) {
    const attempt = SchedulePatchRequestSchema.safeParse({
      programId: 'p',
      action,
      workoutDate: '2026-09-14',
      newDate: '2026-09-15',
      swapWithDate: '2026-09-16',
      days: 2,
      resumeDate: '2026-09-15',
    });
    assert.equal(attempt.success, true, `${action} should be a member of the union`);
  }
  assert.equal(
    SchedulePatchRequestSchema.safeParse({ programId: 'p', action: 'delete' }).success,
    false,
    'an action the route would 400 on must not typecheck',
  );
});

test('the discriminant enforces each action’s OWN required fields', () => {
  const cases: Array<[string, Record<string, unknown>]> = [
    ['skip needs a workoutDate', { programId: 'p', action: 'skip' }],
    ['unskip needs a workoutDate', { programId: 'p', action: 'unskip' }],
    ['uncomplete needs a workoutDate', { programId: 'p', action: 'uncomplete' }],
    [
      'reschedule needs a newDate',
      { programId: 'p', action: 'reschedule', workoutDate: '2026-09-14' },
    ],
    [
      'swap needs a swapWithDate',
      { programId: 'p', action: 'swap', workoutDate: '2026-09-14' },
    ],
    ['shift needs days', { programId: 'p', action: 'shift' }],
    // `!days` in the route refuses 0, so a no-op shift must not typecheck.
    ['shift refuses 0 days', { programId: 'p', action: 'shift', days: 0 }],
    ['every action needs a programId', { action: 'pause' }],
  ];
  for (const [why, body] of cases) {
    assert.equal(SchedulePatchRequestSchema.safeParse(body).success, false, why);
  }

  // pause takes nothing else; resume's date is optional (today by default).
  assert.equal(
    SchedulePatchRequestSchema.safeParse({ programId: 'p', action: 'pause' }).success,
    true,
  );
  assert.equal(
    SchedulePatchRequestSchema.safeParse({ programId: 'p', action: 'resume' }).success,
    true,
  );
  // Negative days pull the remaining sessions forward.
  assert.equal(
    SchedulePatchRequestSchema.safeParse({ programId: 'p', action: 'shift', days: -3 })
      .success,
    true,
  );
});

test('a write body carries the tz the transport merges into it', () => {
  // apiFetch merges `tz` (minutes west of UTC) and `tzZone` into every
  // date-scoped write — so a request shape that refused them would reject the
  // very body the client sends. See src/tz.ts.
  const parsed = SchedulePatchRequestSchema.parse({
    programId: 'p',
    action: 'reschedule',
    workoutDate: '2026-09-14',
    newDate: '2026-09-15',
    tz: 240,
    tzZone: 'America/New_York',
  });
  assert.equal(parsed.tz, 240);
  assert.equal(parsed.tzZone, 'America/New_York');
  assert.equal(
    SchedulePatchRequestSchema.safeParse({
      programId: 'p',
      action: 'pause',
      tz: 'America/New_York',
    }).success,
    false,
    'tz is a number; the zone name is tzZone',
  );
});

test('the slot-level actions answer with the program’s slots, re-sorted', () => {
  const body = {
    message: 'Schedule updated: reschedule',
    schedule: {
      programId: 'strength-foundation',
      scheduledWorkouts: [
        {
          date: '2026-09-14T00:00:00.000Z',
          programId: 'strength-foundation',
          phase: 1,
          dayLabel: 'Day 1',
          workoutTitle: 'Lower Body Strength',
          status: 'scheduled',
        },
      ],
    },
  };
  const parsed = ScheduleSlotActionResponseSchema.parse(body);
  assert.equal(parsed.schedule.scheduledWorkouts[0]?.dayLabel, 'Day 1');
  assert.equal(slotDateKey(parsed.schedule.scheduledWorkouts[0]!.date), '2026-09-14');

  // A caller that does not know which action it sent reads the union.
  const viaUnion = SchedulePatchResponseSchema.parse(body);
  assert.ok('schedule' in viaUnion);
});

test('the program-level actions answer with counters and no slots', () => {
  const shifted = ScheduleProgramActionResponseSchema.parse({
    message: 'Schedule shifted by 2 day(s)',
    programId: 'strength-foundation',
    totalScheduledWorkouts: 12,
    futureWorkouts: 7,
    nextWorkout: '2026-09-16T00:00:00.000Z',
  });
  assert.equal(shifted.futureWorkouts, 7);
  assert.equal(slotDateKey(shifted.nextWorkout!), '2026-09-16');

  // pause (and resume with no schedule) answer with the two fields alone.
  const paused = { message: 'Program paused', programId: 'strength-foundation' };
  assert.equal(ScheduleProgramActionResponseSchema.parse(paused).programId, 'strength-foundation');

  // The union must not read a program answer as a slot answer: only one of the
  // two members can take each body.
  const viaUnion = SchedulePatchResponseSchema.parse(paused);
  assert.equal('schedule' in viaUnion, false);
  assert.equal(ScheduleSlotActionResponseSchema.safeParse(paused).success, false);
});

// ---------------------------------------------------------------------------
// POST /api/schedule and PUT /api/schedule/settings
// ---------------------------------------------------------------------------

test('POST /api/schedule: create needs a programId, training days and a start date', () => {
  const ok = ScheduleCreateRequestSchema.safeParse({
    programId: 'strength-foundation',
    trainingDays: [1, 3, 5],
    startDate: '2026-09-07',
    tz: 240,
  });
  assert.equal(ok.success, true);
  for (const [why, body] of [
    ['no startDate', { programId: 'p', trainingDays: [1] }],
    ['no trainingDays', { programId: 'p', startDate: '2026-09-07' }],
    ['empty trainingDays', { programId: 'p', trainingDays: [], startDate: '2026-09-07' }],
    ['a day that is not a day', { programId: 'p', trainingDays: [9], startDate: '2026-09-07' }],
  ] as Array<[string, Record<string, unknown>]>) {
    assert.equal(ScheduleCreateRequestSchema.safeParse(body).success, false, why);
  }

  const created = ScheduleCreateResponseSchema.parse({
    message: 'Schedule created successfully',
    schedule: {
      _id: '68f1c2a9b4d3e10012ab34cd',
      programId: 'strength-foundation',
      programName: 'Strength Foundation',
      settings: { trainingDays: [1, 3, 5], startDate: '2026-09-07T00:00:00.000Z' },
      totalScheduledWorkouts: 12,
      firstWorkout: '2026-09-07T00:00:00.000Z',
      lastWorkout: '2026-10-30T00:00:00.000Z',
    },
  });
  assert.deepEqual(created.schedule.settings?.trainingDays, [1, 3, 5]);
  assert.equal(slotDateKey(created.schedule.firstWorkout!), '2026-09-07');
});

test('PUT /api/schedule/settings: startDate is optional, and the answer counts the re-lay', () => {
  assert.equal(
    ScheduleSettingsUpdateRequestSchema.safeParse({
      programId: 'strength-foundation',
      trainingDays: [2, 4],
      tz: 240,
    }).success,
    true,
    'omitted startDate means "from the caller’s local today" — which is why tz is read',
  );
  assert.equal(
    ScheduleSettingsUpdateRequestSchema.safeParse({
      programId: 'strength-foundation',
      trainingDays: [],
    }).success,
    false,
  );

  const parsed = ScheduleSettingsUpdateResponseSchema.parse({
    message: 'Schedule settings updated and future workouts regenerated',
    schedule: {
      programId: 'strength-foundation',
      settings: { trainingDays: [2, 4], startDate: '2026-09-07T00:00:00.000Z' },
      totalScheduledWorkouts: 12,
      pastWorkouts: 5,
      futureWorkouts: 7,
    },
  });
  assert.deepEqual(parsed.schedule.settings?.trainingDays, [2, 4]);
  assert.equal(parsed.schedule.pastWorkouts + parsed.schedule.futureWorkouts, 12);
});
