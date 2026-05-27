// Run with: npx tsx --test tests/schemas.test.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  ActiveProgramsResponseSchema,
  LogMoodRequestSchema,
  LogWeightRequestSchema,
  MeResponseSchema,
  MoodHistoryResponseSchema,
  SaveWorkoutResponseSchema,
  ScheduleResponseSchema,
  UserSchema,
  WeightHistoryResponseSchema,
  WorkoutLogSchema,
  WorkoutsListResponseSchema,
} from '../src/index';

test('MeResponseSchema: accepts a real /api/auth/me payload', () => {
  const result = MeResponseSchema.safeParse({
    user: {
      _id: '67000000abc',
      email: 'jon@example.com',
      name: 'Jon',
      role: 'user',
      savedPrograms: [],
      onboardingCompleted: true,
    },
  });
  assert.equal(result.success, true);
});

test('MeResponseSchema: rejects missing user', () => {
  const result = MeResponseSchema.safeParse({ token: 'x' });
  assert.equal(result.success, false);
});

test('UserSchema: rejects an invalid email', () => {
  const result = UserSchema.safeParse({ _id: 'a', email: 'not-an-email' });
  assert.equal(result.success, false);
});

test('UserSchema: ignores extra fields via passthrough', () => {
  const result = UserSchema.safeParse({
    _id: 'a',
    email: 'jon@example.com',
    arbitraryExtra: 'value',
  });
  assert.equal(result.success, true);
});

test('WeightHistoryResponseSchema: parses an array of entries', () => {
  const result = WeightHistoryResponseSchema.safeParse({
    history: [
      { date: '2026-05-01', weight: 180 },
      { date: '2026-05-02', weight: null, skipped: true },
    ],
  });
  assert.equal(result.success, true);
});

test('LogWeightRequestSchema: rejects negative weight', () => {
  const result = LogWeightRequestSchema.safeParse({ weight: -10 });
  assert.equal(result.success, false);
});

test('LogWeightRequestSchema: accepts null weight with skipped flag', () => {
  const result = LogWeightRequestSchema.safeParse({
    weight: null,
    skipped: true,
  });
  assert.equal(result.success, true);
});

test('LogMoodRequestSchema: rejects mood outside 1-5', () => {
  const result = LogMoodRequestSchema.safeParse({ mood: 7 });
  assert.equal(result.success, false);
});

test('LogMoodRequestSchema: accepts mood=3 with optional notes', () => {
  const result = LogMoodRequestSchema.safeParse({
    mood: 3,
    notes: 'feeling steady',
  });
  assert.equal(result.success, true);
});

test('MoodHistoryResponseSchema: parses array with mood scale enum', () => {
  const result = MoodHistoryResponseSchema.safeParse({
    history: [{ date: '2026-05-01', mood: 5 }],
  });
  assert.equal(result.success, true);
});

test('WorkoutLogSchema: accepts a minimal completed workout', () => {
  const result = WorkoutLogSchema.safeParse({
    programId: 'p1',
    phaseIndex: 0,
    workoutIndex: 0,
    date: '2026-05-01',
    exercises: [{ exerciseSlug: 'bench-press', sets: [] }],
    completed: true,
  });
  assert.equal(result.success, true);
});

test('WorkoutLogSchema: rejects negative phaseIndex', () => {
  const result = WorkoutLogSchema.safeParse({
    programId: 'p1',
    phaseIndex: -1,
    workoutIndex: 0,
    date: '2026-05-01',
    exercises: [],
    completed: false,
  });
  assert.equal(result.success, false);
});

test('WorkoutsListResponseSchema: parses a list of workouts', () => {
  const result = WorkoutsListResponseSchema.safeParse({
    workouts: [
      {
        programId: 'p1',
        phaseIndex: 0,
        workoutIndex: 0,
        date: '2026-05-01',
        exercises: [],
        completed: false,
      },
    ],
  });
  assert.equal(result.success, true);
});

test('SaveWorkoutResponseSchema: parses success-only response', () => {
  const result = SaveWorkoutResponseSchema.safeParse({ success: true });
  assert.equal(result.success, true);
});

test('ScheduleResponseSchema: parses array of slots', () => {
  const result = ScheduleResponseSchema.safeParse({
    schedule: [
      {
        date: '2026-05-01',
        programId: 'p1',
        phaseIndex: 0,
        workoutIndex: 0,
        status: 'scheduled',
      },
    ],
  });
  assert.equal(result.success, true);
});

test('ScheduleResponseSchema: rejects an unknown status enum value', () => {
  const result = ScheduleResponseSchema.safeParse({
    schedule: [
      {
        date: '2026-05-01',
        programId: 'p1',
        phaseIndex: 0,
        workoutIndex: 0,
        status: 'mystery',
      },
    ],
  });
  assert.equal(result.success, false);
});

test('ActiveProgramsResponseSchema: parses minimal response and accepts extras (passthrough)', () => {
  const result = ActiveProgramsResponseSchema.safeParse({
    programs: [
      {
        programId: 'p1',
        status: 'active',
        startedAt: '2026-04-01',
      },
    ],
    extra: 'allowed',
  });
  assert.equal(result.success, true);
});
