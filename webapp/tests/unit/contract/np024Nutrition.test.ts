// Run with: npm run test:file tests/unit/contract/np024Nutrition.test.ts
//
// THE FOOD LOG SURFACE, CHECKED AGAINST THE SHARED SCHEMAS (NP-024).
//
// Read tests/unit/contract/_contract.ts first — it explains why the schemas are
// imported by RELATIVE path, why "it parses" is not the whole check, and what a
// domain file has to end with.
//
// WHAT THIS FILE IS FOR
//
// shared/api-client described the MAY contract: the legacy `/api/nutrition/log`
// day as the only day shape, a Food with a bare `nutrition` block and no
// serving basis at all, and a Recipe with `nutrition` where the web has always
// stored `totalsPerServing`. Every recipe's macros therefore read as 0 on the
// device, and servings, variants, tags and untimed logs were invisible. Twelve
// of the twenty routes below had no schema whatsoever.
//
// So every route is called for real — the exported handler, a signed token, the
// loopback test database — and parsed with the schema the native app reads it
// through. The four rules at the top of
// shared/api-client/src/schemas/nutrition.ts are asserted here against those
// real bodies, not against a fixture:
//
//   1. nutrition is PER SERVING of the default variant, never per 100 g;
//   2. Food `source` is `usda` | `openfoodfacts` | `manual` — there is no `off`;
//   3. a Recipe's per-serving macros live in `totalsPerServing`;
//   4. `GET /api/meal-logs` is the canonical day, and the legacy
//      `/api/nutrition/log` is kept only for water, quick adds and goals.
//
// ITS OWN FIXTURES, ON PURPOSE. The runner executes test FILES in parallel
// against ONE database, so this file uses its own member
// (`@np024.contract.test`), its own `np024-` food slugs and its own `NP024 …`
// display names, and it never counts a row it did not create.
//
// DAYS. Every call sends `tz=0`, so a "local day" here is the UTC day and the
// fixtures are logged at 12:30Z of TODAY's UTC date — inside the 14-day
// recent window, the 90-day overview window and the 7-day summary span at once.

import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import mongoose from 'mongoose'
import type { NextRequest } from 'next/server'

// The routes. Real exported handlers.
import { GET as mealLogsGET, POST as mealLogsPOST } from '../../../app/api/meal-logs/route'
import { GET as nutritionLogGET } from '../../../app/api/nutrition/log/route'
import { GET as summaryGET } from '../../../app/api/nutrition/summary/route'
import { GET as foodsGET } from '../../../app/api/nutrition/foods/route'
import { GET as foodByIdGET } from '../../../app/api/nutrition/foods/[id]/route'
import { GET as overviewGET } from '../../../app/api/nutrition/foods/overview/route'
import { GET as recentGET } from '../../../app/api/nutrition/foods/recent/route'
import { GET as frequentGET } from '../../../app/api/nutrition/foods/frequent/route'
import { GET as barcodeGET } from '../../../app/api/nutrition/foods/barcode/route'
import { POST as foodImportPOST } from '../../../app/api/nutrition/foods/import/route'
import { GET as myFoodsGET } from '../../../app/api/me/foods/route'
import { GET as mealsGET } from '../../../app/api/meals/route'
import { GET as recipesGET } from '../../../app/api/nutrition/recipes/route'
import { GET as recipeByIdGET } from '../../../app/api/nutrition/recipes/[id]/route'
import { GET as tagsGET } from '../../../app/api/tags/route'
import { GET as goalsGET, POST as goalsPOST } from '../../../app/api/nutrition/goals/route'
import {
  GET as mealScheduleGET,
  PUT as mealSchedulePUT,
} from '../../../app/api/nutrition/meal-schedule/route'

// The contract. RELATIVE imports of shared/api-client — see _contract.ts.
import {
  FoodBarcodeResponseSchema,
  FoodDetailResponseSchema,
  FoodImportRequestSchema,
  FoodImportResponseSchema,
  FoodOverviewResponseSchema,
  FoodSearchResponseSchema,
  FrequentFoodsResponseSchema,
  MEAL_LOG_SOURCES,
  MealLogCreateRequestSchema,
  MealLogCreateResponseSchema,
  MealLogsDayResponseSchema,
  MealLogsRangeResponseSchema,
  MealScheduleResponseSchema,
  MealScheduleWriteRequestSchema,
  MealsListResponseSchema,
  NutritionGoalsRequestSchema,
  NutritionGoalsResponseSchema,
  NutritionGoalsWriteResponseSchema,
  NutritionLogDayResponseSchema,
  NutritionSummaryResponseSchema,
  RecentFoodsResponseSchema,
  RecipeDetailResponseSchema,
  RecipesListResponseSchema,
  SavedFoodsResponseSchema,
  TagsResponseSchema,
  type FoodImportRequest,
  type MealLogCreateRequest,
  type MealScheduleWriteRequest,
  type NutritionGoalsRequest,
} from '../../../../shared/api-client/src/schemas/nutrition'

// The assertion + coverage gate.
import {
  Coverage,
  assertContract,
  assertEveryRouteCovered,
  getJson,
  sendJson,
  type ContractMember,
  type ContractRoute,
  type Handler,
} from './_contract'

import User from '../../../models/User'
import Food from '../../../models/Food'
import Meal from '../../../models/Meal'
import MealLog from '../../../models/MealLog'
import MealTagSchedule from '../../../models/MealTagSchedule'
import DayNutrition from '../../../models/DayNutrition'
import NutritionGoal from '../../../models/NutritionGoal'
import Recipe from '../../../models/Recipe'
import UserProgress from '../../../models/UserProgress'
import { signToken } from '../../../lib/auth'

// ---------------------------------------------------------------------------
// The manifest: every route NP-024's schemas describe.
// ---------------------------------------------------------------------------

const NP024_ROUTES: readonly ContractRoute[] = [
  { method: 'GET', path: '/api/meal-logs', schema: 'MealLogsDayResponseSchema + MealLogsRangeResponseSchema', note: 'the canonical day (?date=) and the range (?from=&to=)' },
  { method: 'POST', path: '/api/meal-logs', schema: 'MealLogCreateResponseSchema', note: 'items[] resolved server-side from the Food + variant' },
  { method: 'GET', path: '/api/nutrition/log', schema: 'NutritionLogDayResponseSchema', note: 'legacy compat day — the ONLY source of water + quickAdds' },
  { method: 'GET', path: '/api/nutrition/summary', schema: 'NutritionSummaryResponseSchema', note: "the dashboard's 7-day trend" },
  { method: 'GET', path: '/api/nutrition/foods', schema: 'FoodSearchResponseSchema', note: 'flattened default variant + variants[]' },
  { method: 'GET', path: '/api/nutrition/foods/[id]', schema: 'FoodDetailResponseSchema', note: 'by ObjectId OR by slug' },
  { method: 'GET', path: '/api/nutrition/foods/overview', schema: 'FoodOverviewResponseSchema', note: 'the four chips behind an empty search box' },
  { method: 'GET', path: '/api/nutrition/foods/recent', schema: 'RecentFoodsResponseSchema', note: 'adds lastLoggedAt' },
  { method: 'GET', path: '/api/nutrition/foods/frequent', schema: 'FrequentFoodsResponseSchema', note: 'adds count' },
  { method: 'GET', path: '/api/nutrition/foods/barcode', schema: 'FoodBarcodeResponseSchema', note: 'a miss is { food: null }, not a 404' },
  { method: 'POST', path: '/api/nutrition/foods/import', schema: 'FoodImportResponseSchema', note: 'ungated; the door native uses for a usda-/off- hit' },
  { method: 'GET', path: '/api/me/foods', schema: 'SavedFoodsResponseSchema', note: 'adds isSaved + savedAt' },
  { method: 'GET', path: '/api/meals', schema: 'MealsListResponseSchema', note: 'Meal with its `recipe` half' },
  { method: 'GET', path: '/api/nutrition/recipes', schema: 'RecipesListResponseSchema', note: 'totalsPerServing, never `nutrition`' },
  { method: 'GET', path: '/api/nutrition/recipes/[id]', schema: 'RecipeDetailResponseSchema', note: 'the recipe doc DIRECTLY, unwrapped' },
  { method: 'GET', path: '/api/tags', schema: 'TagsResponseSchema', note: 'defaults + userTags (logs ∪ meals ∪ schedule)' },
  { method: 'GET', path: '/api/nutrition/goals', schema: 'NutritionGoalsResponseSchema', note: 'the row DIRECTLY, or the defaults with _isDefault' },
  { method: 'POST', path: '/api/nutrition/goals', schema: 'NutritionGoalsWriteResponseSchema', note: 'the body onboarding writes (NP-056)' },
  { method: 'GET', path: '/api/nutrition/meal-schedule', schema: 'MealScheduleResponseSchema', note: 'ORDER is data; null times are a real value' },
  { method: 'PUT', path: '/api/nutrition/meal-schedule', schema: 'MealScheduleResponseSchema', note: 'replaces the whole set' },
]

