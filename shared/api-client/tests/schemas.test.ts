// Run with: npx tsx --test tests/schemas.test.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  ActiveProgramsResponseSchema,
  ProgramListResponseSchema,
  ProgramSearchResponseSchema,
  SavedProgramsResponseSchema,
  SaveToggleResponseSchema,
  ProgramDetailResponseSchema,
  ProgramMutationResponseSchema,
  CheckSessionRequestSchema,
  CheckSessionResponseSchema,
  LogMoodRequestSchema,
  LogWeightRequestSchema,
  MeResponseSchema,
  ProfileResponseSchema,
  WeightCheckResponseSchema,
  WeightPostRequestSchema,
  MoodHistoryResponseSchema,
  SaveWorkoutResponseSchema,
  ScheduleResponseSchema,
  SendLinkRequestSchema,
  SendLinkResponseSchema,
  UserSchema,
  VerifyLinkRequestSchema,
  VerifyLinkResponseSchema,
  WeightHistoryResponseSchema,
  WorkoutLogSchema,
  WorkoutsListResponseSchema,
  WorkoutSaveRequestSchema,
  WorkoutSaveResponseSchema,
  ExerciseAlternativesResponseSchema,
  ScheduleApiResponseSchema,
  ProgressMoodResponseSchema,
  MealLogResponseSchema,
  FoodSearchResponseSchema,
  FoodDetailResponseSchema,
  RecipesListResponseSchema,
  RecipeDetailResponseSchema,
  ConversationsResponseSchema,
  UnreadResponseSchema,
  PostMessageResponseSchema,
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

test('ProgramListResponseSchema: parses a bare array of catalog items', () => {
  const result = ProgramListResponseSchema.safeParse([
    {
      program_id: 'strength-5x5',
      name: 'Strength 5x5',
      description: 'Barbell strength',
      duration_weeks: 12,
      training_days_per_week: 5,
      tags: ['strength'],
    },
    { _id: 'm2', name: 'Minimal' },
  ]);
  assert.equal(result.success, true);
});

test('ProgramListResponseSchema: rejects an item missing name', () => {
  const result = ProgramListResponseSchema.safeParse([{ program_id: 'x' }]);
  assert.equal(result.success, false);
});

test('ProgramSearchResponseSchema: parses { programs, pagination, availableTags }', () => {
  const result = ProgramSearchResponseSchema.safeParse({
    programs: [{ program_id: 'p9', name: 'Push Pull Legs' }],
    pagination: { page: 1, limit: 20, total: 1, totalPages: 1, hasMore: false },
    availableTags: ['ppl', 'hypertrophy'],
  });
  assert.equal(result.success, true);
});

test('ProgramSearchResponseSchema: rejects when programs is not an array', () => {
  const result = ProgramSearchResponseSchema.safeParse({ programs: 'nope' });
  assert.equal(result.success, false);
});

test('SavedProgramsResponseSchema: parses saved programs with savedAt/order extras', () => {
  const result = SavedProgramsResponseSchema.safeParse({
    savedPrograms: [
      {
        program_id: 'p1',
        name: 'Foundation',
        savedAt: '2026-05-01',
        order: 0,
      },
    ],
  });
  assert.equal(result.success, true);
});

test('SavedProgramsResponseSchema: rejects a missing savedPrograms key', () => {
  const result = SavedProgramsResponseSchema.safeParse({ programs: [] });
  assert.equal(result.success, false);
});

test('SaveToggleResponseSchema: parses a success toggle response', () => {
  const result = SaveToggleResponseSchema.safeParse({
    success: true,
    message: 'Program saved',
  });
  assert.equal(result.success, true);
});

test('SaveToggleResponseSchema: rejects a non-boolean success', () => {
  const result = SaveToggleResponseSchema.safeParse({ success: 'yes' });
  assert.equal(result.success, false);
});

test('ProgramDetailResponseSchema: parses a hydrated program with nested phases', () => {
  const result = ProgramDetailResponseSchema.safeParse({
    program_id: 'prog-1',
    name: 'Strength Foundation',
    description: 'Base',
    duration_weeks: 8,
    phases: [
      {
        phase: 'Phase 1',
        weeks: '1-4',
        focus: 'f',
        workouts: [
          {
            day: 'Day 1',
            title: 'Push A',
            exercises: [
              { exerciseSlug: 'bench', name: 'Bench', sets: 4, reps: '5-8' },
            ],
          },
        ],
      },
    ],
  });
  assert.equal(result.success, true);
});

