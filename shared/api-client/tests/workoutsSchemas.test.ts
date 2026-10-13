// Run with: npm test   (shared/api-client)
//
// THE /api/workouts CONTRACT, AGAINST RECORDED RESPONSES (NP-018).
//
// WHERE THESE FIXTURES COME FROM
//
// Every `RECORDED_*` object below is a body a REAL route handler produced,
// printed by `webapp/tests/unit/contract/np018Workouts.test.ts` run with
// `CONTRACT_DUMP=1` — the beta code path, on the beta branch, against that
// suite's disposable loopback database. They are not recordings from the live
// beta SITE, and that is deliberate: beta and production share one MongoDB
// (AGENTS.md, "Channels"), so a body captured there would be a production
// member's data. Only the ids, names and timestamps are fixture values; the
// SHAPE — including every `null` the model defaults into a set, and every key
// the routes omit — is the server's own.
//
// WHAT EACH HALF CHECKS
//
// This file proves the schemas accept what the server sends and refuse what it
// does not. It cannot prove the server still sends it — that is what the webapp
// contract harness is for, and a failure there is fixed by changing the schema
// IN THAT PULL REQUEST. Keep the two in step.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import * as api from '../src/index';
import {
  ExerciseSuggestionsResponseSchema,
  FavoriteOrderResponseSchema,
  LastPerformanceResponseSchema,
  PastWorkoutLogResponseSchema,
  PlannedWorkoutsResponseSchema,
  ProgramWorkoutLogsResponseSchema,
  QuickSessionResponseSchema,
  ResolveIncompleteResponseSchema,
  WorkoutDiscardResponseSchema,
  WorkoutGatePayloadSchema,
  WorkoutHistoryResponseSchema,
  WorkoutInProgressResponseSchema,
  WorkoutLogCorrectionRequestSchema,
  WorkoutLogCorrectionResponseSchema,
  WorkoutProgramSaveRequestSchema,
  WorkoutQuickSaveRequestSchema,
  WorkoutResumeResponseSchema,
  WorkoutSaveRequestSchema,
  WorkoutSaveResponseSchema,
  QuickSessionPatchRequestSchema,
  QuickSessionPatchResponseSchema,
  QuickSessionDeleteResponseSchema,
} from '../src/schemas/workouts';

