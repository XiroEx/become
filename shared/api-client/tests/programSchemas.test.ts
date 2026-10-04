// Run with: npx tsx --test tests/programSchemas.test.ts
//
// NP-019 — the programs domain, re-aligned with the live routes.
//
// These are HAND-WRITTEN fixtures, so they agree with the schemas by
// construction and prove only that the shapes are internally coherent (the
// enums, the 1-based phase, the nullable vs optional distinction). What the
// routes ACTUALLY send is checked by
// webapp/tests/unit/contract/np019Programs.test.ts, which calls the real
// handlers. Both exist on purpose; neither replaces the other.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  ACTIVE_PROGRAM_STATUSES,
  ActiveProgramStatusSchema,
  ActiveProgramsApiResponseSchema,
  CurrentWorkoutExerciseSchema,
  CurrentWorkoutQuerySchema,
  CurrentWorkoutResponseSchema,
  CustomProgramDeleteResponseSchema,
  CustomProgramInputSchema,
  CustomProgramResponseSchema,
  CustomProgramUpdateRequestSchema,
  CustomProgramsResponseSchema,
  EXERCISE_GROUP_TYPES,
  ExerciseGroupTypeSchema,
  ProgramAbandonRequestSchema,
  ProgramAbandonResponseSchema,
  ProgramAlreadyEnrolledResponseSchema,
  ProgramDetailResponseSchema,
  ProgramEnrollRequestSchema,
  ProgramEnrollResponseSchema,
  ProgramExerciseSchema,
  ProgramJourneyResponseSchema,
  ProgramRecommendQuerySchema,
  ProgramRecommendResponseSchema,
  ProgramSearchQuerySchema,
  ProgramStartDateRequestSchema,
  ProgramStartDateResponseSchema,
  ProgramSwapDeleteQuerySchema,
  ProgramSwapRequestSchema,
  ProgramSwapResponseSchema,
  SaveProgramRequestSchema,
  SavedProgramsReorderRequestSchema,
  SavedProgramsReorderResponseSchema,
  SavedProgramsResponseSchema,
  ShareCreateRequestSchema,
  ShareCreateResponseSchema,
  TRACKING_TYPES,
} from '../src/index';

// ---------------------------------------------------------------------------
// The hydrated exercise — one shape for detail AND current-workout.
// ---------------------------------------------------------------------------

/** Everything webapp/lib/hydrateExercises.ts can put on one exercise. */
const FULLY_HYDRATED_EXERCISE = {
  exerciseSlug: 'barbell-back-squat',
  name: 'Barbell Back Squat',
  category: 'strength',
  type: 'strength',
  sets: 4,
  reps: '5-8',
  rest: '2-3 min',
  tempo: '3-1-1-0',
  rpe: 8,
  percentOf1RM: 75,
  duration: '30 sec',
  role: 'compound',
  details: 'Brace before you unrack.',
  tip: 'Knees track over the toes.',
  groupId: 'g1',
  groupType: 'superset',
  groupLabel: 'A',
  groupRest: '90 sec',
  groupRounds: 3,
  trackingType: 'reps_weight',
  difficulty: 'intermediate',
  laterality: 'bilateral',
  primaryMuscles: ['quadriceps', 'glutes'],
  equipment: ['barbell', 'rack'],
  movementPatterns: ['squat'],
  videoUrl: 'https://cdn.example.com/squat.mp4',
  thumbnailUrl: 'https://cdn.example.com/squat.jpg',
  videoWidth: 1080,
  videoHeight: 1920,
  videoFraming: { fit: 'cover', positionX: 50, positionY: 40, zoom: 1.2 },
  videoTrim: { start: 1.5, end: 8 },
};