test('ProgramDetailResponseSchema: defaults phases to [] when absent', () => {
  const result = ProgramDetailResponseSchema.safeParse({ name: 'Minimal' });
  assert.equal(result.success, true);
  if (result.success) {
    assert.deepEqual(result.data.phases, []);
  }
});

test('ProgramMutationResponseSchema: parses enroll/abandon {success, message}', () => {
  const r = ProgramMutationResponseSchema.safeParse({
    success: true,
    message: 'Program saved',
  });
  assert.equal(r.success, true);
});

test('ProgramMutationResponseSchema: parses start-date {message, startDate}', () => {
  const r = ProgramMutationResponseSchema.safeParse({
    message: 'Start date updated',
    startDate: '2026-06-01',
  });
  assert.equal(r.success, true);
});

test('ProgramMutationResponseSchema: rejects a non-string message', () => {
  const r = ProgramMutationResponseSchema.safeParse({ message: 42 });
  assert.equal(r.success, false);
});

test('ProgramDetailResponseSchema: rejects a phase missing its name', () => {
  const result = ProgramDetailResponseSchema.safeParse({
    name: 'X',
    phases: [{ weeks: '1-4', workouts: [] }],
  });
  assert.equal(result.success, false);
});

// ---------------------------------------------------------------------------
// Magic-link auth flow schemas
// ---------------------------------------------------------------------------

test('SendLinkRequestSchema: accepts a login request without name', () => {
  const result = SendLinkRequestSchema.safeParse({
    email: 'jon@example.com',
    mode: 'login',
  });
  assert.equal(result.success, true);
});

test('SendLinkRequestSchema: accepts a register request with name', () => {
  const result = SendLinkRequestSchema.safeParse({
    email: 'jon@example.com',
    mode: 'register',
    name: 'Jon Don',
  });
  assert.equal(result.success, true);
});

test('SendLinkRequestSchema: rejects an invalid email', () => {
  const result = SendLinkRequestSchema.safeParse({
    email: 'not-an-email',
    mode: 'login',
  });
  assert.equal(result.success, false);
});

test('SendLinkRequestSchema: rejects an unknown mode', () => {
  const result = SendLinkRequestSchema.safeParse({
    email: 'jon@example.com',
    mode: 'reset',
  });
  assert.equal(result.success, false);
});

test('SendLinkResponseSchema: parses the 200 send-link payload', () => {
  const result = SendLinkResponseSchema.safeParse({
    success: true,
    message: 'Verification email sent. Please check your inbox.',
    sessionId: 'abc123sessionid',
  });
  assert.equal(result.success, true);
});

test('SendLinkResponseSchema: rejects a missing sessionId', () => {
  const result = SendLinkResponseSchema.safeParse({
    success: true,
    message: 'sent',
  });
  assert.equal(result.success, false);
});

test('CheckSessionRequestSchema: requires a sessionId', () => {
  assert.equal(
    CheckSessionRequestSchema.safeParse({ sessionId: 'x' }).success,
    true,
  );
  assert.equal(CheckSessionRequestSchema.safeParse({}).success, false);
});

test('CheckSessionResponseSchema: accepts a pending poll with no authToken', () => {
  const result = CheckSessionResponseSchema.safeParse({ status: 'pending' });
  assert.equal(result.success, true);
});

test('CheckSessionResponseSchema: accepts a verified poll carrying the JWT', () => {
  const result = CheckSessionResponseSchema.safeParse({
    status: 'verified',
    authToken: 'jwt.token.value',
  });
  assert.equal(result.success, true);
});

test('CheckSessionResponseSchema: rejects an unknown status', () => {
  const result = CheckSessionResponseSchema.safeParse({ status: 'queued' });
  assert.equal(result.success, false);
});

test('VerifyLinkRequestSchema: requires a token', () => {
  assert.equal(VerifyLinkRequestSchema.safeParse({ token: 't' }).success, true);
  assert.equal(VerifyLinkRequestSchema.safeParse({}).success, false);
});

test('VerifyLinkResponseSchema: parses the verify-link 200 payload', () => {
  const result = VerifyLinkResponseSchema.safeParse({
    token: 'jwt.token.value',
    user: { id: '67000000abc', name: 'Jon', email: 'jon@example.com' },
  });
  assert.equal(result.success, true);
});

test('VerifyLinkResponseSchema: allows a null user name', () => {
  const result = VerifyLinkResponseSchema.safeParse({
    token: 'jwt.token.value',
    user: { id: '67000000abc', name: null, email: 'jon@example.com' },
  });
  assert.equal(result.success, true);
});

test('VerifyLinkResponseSchema: rejects a response missing the token', () => {
  const result = VerifyLinkResponseSchema.safeParse({
    user: { id: 'a', email: 'jon@example.com' },
  });
  assert.equal(result.success, false);
});