function ok(label: string, schema: { safeParse(v: unknown): { success: boolean; error?: unknown } }, value: unknown): void {
  const result = schema.safeParse(value);
  assert.equal(
    result.success,
    true,
    `${label} must parse the recorded response:\n${JSON.stringify(result.error, null, 2)}`,
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// The save BODY the web builds — POST /api/workouts, both halves
//
// Copied field for field from
// webapp/app/dashboard/workout/[programId]/workout/live/LiveWorkoutClient.tsx
// (`saveWorkout`). The same two objects are sent for real by the contract
// harness, so this is the body and not an idea of it.
// ═══════════════════════════════════════════════════════════════════════════

/** The completing save of a program day. */
const WEB_PROGRAM_SAVE_BODY = {
  programId: 'program_jon_don_split',
  phase: 1, // 1-BASED — rule 3
  day: 'Day 1',
  exercises: [
    {
      name: 'Barbell Bench Press',
      exerciseSlug: 'barbell-bench-press',
      sets: [
        { setNumber: 1, reps: 5, weight: 315, completed: true },
        { setNumber: 2, reps: 5, weight: 315, completed: true },
        // A SKIPPED set: completed, reps 0, weight 0 — rule 2.
        { setNumber: 3, reps: 0, weight: 0, completed: true },
      ],
      groupId: 'g1',
      groupType: 'superset',
      groupLabel: 'A',
      groupRounds: 3,
      prescription: { sets: 3, reps: '5', rest: '3 min', trackingType: 'reps_weight' },
      originalExerciseSlug: 'overhead-press',
      swappedFromName: 'Overhead Press',
    },
    {
      name: 'Treadmill Run',
      exerciseSlug: 'treadmill-run',
      // Timed work goes in duration/distance/speed, never reps/weight — rule 1.
      sets: [
        { setNumber: 1, reps: 0, weight: 0, duration: 600, distance: 1600, speed: 6.5, completed: true },
      ],
      prescription: { sets: 1, duration: '10 min', trackingType: 'time_distance' },
      addedAdHoc: true,
    },
  ],
  completed: true,
  activeSeconds: 2400,
  scheduledDate: '2026-09-30T00:00:00.000Z',
  duration: 40,
  performedAt: '2026-09-30T02:41:00.000Z', // only on the completing save — rule 4
  attemptId: 'wa-m1p2q3-abc12345',
  tz: 240, // minutes WEST of UTC, a NUMBER — rule 5
};

/** A quick (ad-hoc) session. Note `tzZone` beside `tz`. */
const WEB_QUICK_SAVE_BODY = {
  kind: 'quick' as const,
  sessionId: 'qs-1759192800000-7f3a',
  title: 'Upper Push',
  needsName: false,
  focus: 'upper',
  favorite: true,
  exercises: [
    {
      name: 'Barbell Bench Press',
      exerciseSlug: 'barbell-bench-press',
      sets: [{ setNumber: 1, reps: 8, weight: 200, completed: true }],
      prescription: { sets: 1, reps: '8', rest: '90 sec', trackingType: 'reps_weight' },
    },
    {
      name: 'Treadmill Run',
      exerciseSlug: 'treadmill-run',
      sets: [
        { setNumber: 1, reps: 0, weight: 0, duration: 900, distance: 2400, speed: 6, completed: true },
      ],
      prescription: { sets: 1, duration: '15 min', trackingType: 'time_distance' },
    },
  ],
  completed: true,
  activeSeconds: 1500,
  duration: 25,
  started: true,
  tz: 240,
  tzZone: 'America/New_York',
};

test('WorkoutSaveRequestSchema: the PROGRAM body the web builds validates', () => {
  const parsed = WorkoutSaveRequestSchema.safeParse(WEB_PROGRAM_SAVE_BODY);
  assert.equal(parsed.success, true, JSON.stringify(parsed.error, null, 2));
  assert.notEqual(parsed.data?.kind, 'quick');
  // …and it validates as the program member on its own, which is the type the
  // native live screen builds (expo/lib/live/workoutSave.ts).
  ok('WorkoutProgramSaveRequestSchema', WorkoutProgramSaveRequestSchema, WEB_PROGRAM_SAVE_BODY);
});

test('WorkoutSaveRequestSchema: the QUICK body the web builds validates', () => {
  const parsed = WorkoutSaveRequestSchema.safeParse(WEB_QUICK_SAVE_BODY);
  assert.equal(parsed.success, true, JSON.stringify(parsed.error, null, 2));
  assert.equal(parsed.data?.kind, 'quick');
  ok('WorkoutQuickSaveRequestSchema', WorkoutQuickSaveRequestSchema, WEB_QUICK_SAVE_BODY);
});

test('WorkoutSaveRequestSchema: an autosave omits performedAt and duration (rule 4)', () => {
  // Rule 4: `performedAt` travels only on the completing save, so an autosave
  // can never disturb the log's date.
  const autosave = { ...WEB_PROGRAM_SAVE_BODY, completed: false } as Record<string, unknown>;
  delete autosave.performedAt;
  delete autosave.duration;
  const parsed = WorkoutSaveRequestSchema.safeParse(autosave);
  assert.equal(parsed.success, true, JSON.stringify(parsed.error, null, 2));
});

test('WorkoutSaveRequestSchema: the union keeps the two halves apart', () => {
  // A program body with no programId is not "a quick session with bits
  // missing"; it is refused here instead of coming back as a 400 from a device.
  const noProgram = { ...WEB_PROGRAM_SAVE_BODY } as Record<string, unknown>;
  delete noProgram.programId;
  assert.equal(WorkoutSaveRequestSchema.safeParse(noProgram).success, false);

  const noDay = { ...WEB_PROGRAM_SAVE_BODY } as Record<string, unknown>;
  delete noDay.day;
  assert.equal(WorkoutSaveRequestSchema.safeParse(noDay).success, false);

  const noSession = { ...WEB_QUICK_SAVE_BODY } as Record<string, unknown>;
  delete noSession.sessionId;
  assert.equal(WorkoutSaveRequestSchema.safeParse(noSession).success, false);

  // An unknown `kind` is not a save at all.
  assert.equal(
    WorkoutSaveRequestSchema.safeParse({ ...WEB_QUICK_SAVE_BODY, kind: 'freestyle' }).success,
    false,
  );
});

test('WorkoutSaveRequestSchema: tz is a NUMBER, minutes west of UTC (rule 5)', () => {
  // The IANA zone name travels as `tzZone`. Sent as `tz` the server reads it
  // with Number(), gets NaN and answers for the UTC day — and POST /api/workouts
  // PERSISTS what it read as the member's zone.
  assert.equal(
    WorkoutSaveRequestSchema.safeParse({ ...WEB_PROGRAM_SAVE_BODY, tz: '240' }).success,
    false,
  );
  assert.equal(
    WorkoutSaveRequestSchema.safeParse({ ...WEB_PROGRAM_SAVE_BODY, tz: 'America/New_York' }).success,
    false,
  );
  assert.equal(
    WorkoutSaveRequestSchema.safeParse({ ...WEB_QUICK_SAVE_BODY, tz: '-60' }).success,
    false,
  );
});

// ═══════════════════════════════════════════════════════════════════════════
// POST /api/workouts — the recorded responses
// ═══════════════════════════════════════════════════════════════════════════

const RECORDED_PROGRAM_AUTOSAVE_RESPONSE = {
  message: 'Workout saved successfully',
  completed: false,
  programCompleted: false,
};

const RECORDED_PROGRAM_COMPLETE_RESPONSE = {
  message: 'Workout saved successfully',
  completed: true,
  programCompleted: true,
  programName: 'NP018 Contract Strength',
  newPRsAchieved: [
    {
      exerciseSlug: 'np018-barbell-bench-press',
      exerciseName: 'Barbell Bench Press',
      dimensions: ['maxWeight', 'maxReps', 'maxE1RM'],
    },
  ],
  streak: {
    streakDays: 5,
    streakExtended: true,
    freezeUsed: true,
    newMilestone: 3,
    longestStreak: 9,
  },
};

const RECORDED_QUICK_SAVE_RESPONSE = {
  message: 'Quick session saved successfully',
  completed: true,
  newPRsAchieved: [
    {
      exerciseSlug: 'np018-barbell-bench-press',
      exerciseName: 'Barbell Bench Press',
      dimensions: ['maxReps'],
    },
  ],
  streak: {
    streakDays: 5,
    streakExtended: false,
    freezeUsed: false,
    newMilestone: null,
    longestStreak: 9,
  },
};

const RECORDED_FAVORITE_DENIED_RESPONSE = {
  message: 'Quick session saved successfully',
  completed: true,
  favoriteDenied: {
    error: "You've starred all 3 of your free sessions.",
    requiresTier: 'plus',
    feature: 'custom-sessions',
    limit: 3,
    remaining: 0,
    resetsAt: null,
    window: 'lifetime',
  },
  newPRsAchieved: [
    {
      exerciseSlug: 'np018-barbell-bench-press',
      exerciseName: 'Barbell Bench Press',
      dimensions: ['maxWeight', 'maxReps', 'maxE1RM'],
    },
  ],
  streak: {
    streakDays: 1,
    streakExtended: true,
    freezeUsed: false,
    newMilestone: null,
    longestStreak: 1,
  },
};

test('WorkoutSaveResponseSchema: the recorded autosave response', () => {
  ok('WorkoutSaveResponseSchema', WorkoutSaveResponseSchema, RECORDED_PROGRAM_AUTOSAVE_RESPONSE);
});

test('WorkoutSaveResponseSchema: the recorded completing save, with PRs and streak', () => {
  const parsed = WorkoutSaveResponseSchema.parse(RECORDED_PROGRAM_COMPLETE_RESPONSE);
  assert.equal(parsed.programCompleted, true);
  assert.equal(parsed.programName, 'NP018 Contract Strength');
  // `streak` was missing from this schema entirely before NP-018, so the finish
  // screen had nothing typed to read the day's streak out of.
  assert.equal(parsed.streak?.streakDays, 5);
  assert.equal(parsed.streak?.freezeUsed, true);
  assert.equal(parsed.streak?.longestStreak, 9);
  assert.equal(parsed.streak?.newMilestone, 3);
});

test('WorkoutSaveResponseSchema: the recorded quick-session response', () => {
  const parsed = WorkoutSaveResponseSchema.parse(RECORDED_QUICK_SAVE_RESPONSE);
  assert.equal(parsed.completed, true);
  // A quick save carries no programCompleted/programName at all.
  assert.equal(parsed.programCompleted, undefined);
  assert.equal(parsed.streak?.newMilestone, null);
});

test('WorkoutSaveResponseSchema: favoriteDenied carries the canonical gate', () => {
  const parsed = WorkoutSaveResponseSchema.parse(RECORDED_FAVORITE_DENIED_RESPONSE);
  // The save SUCCEEDED — logging is history and history is not a paid feature.
  assert.equal(parsed.completed, true);
  assert.equal(parsed.favoriteDenied?.feature, 'custom-sessions');
  assert.equal(parsed.favoriteDenied?.requiresTier, 'plus');
  assert.equal(parsed.favoriteDenied?.remaining, 0);
  assert.equal(parsed.favoriteDenied?.resetsAt, null);
});

test('WorkoutSaveResponseSchema: a shipped build KEEPS a field it has never heard of', () => {
  // Forward compatibility is the reason every response schema here is
  // `.passthrough()`: a store build outlives the server it was written against.
  // The webapp contract harness is what stops that tolerance from hiding a
  // rename — this only checks the tolerance is actually there, including through
  // the `.extend()` on the streak block.
  const grown = {
    ...RECORDED_PROGRAM_COMPLETE_RESPONSE,
    somethingTheServerGrew: 'kept',
    streak: { ...RECORDED_PROGRAM_COMPLETE_RESPONSE.streak, superStreakDays: 4 },
  };
  const parsed = WorkoutSaveResponseSchema.parse(grown) as Record<string, unknown>;
  assert.equal(parsed.somethingTheServerGrew, 'kept');
  assert.equal((parsed.streak as Record<string, unknown>).superStreakDays, 4);
});

test('WorkoutSaveResponseSchema: rejects a malformed PR entry', () => {
  assert.equal(
    WorkoutSaveResponseSchema.safeParse({ newPRsAchieved: [{ exerciseSlug: 'bench' }] }).success,
    false,
  );
});

// ═══════════════════════════════════════════════════════════════════════════
// GET /api/workouts — resume the day
// ═══════════════════════════════════════════════════════════════════════════

const RECORDED_RESUME_RESPONSE = {
  workout: {
    date: '2026-09-30T11:13:30.101Z',
    programId: 'np018-contract-strength',
    phase: 1,
    day: 'Day 1',
    kind: 'program',
    attemptId: 'np018-attempt-1',
    completed: false,
    startedAt: '2026-09-30T11:13:30.101Z',
    activeSeconds: 2400,
    exercises: [
      {
        name: 'Barbell Bench Press',
        exerciseSlug: 'np018-barbell-bench-press',
        sets: [
          // Every measurement the member did not log comes back as null, not
          // absent: webapp/models/UserProgress.ts DEFAULTS them.
          { setNumber: 1, reps: 5, weight: 315, duration: null, distance: null, speed: null, completed: true },
          { setNumber: 2, reps: 5, weight: 315, duration: null, distance: null, speed: null, completed: true },
          { setNumber: 3, reps: 0, weight: 0, duration: null, distance: null, speed: null, completed: true },
        ],
        groupId: 'np018-g1',
        groupType: 'superset',
        groupLabel: 'A',
        groupRounds: 3,
        prescription: { sets: 3, reps: '5', rest: '3 min', trackingType: 'reps_weight' },
        originalExerciseSlug: 'np018-overhead-press',
        swappedFromName: 'Overhead Press',
      },
      {
        name: 'Treadmill Run',
        exerciseSlug: 'np018-treadmill-run',
        sets: [
          { setNumber: 1, reps: 0, weight: 0, duration: 600, distance: 1600, speed: 6.5, completed: true },
        ],
        addedAdHoc: true,
        prescription: { sets: 1, duration: '10 min', trackingType: 'time_distance' },
      },
    ],
  },
  isResume: true,
  exerciseHistory: {
    'Barbell Bench Press': { weight: 245, reps: 3, duration: null, date: '2026-09-20T11:13:29.855Z' },
  },
  exercisePRs: { 'Barbell Bench Press': { weight: 225, reps: 5 } },
  staleIncomplete: {
    day: 'Day 2',
    phase: 1,
    date: '2026-09-27T11:13:29.855Z',
    exercises: [
      {
        name: 'Barbell Bench Press',
        exerciseSlug: 'np018-barbell-bench-press',
        sets: [
          { setNumber: 1, reps: 5, weight: 185, duration: null, distance: null, speed: null, completed: true },
          { setNumber: 2, reps: 0, weight: 0, duration: null, distance: null, speed: null, completed: false },
        ],
      },
    ],
    completedExerciseCount: 1,
    totalExerciseCount: 1,
  },
};

/** The one answer for a member with no UserProgress document at all. */
const RECORDED_RESUME_EMPTY_RESPONSE = {
  workout: null,
  isResume: false,
  exerciseHistory: {},
};

test('WorkoutResumeResponseSchema: the recorded resume response', () => {
  const parsed = WorkoutResumeResponseSchema.parse(RECORDED_RESUME_RESPONSE);
  assert.equal(parsed.isResume, true);
  // Rule 3: 1-based on the wire.
  assert.equal(parsed.workout?.phase, 1);
  // Rule 1: timed work is read back out of duration/distance, and the reps 0
  // beside it is not a rep count.
  const treadmill = parsed.workout?.exercises.find((ex) => ex.exerciseSlug === 'np018-treadmill-run');
  assert.equal(treadmill?.sets[0]?.duration, 600);
  assert.equal(treadmill?.sets[0]?.distance, 1600);
  assert.equal(treadmill?.sets[0]?.reps, 0);
  // Rule 2: the skipped bench set is completed with reps 0 / weight 0.
  const bench = parsed.workout?.exercises.find((ex) => ex.exerciseSlug === 'np018-barbell-bench-press');
  assert.deepEqual(
    bench?.sets.map((s) => [s.reps, s.weight, s.completed]),
    [[5, 315, true], [5, 315, true], [0, 0, true]],
  );
  assert.equal(parsed.staleIncomplete?.day, 'Day 2');
});

test('WorkoutResumeResponseSchema: the recorded answer for a member with no progress row', () => {
  const parsed = WorkoutResumeResponseSchema.parse(RECORDED_RESUME_EMPTY_RESPONSE);
  // exercisePRs and staleIncomplete are absent here — which is exactly why they
  // are optional and not `nullable()` alone.
  assert.equal(parsed.exercisePRs, undefined);
  assert.equal(parsed.staleIncomplete, undefined);
});

test('WorkoutResumeResponseSchema: refuses a set measurement that is not a number', () => {
  const broken = JSON.parse(JSON.stringify(RECORDED_RESUME_RESPONSE)) as typeof RECORDED_RESUME_RESPONSE;
  (broken.workout.exercises[0]!.sets[0] as unknown as { weight: unknown }).weight = '315';
  assert.equal(WorkoutResumeResponseSchema.safeParse(broken).success, false);
});

test('WorkoutDiscardResponseSchema: the recorded DELETE /api/workouts response', () => {
  ok('WorkoutDiscardResponseSchema', WorkoutDiscardResponseSchema, { success: true });
});

// ═══════════════════════════════════════════════════════════════════════════
// GET /api/workouts/in-progress
// ═══════════════════════════════════════════════════════════════════════════

const RECORDED_IN_PROGRESS_WORKOUT = {
  workout: {
    kind: 'program',
    programId: 'np018-contract-strength',
    day: 'Day 1',
    phase: 1,
    // Every field a program log does not have comes back NULL rather than
    // absent, so a client reads one shape for both kinds.
    sessionId: null,
    title: null,
    exerciseCount: 2,
    startedAt: '2026-09-30T11:13:30.139Z',
  },
  planned: null,
};

const RECORDED_IN_PROGRESS_PLANNED = {
  workout: null,
  planned: {
    kind: 'quick',
    sessionId: 'np018-plan-today',
    title: 'Planned for today',
    exerciseCount: 0,
  },
};

test('WorkoutInProgressResponseSchema: the recorded `workout` branch', () => {
  const parsed = WorkoutInProgressResponseSchema.parse(RECORDED_IN_PROGRESS_WORKOUT);
  assert.equal(parsed.workout?.kind, 'program');
  assert.equal(parsed.workout?.sessionId, null);
  assert.equal(parsed.planned, null);
});

test('WorkoutInProgressResponseSchema: the recorded `planned` branch', () => {
  const parsed = WorkoutInProgressResponseSchema.parse(RECORDED_IN_PROGRESS_PLANNED);
  // A "Plan it" placeholder nobody opened is real information, but it is not a
  // workout in progress — the two live in different keys for that reason.
  assert.equal(parsed.workout, null);
  assert.equal(parsed.planned?.kind, 'quick');
});

// ═══════════════════════════════════════════════════════════════════════════
// GET /api/workouts/last-performance
// ═══════════════════════════════════════════════════════════════════════════

const RECORDED_LAST_PERFORMANCE = {
  performances: {
    'np018-barbell-bench-press': {
      reps: 8,
      weight: 200,
      speed: null,
      duration: null,
      distance: null,
      date: '2026-09-30T11:13:30.183Z',
    },
    'np018-treadmill-run': {
      reps: 0,
      weight: 0,
      speed: 6,
      duration: 900,
      distance: 2400,
      date: '2026-09-30T11:13:30.183Z',
    },
    // Matched through the SWAP TRAIL: the member never logged this slug under
    // its own name, but a bench set carries it as `originalExerciseSlug`.
    'np018-overhead-press': {
      reps: 0,
      weight: 0,
      speed: null,
      duration: null,
      distance: null,
      date: '2026-09-30T11:13:30.152Z',
      programId: 'np018-contract-strength',
    },
  },
  prs: { 'Barbell Bench Press': { weight: 315, reps: 5 } },
};

test('LastPerformanceResponseSchema: the recorded prefill response', () => {
  const parsed = LastPerformanceResponseSchema.parse(RECORDED_LAST_PERFORMANCE);
  assert.equal(parsed.performances['np018-treadmill-run']?.duration, 900);
  assert.equal(parsed.performances['np018-overhead-press']?.programId, 'np018-contract-strength');
  assert.equal(parsed.prs?.['Barbell Bench Press']?.weight, 315);
});

test('LastPerformanceResponseSchema: a slug with no history is null, and `prs` may be absent', () => {
  // The empty answer for a request that named no slugs at all.
  const parsed = LastPerformanceResponseSchema.parse({ performances: {} });
  assert.deepEqual(parsed.performances, {});
  assert.equal(parsed.prs, undefined);

  ok('LastPerformanceResponseSchema (null entry)', LastPerformanceResponseSchema, {
    performances: { 'never-done-this': null },
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// GET /api/workouts/logs — two responses, one route
// ═══════════════════════════════════════════════════════════════════════════

const RECORDED_PROGRAM_LOGS = {
  logs: [
    { day: 'Day 2', phase: 1, completed: true, date: '2026-09-10T11:13:29.855Z', duration: 44 },
    { day: 'Day 1', phase: 1, completed: true, date: '2026-09-20T11:13:29.855Z', duration: 48 },
    // An open log carries no duration at all.
    { day: 'Day 2', phase: 1, completed: false, date: '2026-09-27T11:13:29.855Z' },
  ],
};

const RECORDED_HISTORY = {
  logs: [
    {
      kind: 'quick',
      title: 'Contract Quick Session',
      focus: 'upper',
      sessionId: 'np018-quick-session',
      completed: true,
      skipped: false,
      favorite: true,
      date: '2026-09-30T11:13:30.183Z',
      duration: 25,
      exerciseCount: 2,
      completedSets: 2,
      // `?withExercises=true`: the DraftExercise shape a session is REOPENED
      // from. `sets` is a count and `reps`/`duration`/`rest` are prescription
      // strings — this is what to do, not what was done.
      exercises: [
        {
          exerciseSlug: 'np018-barbell-bench-press',
          name: 'Barbell Bench Press',
          trackingType: 'reps_weight',
          equipment: ['barbell', 'flat_bench'],
          laterality: 'bilateral',
          movementPatterns: ['horizontal_push'],
          sets: 1,
          reps: '8',
          rest: '90 sec',
        },
        {
          exerciseSlug: 'np018-treadmill-run',
          name: 'Treadmill Run',
          trackingType: 'time_distance',
          equipment: ['treadmill'],
          laterality: 'bilateral',
          movementPatterns: ['gait'],
          sets: 1,
          // Timed work: no rep prescription, a duration instead — rule 1.
          reps: '',
          duration: '15 min',
        },
      ],
    },
    {
      kind: 'program',
      title: 'NP018 Contract Strength · Day 1',
      programId: 'np018-contract-strength',
      programName: 'NP018 Contract Strength',
      day: 'Day 1',
      phase: 1,
      completed: true,
      skipped: false,
      favorite: false,
      date: '2026-09-30T11:13:30.152Z',
      duration: 40,
      exerciseCount: 2,
      completedSets: 4,
      // A program day is resolved from the program itself: no draft here.
    },
  ],
  favoriteSessionOrder: [],
};

test('ProgramWorkoutLogsResponseSchema: the recorded ?programId= response', () => {
  const parsed = ProgramWorkoutLogsResponseSchema.parse(RECORDED_PROGRAM_LOGS);
  assert.equal(parsed.logs.length, 3);
  // Rule 3.
  assert.equal(parsed.logs.every((log) => log.phase === 1), true);
});

test('WorkoutHistoryResponseSchema: the recorded history response', () => {
  const parsed = WorkoutHistoryResponseSchema.parse(RECORDED_HISTORY);
  const quick = parsed.logs[0]!;
  assert.equal(quick.kind, 'quick');
  assert.equal(quick.favorite, true);
  assert.equal(quick.exercises?.[1]?.reps, '');
  assert.equal(quick.exercises?.[1]?.duration, '15 min');
  assert.equal(parsed.logs[1]!.exercises, undefined);
  assert.deepEqual(parsed.favoriteSessionOrder, []);
});

test('WorkoutHistoryResponseSchema: a draft `sets` is a COUNT and `reps` a STRING', () => {
  // The two are the easiest fields in this domain to get backwards, and getting
  // them backwards is what strips the weight column off a reopened session.
  const broken = JSON.parse(JSON.stringify(RECORDED_HISTORY)) as typeof RECORDED_HISTORY;
  (broken.logs[0]!.exercises![0] as unknown as { sets: unknown }).sets = [{ reps: 8 }];
  assert.equal(WorkoutHistoryResponseSchema.safeParse(broken).success, false);

  const broken2 = JSON.parse(JSON.stringify(RECORDED_HISTORY)) as typeof RECORDED_HISTORY;
  (broken2.logs[0]!.exercises![0] as unknown as { reps: unknown }).reps = 8;
  assert.equal(WorkoutHistoryResponseSchema.safeParse(broken2).success, false);
});

// ═══════════════════════════════════════════════════════════════════════════
// PATCH /api/workouts/logs — a correction
// ═══════════════════════════════════════════════════════════════════════════

test('WorkoutLogCorrectionRequestSchema: the body the correction modal builds', () => {
  // components/workout/TrainingLogCorrectionModal.tsx builds one of these two
  // locators, never a blend of them.
  const quick = {
    locator: { kind: 'quick', sessionId: 'qs-1759192800000-7f3a', date: '2026-09-30T11:13:30.183Z' },
    correction: {
      title: 'Upper Push (corrected)',
      duration: 26,
      notes: 'Weight was wrong on the bench.',
      exercises: [
        {
          name: 'Barbell Bench Press',
          exerciseSlug: 'barbell-bench-press',
          sets: [{ setNumber: 1, reps: 8, weight: 190, completed: true }],
        },
      ],
    },
  };
  const parsedQuick = WorkoutLogCorrectionRequestSchema.safeParse(quick);
  assert.equal(parsedQuick.success, true, JSON.stringify(parsedQuick.error, null, 2));
  assert.equal(parsedQuick.data?.locator.kind, 'quick');

  const program = {
    locator: {
      kind: 'program',
      programId: 'program_jon_don_split',
      day: 'Day 1',
      date: '2026-09-20T11:13:29.855Z',
    },
    correction: {
      exercises: [
        {
          name: 'Treadmill Run',
          exerciseSlug: 'treadmill-run',
          sets: [
            { setNumber: 1, reps: 0, weight: 0, duration: 960, distance: 2500, speed: 6.2, completed: true },
          ],
        },
      ],
    },
  };
  const parsedProgram = WorkoutLogCorrectionRequestSchema.safeParse(program);
  assert.equal(parsedProgram.success, true, JSON.stringify(parsedProgram.error, null, 2));
  assert.equal(parsedProgram.data?.locator.kind, 'program');

  // A program locator without its day is refused here, not by the route's 400.
  const noDay = JSON.parse(JSON.stringify(program)) as Record<string, Record<string, unknown>>;
  delete noDay.locator!.day;
  assert.equal(WorkoutLogCorrectionRequestSchema.safeParse(noDay).success, false);
});

test('WorkoutLogCorrectionResponseSchema: the recorded response', () => {
  const parsed = WorkoutLogCorrectionResponseSchema.parse({ success: true, recalculatedPRs: 0 });
  assert.equal(parsed.success, true);
  // A COUNT of the exercises the member holds a record for after the replay.
  assert.equal(typeof parsed.recalculatedPRs, 'number');
});

// ═══════════════════════════════════════════════════════════════════════════
// GET /api/workouts/log — one past program day
// ═══════════════════════════════════════════════════════════════════════════

const RECORDED_PAST_LOG = {
  log: {
    date: '2026-09-20T11:13:29.855Z',
    programId: 'np018-contract-strength',
    phase: 1,
    day: 'Day 1',
    kind: 'program',
    completed: true,
    duration: 48,
    startedAt: '2026-09-20T11:13:29.855Z',
    activeSeconds: 2880,
    notes: 'Felt strong.',
    exercises: [
      {
        name: 'Barbell Bench Press',
        exerciseSlug: 'np018-barbell-bench-press',
        sets: [
          { setNumber: 1, reps: 5, weight: 225, duration: null, distance: null, speed: null, completed: true },
          { setNumber: 2, reps: 3, weight: 245, duration: null, distance: null, speed: null, completed: true },
        ],
      },
    ],
  },
  exerciseHistory: {
    'Barbell Bench Press': { weight: 205, reps: 5, duration: null, date: '2026-09-10T11:13:29.855Z' },
  },
};

test('PastWorkoutLogResponseSchema: the recorded single-day response', () => {
  const parsed = PastWorkoutLogResponseSchema.parse(RECORDED_PAST_LOG);
  assert.equal(parsed.log?.day, 'Day 1');
  assert.equal(parsed.log?.notes, 'Felt strong.');
  // The history is relative to THAT day, not to today.
  assert.equal(parsed.exerciseHistory['Barbell Bench Press']?.weight, 205);
});

test('PastWorkoutLogResponseSchema: a day with no log answers null, not an error', () => {
  const parsed = PastWorkoutLogResponseSchema.parse({ log: null, exerciseHistory: {} });
  assert.equal(parsed.log, null);
});

// ═══════════════════════════════════════════════════════════════════════════
// The quick-session routes
// ═══════════════════════════════════════════════════════════════════════════

const RECORDED_PLANNED = {
  planned: [
    {
      sessionId: 'np018-planned-session',
      title: 'Planned Upper',
      needsName: false,
      focus: 'upper',
      date: '2026-10-03T11:13:29.855Z',
      exerciseCount: 1,
      exercises: [
        {
          exerciseSlug: 'np018-barbell-bench-press',
          name: 'Barbell Bench Press',
          trackingType: 'reps_weight',
          equipment: ['barbell', 'flat_bench'],
          laterality: 'bilateral',
          movementPatterns: ['horizontal_push'],
          sets: 3,
          reps: '8',
          rest: '90 sec',
          // Grouping survives the round trip, or a planned superset starts as
          // two unrelated exercises.
          groupId: 'np018-p1',
          groupType: 'superset',
          groupLabel: 'A',
          groupRounds: 2,
        },
      ],
    },
  ],
};

const RECORDED_QUICK_SESSION = {
  session: {
    sessionId: 'np018-quick-session',
    title: 'Corrected Quick Session',
    needsName: false,
    focus: 'upper',
    date: '2026-09-30T11:13:30.183Z',
    completed: true,
    duration: 26,
    exercises: [
      {
        name: 'Barbell Bench Press',
        exerciseSlug: 'np018-barbell-bench-press',
        trackingType: 'reps_weight',
        equipment: ['barbell', 'flat_bench'],
        laterality: 'bilateral',
        movementPatterns: ['horizontal_push'],
        sets: [
          { setNumber: 1, reps: 8, weight: 190, duration: null, distance: null, speed: null, completed: true },
        ],
        prescription: { sets: 1, reps: '8', rest: '90 sec', trackingType: 'reps_weight' },
      },
      {
        name: 'Treadmill Run',
        exerciseSlug: 'np018-treadmill-run',
        trackingType: 'time_distance',
        equipment: ['treadmill'],
        laterality: 'bilateral',
        movementPatterns: ['gait'],
        sets: [
          { setNumber: 1, reps: 0, weight: 0, duration: 960, distance: 2500, speed: 6.2, completed: true },
        ],
        prescription: { sets: 1, duration: '15 min', trackingType: 'time_distance' },
      },
    ],
  },
};

test('PlannedWorkoutsResponseSchema: the recorded planned-sessions response', () => {
  const parsed = PlannedWorkoutsResponseSchema.parse(RECORDED_PLANNED);
  assert.equal(parsed.planned[0]?.sessionId, 'np018-planned-session');
  assert.equal(parsed.planned[0]?.exercises[0]?.groupRounds, 2);
});

test('QuickSessionResponseSchema: the recorded session read', () => {
  const parsed = QuickSessionResponseSchema.parse(RECORDED_QUICK_SESSION);
  const treadmill = parsed.session?.exercises.find((ex) => ex.exerciseSlug === 'np018-treadmill-run');
  // Cardio is a distance and a speed, not a load — rule 1, on the way back.
  assert.equal(treadmill?.sets[0]?.distance, 2500);
  assert.equal(treadmill?.sets[0]?.speed, 6.2);
  assert.equal(treadmill?.trackingType, 'time_distance');
});

test('QuickSessionResponseSchema: a 404 answers the same shape with session null', () => {
  const parsed = QuickSessionResponseSchema.parse({ session: null });
  assert.equal(parsed.session, null);
});

test('QuickSessionPatchRequestSchema / responses: the recorded manage calls', () => {
  ok('QuickSessionPatchRequestSchema (re-date)', QuickSessionPatchRequestSchema, {
    id: 'np018-quick-session',
    date: '2026-09-29',
    tz: 240,
  });
  ok('QuickSessionPatchRequestSchema (rename + star)', QuickSessionPatchRequestSchema, {
    id: 'np018-quick-session',
    title: 'Renamed Quick Session',
    favorite: true,
    tz: 240,
  });
  ok('QuickSessionPatchRequestSchema (skip)', QuickSessionPatchRequestSchema, {
    id: 'np018-quick-session',
    skipped: true,
    tz: 240,
  });
  // `id` is the whole locator; without it the route answers 400.
  assert.equal(QuickSessionPatchRequestSchema.safeParse({ favorite: true }).success, false);

  ok('QuickSessionPatchResponseSchema', QuickSessionPatchResponseSchema, { success: true });
  ok('QuickSessionDeleteResponseSchema', QuickSessionDeleteResponseSchema, { success: true });
});

test('WorkoutGatePayloadSchema: the recorded 403 from starring at the free cap', () => {
  const parsed = WorkoutGatePayloadSchema.parse({
    error: "You've starred all 3 of your free sessions.",
    requiresTier: 'plus',
    feature: 'custom-sessions',
    limit: 3,
    remaining: 0,
    resetsAt: null,
    window: 'lifetime',
  });
  assert.equal(parsed.feature, api.CUSTOM_SESSIONS_FEATURE);
  assert.equal(parsed.requiresTier, 'plus');
  // A refusal with no wording is not a gate — the sheet renders `error` verbatim.
  assert.equal(
    WorkoutGatePayloadSchema.safeParse({ error: '', feature: 'custom-sessions', requiresTier: 'plus' }).success,
    false,
  );
});

// ═══════════════════════════════════════════════════════════════════════════
// PATCH /api/workouts/favorite-order
// ═══════════════════════════════════════════════════════════════════════════

test('FavoriteOrderResponseSchema: the recorded response is the order the server STORED', () => {
  const parsed = FavoriteOrderResponseSchema.parse({
    success: true,
    favoriteSessionOrder: ['np018-quick-session', 'np018-other-session'],
  });
  // The client renders this, not its own optimistic list: the server trims,
  // drops blanks and collapses duplicates on the way in.
  assert.deepEqual(parsed.favoriteSessionOrder, ['np018-quick-session', 'np018-other-session']);
});

// ═══════════════════════════════════════════════════════════════════════════
// POST /api/workouts/resolve-incomplete
// ═══════════════════════════════════════════════════════════════════════════

test('ResolveIncompleteResponseSchema: the recorded count and continue responses', () => {
  const counted = ResolveIncompleteResponseSchema.parse({
    action: 'count',
    nextDay: 'Day 1',
    nextPhase: 1,
  });
  assert.equal(counted.action, 'count');
  assert.equal(counted.nextPhase, 1); // 1-BASED — rule 3

  // `continue` and `restart` resolve the log without moving the program on.
  const continued = ResolveIncompleteResponseSchema.parse({
    action: 'continue',
    nextDay: null,
    nextPhase: null,
  });
  assert.equal(continued.nextDay, null);
  assert.equal(continued.nextPhase, null);

  // The four actions are a closed set; anything else is a 400 from the route.
  assert.deepEqual(api.RESOLVE_INCOMPLETE_ACTIONS, ['continue', 'restart', 'count', 'skip']);
  assert.equal(
    ResolveIncompleteResponseSchema.safeParse({ action: 'delete', nextDay: null, nextPhase: null }).success,
    false,
  );
});

// ═══════════════════════════════════════════════════════════════════════════
// GET /api/workouts/exercise-suggestions
// ═══════════════════════════════════════════════════════════════════════════

const RECORDED_SUGGESTIONS = {
  suggestions: [
    {
      id: 'workout.progression-nudge.np018-barbell-bench-press',
      severity: 'nudge',
      title: 'Progress Np018 Barbell Bench Press',
      body: 'Np018 Barbell Bench Press has shown up 4 times recently. If the last session moved cleanly, add a small load or one rep next time.',
      placement: 'exercise',
      primaryAction: { label: 'Open progress', href: '/dashboard/progress#records' },
      dismissible: true,
      cooldownDays: 4,
      source: 'workout',
      sourceData: { exerciseSlug: 'np018-barbell-bench-press', count: 4 },
    },
    {
      id: 'workout.plateau-warning.np018-barbell-bench-press',
      severity: 'warning',
      title: 'Np018 Barbell Bench Press may be stalling',
      body: 'Np018 Barbell Bench Press has repeated 5 times in the last few weeks without a recent PR. Consider a lighter technique day or a different rep target.',
      placement: 'exercise',
      primaryAction: { label: 'Review PRs', href: '/dashboard/progress#records' },
      dismissible: true,
      cooldownDays: 7,
      source: 'workout',
      sourceData: { exerciseSlug: 'np018-barbell-bench-press', count: 5 },
    },
  ],
};

test('ExerciseSuggestionsResponseSchema: the recorded exercise-scoped nudges', () => {
  const parsed = ExerciseSuggestionsResponseSchema.parse(RECORDED_SUGGESTIONS);
  assert.equal(parsed.suggestions.length, 2);
  assert.equal(parsed.suggestions[0]?.placement, 'exercise');
  assert.equal(parsed.suggestions[0]?.sourceData?.exerciseSlug, 'np018-barbell-bench-press');
  // A severity the engine grows must not make a shipped build drop the whole
  // response, so `severity` is a string and not an enum.
  ok('ExerciseSuggestionsResponseSchema (new severity)', ExerciseSuggestionsResponseSchema, {
    suggestions: [
      {
        id: 'workout.something-new.slug',
        severity: 'encouragement',
        title: 'T',
        body: 'B',
        placement: 'exercise',
        dismissible: false,
        source: 'workout',
      },
    ],
  });
  // An empty list is the ordinary answer and must parse.
  assert.deepEqual(ExerciseSuggestionsResponseSchema.parse({ suggestions: [] }).suggestions, []);
});

// ═══════════════════════════════════════════════════════════════════════════
// The speculative shapes are gone, and must stay gone
// ═══════════════════════════════════════════════════════════════════════════

test('the phaseIndex/workoutIndex shapes no route returns are not exported', () => {
  // `WorkoutLogSchema`, `WorkoutsListResponseSchema` and
  // `SaveWorkoutResponseSchema` described a `{ workouts: [ { programId,
  // phaseIndex, workoutIndex, … } ] }` API that does not exist: no route lists
  // workouts, no response carries a `workouts` key, and the server addresses a
  // session by 1-based `phase` + `day` LABEL. They also disagreed with the web's
  // own hand copy (`logs`/`day`/`phase`).
  //
  // A speculative schema is worse than no schema: it reads like a contract and
  // binds nothing. If one of these names comes back, this fails.
  for (const gone of [
    'WorkoutLogSchema',
    'WorkoutsListResponseSchema',
    'SaveWorkoutResponseSchema',
    'SetLogSchema',
    'ExerciseLogSchema',
  ]) {
    assert.equal(
      Object.prototype.hasOwnProperty.call(api, gone),
      false,
      `${gone} described a response no /api/workouts route returns. Use the shape the route `
        + 'really answers with (StoredWorkoutLogSchema, WorkoutHistoryResponseSchema, '
        + 'WorkoutSaveResponseSchema) instead of bringing it back.',
    );
  }
});

test('every schema NP-018 adds is exported from the package root', () => {
  // The native app imports from `@become/api-client`, not from the file, so a
  // schema missing from src/index.ts is a schema nobody can use.
  for (const name of [
    'WorkoutSaveRequestSchema',
    'WorkoutProgramSaveRequestSchema',
    'WorkoutQuickSaveRequestSchema',
    'WorkoutSaveResponseSchema',
    'WorkoutStreakResultSchema',
    'WorkoutGatePayloadSchema',
    'StoredWorkoutLogSchema',
    'WorkoutResumeResponseSchema',
    'WorkoutDiscardResponseSchema',
    'WorkoutInProgressResponseSchema',
    'LastPerformanceResponseSchema',
    'ProgramWorkoutLogsResponseSchema',
    'WorkoutHistoryResponseSchema',
    'WorkoutDraftExerciseSchema',
    'WorkoutLogCorrectionRequestSchema',
    'WorkoutLogCorrectionResponseSchema',
    'PastWorkoutLogResponseSchema',
    'PlannedWorkoutsResponseSchema',
    'QuickSessionResponseSchema',
    'QuickSessionPatchRequestSchema',
    'QuickSessionPatchResponseSchema',
    'QuickSessionDeleteResponseSchema',
    'FavoriteOrderRequestSchema',
    'FavoriteOrderResponseSchema',
    'ResolveIncompleteRequestSchema',
    'ResolveIncompleteResponseSchema',
    'ExerciseSuggestionsResponseSchema',
  ]) {
    assert.equal(
      Object.prototype.hasOwnProperty.call(api, name),
      true,
      `${name} is not exported from shared/api-client's src/index.ts`,
    );
  }
});
