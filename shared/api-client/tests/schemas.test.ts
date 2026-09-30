// Run with: npx tsx --test tests/schemas.test.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  ActiveProgramsApiResponseSchema,
  ProgramListResponseSchema,
  ProgramSearchResponseSchema,
  SavedProgramsResponseSchema,
  SaveToggleResponseSchema,
  ProgramDetailResponseSchema,
  ProgramAbandonResponseSchema,
  ProgramStartDateResponseSchema,
  CheckSessionRequestSchema,
  CheckSessionResponseSchema,
  LogMoodRequestSchema,
  LogWeightRequestSchema,
  MeResponseSchema,
  ProfileResponseSchema,
  WeightCheckResponseSchema,
  WeightPostRequestSchema,
  SendLinkRequestSchema,
  SendLinkResponseSchema,
  UserSchema,
  VerifyLinkRequestSchema,
  VerifyLinkResponseSchema,
  ExerciseAlternativesResponseSchema,
  ProgressMoodResponseSchema,
  // NP-024 nutrition. One recorded fixture per route lives below; the REAL
  // responses are parsed with these same schemas by
  // webapp/tests/unit/contract/np024Nutrition.test.ts.
  MealLogsDayResponseSchema,
  MealLogsRangeResponseSchema,
  MealLogCreateRequestSchema,
  MealLogCreateResponseSchema,
  NutritionLogDayResponseSchema,
  MealLogResponseSchema,
  NutritionSummaryResponseSchema,
  FoodSearchResponseSchema,
  FoodDetailResponseSchema,
  FoodOverviewResponseSchema,
  RecentFoodsResponseSchema,
  FrequentFoodsResponseSchema,
  SavedFoodsResponseSchema,
  FoodBarcodeResponseSchema,
  FoodImportRequestSchema,
  FoodImportResponseSchema,
  MealsListResponseSchema,
  TagsResponseSchema,
  NutritionGoalsResponseSchema,
  NutritionGoalsRequestSchema,
  NutritionGoalsWriteResponseSchema,
  MealScheduleResponseSchema,
  MealScheduleWriteRequestSchema,
  RecipesListResponseSchema,
  RecipeDetailResponseSchema,
  ConversationsResponseSchema,
  UnreadResponseSchema,
  PostMessageResponseSchema,
} from '../src/index';
import * as nutritionFixtures from './nutritionFixtures';

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

// The speculative `WorkoutLogSchema` / `WorkoutsListResponseSchema` /
// `SaveWorkoutResponseSchema` trio that used to be checked here described a
// `{ workouts: [ { phaseIndex, workoutIndex } ] }` API no handler has ever
// answered with. It was deleted with NP-018; the real /api/workouts surface is
// covered by tests/workoutsSchemas.test.ts and by the webapp contract harness.

// The speculative `{ schedule: [ { phaseIndex, workoutIndex } ] }` envelope
// that used to be checked here described a response no route has ever sent. It
// was deleted with NP-021; the real GET /api/schedule is covered by
// tests/scheduleSchemas.test.ts and by the webapp contract harness.