// Deliberately NOT here: the plan, scan and flag surfaces (their own tickets),
// the AI estimate routes, the admin food CRUD, the water/quick-add writers, and
// the PATCH/DELETE verbs on meal-logs and recipes.

const coverage = new Coverage()

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const MEMBER: ContractMember = {
  id: '6ab0240000000000000f7ee0',
  email: 'plus@np024.contract.test',
  label: 'plus',
  auth: '',
}

const FOOD_ID = '6ab0240000000000000f7f01'
const VARIANT_ID = '6ab0240000000000000f7f11'
const HALF_VARIANT_ID = '6ab0240000000000000f7f12'
const MEAL_ID = '6ab0240000000000000f7fa1'
const RECIPE_ID = '6ab0240000000000000f7fb1'
const SAVED_FOOD_ID = '6ab0240000000000000f7f02'

const BARCODE = '0099999900001'
const FOOD_NAME = 'NP024 Protein Bar'
const FOOD_BRAND = 'NP024 Foods'
/** Exactly `baseSlug(FOOD_NAME, FOOD_BRAND)` — see the import test. */
const FOOD_SLUG = 'np024-foods-np024-protein-bar'

/** Today's UTC day, which is also the LOCAL day for every `tz=0` call here. */
const DAY = new Date().toISOString().slice(0, 10)
const LOGGED_AT = `${DAY}T12:30:00.000Z`
const UNTIMED_AT = `${DAY}T00:00:00.000Z`
/** DayNutrition rows are keyed at UTC midnight of the local day. */
const DAY_MIDNIGHT = new Date(`${DAY}T00:00:00.000Z`)

/**
 * Rule 1 in fixture form: a bar whose serving is "1 each (60 g)". The stored
 * macros are for ONE BAR, so anything that treats them as per-100-g logs a
 * hundredth of a bar. `gramsPerServing` is the only honest weight a count-native
 * serving has.
 */
const BAR_NUTRITION = {
  calories: 210, protein: 20, carbs: 24, fats: 7,
  fiber: 9, sugar: 1, sodium: 0.19, saturatedFat: 2.5,
}

async function cleanFixtures(): Promise<void> {
  const objectId = new mongoose.Types.ObjectId(MEMBER.id)
  await User.deleteMany({ $or: [{ _id: objectId }, { email: MEMBER.email }] })
  await UserProgress.deleteMany({ userId: MEMBER.id })
  await Food.deleteMany({ $or: [{ slug: { $regex: '^np024-' } }, { createdBy: objectId }, { barcode: BARCODE }] })
  await Meal.deleteMany({ $or: [{ _id: new mongoose.Types.ObjectId(MEAL_ID) }, { createdBy: objectId }] })
  await Recipe.deleteMany({ $or: [{ _id: new mongoose.Types.ObjectId(RECIPE_ID) }, { createdBy: objectId }] })
  await MealLog.deleteMany({ user: objectId })
  await MealTagSchedule.deleteMany({ user: objectId })
  await DayNutrition.deleteMany({ userId: objectId })
  await NutritionGoal.deleteMany({ userId: objectId })
}

before(async () => {
  process.env.JWT_SECRET ||= 'become-unit-test-secret'
  process.env.ENTITLEMENTS_ENFORCED = '1'

  await mongoose.connect(process.env.MONGODB_URI ?? 'mongodb://127.0.0.1:27017/become-test')
  await cleanFixtures()

  // The food search route runs a `$text` query; without the index built the
  // handler 500s and the failure reads like a contract break.
  await Promise.all([Food.init(), Meal.init(), Recipe.init()])

  await User.create({
    _id: new mongoose.Types.ObjectId(MEMBER.id),
    email: MEMBER.email,
    // Legacy column, `required` on the model; magic-link members never use it.
    password: 'contract-test-unused',
    name: 'Contract Nutrition',
    tier: 'plus',
    onboardingCompleted: true,
    savedFoods: [{ foodId: new mongoose.Types.ObjectId(FOOD_ID), savedAt: new Date(`${DAY}T06:00:00.000Z`) }],
  })
  MEMBER.auth = `Bearer ${await signToken({ userId: MEMBER.id, email: MEMBER.email })}`

  await Food.create({
    _id: new mongoose.Types.ObjectId(FOOD_ID),
    name: FOOD_NAME,
    slug: FOOD_SLUG,
    brand: FOOD_BRAND,
    category: 'Snack',
    aliases: ['np024 bar'],
    source: 'manual',
    isFirstClass: false,
    isVerified: true,
    barcode: BARCODE,
    imageUrl: 'https://cdn.become.test/np024/bar.jpg',
    usageCount: 0,
    createdBy: new mongoose.Types.ObjectId(MEMBER.id),
    authoredBy: new mongoose.Types.ObjectId(MEMBER.id),
    groupKey: 'np024 protein bar',
    variants: [
      {
        _id: new mongoose.Types.ObjectId(VARIANT_ID),
        name: 'Bar',
        isDefault: true,
        servingSize: 1,
        servingUnit: 'each',
        displayLabel: '1 bar (60 g)',
        alternateServings: [{ label: '100 g', multiplier: 1.6667 }],
        nutrition: BAR_NUTRITION,
        gramsPerServing: 60,
      },
      {
        _id: new mongoose.Types.ObjectId(HALF_VARIANT_ID),
        name: 'Half bar',
        isDefault: false,
        servingSize: 0.5,
        servingUnit: 'each',
        alternateServings: [],
        nutrition: { calories: 105, protein: 10, carbs: 12, fats: 3.5 },
        gramsPerServing: 30,
      },
    ],
  })

  // A saved Meal template with its `recipe` half populated — the shape
  // GET /api/meals has to be able to describe.
  await Meal.create({
    _id: new mongoose.Types.ObjectId(MEAL_ID),
    name: 'NP024 Chili Bowl',
    description: 'Batch cooked',
    items: [{
      foodId: new mongoose.Types.ObjectId(FOOD_ID),
      variantId: new mongoose.Types.ObjectId(VARIANT_ID),
      variantName: 'Bar',
      name: 'NP024 Protein Bar',
      brand: 'NP024 Foods',
      servingSize: 1,
      servingUnit: 'each',
      servings: 1,
      nutrition: BAR_NUTRITION,
      servingLabel: '1 bar (60 g)',
    }],
    recipe: {
      instructions: ['Brown the beef', 'Simmer 40 min'],
      prepTimeMinutes: 10,
      cookTimeMinutes: 40,
      servings: 4,
      gramsPerServing: 350,
    },
    tags: ['dinner'],
    defaultTag: 'dinner',
    createdBy: new mongoose.Types.ObjectId(MEMBER.id),
    isPublic: false,
    isVerified: false,
  })

  // Rule 3: `totalsPerServing`. 420 + 0 over 2 servings = 210 per serving, which
  // is the number the web renders and the number native must render.
  await Recipe.create({
    _id: new mongoose.Types.ObjectId(RECIPE_ID),
    name: 'NP024 Protein Oats',
    description: 'Quick breakfast',
    category: 'Breakfast',
    servings: 2,
    ingredients: [
      {
        foodId: new mongoose.Types.ObjectId(FOOD_ID),
        variantId: new mongoose.Types.ObjectId(VARIANT_ID),
        variantName: 'Bar',
        name: 'Oats',
        amount: 80,
        unit: 'g',
        nutrition: { calories: 300, protein: 10, carbs: 50, fats: 5 },
      },
      {
        name: 'Whey',
        amount: 1,
        unit: 'scoop',
        nutrition: { calories: 120, protein: 24, carbs: 3, fats: 2 },
      },
    ],
    instructions: ['Mix', 'Microwave 2 min'],
    prepTime: 2,
    cookTime: 2,
    totalsPerServing: { calories: 210, protein: 17, carbs: 26.5, fats: 3.5, fiber: 0 },
    gramsPerServing: 250,
    tags: ['breakfast'],
    isPublic: false,
    createdBy: new mongoose.Types.ObjectId(MEMBER.id),
    imageUrl: 'https://cdn.become.test/np024/oats.jpg',
    savedFoodId: new mongoose.Types.ObjectId(SAVED_FOOD_ID),
    usageCount: 2,
  })

  // Water + a quick add. These live ONLY on the legacy day (rule 4) — nothing
  // in /api/meal-logs can express them.
  await DayNutrition.create({
    userId: new mongoose.Types.ObjectId(MEMBER.id),
    date: DAY_MIDNIGHT,
    water: { current: 64, goal: 120 },
    quickAdds: [{
      id: 'qa-np024-1',
      calories: 150,
      protein: 0,
      carbs: 38,
      fats: 0,
      note: 'orange juice',
      loggedAt: new Date(`${DAY}T15:00:00.000Z`),
    }],
  })
})