test('WorkoutSaveRequestSchema: parses the live-workout save payload', () => {
  const r = WorkoutSaveRequestSchema.safeParse({
    programId: 'prog-1',
    phase: 1,
    day: 'Day 1',
    completed: true,
    activeSeconds: 600,
    duration: 10,
    exercises: [
      {
        name: 'Bench',
        exerciseSlug: 'bench',
        sets: [{ setNumber: 1, reps: 5, weight: 135, completed: true }],
      },
    ],
  });
  assert.equal(r.success, true);
});

test('WorkoutSaveRequestSchema: rejects a missing day', () => {
  const r = WorkoutSaveRequestSchema.safeParse({
    programId: 'p',
    phase: 1,
    completed: true,
    exercises: [],
  });
  assert.equal(r.success, false);
});

test('WorkoutSaveResponseSchema: parses a save response with PRs', () => {
  const r = WorkoutSaveResponseSchema.safeParse({
    message: 'Workout saved successfully',
    completed: true,
    newPRsAchieved: [
      { exerciseSlug: 'bench', exerciseName: 'Bench', dimensions: ['weight', 'e1rm'] },
    ],
  });
  assert.equal(r.success, true);
});

test('WorkoutSaveResponseSchema: rejects a malformed PR entry', () => {
  const r = WorkoutSaveResponseSchema.safeParse({
    newPRsAchieved: [{ exerciseSlug: 'bench' }],
  });
  assert.equal(r.success, false);
});


test('ExerciseAlternativesResponseSchema: parses alternatives list', () => {
  const r = ExerciseAlternativesResponseSchema.safeParse({
    source: { slug: 'bench', name: 'Bench' },
    alternatives: [
      { slug: 'db-press', name: 'DB Bench Press', score: 42, reasons: ['Same pattern'] },
    ],
    total: 1,
  });
  assert.equal(r.success, true);
});

test('ExerciseAlternativesResponseSchema: rejects a candidate missing name', () => {
  const r = ExerciseAlternativesResponseSchema.safeParse({
    alternatives: [{ slug: 'x' }],
  });
  assert.equal(r.success, false);
});


test('ScheduleApiResponseSchema: parses nested schedules with scheduledWorkouts', () => {
  const r = ScheduleApiResponseSchema.safeParse({
    schedules: [
      {
        _id: 's1',
        programId: 'prog-1',
        programName: 'Strength',
        programStatus: 'active',
        scheduledWorkouts: [
          { date: '2026-06-01T00:00:00.000Z', dayLabel: 'Day 1', status: 'scheduled', phase: 1 },
        ],
      },
    ],
  });
  assert.equal(r.success, true);
});

test('ScheduleApiResponseSchema: defaults schedules to [] and a workout requires date+status', () => {
  assert.equal(ScheduleApiResponseSchema.safeParse({}).success, true);
  const bad = ScheduleApiResponseSchema.safeParse({
    schedules: [{ programId: 'p', scheduledWorkouts: [{ dayLabel: 'Day 1' }] }],
  });
  assert.equal(bad.success, false);
});


test('ProgressMoodResponseSchema: parses moodData points', () => {
  const r = ProgressMoodResponseSchema.safeParse({
    moodData: [{ date: 'Jun 1', value: 3 }, { date: 'Jun 2', value: 5 }],
  });
  assert.equal(r.success, true);
});

test('ProgressMoodResponseSchema: defaults moodData to [] and rejects mood out of range', () => {
  assert.equal(ProgressMoodResponseSchema.safeParse({}).success, true);
  const bad = ProgressMoodResponseSchema.safeParse({ moodData: [{ date: 'x', value: 9 }] });
  assert.equal(bad.success, false);
});


test('MealLogResponseSchema: parses meals with foods + goals', () => {
  const r = MealLogResponseSchema.safeParse({
    date: '2026-06-01',
    meals: [
      { mealType: 'breakfast', foods: [{ id: 'f1', name: 'Oats', servings: 1, nutrition: { calories: 300, protein: 10, carbs: 50, fats: 5 } }] },
    ],
    goals: { calories: 2200, protein: 150, carbs: 200, fats: 65 },
  });
  assert.equal(r.success, true);
});

test('MealLogResponseSchema: defaults meals to [] and a food requires nutrition', () => {
  assert.equal(MealLogResponseSchema.safeParse({}).success, true);
  const bad = MealLogResponseSchema.safeParse({
    meals: [{ mealType: 'lunch', foods: [{ name: 'X' }] }],
  });
  assert.equal(bad.success, false);
});