test('ProgramExerciseSchema: types every field hydrateExercises can add', () => {
  const result = ProgramExerciseSchema.safeParse(FULLY_HYDRATED_EXERCISE);
  assert.equal(result.success, true, JSON.stringify(result, null, 2));
  if (!result.success) return;

  // The fields the live screen used to hand-cast off an untyped object are
  // now typed properties, not passthrough extras.
  assert.equal(result.data.trackingType, 'reps_weight');
  assert.equal(result.data.groupId, 'g1');
  assert.equal(result.data.groupType, 'superset');
  assert.equal(result.data.groupLabel, 'A');
  assert.equal(result.data.groupRounds, 3);
  assert.equal(result.data.rest, '2-3 min');
  assert.equal(result.data.tempo, '3-1-1-0');
  assert.equal(result.data.videoUrl, 'https://cdn.example.com/squat.mp4');
  assert.equal(result.data.videoWidth, 1080);
  assert.equal(result.data.videoFraming?.fit, 'cover');
  assert.equal(result.data.videoTrim?.start, 1.5);
});

test('ProgramExerciseSchema: a bare slug is still a valid exercise', () => {
  // An unhydratable slug (`__protocol__amrap-10`, or a catalog row an admin
  // deleted) comes back with almost nothing on it.
  const result = ProgramExerciseSchema.safeParse({
    exerciseSlug: '__protocol__amrap-10',
    name: 'AMRAP 10',
    type: 'conditioning',
  });
  assert.equal(result.success, true);
});

test('CurrentWorkoutExerciseSchema IS ProgramExerciseSchema — one shape, two routes', () => {
  assert.equal(CurrentWorkoutExerciseSchema, ProgramExerciseSchema);
  assert.equal(
    CurrentWorkoutExerciseSchema.safeParse(FULLY_HYDRATED_EXERCISE).success,
    true,
  );
});

test('ExerciseGroupTypeSchema: the six wire values, with the underscore in giant_set', () => {
  assert.deepEqual(EXERCISE_GROUP_TYPES, [
    'superset',
    'circuit',
    'triset',
    'giant_set',
    'emom',
    'amrap',
  ]);
  for (const value of EXERCISE_GROUP_TYPES) {
    assert.equal(ExerciseGroupTypeSchema.safeParse(value).success, true);
  }
  // The native display spelling is NOT the wire value.
  assert.equal(ExerciseGroupTypeSchema.safeParse('giantset').success, false);
  assert.equal(
    ProgramExerciseSchema.safeParse({ groupType: 'giantset' }).success,
    false,
  );
});

test('trackingType stays a plain string so a new catalog value cannot break a shipped build', () => {
  assert.ok(TRACKING_TYPES.includes('time_distance'));
  // A value the shipped enum has never heard of still parses on the exercise…
  const grown = ProgramExerciseSchema.safeParse({
    exerciseSlug: 'x',
    trackingType: 'reps_band_tension',
  });
  assert.equal(grown.success, true);
});

// ---------------------------------------------------------------------------
// Program detail
// ---------------------------------------------------------------------------

test('ProgramDetailResponseSchema: parses a hydrated program carrying the group + video fields', () => {
  const result = ProgramDetailResponseSchema.safeParse({
    _id: '6ab0150000000000000f0001',
    __v: 0,
    program_id: 'strength-foundation',
    name: 'Strength Foundation',
    description: 'Base strength',
    duration_weeks: 8,
    training_days_per_week: 4,
    goal: 'Build strength',
    target_user: 'Beginner to Intermediate',
    equipment: ['barbell'],
    tags: ['strength'],
    isCustom: false,
    coverParallax: false,
    coverZoom: 1,
    coverPositionX: 50,
    coverPositionY: 50,
    phases: [
      {
        phase: 'Phase 1',
        weeks: '1-4',
        focus: 'Accumulation',
        workouts: [
          {
            day: 'Day 1',
            title: 'Lower A',
            exercises: [FULLY_HYDRATED_EXERCISE],
          },
        ],
      },
    ],
  });
  assert.equal(result.success, true, JSON.stringify(result, null, 2));
  if (!result.success) return;
  const exercise = result.data.phases[0]?.workouts[0]?.exercises[0];
  assert.equal(exercise?.groupType, 'superset');
  assert.equal(exercise?.trackingType, 'reps_weight');
  assert.equal(exercise?.videoHeight, 1920);
});

test('ProgramDetailResponseSchema: a search-projected phase (no workouts) still parses', () => {
  const result = ProgramDetailResponseSchema.safeParse({
    program_id: 'p1',
    name: 'Push Pull Legs',
    phases: [{ phase: 'Phase 1', weeks: '1-6', focus: 'Volume' }],
  });
  assert.equal(result.success, true);
  if (result.success) assert.deepEqual(result.data.phases[0]?.workouts, []);
});