after(async () => {
  await cleanFixtures()
  await mongoose.disconnect()
})

/** A `[id]` route takes Next's second argument. Bound so the harness can call it. */
function withId(
  handler: (
    request: NextRequest,
    context: { params: Promise<{ id: string }> },
  ) => Promise<Response>,
  id: string,
): Handler {
  return (request) => handler(request, { params: Promise.resolve({ id }) })
}

/** Every read here asks for a LOCAL day with `tz=0`, i.e. the UTC day. */
const TZ = { tz: '0' }

// ═══════════════════════════════════════════════════════════════════════════
// POST /api/meal-logs — the canonical write. Runs first: the reads below read
// what it wrote.
// ═══════════════════════════════════════════════════════════════════════════

test('POST /api/meal-logs matches MealLogCreateResponseSchema, resolved from the Food', async () => {
  // Typed at the call site from the shared request schema. Only `foodId` and
  // `servings` are sent: the name, brand, serving basis, nutrition, variant and
  // bridge all come off the Food's default variant server-side, which is what
  // makes a two-field log correct rather than a guess.
  const request: MealLogCreateRequest = {
    items: [{
      foodId: FOOD_ID,
      servings: 2,
      loggedQuantity: 120,
      loggedUnit: 'g',
    }],
    loggedAt: LOGGED_AT,
    tags: ['lunch', 'post-workout'],
    mealName: 'Post-gym',
    source: 'search',
    notes: 'two bars',
    untimed: false,
  }
  assert.equal(MealLogCreateRequestSchema.safeParse(request).success, true)

  const { status, body } = await sendJson(mealLogsPOST, 'POST', '/api/meal-logs', MEMBER, request)
  coverage.mark('POST', '/api/meal-logs')

  assert.equal(status, 201, JSON.stringify(body))
  assertContract({
    label: 'POST /api/meal-logs',
    schema: MealLogCreateResponseSchema,
    body,
    expectKeys: [
      'success',
      'log._id',
      'log.user',
      'log.loggedAt',
      'log.untimed',
      'log.items',
      // Rule 1: the serving basis travels with the item, or nothing downstream
      // can re-scale or re-edit it.
      'log.items.0._id',
      'log.items.0.foodId',
      'log.items.0.variantId',
      'log.items.0.variantName',
      'log.items.0.name',
      'log.items.0.brand',
      'log.items.0.servingSize',
      'log.items.0.servingUnit',
      'log.items.0.servings',
      'log.items.0.nutrition.calories',
      'log.items.0.nutrition.protein',
      'log.items.0.nutrition.carbs',
      'log.items.0.nutrition.fats',
      'log.items.0.loggedQuantity',
      'log.items.0.loggedUnit',
      'log.items.0.loggedGramsPerServing',
      'log.mealName',
      'log.source',
      'log.tags',
      'log.notes',
      'log.totalNutrition.calories',
      'log.createdAt',
      'log.updatedAt',
    ],
  })

  const parsed = MealLogCreateResponseSchema.parse(body)
  const item = parsed.log.items[0]
  assert.ok(item)
  assert.equal(item.name, 'NP024 Protein Bar', 'the name came from the Food, not the request')
  assert.equal(item.servingSize, 1)
  assert.equal(item.servingUnit, 'each')
  assert.equal(item.variantId, VARIANT_ID, 'the DEFAULT variant was chosen')
  assert.equal(item.loggedGramsPerServing, 60, 'the variant bridge was snapshotted')
  // Rule 1, stated as arithmetic: the block is per serving and `servings`
  // multiplies it. 210 per bar × 2 bars = 420, not 210 and not 210/100 × 120.
  assert.equal(item.nutrition.calories, 210)
  assert.equal(item.servings, 2)
  assert.equal(parsed.log.totalNutrition.calories, 420)
  assert.equal(parsed.log.source, 'search')
  assert.ok((MEAL_LOG_SOURCES as readonly string[]).includes(parsed.log.source!))
  assert.deepEqual(parsed.log.tags, ['lunch', 'post-workout'])
})

test('a second, UNTIMED log under a custom tag — neither fits the legacy day', async () => {
  // Seeded directly so its `untimed` flag and single custom tag are exact. The
  // legacy `/api/nutrition/log` projection cannot express either: it collapses
  // everything into four buckets and has no untimed concept at all.
  await MealLog.create({
    user: new mongoose.Types.ObjectId(MEMBER.id),
    loggedAt: new Date(UNTIMED_AT),
    untimed: true,
    items: [{
      name: 'NP024 Handful of almonds',
      servingSize: 28,
      servingUnit: 'g',
      servings: 1,
      nutrition: { calories: 164, protein: 6, carbs: 6, fats: 14 },
    }],
    tags: ['before work'],
  })
  assert.equal(await MealLog.countDocuments({ user: MEMBER.id }), 2)
})

// ═══════════════════════════════════════════════════════════════════════════
// GET /api/meal-logs — the canonical day, and the range
// ═══════════════════════════════════════════════════════════════════════════

test('GET /api/meal-logs?date= matches MealLogsDayResponseSchema', async () => {
  const { status, body } = await getJson(mealLogsGET, '/api/meal-logs', MEMBER, {
    date: DAY,
    ...TZ,
  })
  coverage.mark('GET', '/api/meal-logs')

  assert.equal(status, 200, JSON.stringify(body))
  assertContract({
    label: 'GET /api/meal-logs?date=',
    schema: MealLogsDayResponseSchema,
    body,
    expectKeys: [
      'date',
      'logs',
      'logs.0._id',
      'logs.0.user',
      'logs.0.loggedAt',
      'logs.0.untimed',
      'logs.0.tags',
      'logs.0.items',
      'logs.0.items.0.name',
      'logs.0.items.0.servingSize',
      'logs.0.items.0.servingUnit',
      'logs.0.items.0.servings',
      'logs.0.items.0.nutrition.calories',
      'logs.0.totalNutrition.calories',
      'logs.0.totalNutrition.protein',
      'logs.0.totalNutrition.carbs',
      'logs.0.totalNutrition.fats',
      'dailyTotals.calories',
      'dailyTotals.protein',
      'dailyTotals.carbs',
      'dailyTotals.fats',
      'dailyTotals.fiber',
      'dailyTotals.sugar',
      'dailyTotals.sodium',
      'dailyTotals.saturatedFat',
    ],
  })

  const parsed = MealLogsDayResponseSchema.parse(body)
  assert.equal(parsed.date, DAY, 'the echo is the LOCAL day key, not a UTC instant')
  assert.equal(parsed.logs.length, 2)

  // Rule 4: an untimed log under a custom tag survives THIS day whole.
  const untimed = parsed.logs.find((l) => l.untimed === true)
  assert.ok(untimed, 'the untimed log is on the wire')
  assert.deepEqual(untimed.tags, ['before work'])

  // 420 (2 bars) + 164 (almonds). Quick adds are NOT here — see the legacy day.
  assert.equal(parsed.dailyTotals.calories, 584)
  assert.equal(parsed.dailyTotals.protein, 46)
})