test('FoodSearchResponseSchema: parses three-source foods list', () => {
  const r = FoodSearchResponseSchema.safeParse({
    foods: [
      { _id: 'db1', name: 'Oats', source: 'manual', nutrition: { calories: 380 } },
      { id: 'usda-9', name: 'Banana', brand: null, source: 'usda', calories: 89 },
    ],
    total: 2,
  });
  assert.equal(r.success, true);
});

test('FoodSearchResponseSchema: defaults foods to [] and requires a name', () => {
  assert.equal(FoodSearchResponseSchema.safeParse({}).success, true);
  assert.equal(FoodSearchResponseSchema.safeParse({ foods: [{ source: 'usda' }] }).success, false);
});

test('FoodDetailResponseSchema: parses { food } with nullable nutrition', () => {
  const r = FoodDetailResponseSchema.safeParse({
    food: { _id: 'usda-9', name: 'Banana', category: 'fruit', source: 'usda', nutrition: { calories: 89, fats: null } },
  });
  assert.equal(r.success, true);
});

test('FoodDetailResponseSchema: rejects a missing food key', () => {
  assert.equal(FoodDetailResponseSchema.safeParse({}).success, false);
});


test('RecipesListResponseSchema: parses recipes list', () => {
  const r = RecipesListResponseSchema.safeParse({
    recipes: [
      { _id: 'r1', name: 'Protein Oats', servings: 2, nutrition: { calories: 450, protein: 30, carbs: 50, fats: 12 }, ingredients: [{ name: 'Oats', amount: 80, unit: 'g', nutrition: { calories: 300, protein: 10, carbs: 50, fats: 5 } }], instructions: ['Mix'] },
    ],
    total: 1,
  });
  assert.equal(r.success, true);
});

test('RecipesListResponseSchema: defaults recipes to [] and requires a name', () => {
  assert.equal(RecipesListResponseSchema.safeParse({}).success, true);
  assert.equal(RecipesListResponseSchema.safeParse({ recipes: [{ servings: 1 }] }).success, false);
});

test('RecipeDetailResponseSchema: parses an unwrapped recipe doc', () => {
  const r = RecipeDetailResponseSchema.safeParse({ _id: 'r1', name: 'X', ingredients: [], instructions: [] });
  assert.equal(r.success, true);
});


test('ConversationsResponseSchema: parses conversations with unreadCount', () => {
  const r = ConversationsResponseSchema.safeParse({
    conversations: [
      { _id: 'c1', name: 'Coach', unreadCount: 3, lastMessage: { text: 'hi', sentAt: '2026-06-01T10:00:00.000Z' } },
    ],
  });
  assert.equal(r.success, true);
});

test('UnreadResponseSchema: requires a numeric unreadCount', () => {
  assert.equal(UnreadResponseSchema.safeParse({ unreadCount: 5 }).success, true);
  assert.equal(UnreadResponseSchema.safeParse({ unreadCount: 'x' }).success, false);
});

test('PostMessageResponseSchema: parses the WRAPPED { message } POST shape', () => {
  const r = PostMessageResponseSchema.safeParse({
    message: { _id: 'm1', text: 'hello', senderId: { _id: 'u1', name: 'Jon' }, createdAt: '2026-06-01T10:00:00.000Z' },
  });
  assert.equal(r.success, true);
});

test('PostMessageResponseSchema: rejects an unwrapped (bare) message', () => {
  const r = PostMessageResponseSchema.safeParse({ _id: 'm1', text: 'hello' });
  assert.equal(r.success, false);
});


test('ProfileResponseSchema: parses GET/PATCH profile shape', () => {
  const r = ProfileResponseSchema.safeParse({ profile: { goal: 'strength' }, name: 'Jon', onboardingCompleted: true, email: 'jon@example.com' });
  assert.equal(r.success, true);
  assert.equal(ProfileResponseSchema.safeParse({ profile: null, name: null }).success, true);
});

test('WeightCheckResponseSchema: parses skip-tracking GET state', () => {
  const r = WeightCheckResponseSchema.safeParse({ needsWeightCheck: true, consecutiveSkips: 2, daysSinceLastEntry: 3, lastWeight: 180, todaysWeight: null });
  assert.equal(r.success, true);
});

test('WeightPostRequestSchema: accepts a weight log and a skip', () => {
  assert.equal(WeightPostRequestSchema.safeParse({ weight: 183 }).success, true);
  assert.equal(WeightPostRequestSchema.safeParse({ weight: null, skip: true }).success, true);
  assert.equal(WeightPostRequestSchema.safeParse({ weight: -5 }).success, false);
});