// ---------------------------------------------------------------------------
// Current workout
// ---------------------------------------------------------------------------

test('CurrentWorkoutResponseSchema: phase is 1-based on the wire', () => {
  const body = {
    workout: {
      day: 'Day 1',
      title: 'Lower A',
      exercises: [FULLY_HYDRATED_EXERCISE],
    },
    phase: 1,
    day: 'Day 1',
    phaseInfo: { name: 'Phase 1', focus: 'Accumulation', weeks: '1-4' },
    completedWorkouts: 2,
    totalWorkouts: 16,
  };
  assert.equal(CurrentWorkoutResponseSchema.safeParse(body).success, true);
  // Zero would be an array index leaking onto the wire.
  assert.equal(
    CurrentWorkoutResponseSchema.safeParse({ ...body, phase: 0 }).success,
    false,
  );
});

test('CurrentWorkoutQuerySchema: programId is required, day is a label', () => {
  assert.equal(
    CurrentWorkoutQuerySchema.safeParse({ programId: 'p1', day: 'Day 2' })
      .success,
    true,
  );
  assert.equal(CurrentWorkoutQuerySchema.safeParse({}).success, false);
});

// ---------------------------------------------------------------------------
// Active programs
// ---------------------------------------------------------------------------

test("ActiveProgramStatusSchema: the server's four values, and no 'abandoned'", () => {
  assert.deepEqual(ACTIVE_PROGRAM_STATUSES, [
    'active',
    'in-progress',
    'paused',
    'completed',
  ]);
  assert.equal(ActiveProgramStatusSchema.safeParse('in-progress').success, true);
  // Abandoning REMOVES the enrolment; there is no status for it.
  assert.equal(ActiveProgramStatusSchema.safeParse('abandoned').success, false);
});

test('ActiveProgramsApiResponseSchema: rejects a status the server never writes', () => {
  const result = ActiveProgramsApiResponseSchema.safeParse({
    activePrograms: [
      { programId: 'p1', programName: 'Foundation', status: 'abandoned' },
    ],
  });
  assert.equal(result.success, false);
});

// ---------------------------------------------------------------------------
// Enrolment, start date, abandon
// ---------------------------------------------------------------------------

const ENROLLED_PROGRAM = {
  programId: 'strength-foundation',
  programName: 'Strength Foundation',
  startDate: '2026-06-01T00:00:00.000Z',
  currentPhase: 1,
  currentDay: 'Day 1',
  completedWorkouts: 0,
  totalWorkouts: 16,
  status: 'in-progress',
};

test('ProgramEnrollRequestSchema: { programId, startDate? }', () => {
  assert.equal(
    ProgramEnrollRequestSchema.safeParse({ programId: 'p1' }).success,
    true,
  );
  assert.equal(
    ProgramEnrollRequestSchema.safeParse({
      programId: 'p1',
      startDate: '2026-06-01',
    }).success,
    true,
  );
  assert.equal(ProgramEnrollRequestSchema.safeParse({}).success, false);
});

test('ProgramEnrollResponseSchema: a fresh enrolment carries the activeProgram', () => {
  const result = ProgramEnrollResponseSchema.safeParse({
    message: 'Successfully enrolled in program',
    activeProgram: ENROLLED_PROGRAM,
  });
  assert.equal(result.success, true, JSON.stringify(result, null, 2));
  if (result.success) {
    assert.equal(result.data.alreadyEnrolled, undefined);
    assert.equal(result.data.activeProgram.currentPhase, 1);
  }
});