test('GET /api/meal-logs?from=&to= matches MealLogsRangeResponseSchema with zero-days', async () => {
  const yesterday = new Date(`${DAY}T00:00:00.000Z`)
  yesterday.setUTCDate(yesterday.getUTCDate() - 1)
  const from = yesterday.toISOString().slice(0, 10)

  const { status, body } = await getJson(mealLogsGET, '/api/meal-logs', MEMBER, {
    from,
    to: DAY,
    ...TZ,
  })

  assert.equal(status, 200, JSON.stringify(body))
  assertContract({
    label: 'GET /api/meal-logs?from=&to=',
    schema: MealLogsRangeResponseSchema,
    body,
    expectKeys: [
      'days',
      'days.0.date',
      'days.0.logs',
      'days.0.dailyTotals.calories',
    ],
  })

  const parsed = MealLogsRangeResponseSchema.parse(body)
  // Every day in the range, explicit zero-days included, oldest first.
  assert.deepEqual(parsed.days.map((d) => d.date), [from, DAY])
  assert.deepEqual(parsed.days[0]?.logs, [])
  assert.equal(parsed.days[0]?.dailyTotals.calories, 0)
  assert.equal(parsed.days[1]?.dailyTotals.calories, 584)
})

// ═══════════════════════════════════════════════════════════════════════════
// GET /api/nutrition/log — the legacy compat day (rule 4)
// ═══════════════════════════════════════════════════════════════════════════

test('GET /api/nutrition/log matches NutritionLogDayResponseSchema, water and quick adds and all', async () => {
  const { status, body } = await getJson(nutritionLogGET, '/api/nutrition/log', MEMBER, {
    date: DAY,
    ...TZ,
  })
  coverage.mark('GET', '/api/nutrition/log')

  assert.equal(status, 200, JSON.stringify(body))
  assertContract({
    label: 'GET /api/nutrition/log',
    schema: NutritionLogDayResponseSchema,
    body,
    expectKeys: [
      'userId',
      'date',
      'meals',
      'meals.0.id',
      'meals.0.mealType',
      'meals.0.loggedAt',
      'meals.0.foods',
      // `id` is the ITEM's _id — it is what PUT/DELETE address.
      'meals.0.foods.0.id',
      'meals.0.foods.0.foodId',
      'meals.0.foods.0.name',
      'meals.0.foods.0.servingSize',
      'meals.0.foods.0.servingUnit',
      'meals.0.foods.0.servings',
      'meals.0.foods.0.nutrition.calories',
      'meals.0.foods.0.loggedQuantity',
      'meals.0.foods.0.loggedUnit',
      'meals.0.foods.0.loggedGramsPerServing',
      // The three things that live ONLY here.
      'water.current',
      'water.goal',
      'quickAdds',
      'quickAdds.0.id',
      'quickAdds.0.calories',
      'quickAdds.0.note',
      'quickAdds.0.loggedAt',
      // The web dashboard reads these.
      'dailyTotals.calories',
      'dailyTotals.protein',
      'dailyTotals.carbs',
      'dailyTotals.fats',
      'goals.calories',
    ],
  })

  const parsed = NutritionLogDayResponseSchema.parse(body)
  assert.equal(parsed.water?.current, 64)
  assert.equal(parsed.water?.goal, 120)
  assert.equal(parsed.quickAdds[0]?.calories, 150)

  // The reason the web dashboard still reads this route: its totals INCLUDE the
  // quick add, and GET /api/meal-logs' do not. 584 + 150.
  assert.equal(parsed.dailyTotals?.calories, 734)

  // Rule 4, the cost of the legacy shape: `before work` is gone and the untimed
  // entry has been filed under `snack`.
  assert.deepEqual(parsed.meals.map((m) => m.mealType), ['lunch', 'snack'])
  const lunch = parsed.meals.find((m) => m.mealType === 'lunch')
  assert.ok(lunch)
  assert.equal(lunch.foods[0]?.servings, 2)
  assert.equal(lunch.foods[0]?.nutrition.calories, 210)

  // No goals row saved yet, so this is the hardcoded fallback — which is why
  // NutritionGoalsSchema cannot require `goalType`.
  assert.equal(parsed.goals?.calories, 2000)
})

// ═══════════════════════════════════════════════════════════════════════════
// GET /api/nutrition/summary — the dashboard's 7-day trend
// ═══════════════════════════════════════════════════════════════════════════

test('GET /api/nutrition/summary?period=week matches NutritionSummaryResponseSchema', async () => {
  const { status, body } = await getJson(summaryGET, '/api/nutrition/summary', MEMBER, {
    period: 'week',
    date: DAY,
    ...TZ,
  })
  coverage.mark('GET', '/api/nutrition/summary')

  assert.equal(status, 200, JSON.stringify(body))
  assertContract({
    label: 'GET /api/nutrition/summary?period=week',
    schema: NutritionSummaryResponseSchema,
    body,
    expectKeys: [
      'period',
      'startDate',
      'endDate',
      'days',
      'days.0.date',
      'days.0.calories',
      'days.0.protein',
      'days.0.carbs',
      'days.0.fats',
      'days.0.fiber',
      'days.0.sugar',
      'days.0.sodium',
      'days.0.water',
      'days.0.mealCount',
      'days.0.hasData',
      'averages.calories',
      'averages.protein',
      'averages.carbs',
      'averages.fats',
      'averages.fiber',
      'averages.water',
      'averages.daysTracked',
      'averages.totalDays',
    ],
  })

  const parsed = NutritionSummaryResponseSchema.parse(body)
  // Seven LOCAL day keys, oldest → newest, every one present.
  assert.equal(parsed.days.length, 7)
  assert.equal(parsed.endDate, DAY)
  assert.equal(parsed.days[6]?.date, DAY)
  assert.equal(parsed.days[0]?.hasData, false, 'a day with nothing on it is still a row')

  const today = parsed.days[6]
  assert.ok(today)
  assert.equal(today.hasData, true)
  // Computed from MealLog + quickAdds on every request, never from a mirror.
  assert.equal(today.calories, 734)
  assert.equal(today.water, 64)
  assert.equal(today.mealCount, 2, 'logs, not items')
  assert.equal(parsed.averages.daysTracked, 1)
  assert.equal(parsed.averages.totalDays, 7)
})

// ═══════════════════════════════════════════════════════════════════════════
// The food surfaces — every one of them flattens the DEFAULT VARIANT (rule 1)
// ═══════════════════════════════════════════════════════════════════════════