test('ActiveProgramsApiResponseSchema: parses minimal response and accepts extras (passthrough)', () => {
  const result = ActiveProgramsApiResponseSchema.safeParse({
    activePrograms: [
      {
        programId: 'p1',
        programName: 'Foundation',
        status: 'in-progress',
        startDate: '2026-04-01T00:00:00.000Z',
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

test('ProgramAbandonResponseSchema: parses {success, message}', () => {
  const r = ProgramAbandonResponseSchema.safeParse({
    success: true,
    message: 'Program abandoned successfully',
  });
  assert.equal(r.success, true);
});

test('ProgramStartDateResponseSchema: parses {message, startDate}', () => {
  const r = ProgramStartDateResponseSchema.safeParse({
    message: 'Start date updated',
    startDate: '2026-06-01',
  });
  assert.equal(r.success, true);
});

test('ProgramStartDateResponseSchema: rejects a non-string message', () => {
  const r = ProgramStartDateResponseSchema.safeParse({
    message: 42,
    startDate: '2026-06-01',
  });
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

// The POST /api/workouts save body and its response moved to
// tests/workoutsSchemas.test.ts with NP-018, where they are checked against
// the body LiveWorkoutClient actually builds for both a program day and a
// quick session.

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


// GET /api/schedule and the PATCH/POST/PUT writes moved to
// tests/scheduleSchemas.test.ts with NP-021.


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


// ═══════════════════════════════════════════════════════════════════════════
// NUTRITION (NP-024) — one recorded fixture per route the v1 food log calls.
//
// `tests/nutritionFixtures.ts` holds the bodies; this block is the assertion
// that each schema still accepts the response the web actually sends, plus the
// negative cases that encode the four rules at the top of
// src/schemas/nutrition.ts. The REAL handlers are parsed with these same
// schemas by webapp/tests/unit/contract/np024Nutrition.test.ts — a fixture
// agrees with a schema by construction, so it can only ever catch a change made
// on THIS side.
// ═══════════════════════════════════════════════════════════════════════════

/** Every fixture parses with the schema its route is read through. */
const NUTRITION_ROUTE_FIXTURES: ReadonlyArray<
  [string, { safeParse(v: unknown): { success: boolean; error?: unknown } }, unknown]
> = [
  ['GET /api/meal-logs?date=', MealLogsDayResponseSchema, nutritionFixtures.MEAL_LOGS_DAY],
  ['GET /api/meal-logs?from=&to=', MealLogsRangeResponseSchema, nutritionFixtures.MEAL_LOGS_RANGE],
  ['POST /api/meal-logs (request)', MealLogCreateRequestSchema, nutritionFixtures.MEAL_LOG_CREATE_REQUEST],
  ['POST /api/meal-logs', MealLogCreateResponseSchema, nutritionFixtures.MEAL_LOG_CREATE],
  ['GET /api/nutrition/log', NutritionLogDayResponseSchema, nutritionFixtures.NUTRITION_LOG_DAY],
  ['GET /api/nutrition/summary', NutritionSummaryResponseSchema, nutritionFixtures.NUTRITION_SUMMARY_WEEK],
  ['GET /api/nutrition/foods', FoodSearchResponseSchema, nutritionFixtures.FOOD_SEARCH],
  ['GET /api/nutrition/foods/[id]', FoodDetailResponseSchema, nutritionFixtures.FOOD_DETAIL],
  ['GET /api/nutrition/foods/overview', FoodOverviewResponseSchema, nutritionFixtures.FOOD_OVERVIEW],
  ['GET /api/nutrition/foods/recent', RecentFoodsResponseSchema, nutritionFixtures.FOODS_RECENT],
  ['GET /api/nutrition/foods/frequent', FrequentFoodsResponseSchema, nutritionFixtures.FOODS_FREQUENT],
  ['GET /api/nutrition/foods/barcode', FoodBarcodeResponseSchema, nutritionFixtures.FOOD_BARCODE],
  ['GET /api/nutrition/foods/barcode (miss)', FoodBarcodeResponseSchema, nutritionFixtures.FOOD_BARCODE_MISS],
  ['GET /api/nutrition/foods/barcode (preview)', FoodBarcodeResponseSchema, nutritionFixtures.FOOD_BARCODE_PREVIEW],
  ['POST /api/nutrition/foods/import (request)', FoodImportRequestSchema, nutritionFixtures.FOOD_IMPORT_REQUEST],
  ['POST /api/nutrition/foods/import', FoodImportResponseSchema, nutritionFixtures.FOOD_IMPORT],
  ['GET /api/me/foods', SavedFoodsResponseSchema, nutritionFixtures.SAVED_FOODS],
  ['GET /api/meals', MealsListResponseSchema, nutritionFixtures.MEALS_LIST],
  ['GET /api/nutrition/recipes', RecipesListResponseSchema, nutritionFixtures.RECIPES_LIST],
  ['GET /api/nutrition/recipes/[id]', RecipeDetailResponseSchema, nutritionFixtures.RECIPE_ROW],
  ['GET /api/tags', TagsResponseSchema, nutritionFixtures.TAGS],
  ['GET /api/nutrition/goals', NutritionGoalsResponseSchema, nutritionFixtures.NUTRITION_GOALS],
  ['GET /api/nutrition/goals (default)', NutritionGoalsResponseSchema, nutritionFixtures.NUTRITION_GOALS_DEFAULT],
  ['POST /api/nutrition/goals (request)', NutritionGoalsRequestSchema, nutritionFixtures.NUTRITION_GOALS_REQUEST],
  ['POST /api/nutrition/goals', NutritionGoalsWriteResponseSchema, nutritionFixtures.NUTRITION_GOALS_WRITE],
  ['GET /api/nutrition/meal-schedule', MealScheduleResponseSchema, nutritionFixtures.MEAL_SCHEDULE],
  ['PUT /api/nutrition/meal-schedule (request)', MealScheduleWriteRequestSchema, nutritionFixtures.MEAL_SCHEDULE_WRITE_REQUEST],
];

for (const [label, schema, body] of NUTRITION_ROUTE_FIXTURES) {
  test(`nutrition contract: the recorded ${label} body parses`, () => {
    const result = schema.safeParse(body);
    assert.equal(result.success, true, `${label}: ${JSON.stringify(result.error)}`);
  });
}

test('nutrition: every route the v1 food log calls has a recorded fixture', () => {
  // The 20 routes NP-024 covers, some recorded more than once (a barcode miss,
  // a never-saved goals row) and five with their request body beside the
  // response. The webapp harness holds the same list as a manifest and fails if
  // one of them is never CALLED.
  const routes = new Set(
    NUTRITION_ROUTE_FIXTURES.map(([label]) =>
      label.replace(/ \((request|miss|preview|default)\)$/, '').replace(/\?.*$/, ''),
    ),
  );
  assert.equal(routes.size, 20, [...routes].sort().join('\n'));
});

test('Rule 1: a Food carries its SERVING BASIS, not a bare per-100 block', () => {
  const parsed = FoodDetailResponseSchema.parse(nutritionFixtures.FOOD_DETAIL);
  const variant = parsed.food.variants.find((v) => v.isDefault);
  assert.ok(variant, 'the default variant is on the wire');
  // "1 each" with a 60 g bridge: the stored macros are for ONE BAR. Treating
  // them as per-100-g logs 1/100th of a bar, which is the bug this closes.
  assert.equal(variant.servingSize, 1);
  assert.equal(variant.servingUnit, 'each');
  assert.equal(variant.gramsPerServing, 60);
  assert.equal(variant.nutrition.calories, 210);
  // And the top level mirrors THAT variant, so a flattened row is usable too.
  assert.equal(parsed.food.servingSize, variant.servingSize);
  assert.equal(parsed.food.gramsPerServing, variant.gramsPerServing);
});

test('Rule 1: a log item is per serving, and `servings` is how much was eaten', () => {
  const day = MealLogsDayResponseSchema.parse(nutritionFixtures.MEAL_LOGS_DAY);
  const item = day.logs[0]!.items[0]!;
  assert.equal(item.servings, 2);
  assert.equal(item.nutrition.calories, 210);
  // The server totals a log as nutrition × servings.
  assert.equal(day.logs[0]!.totalNutrition.calories, item.nutrition.calories * item.servings);
});

test('Rule 2: Food `source` is usda | openfoodfacts | manual — `off` is rejected', () => {
  for (const source of ['usda', 'openfoodfacts', 'manual']) {
    assert.equal(
      FoodDetailResponseSchema.safeParse({ food: { _id: 'f1', name: 'X', source } }).success,
      true,
      source,
    );
  }
  assert.equal(
    FoodDetailResponseSchema.safeParse({ food: { _id: 'f1', name: 'X', source: 'off' } }).success,
    false,
    'there is no `off` source — the OpenFoodFacts value is spelled in full',
  );
});

test('Rule 3: a Recipe carries `totalsPerServing`, and `nutrition` is not enough', () => {
  const recipe = RecipeDetailResponseSchema.parse(nutritionFixtures.RECIPE_ROW);
  assert.equal(recipe.totalsPerServing.calories, 210);
  assert.equal(recipe.totalsPerServing.protein, 17);
  assert.equal(recipe.totalsPerServing.carbs, 26.5);
  assert.equal(recipe.totalsPerServing.fats, 3.5);
  // The shape the schema used to describe. Native read `nutrition` and got 0
  // for every recipe ever published; that must now fail loudly instead.
  const renamed = { ...nutritionFixtures.RECIPE_ROW } as Record<string, unknown>;
  delete renamed.totalsPerServing;
  renamed.nutrition = { calories: 450, protein: 30, carbs: 50, fats: 12 };
  assert.equal(RecipeDetailResponseSchema.safeParse(renamed).success, false);
});

test('Rule 4: the canonical day answers `logs`, the legacy one answers `meals`', () => {
  const canonical = MealLogsDayResponseSchema.parse(nutritionFixtures.MEAL_LOGS_DAY);
  // An untimed log under a custom tag — the legacy shape cannot express either.
  const untimed = canonical.logs.find((l) => l.untimed === true);
  assert.ok(untimed, 'an untimed log survives the canonical day');
  assert.deepEqual(untimed.tags, ['before work']);

  const legacy = NutritionLogDayResponseSchema.parse(nutritionFixtures.NUTRITION_LOG_DAY);
  // Water, quick adds and goals live ONLY here.
  assert.equal(legacy.water?.current, 64);
  assert.equal(legacy.quickAdds[0]?.calories, 150);
  assert.equal(legacy.goals?.calories, 2400);
  // …and its totals include the quick add, which the canonical day's do not.
  assert.equal(legacy.dailyTotals?.calories, 734);
  assert.equal(canonical.dailyTotals.calories, 584);
  // Every custom tag collapses into one of four buckets on the way out.
  assert.deepEqual(legacy.meals.map((m) => m.mealType), ['lunch', 'snack']);
});

test('the deprecated names still resolve to the new shapes', () => {
  // Kept until the screens move. The SAME object, so importing the old name
  // cannot hand a caller a stale contract.
  assert.equal(MealLogResponseSchema, NutritionLogDayResponseSchema);
  assert.equal(
    MealLogResponseSchema.safeParse(nutritionFixtures.NUTRITION_LOG_DAY).success,
    true,
  );
});

test('a renamed or dropped field fails the schema, not the screen', () => {
  // Each of these is a field a native screen reads. A rename used to sail
  // through `.passthrough()` as an unknown extra.
  const dayNoTotals = { ...nutritionFixtures.MEAL_LOGS_DAY } as Record<string, unknown>;
  delete dayNoTotals.dailyTotals;
  assert.equal(MealLogsDayResponseSchema.safeParse(dayNoTotals).success, false);

  const itemNoBasis = {
    ...nutritionFixtures.MEAL_LOGS_DAY,
    logs: [
      {
        ...nutritionFixtures.MEAL_LOGS_DAY.logs[0],
        items: [{ name: 'X', servings: 1, nutrition: { calories: 1, protein: 0, carbs: 0, fats: 0 } }],
      },
    ],
  };
  assert.equal(
    MealLogsDayResponseSchema.safeParse(itemNoBasis).success,
    false,
    'an item with no servingSize/servingUnit can be neither scaled nor re-edited',
  );

  const summaryThinDay = {
    ...nutritionFixtures.NUTRITION_SUMMARY_WEEK,
    days: [{ date: '2026-09-28' }],
  };
  assert.equal(NutritionSummaryResponseSchema.safeParse(summaryThinDay).success, false);

  assert.equal(TagsResponseSchema.safeParse({ defaults: ['lunch'] }).success, true);
  assert.equal(TagsResponseSchema.safeParse({ userTags: 'lunch' }).success, false);
});

test('a null-ended meal-time window is data, and a wrapping one is legal', () => {
  const parsed = MealScheduleResponseSchema.parse(nutritionFixtures.MEAL_SCHEDULE);
  const unscheduled = parsed.windows.find((w) => w.tag === 'before work');
  assert.ok(unscheduled);
  assert.equal(unscheduled.startMinutes, null);
  const bed = parsed.windows.find((w) => w.tag === 'bed');
  assert.ok(bed);
  // 23:00 → 02:00. end <= start is a WRAP, not bad data.
  assert.equal(bed.startMinutes, 1380);
  assert.equal(bed.endMinutes, 120);
  // Array order IS the member's meal order, so it must survive the parse.
  assert.deepEqual(
    parsed.windows.map((w) => w.tag),
    ['breakfast', 'lunch', 'before work', 'bed'],
  );
});

test('a barcode miss is `{ food: null }`, and a preview is not persistable', () => {
  assert.equal(FoodBarcodeResponseSchema.parse(nutritionFixtures.FOOD_BARCODE_MISS).food, null);
  const preview = FoodBarcodeResponseSchema.parse(nutritionFixtures.FOOD_BARCODE_PREVIEW);
  assert.equal(preview.food?.persistable, false);
  assert.equal(preview.food?._id.startsWith('preview-off-'), true);
});

test('list schemas default their array to [] and still require a name', () => {
  assert.equal(
    MealLogsDayResponseSchema.safeParse({
      date: '2026-09-28',
      dailyTotals: { calories: 0, protein: 0, carbs: 0, fats: 0 },
    }).success,
    true,
  );
  assert.equal(FoodSearchResponseSchema.safeParse({}).success, true);
  assert.equal(FoodSearchResponseSchema.safeParse({ foods: [{ _id: 'a', source: 'usda' }] }).success, false);
  assert.equal(RecipesListResponseSchema.safeParse({}).success, true);
  assert.equal(RecipesListResponseSchema.safeParse({ recipes: [{ servings: 1 }] }).success, false);
  assert.equal(MealsListResponseSchema.safeParse({}).success, true);
  assert.equal(FoodDetailResponseSchema.safeParse({}).success, false);
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


// The profile contract itself lives in tests/accountSchemas.test.ts, next to
// the rest of the account area. `fitnessGoal` is the server's key — `goal` was
// the May one, and PATCH /api/profile drops it.
test('ProfileResponseSchema: parses GET/PATCH profile shape', () => {
  const r = ProfileResponseSchema.safeParse({ profile: { fitnessGoal: 'gain_muscle' }, name: 'Jon', onboardingCompleted: true, email: 'jon@example.com' });
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