test('ProgramAlreadyEnrolledResponseSchema: same 200, distinguished only by alreadyEnrolled', () => {
  const body = {
    message: 'Already enrolled in this program',
    alreadyEnrolled: true,
    activeProgram: {
      ...ENROLLED_PROGRAM,
      hasSchedule: true,
      exerciseSwaps: [
        {
          originalSlug: 'barbell-back-squat',
          replacementSlug: 'goblet-squat',
          replacementName: 'Goblet Squat',
          swappedAt: '2026-06-10T12:00:00.000Z',
        },
      ],
    },
  };
  assert.equal(ProgramAlreadyEnrolledResponseSchema.safeParse(body).success, true);
  // The fresh-enrolment schema parses it too, so ONE client-side parse covers
  // both answers — that is the whole reason `alreadyEnrolled` is optional there.
  assert.equal(ProgramEnrollResponseSchema.safeParse(body).success, true);
  // …but the already-enrolled schema does NOT accept the fresh answer.
  assert.equal(
    ProgramAlreadyEnrolledResponseSchema.safeParse({
      message: 'Successfully enrolled in program',
      activeProgram: ENROLLED_PROGRAM,
    }).success,
    false,
  );
});

test('ProgramStartDateRequestSchema: both fields required', () => {
  assert.equal(
    ProgramStartDateRequestSchema.safeParse({
      programId: 'p1',
      startDate: '2026-06-01',
    }).success,
    true,
  );
  assert.equal(
    ProgramStartDateRequestSchema.safeParse({ programId: 'p1' }).success,
    false,
  );
});

test('ProgramStartDateResponseSchema: the schedule counters are optional', () => {
  assert.equal(
    ProgramStartDateResponseSchema.safeParse({
      message: 'Start date updated',
      startDate: '2026-06-01T00:00:00.000Z',
    }).success,
    true,
  );
  assert.equal(
    ProgramStartDateResponseSchema.safeParse({
      message: 'Start date updated and schedule regenerated',
      startDate: '2026-06-01T00:00:00.000Z',
      totalScheduledWorkouts: 16,
      futureWorkouts: 16,
      nextWorkout: '2026-06-01T00:00:00.000Z',
    }).success,
    true,
  );
});

test('ProgramAbandonRequestSchema / ProgramAbandonResponseSchema', () => {
  assert.equal(
    ProgramAbandonRequestSchema.safeParse({ programId: 'p1' }).success,
    true,
  );
  assert.equal(
    ProgramAbandonResponseSchema.safeParse({
      success: true,
      message: 'Program abandoned successfully',
    }).success,
    true,
  );
  assert.equal(
    ProgramAbandonResponseSchema.safeParse({ success: 'yes' }).success,
    false,
  );
});

// ---------------------------------------------------------------------------
// Custom programs
// ---------------------------------------------------------------------------

test('CustomProgramInputSchema: the member-supplied allow-list', () => {
  const result = CustomProgramInputSchema.safeParse({
    name: 'My Split',
    description: 'Four days',
    duration_weeks: 6,
    training_days_per_week: 4,
    goal: 'Hypertrophy',
    target_user: 'Intermediate',
    equipment: ['dumbbells'],
    tags: ['custom'],
    phases: [
      {
        phase: 'Phase 1',
        weeks: '1-6',
        focus: 'Volume',
        workouts: [
          { day: 'Day 1', title: 'Push', exercises: [{ name: 'Bench', sets: 3 }] },
        ],
      },
    ],
  });
  assert.equal(result.success, true, JSON.stringify(result, null, 2));
  assert.equal(CustomProgramInputSchema.safeParse({}).success, false);
});

test('CustomProgramUpdateRequestSchema: every field optional on PUT/PATCH', () => {
  assert.equal(CustomProgramUpdateRequestSchema.safeParse({}).success, true);
  assert.equal(
    CustomProgramUpdateRequestSchema.safeParse({ name: 'Renamed' }).success,
    true,
  );
});

test('CustomProgramsResponseSchema: ownership rides on each program', () => {
  const result = CustomProgramsResponseSchema.safeParse({
    programs: [
      {
        _id: '6ab0150000000000000f0002',
        program_id: 'custom-abc123-my-split-m0k1',
        name: 'My Split',
        isCustom: true,
        createdBy: '6ab0150000000000000f7ee1',
        isOwner: false,
        sharedByName: 'Coach Jon',
        phases: [],
      },
    ],
  });
  assert.equal(result.success, true, JSON.stringify(result, null, 2));
});