/** The paths every flattened food row must carry, for a given list key. */
function foodRowKeys(prefix: string): string[] {
  return [
    `${prefix}._id`,
    `${prefix}.name`,
    `${prefix}.slug`,
    `${prefix}.brand`,
    `${prefix}.category`,
    // Rule 1: the serving basis, mirrored from the default variant.
    `${prefix}.servingSize`,
    `${prefix}.servingUnit`,
    `${prefix}.displayLabel`,
    `${prefix}.alternateServings`,
    `${prefix}.nutrition.calories`,
    `${prefix}.nutrition.protein`,
    `${prefix}.nutrition.carbs`,
    `${prefix}.nutrition.fats`,
    `${prefix}.gramsPerServing`,
    // …and every variant, so the picker has something to pick.
    `${prefix}.variants`,
    `${prefix}.variants.0._id`,
    `${prefix}.variants.0.name`,
    `${prefix}.variants.0.isDefault`,
    `${prefix}.variants.0.servingSize`,
    `${prefix}.variants.0.servingUnit`,
    `${prefix}.variants.0.displayLabel`,
    `${prefix}.variants.0.alternateServings`,
    `${prefix}.variants.0.nutrition.calories`,
    `${prefix}.variants.0.gramsPerServing`,
    `${prefix}.aliases`,
    `${prefix}.barcode`,
    `${prefix}.imageUrl`,
    `${prefix}.isFirstClass`,
    `${prefix}.isVerified`,
    `${prefix}.usageCount`,
    `${prefix}.source`,
    `${prefix}.createdBy`,
    `${prefix}.authoredBy`,
    `${prefix}.groupKey`,
    `${prefix}.createdAt`,
    `${prefix}.updatedAt`,
  ]
}

/** Rule 1 + rule 2, asserted on a parsed row from any of the food lists. */
function assertBarRow(row: {
  source?: string
  servingSize?: number
  servingUnit?: string
  gramsPerServing?: number
  nutrition?: { calories: number }
  variants: { isDefault?: boolean; name: string; servingSize: number; gramsPerServing?: number; nutrition: { calories: number } }[]
}): void {
  // Rule 2: `manual`, spelled in full; `off` is not a value this app has.
  assert.equal(row.source, 'manual')
  // Rule 1: one bar, with a 60 g bridge. NOT 210 per 100 g.
  assert.equal(row.servingSize, 1)
  assert.equal(row.servingUnit, 'each')
  assert.equal(row.gramsPerServing, 60)
  assert.equal(row.nutrition?.calories, 210)
  // Both variants, and the flattened top level IS the default one.
  assert.equal(row.variants.length, 2)
  const def = row.variants.find((v) => v.isDefault)
  assert.ok(def, 'exactly one variant is the default')
  assert.equal(def.name, 'Bar')
  assert.equal(def.servingSize, row.servingSize)
  assert.equal(def.gramsPerServing, row.gramsPerServing)
  assert.equal(def.nutrition.calories, row.nutrition?.calories)
  const half = row.variants.find((v) => !v.isDefault)
  assert.ok(half, 'the second variant is on the wire, or the picker has nothing to pick')
  assert.equal(half.nutrition.calories, 105)
}

test('GET /api/nutrition/foods matches FoodSearchResponseSchema with the serving basis', async () => {
  // `custom=true` keeps this to OUR catalogue: the three-source path calls USDA
  // and OpenFoodFacts over the network and schedules a background import, none
  // of which is the contract.
  const { status, body } = await getJson(foodsGET, '/api/nutrition/foods', MEMBER, {
    q: 'np024',
    custom: 'true',
  })
  coverage.mark('GET', '/api/nutrition/foods')

  assert.equal(status, 200, JSON.stringify(body))
  assertContract({
    label: 'GET /api/nutrition/foods?q=&custom=true',
    schema: FoodSearchResponseSchema,
    body,
    expectKeys: [
      'foods',
      ...foodRowKeys('foods.0'),
      // The search route's own additions.
      'foods.0.isSaved',
      'total',
      'offset',
      'limit',
    ],
  })

  const parsed = FoodSearchResponseSchema.parse(body)
  assert.equal(parsed.foods.length, 1, 'only this file\'s fixture matches `np024`')
  const row = parsed.foods[0]!
  assertBarRow(row)
  assert.equal(row.isSaved, true, 'the member saved it, so the bookmark renders filled')
  assert.equal(parsed.total, 1)
})

test('GET /api/nutrition/foods/[id] matches FoodDetailResponseSchema, by id AND by slug', async () => {
  const { status, body } = await getJson(
    withId(foodByIdGET, FOOD_ID),
    `/api/nutrition/foods/${FOOD_ID}`,
    MEMBER,
  )
  coverage.mark('GET', '/api/nutrition/foods/[id]')

  assert.equal(status, 200, JSON.stringify(body))
  assertContract({
    label: 'GET /api/nutrition/foods/[id]',
    schema: FoodDetailResponseSchema,
    body,
    expectKeys: foodRowKeys('food'),
  })

  const parsed = FoodDetailResponseSchema.parse(body)
  assertBarRow(parsed.food)
  assert.equal(parsed.food._id, FOOD_ID)

  // The same route resolves a slug, which is how a deep link addresses a food.
  const bySlug = await getJson(
    withId(foodByIdGET, FOOD_SLUG),
    `/api/nutrition/foods/${FOOD_SLUG}`,
    MEMBER,
  )
  assert.equal(bySlug.status, 200)
  assert.equal(FoodDetailResponseSchema.parse(bySlug.body).food._id, FOOD_ID)

  // And a miss is a 404, not `{ food: null }` — unlike the barcode route.
  const miss = await getJson(
    withId(foodByIdGET, 'np024-no-such-food'),
    '/api/nutrition/foods/np024-no-such-food',
    MEMBER,
  )
  assert.equal(miss.status, 404)
})

test('GET /api/nutrition/foods/overview matches FoodOverviewResponseSchema', async () => {
  const { status, body } = await getJson(overviewGET, '/api/nutrition/foods/overview', MEMBER)
  coverage.mark('GET', '/api/nutrition/foods/overview')

  assert.equal(status, 200, JSON.stringify(body))
  assertContract({
    label: 'GET /api/nutrition/foods/overview',
    schema: FoodOverviewResponseSchema,
    body,
    expectKeys: [
      'foods',
      ...foodRowKeys('foods.0'),
      'foods.0.isSaved',
      'meals',
      'recent',
      'frequent',
    ],
  })

  const parsed = FoodOverviewResponseSchema.parse(body)
  // Saved, flattened, and flagged — a raw Food document here takes the screen
  // down, because the row renderer reads `nutrition` at the top level.
  assert.equal(parsed.foods.length, 1)
  assertBarRow(parsed.foods[0]!)
  assert.equal(parsed.foods[0]!.isSaved, true)

  // Deduped in DISPLAY order: the bar is already row 1 of `foods`, so neither
  // `recent` nor `frequent` repeats it. What is left in `recent` is the almonds
  // log, which has no Food behind it and is therefore SYNTHESISED from the log
  // snapshot — a `legacy-` id and one variant, rather than a dropped row.
  assert.deepEqual(parsed.recent.map((f) => f._id), ['legacy-NP024 Handful of almonds'])
  const synthesised = parsed.recent[0]!
  assert.equal(synthesised.servingSize, 28)
  assert.equal(synthesised.servingUnit, 'g')
  assert.equal(synthesised.nutrition?.calories, 164)
  assert.equal(synthesised.variants.length, 1)
  assert.equal(synthesised.variants[0]?.isDefault, true)
  assert.deepEqual(parsed.frequent.map((f) => f._id), [])

  // `meals` is always empty today: the handler filters `Meal.find({ user })`
  // and a Meal is owned by `createdBy`. Typed with MealSchema all the same, so
  // the section is described the day that filter is corrected — the shape is
  // exercised for real by GET /api/meals below.
  assert.deepEqual(parsed.meals, [])
})

test('GET /api/nutrition/foods/recent matches RecentFoodsResponseSchema and adds lastLoggedAt', async () => {
  const { status, body } = await getJson(recentGET, '/api/nutrition/foods/recent', MEMBER)
  coverage.mark('GET', '/api/nutrition/foods/recent')

  assert.equal(status, 200, JSON.stringify(body))
  // The list mixes fully-resolved rows with rows SYNTHESISED from a log that has
  // no Food behind it, and only the resolved ones carry the whole flattened
  // shape — so the row keys are asserted at the bar's own index rather than at 0.
  const barIndex = RecentFoodsResponseSchema.parse(body).foods.findIndex((f) => f._id === FOOD_ID)
  assert.ok(barIndex >= 0, 'the bar was logged today')
  assertContract({
    label: 'GET /api/nutrition/foods/recent',
    schema: RecentFoodsResponseSchema,
    body,
    expectKeys: [
      'foods',
      ...foodRowKeys(`foods.${barIndex}`),
      `foods.${barIndex}.lastLoggedAt`,
    ],
  })

  const parsed = RecentFoodsResponseSchema.parse(body)
  const bar = parsed.foods.find((f) => f._id === FOOD_ID)
  assert.ok(bar, 'the bar was logged today')
  assertBarRow(bar)
  assert.ok(bar.lastLoggedAt, 'the recency the list is ordered by is on the wire')

  // The almonds log has no `foodId`, so it comes back SYNTHESISED rather than
  // dropped — a `legacy-` id, one variant, and the snapshot's serving basis.
  const almonds = parsed.foods.find((f) => f.name === 'NP024 Handful of almonds')
  assert.ok(almonds, 'a log with no Food behind it is still the thing they ate')
  assert.equal(almonds._id, 'legacy-NP024 Handful of almonds')
  assert.equal(almonds.servingUnit, 'g')
  assert.equal(almonds.variants.length, 1)
  assert.equal(almonds.variants[0]?.isDefault, true)
  assert.equal(almonds.source, 'manual')
})

test('GET /api/nutrition/foods/frequent matches FrequentFoodsResponseSchema and adds count', async () => {
  const { status, body } = await getJson(frequentGET, '/api/nutrition/foods/frequent', MEMBER)
  coverage.mark('GET', '/api/nutrition/foods/frequent')

  assert.equal(status, 200, JSON.stringify(body))
  // Same as `recent`: the almonds log has no Food behind it, so its row is
  // synthesised and thinner. Both rows have a count of 1, so the aggregation's
  // order between them is not something to assert — find the bar.
  const barIndex = FrequentFoodsResponseSchema.parse(body).foods.findIndex((f) => f._id === FOOD_ID)
  assert.ok(barIndex >= 0, 'the bar was logged today')
  assertContract({
    label: 'GET /api/nutrition/foods/frequent',
    schema: FrequentFoodsResponseSchema,
    body,
    expectKeys: ['foods', ...foodRowKeys(`foods.${barIndex}`), `foods.${barIndex}.count`],
  })

  const parsed = FrequentFoodsResponseSchema.parse(body)
  const bar = parsed.foods.find((f) => f._id === FOOD_ID)
  assert.ok(bar)
  assertBarRow(bar)
  assert.equal(bar.count, 1, 'the count the list is ordered by is on the wire')
})

test('GET /api/nutrition/foods/barcode matches FoodBarcodeResponseSchema; a miss is `{ food: null }`', async () => {
  const { status, body } = await getJson(barcodeGET, '/api/nutrition/foods/barcode', MEMBER, {
    code: BARCODE,
  })
  coverage.mark('GET', '/api/nutrition/foods/barcode')

  assert.equal(status, 200, JSON.stringify(body))
  assertContract({
    label: 'GET /api/nutrition/foods/barcode',
    schema: FoodBarcodeResponseSchema,
    body,
    expectKeys: foodRowKeys('food'),
  })

  const parsed = FoodBarcodeResponseSchema.parse(body)
  assert.ok(parsed.food)
  assertBarRow(parsed.food)
  assert.equal(parsed.food.barcode, BARCODE)
  // A real Food row, so it is loggable by `foodId`.
  assert.equal(parsed.food.persistable, undefined)

  // A 12-digit UPC-A and its 13-digit EAN-13 form are the same barcode.
  const upc = await getJson(barcodeGET, '/api/nutrition/foods/barcode', MEMBER, {
    code: BARCODE.slice(1),
  })
  assert.equal(upc.status, 200)
  assert.equal(FoodBarcodeResponseSchema.parse(upc.body).food?._id, FOOD_ID)
})

test('POST /api/nutrition/foods/import matches FoodImportResponseSchema', async () => {
  // Typed at the call site: this is the UNGATED door native uses to materialise
  // a `usda-`/`off-` search hit before logging it. `manual` is the fallback
  // shape (the cached search row re-sent as `data`), and the only one of the
  // three that needs no network.
  //
  // The payload deliberately names the fixture food, so this exercises the
  // IDEMPOTENT branch: `importManualFood` dedupes a manual save on
  // `baseSlug(name, brand)` scoped to the caller, which is what makes it safe
  // for the app to call on every log of the same thing. The response shape is
  // identical either way — `flattenFoodForResponse` — so nothing about the
  // contract is left uncovered, and the row that comes back is the full
  // two-variant one rather than a thin new single-variant row.
  const request: FoodImportRequest = {
    source: 'manual',
    data: {
      name: FOOD_NAME,
      brand: FOOD_BRAND,
      category: 'Snack',
      servingSize: 1,
      servingUnit: 'each',
      gramsPerServing: 60,
      alternateServings: [],
      nutrition: BAR_NUTRITION,
    },
  }
  assert.equal(FoodImportRequestSchema.safeParse(request).success, true)

  const { status, body } = await sendJson(
    foodImportPOST,
    'POST',
    '/api/nutrition/foods/import',
    MEMBER,
    request,
  )
  coverage.mark('POST', '/api/nutrition/foods/import')

  assert.equal(status, 200, JSON.stringify(body))
  assertContract({
    label: 'POST /api/nutrition/foods/import',
    schema: FoodImportResponseSchema,
    body,
    expectKeys: ['success', 'created', ...foodRowKeys('food')],
  })

  const parsed = FoodImportResponseSchema.parse(body)
  assert.equal(parsed.success, true)
  assert.equal(parsed.created, false, 'the same name+brand is the same food')
  assert.equal(parsed.food._id, FOOD_ID, 'the caller is handed back their OWN row')
  assertBarRow(parsed.food)
  // The pick counts as a usage — the row is re-read AFTER the $inc, so the
  // bumped count is what reaches the client. (It is already at 1 from the
  // POST /api/meal-logs above, which bumps it too.)
  const usageAfterFirst = parsed.food.usageCount
  assert.ok(usageAfterFirst && usageAfterFirst >= 1, `usageCount was ${usageAfterFirst}`)

  // Called again, as the app would on the next log of the same food: still not
  // created, and the usage bump is the only difference.
  const again = await sendJson(
    foodImportPOST,
    'POST',
    '/api/nutrition/foods/import',
    MEMBER,
    request,
  )
  assert.equal(again.status, 200)
  const reparsed = FoodImportResponseSchema.parse(again.body)
  assert.equal(reparsed.created, false)
  assert.equal(reparsed.food._id, FOOD_ID)
  assert.equal(reparsed.food.usageCount, usageAfterFirst! + 1)
})

test('GET /api/me/foods matches SavedFoodsResponseSchema and adds isSaved + savedAt', async () => {
  const { status, body } = await getJson(myFoodsGET, '/api/me/foods', MEMBER)
  coverage.mark('GET', '/api/me/foods')

  assert.equal(status, 200, JSON.stringify(body))
  assertContract({
    label: 'GET /api/me/foods',
    schema: SavedFoodsResponseSchema,
    body,
    expectKeys: ['foods', ...foodRowKeys('foods.0'), 'foods.0.isSaved', 'foods.0.savedAt'],
  })

  const parsed = SavedFoodsResponseSchema.parse(body)
  assert.equal(parsed.foods.length, 1)
  assertBarRow(parsed.foods[0]!)
  assert.equal(parsed.foods[0]!.isSaved, true)
  assert.ok(parsed.foods[0]!.savedAt, 'the list is ordered by it')
})