test('CustomProgramResponseSchema / CustomProgramDeleteResponseSchema', () => {
  assert.equal(
    CustomProgramResponseSchema.safeParse({
      _id: '6ab0150000000000000f0003',
      program_id: 'custom-abc123-my-split-m0k1',
      name: 'My Split',
      isCustom: true,
      createdBy: '6ab0150000000000000f7ee1',
      sharedWith: [],
      phases: [],
      __v: 0,
    }).success,
    true,
  );
  assert.equal(
    CustomProgramDeleteResponseSchema.safeParse({ ok: true }).success,
    true,
  );
});

// ---------------------------------------------------------------------------
// Swaps
// ---------------------------------------------------------------------------

test('ProgramSwapRequestSchema: all four fields are required by the route', () => {
  assert.equal(
    ProgramSwapRequestSchema.safeParse({
      programId: 'p1',
      originalSlug: 'barbell-back-squat',
      replacementSlug: 'goblet-squat',
      replacementName: 'Goblet Squat',
    }).success,
    true,
  );
  assert.equal(
    ProgramSwapRequestSchema.safeParse({
      programId: 'p1',
      originalSlug: 'a',
      replacementSlug: 'b',
    }).success,
    false,
  );
});

test('ProgramSwapDeleteQuerySchema + ProgramSwapResponseSchema: { message }, no success flag', () => {
  assert.equal(
    ProgramSwapDeleteQuerySchema.safeParse({
      programId: 'p1',
      originalSlug: 'barbell-back-squat',
    }).success,
    true,
  );
  assert.equal(
    ProgramSwapResponseSchema.safeParse({ message: 'Exercise swap saved' })
      .success,
    true,
  );
  assert.equal(ProgramSwapResponseSchema.safeParse({ success: true }).success, false);
});

// ---------------------------------------------------------------------------
// Saved programs
// ---------------------------------------------------------------------------

test('SavedProgramsResponseSchema: order and savedAt ride on the program', () => {
  const result = SavedProgramsResponseSchema.safeParse({
    savedPrograms: [
      {
        _id: '6ab0150000000000000f0004',
        program_id: 'p1',
        name: 'Foundation',
        savedAt: '2026-05-01T00:00:00.000Z',
        order: 0,
        phases: [],
      },
    ],
  });
  assert.equal(result.success, true, JSON.stringify(result, null, 2));
});

test('SaveProgramRequestSchema / SavedProgramsReorderRequestSchema', () => {
  assert.equal(SaveProgramRequestSchema.safeParse({ programId: 'p1' }).success, true);
  assert.equal(
    SavedProgramsReorderRequestSchema.safeParse({ programIds: ['p2', 'p1'] })
      .success,
    true,
  );
  // The route 400s on anything that is not an array.
  assert.equal(
    SavedProgramsReorderRequestSchema.safeParse({ programIds: 'p1' }).success,
    false,
  );
  assert.equal(
    SavedProgramsReorderResponseSchema.safeParse({
      success: true,
      message: 'Order updated',
    }).success,
    true,
  );
});

// ---------------------------------------------------------------------------
// Journey
// ---------------------------------------------------------------------------

test('ProgramJourneyResponseSchema: the empty recap (no completed sessions)', () => {
  const result = ProgramJourneyResponseSchema.safeParse({
    programName: 'Strength Foundation',
    durationWeeks: 8,
    totalSessions: 0,
    totalVolumeLbs: 0,
    weightChange: null,
    topPRs: [],
    startDate: null,
    endDate: null,
  });
  assert.equal(result.success, true, JSON.stringify(result, null, 2));
});

test('ProgramJourneyResponseSchema: a full recap with PRs and a weight change', () => {
  const result = ProgramJourneyResponseSchema.safeParse({
    programName: 'Strength Foundation',
    durationWeeks: 8,
    goal: 'Build strength',
    totalSessions: 14,
    totalVolumeLbs: 84250,
    weightChange: { startLbs: 180.4, endLbs: 185.2, change: 4.8 },
    topPRs: [
      { name: 'Barbell Back Squat', weight: 315, reps: 3, date: 'Jul 2, 2026' },
    ],
    startDate: 'June 1, 2026',
    endDate: 'July 26, 2026',
  });
  assert.equal(result.success, true, JSON.stringify(result, null, 2));
});

// ---------------------------------------------------------------------------
// Search + recommend (the onboarding pair — NP-057 reads these)
// ---------------------------------------------------------------------------

test('ProgramSearchQuerySchema: tag repeats, the rest are scalars', () => {
  assert.equal(
    ProgramSearchQuerySchema.safeParse({
      q: 'push',
      tag: ['strength', 'ppl'],
      level: 'Intermediate',
      minWeeks: 4,
      maxWeeks: 12,
      days: 4,
      page: 1,
      limit: 20,
    }).success,
    true,
  );
  assert.equal(ProgramSearchQuerySchema.safeParse({}).success, true);
  assert.equal(ProgramSearchQuerySchema.safeParse({ days: 9 }).success, false);
});

test('ProgramRecommendQuerySchema: the onboarding call, with profile=0', () => {
  const result = ProgramRecommendQuerySchema.safeParse({
    goals: ['gain_muscle', 'lose_weight'],
    level: 'beginner',
    days: 3,
    equipment: ['dumbbells', 'none'],
    limit: 3,
    profile: '0',
  });
  assert.equal(result.success, true, JSON.stringify(result, null, 2));
  assert.equal(
    ProgramRecommendQuerySchema.safeParse({ goals: ['get_swole'] }).success,
    false,
  );
  assert.equal(ProgramRecommendQuerySchema.safeParse({ limit: 11 }).success, false);
});

test('ProgramRecommendResponseSchema: basedOn echoes the inputs, recommendations carry reasons', () => {
  const result = ProgramRecommendResponseSchema.safeParse({
    basedOn: {
      goals: ['gain_muscle'],
      experienceLevel: 'beginner',
      weeklyAvailability: 3,
      equipmentAccess: ['dumbbells'],
    },
    recommendations: [
      {
        program_id: 'strength-foundation',
        name: 'Strength Foundation',
        description: 'Base strength',
        goal: 'Build strength',
        target_user: 'Beginner',
        training_days_per_week: 3,
        duration_weeks: 8,
        tags: ['strength'],
        coverImage: null,
        score: 74.5,
        reasons: ['Matches your goal: Build Muscle', 'Fits 3 days a week'],
      },
    ],
  });
  assert.equal(result.success, true, JSON.stringify(result, null, 2));
});

test('ProgramRecommendResponseSchema: the nulls are NULL, not absent', () => {
  // A member who answered nothing still gets a well-formed basedOn block, and
  // a client that treated `null` as "key missing" would crash on it.
  const result = ProgramRecommendResponseSchema.safeParse({
    basedOn: {
      goals: [],
      experienceLevel: null,
      weeklyAvailability: null,
      equipmentAccess: [],
    },
    recommendations: [],
  });
  assert.equal(result.success, true, JSON.stringify(result, null, 2));
  assert.equal(
    ProgramRecommendResponseSchema.safeParse({
      basedOn: { goals: [], equipmentAccess: [] },
      recommendations: [],
    }).success,
    false,
    'experienceLevel/weeklyAvailability are nullable, not optional',
  );
});

test('ShareCreateRequestSchema: program, workout and session bodies', () => {
  // Mirrors webapp/app/api/share/route.ts: program takes programId, workout
  // takes programId + day (+ optional phase), session takes the snapshot.
  assert.equal(
    ShareCreateRequestSchema.safeParse({ kind: 'program', programId: 'strength-foundation' }).success,
    true,
  );
  assert.equal(
    ShareCreateRequestSchema.safeParse({ kind: 'workout', programId: 'strength-foundation', day: 'Day 1' }).success,
    true,
  );
  assert.equal(
    ShareCreateRequestSchema.safeParse({
      kind: 'session',
      session: { title: 'Quick Pump', focus: 'push', exercises: [{ name: 'Push-Up', sets: 3 }] },
    }).success,
    true,
  );
  assert.equal(ShareCreateRequestSchema.safeParse({ kind: 'nope' }).success, false);
});

test('ShareCreateResponseSchema: shareId plus the RELATIVE public path', () => {
  // The route answers `{ shareId, url: '/share/<shareId>' }` — native builds
  // the absolute URL on the web's domain for the share sheet.
  const result = ShareCreateResponseSchema.safeParse({ shareId: 'abc123', url: '/share/abc123' });
  assert.equal(result.success, true, JSON.stringify(result, null, 2));
});