// ═══════════════════════════════════════════════════════════════════════════
// GET /api/meals — a Meal, with its `recipe` half
// ═══════════════════════════════════════════════════════════════════════════

test('GET /api/meals matches MealsListResponseSchema including `recipe`', async () => {
  const { status, body } = await getJson(mealsGET, '/api/meals', MEMBER, { mine: 'true' })
  coverage.mark('GET', '/api/meals')

  assert.equal(status, 200, JSON.stringify(body))
  assertContract({
    label: 'GET /api/meals?mine=true',
    schema: MealsListResponseSchema,
    body,
    expectKeys: [
      'meals',
      'meals.0._id',
      'meals.0.name',
      'meals.0.description',
      'meals.0.items',
      'meals.0.items.0._id',
      'meals.0.items.0.foodId',
      'meals.0.items.0.variantId',
      'meals.0.items.0.name',
      'meals.0.items.0.servingSize',
      'meals.0.items.0.servingUnit',
      'meals.0.items.0.servings',
      'meals.0.items.0.nutrition.calories',
      'meals.0.items.0.servingLabel',
      // The recipe half — a Meal with instructions IS a recipe in the product.
      'meals.0.recipe.instructions',
      'meals.0.recipe.prepTimeMinutes',
      'meals.0.recipe.cookTimeMinutes',
      'meals.0.recipe.servings',
      'meals.0.recipe.gramsPerServing',
      'meals.0.tags',
      'meals.0.defaultTag',
      'meals.0.createdBy',
      'meals.0.isPublic',
      'meals.0.isVerified',
      'meals.0.totalNutrition.calories',
      'meals.0.usageCount',
      'meals.0.createdAt',
      'meals.0.updatedAt',
      'total',
      'offset',
      'limit',
    ],
  })

  const parsed = MealsListResponseSchema.parse(body)
  assert.equal(parsed.meals.length, 1, 'only this member\'s own meal')
  const meal = parsed.meals[0]!
  assert.equal(meal._id, MEAL_ID)
  assert.equal(meal.recipe?.servings, 4)
  assert.deepEqual(meal.recipe?.instructions, ['Brown the beef', 'Simmer 40 min'])
  assert.equal(meal.defaultTag, 'dinner')
  // Rule 1 again: an item inside a Meal carries the same serving basis a log does.
  assert.equal(meal.items[0]?.servingSize, 1)
  assert.equal(meal.items[0]?.servingUnit, 'each')
  assert.equal(meal.totalNutrition.calories, 210)
})

// ═══════════════════════════════════════════════════════════════════════════
// Recipes — rule 3, the reason native showed 0 kcal for every recipe
// ═══════════════════════════════════════════════════════════════════════════

test('GET /api/nutrition/recipes matches RecipesListResponseSchema with `totalsPerServing`', async () => {
  const { status, body } = await getJson(recipesGET, '/api/nutrition/recipes', MEMBER, {
    mine: 'true',
  })
  coverage.mark('GET', '/api/nutrition/recipes')

  assert.equal(status, 200, JSON.stringify(body))
  assertContract({
    label: 'GET /api/nutrition/recipes?mine=true',
    schema: RecipesListResponseSchema,
    body,
    expectKeys: [
      'recipes',
      'recipes.0._id',
      'recipes.0.name',
      'recipes.0.description',
      'recipes.0.category',
      'recipes.0.servings',
      'recipes.0.ingredients',
      'recipes.0.ingredients.0.foodId',
      'recipes.0.ingredients.0.variantId',
      'recipes.0.ingredients.0.variantName',
      'recipes.0.ingredients.0.name',
      'recipes.0.ingredients.0.amount',
      'recipes.0.ingredients.0.unit',
      'recipes.0.ingredients.0.nutrition.calories',
      'recipes.0.ingredients.0.nutrition.protein',
      'recipes.0.ingredients.0.nutrition.carbs',
      'recipes.0.ingredients.0.nutrition.fats',
      'recipes.0.instructions',
      'recipes.0.prepTime',
      'recipes.0.cookTime',
      // RULE 3. The field native read as `nutrition` and got 0 from.
      'recipes.0.totalsPerServing.calories',
      'recipes.0.totalsPerServing.protein',
      'recipes.0.totalsPerServing.carbs',
      'recipes.0.totalsPerServing.fats',
      'recipes.0.gramsPerServing',
      'recipes.0.tags',
      'recipes.0.isPublic',
      'recipes.0.createdBy',
      'recipes.0.imageUrl',
      'recipes.0.savedFoodId',
      'recipes.0.usageCount',
      'recipes.0.createdAt',
      'recipes.0.updatedAt',
    ],
  })

  const parsed = RecipesListResponseSchema.parse(body)
  assert.equal(parsed.recipes.length, 1)
  assert.equal(parsed.recipes[0]?.totalsPerServing.calories, 210)
})

test('GET /api/nutrition/recipes/[id] matches RecipeDetailResponseSchema — the SAME per-serving macros the web shows', async () => {
  const { status, body } = await getJson(
    withId(recipeByIdGET, RECIPE_ID),
    `/api/nutrition/recipes/${RECIPE_ID}`,
    MEMBER,
  )
  coverage.mark('GET', '/api/nutrition/recipes/[id]')

  assert.equal(status, 200, JSON.stringify(body))
  // The detail route answers the recipe doc DIRECTLY — no `{ recipe }` wrapper.
  assertContract({
    label: 'GET /api/nutrition/recipes/[id]',
    schema: RecipeDetailResponseSchema,
    body,
    expectKeys: [
      '_id',
      'name',
      'description',
      'category',
      'servings',
      'ingredients',
      'ingredients.0.name',
      'ingredients.0.amount',
      'ingredients.0.unit',
      'ingredients.0.nutrition.calories',
      'instructions',
      'totalsPerServing.calories',
      'totalsPerServing.protein',
      'totalsPerServing.carbs',
      'totalsPerServing.fats',
      'gramsPerServing',
      'savedFoodId',
    ],
  })

  const parsed = RecipeDetailResponseSchema.parse(body)

  // RULE 3, in the numbers. This is exactly what the web's recipe detail
  // renders (`webapp/components/nutrition/RecipeDetail` reads
  // `recipe.totalsPerServing`) and exactly what
  // `expo/lib/nutrition/recipes.ts#toRecipeDetailViewModel` now reads. The old
  // shared schema described `nutrition`, which no handler has ever sent, so the
  // native screen showed 0 / 0 / 0 / 0 for every recipe ever published.
  assert.deepEqual(
    {
      kcal: parsed.totalsPerServing.calories,
      protein: parsed.totalsPerServing.protein,
      carbs: parsed.totalsPerServing.carbs,
      fat: parsed.totalsPerServing.fats,
    },
    { kcal: 210, protein: 17, carbs: 26.5, fat: 3.5 },
  )
  // Already per serving — the route divided by `servings` before storing it, so
  // a client must NOT divide again.
  assert.equal(parsed.servings, 2)
  const ingredientTotal = (parsed.ingredients ?? []).reduce(
    (sum, i) => sum + (i.nutrition?.calories ?? 0),
    0,
  )
  assert.equal(ingredientTotal, 420, 'ingredient blocks are whole-recipe amounts')
  assert.equal(parsed.totalsPerServing.calories, ingredientTotal / parsed.servings!)

  // `nutrition` is not a Recipe field, and never was.
  assert.equal((body as Record<string, unknown>).nutrition, undefined)
})

// ═══════════════════════════════════════════════════════════════════════════
// Tags, goals, meal-time windows
// ═══════════════════════════════════════════════════════════════════════════

test('PUT /api/nutrition/meal-schedule matches MealScheduleResponseSchema and keeps ORDER', async () => {
  // Typed at the call site. `null` ends are a real value: an unscheduled tag
  // still needs a row so its POSITION is remembered.
  const request: MealScheduleWriteRequest = {
    windows: [
      { tag: 'breakfast', startMinutes: 360, endMinutes: 600 },
      { tag: 'lunch', startMinutes: 660, endMinutes: 900 },
      { tag: 'before work', startMinutes: null, endMinutes: null },
      // 23:00 → 02:00. end <= start WRAPS past midnight; legitimate, not bad data.
      { tag: 'bed', startMinutes: 1380, endMinutes: 120 },
    ],
  }
  assert.equal(MealScheduleWriteRequestSchema.safeParse(request).success, true)

  const { status, body } = await sendJson(
    mealSchedulePUT,
    'PUT',
    '/api/nutrition/meal-schedule',
    MEMBER,
    request,
  )
  coverage.mark('PUT', '/api/nutrition/meal-schedule')

  assert.equal(status, 200, JSON.stringify(body))
  assertContract({
    label: 'PUT /api/nutrition/meal-schedule',
    schema: MealScheduleResponseSchema,
    body,
    expectKeys: [
      'windows',
      'windows.0.tag',
      'windows.0.startMinutes',
      'windows.0.endMinutes',
    ],
  })

  const parsed = MealScheduleResponseSchema.parse(body)
  assert.deepEqual(
    parsed.windows.map((w) => w.tag),
    ['breakfast', 'lunch', 'before work', 'bed'],
    'array order IS the member\'s meal order',
  )
  assert.equal(parsed.windows[2]?.startMinutes, null)
  assert.equal(parsed.windows[3]?.endMinutes, 120)
})

test('GET /api/nutrition/meal-schedule matches MealScheduleResponseSchema', async () => {
  const { status, body } = await getJson(mealScheduleGET, '/api/nutrition/meal-schedule', MEMBER)
  coverage.mark('GET', '/api/nutrition/meal-schedule')

  assert.equal(status, 200, JSON.stringify(body))
  assertContract({
    label: 'GET /api/nutrition/meal-schedule',
    schema: MealScheduleResponseSchema,
    body,
    expectKeys: [
      'windows',
      'windows.0.tag',
      'windows.0.startMinutes',
      'windows.0.endMinutes',
      'windows.2.startMinutes',
    ],
  })

  const parsed = MealScheduleResponseSchema.parse(body)
  assert.equal(parsed.windows.length, 4)
  // Round-trips whole, nulls and wrap included.
  assert.equal(parsed.windows.find((w) => w.tag === 'before work')?.startMinutes, null)
  assert.equal(parsed.windows.find((w) => w.tag === 'bed')?.startMinutes, 1380)
})

test('GET /api/tags matches TagsResponseSchema, schedule tags included', async () => {
  const { status, body } = await getJson(tagsGET, '/api/tags', MEMBER)
  coverage.mark('GET', '/api/tags')

  assert.equal(status, 200, JSON.stringify(body))
  assertContract({
    label: 'GET /api/tags',
    schema: TagsResponseSchema,
    body,
    expectKeys: ['defaults', 'userTags'],
  })

  const parsed = TagsResponseSchema.parse(body)
  assert.deepEqual(parsed.defaults, [
    'breakfast', 'lunch', 'dinner', 'snack', 'pre-workout', 'post-workout',
  ])
  // Logs ∪ saved meals ∪ the SCHEDULE — the schedule is the only place a tag can
  // exist before anything has been logged under it, which is why `breakfast`
  // and `bed` are here with nothing eaten under either.
  assert.deepEqual(
    parsed.userTags,
    ['bed', 'before work', 'breakfast', 'dinner', 'lunch', 'post-workout'],
  )
})

test('GET /api/nutrition/goals answers the DEFAULTS with _isDefault before anything is saved', async () => {
  const { status, body } = await getJson(goalsGET, '/api/nutrition/goals', MEMBER)
  coverage.mark('GET', '/api/nutrition/goals')

  assert.equal(status, 200, JSON.stringify(body))
  assertContract({
    label: 'GET /api/nutrition/goals (never saved)',
    schema: NutritionGoalsResponseSchema,
    body,
    expectKeys: [
      'calories', 'protein', 'carbs', 'fats', 'waterGoal',
      'goalType', 'activityLevel', '_isDefault',
    ],
  })

  const parsed = NutritionGoalsResponseSchema.parse(body)
  assert.equal(parsed._isDefault, true)
  assert.equal(parsed.calories, 2000)
  // The row is answered DIRECTLY, not wrapped in `{ goals }`.
  assert.equal((body as Record<string, unknown>).goals, undefined)
})

test('POST /api/nutrition/goals matches NutritionGoalsWriteResponseSchema (the onboarding body)', async () => {
  // Typed at the call site from the shared request schema — this is the body
  // onboarding writes (NP-056).
  const request: NutritionGoalsRequest = {
    calories: 2400,
    protein: 180,
    carbs: 250,
    fats: 75,
    waterGoal: 120,
    goalType: 'gain',
    activityLevel: 'active',
    macroPreset: 'high_protein',
  }
  assert.equal(NutritionGoalsRequestSchema.safeParse(request).success, true)

  const { status, body } = await sendJson(
    goalsPOST,
    'POST',
    '/api/nutrition/goals',
    MEMBER,
    request,
  )
  coverage.mark('POST', '/api/nutrition/goals')

  assert.equal(status, 200, JSON.stringify(body))
  assertContract({
    label: 'POST /api/nutrition/goals',
    schema: NutritionGoalsWriteResponseSchema,
    body,
    expectKeys: [
      'success',
      'goals._id',
      'goals.userId',
      'goals.calories',
      'goals.protein',
      'goals.carbs',
      'goals.fats',
      'goals.waterGoal',
      'goals.goalType',
      'goals.activityLevel',
      'goals.macroPreset',
      'goals.calcVersion',
      'goals.createdAt',
      'goals.updatedAt',
    ],
  })

  const parsed = NutritionGoalsWriteResponseSchema.parse(body)
  assert.equal(parsed.success, true)
  assert.equal(parsed.goals.waterGoal, 120)
  assert.equal(parsed.goals.macroPreset, 'high_protein')
  // The write is reconciled before it lands: calories and the macros agree, so
  // a dashboard can never show "266 left" beside 378 cal of remaining macros.
  const fromMacros = parsed.goals.protein! * 4 + parsed.goals.carbs! * 4 + parsed.goals.fats! * 9
  assert.ok(
    Math.abs(fromMacros - parsed.goals.calories!) <= Math.max(25, parsed.goals.calories! * 0.02),
    `calories ${parsed.goals.calories} vs macros ${fromMacros}`,
  )
})

test('GET /api/nutrition/goals answers the saved row DIRECTLY once there is one', async () => {
  const { status, body } = await getJson(goalsGET, '/api/nutrition/goals', MEMBER)

  assert.equal(status, 200, JSON.stringify(body))
  assertContract({
    label: 'GET /api/nutrition/goals (saved)',
    schema: NutritionGoalsResponseSchema,
    body,
    expectKeys: [
      '_id', 'userId', 'calories', 'protein', 'carbs', 'fats',
      'waterGoal', 'goalType', 'activityLevel', 'macroPreset',
      'calcVersion', 'createdAt', 'updatedAt',
    ],
  })

  const parsed = NutritionGoalsResponseSchema.parse(body)
  assert.equal(parsed._isDefault, undefined, 'a saved row is not flagged')
  assert.equal(parsed.waterGoal, 120)
  assert.equal(parsed.goalType, 'gain')
  // `custom` is exempt from every recompute; this row is `high_protein`, and
  // the member has no body stats, so nothing is recalculated underneath it.
  assert.equal(parsed.macroPreset, 'high_protein')
})

// ═══════════════════════════════════════════════════════════════════════════
// The coverage gate. Keep this last.
// ═══════════════════════════════════════════════════════════════════════════

test('every route NP-024 covers was actually called with its schema', () => {
  assertEveryRouteCovered(NP024_ROUTES, coverage)
  // The manifest is not allowed to shrink quietly: twenty routes, the list above.
  assert.equal(NP024_ROUTES.length, 20)
  assert.equal(coverage.list().length, 20)
})
