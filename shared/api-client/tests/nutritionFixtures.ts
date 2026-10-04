// RECORDED NUTRITION RESPONSES (NP-024).
//
// One fixture per route the v1 food log calls, recorded from the real handlers
// in the webapp contract harness (webapp/tests/unit/contract/np024Nutrition.test.ts)
// and trimmed of nothing. They live in their own module so the fast client
// suite (tests/schemas.test.ts) and the eyes of a reviewer see the SAME bytes
// the web answered with.
//
// A fixture that agrees with the schema by construction proves nothing on its
// own — that is exactly why the contract harness exists. These are here so the
// client's own suite fails fast when a schema is loosened or a key is renamed
// on the shared side, without needing a database.

export const MEAL_LOGS_DAY = {
  date: '2026-09-28',
  logs: [
    {
      _id: '6ab0240000000000000f8001',
      user: '6ab0240000000000000f7ee0',
      loggedAt: '2026-09-28T12:30:00.000Z',
      untimed: false,
      items: [
        {
          _id: '6ab0240000000000000f8101',
          foodId: '6ab0240000000000000f7f01',
          variantId: '6ab0240000000000000f7f11',
          variantName: 'Bar',
          name: 'NP024 Protein Bar',
          brand: 'NP024 Foods',
          servingSize: 1,
          servingUnit: 'each',
          servings: 2,
          nutrition: {
            calories: 210,
            protein: 20,
            carbs: 24,
            fats: 7,
            fiber: 9,
            sugar: 1,
            sodium: 0.19,
            saturatedFat: 2.5,
          },
          servingLabel: '1 bar (60 g)',
          loggedQuantity: 120,
          loggedUnit: 'g',
          loggedGramsPerServing: 60,
        },
      ],
      mealName: 'Post-gym',
      source: 'search',
      tags: ['lunch', 'post-workout'],
      notes: 'two bars',
      totalNutrition: {
        calories: 420,
        protein: 40,
        carbs: 48,
        fats: 14,
        fiber: 18,
        sugar: 2,
        sodium: 0.38,
        saturatedFat: 5,
      },
      createdAt: '2026-09-28T12:30:00.000Z',
      updatedAt: '2026-09-28T12:30:00.000Z',
      __v: 0,
    },
    {
      // An UNTIMED log with a custom tag — neither is expressible in the
      // legacy day shape, which is the whole reason this route is canonical.
      _id: '6ab0240000000000000f8002',
      user: '6ab0240000000000000f7ee0',
      loggedAt: '2026-09-28T00:00:00.000Z',
      untimed: true,
      items: [
        {
          _id: '6ab0240000000000000f8102',
          name: 'NP024 Handful of almonds',
          servingSize: 28,
          servingUnit: 'g',
          servings: 1,
          nutrition: { calories: 164, protein: 6, carbs: 6, fats: 14 },
        },
      ],
      tags: ['before work'],
      totalNutrition: {
        calories: 164,
        protein: 6,
        carbs: 6,
        fats: 14,
        fiber: 0,
        sugar: 0,
        sodium: 0,
        saturatedFat: 0,
      },
      createdAt: '2026-09-28T00:00:00.000Z',
      updatedAt: '2026-09-28T00:00:00.000Z',
      __v: 0,
    },
  ],
  dailyTotals: {
    calories: 584,
    protein: 46,
    carbs: 54,
    fats: 28,
    fiber: 18,
    sugar: 2,
    sodium: 0.38,
    saturatedFat: 5,
  },
} as const;

export const MEAL_LOGS_RANGE = {
  days: [
    {
      date: '2026-09-27',
      logs: [],
      dailyTotals: {
        calories: 0, protein: 0, carbs: 0, fats: 0,
        fiber: 0, sugar: 0, sodium: 0, saturatedFat: 0,
      },
    },
    {
      date: '2026-09-28',
      logs: MEAL_LOGS_DAY.logs,
      dailyTotals: MEAL_LOGS_DAY.dailyTotals,
    },
  ],
} as const;

export const MEAL_LOG_CREATE_REQUEST = {
  items: [
    { foodId: '6ab0240000000000000f7f01', servings: 2, loggedQuantity: 120, loggedUnit: 'g' },
  ],
  loggedAt: '2026-09-28T12:30:00.000Z',
  tags: ['lunch'],
  source: 'search',
  untimed: false,
} as const;

export const MEAL_LOG_CREATE = {
  success: true,
  log: MEAL_LOGS_DAY.logs[0],
  streak: { streakDays: 4, streakExtended: true, newMilestone: null },
} as const;

/** The default variant, flattened, with the whole variant list beside it. */
export const FOOD_ROW = {
  _id: '6ab0240000000000000f7f01',
  name: 'NP024 Protein Bar',
  slug: 'np024-protein-bar-np024-foods',
  brand: 'NP024 Foods',
  category: 'Snack',
  servingSize: 1,
  servingUnit: 'each',
  displayLabel: '1 bar (60 g)',
  alternateServings: [{ label: '100 g', multiplier: 1.6667 }],
  nutrition: {
    calories: 210, protein: 20, carbs: 24, fats: 7,
    fiber: 9, sugar: 1, sodium: 0.19, saturatedFat: 2.5,
  },
  gramsPerServing: 60,
  barcode: '0099999900001',
  imageUrl: 'https://cdn.become.test/np024/bar.jpg',
  isFirstClass: false,
  isVerified: true,
  usageCount: 3,
  source: 'manual',
  variants: [
    {
      _id: '6ab0240000000000000f7f11',
      name: 'Bar',
      isDefault: true,
      servingSize: 1,
      servingUnit: 'each',
      displayLabel: '1 bar (60 g)',
      alternateServings: [{ label: '100 g', multiplier: 1.6667 }],
      nutrition: {
        calories: 210, protein: 20, carbs: 24, fats: 7,
        fiber: 9, sugar: 1, sodium: 0.19, saturatedFat: 2.5,
      },
      gramsPerServing: 60,
    },
    {
      _id: '6ab0240000000000000f7f12',
      name: 'Half bar',
      isDefault: false,
      servingSize: 0.5,
      servingUnit: 'each',
      alternateServings: [],
      nutrition: { calories: 105, protein: 10, carbs: 12, fats: 3.5 },
      gramsPerServing: 30,
    },
  ],
  aliases: ['np024 bar'],
  createdBy: '6ab0240000000000000f7ee0',
  authoredBy: '6ab0240000000000000f7ee0',
  needsReview: false,
  groupKey: 'np024 protein bar',
  createdAt: '2026-09-20T10:00:00.000Z',
  updatedAt: '2026-09-28T12:30:00.000Z',
  __v: 0,
} as const;

/** A live USDA hit — synthetic `_id`, per-100 g basis because its serving IS 100. */
export const FOOD_ROW_USDA = {
  _id: 'usda-1750340',
  name: 'Bananas, raw',
  category: 'Fruit',
  servingSize: 100,
  servingUnit: 'g',
  displayLabel: '1 medium',
  alternateServings: [],
  nutrition: { calories: 89, protein: 1.1, carbs: 22.8, fats: 0.3, fiber: 2.6 },
  gramsPerServing: 118,
  source: 'usda',
  dataType: 'Foundation',
  isSaved: false,
} as const;

export const FOOD_SEARCH = {
  foods: [{ ...FOOD_ROW, isSaved: true, isBestMatch: true }, FOOD_ROW_USDA],
  total: 2,
  offset: 0,
  limit: 25,
} as const;

export const FOOD_DETAIL = { food: FOOD_ROW } as const;

export const FOOD_OVERVIEW = {
  foods: [{ ...FOOD_ROW, isSaved: true }],
  meals: [] as unknown[],
  recent: [FOOD_ROW],
  frequent: [{ ...FOOD_ROW, count: 3 }],
} as const;

export const FOODS_RECENT = {
  foods: [{ ...FOOD_ROW, lastLoggedAt: '2026-09-28T12:30:00.000Z' }],
} as const;

export const FOODS_FREQUENT = { foods: [{ ...FOOD_ROW, count: 3 }] } as const;

export const SAVED_FOODS = {
  foods: [{ ...FOOD_ROW, isSaved: true, savedAt: '2026-09-21T09:00:00.000Z' }],
} as const;

export const FOOD_BARCODE = { food: FOOD_ROW } as const;
export const FOOD_BARCODE_MISS = { food: null } as const;

/** A preview the server refused to persist: log it by value, not by `foodId`. */
export const FOOD_BARCODE_PREVIEW = {
  food: {
    _id: 'preview-off-0099999900002',
    name: 'NP024 Unpersistable Snack',
    category: 'Other',
    servingSize: 100,
    servingUnit: 'g',
    alternateServings: [],
    nutrition: { calories: 500, protein: 5, carbs: 60, fats: 25 },
    barcode: '0099999900002',
    source: 'openfoodfacts',
    image_url: 'https://images.openfoodfacts.org/np024.jpg',
    nutriscore_grade: 'e',
    persistable: false,
  },
} as const;

export const FOOD_IMPORT_REQUEST = {
  source: 'manual',
  data: {
    name: 'NP024 Imported Bar',
    category: 'Snack',
    servingSize: 1,
    servingUnit: 'each',
    gramsPerServing: 55,
    nutrition: { calories: 200, protein: 18, carbs: 22, fats: 6 },
  },
} as const;

export const FOOD_IMPORT = { success: true, created: true, food: FOOD_ROW } as const;

export const MEAL_ROW = {
  _id: '6ab0240000000000000f7fa1',
  name: 'NP024 Chili Bowl',
  description: 'Batch cooked',
  items: MEAL_LOGS_DAY.logs[0].items,
  recipe: {
    instructions: ['Brown the beef', 'Simmer 40 min'],
    prepTimeMinutes: 10,
    cookTimeMinutes: 40,
    servings: 4,
    gramsPerServing: 350,
  },
  tags: ['dinner'],
  defaultTag: 'dinner',
  createdBy: '6ab0240000000000000f7ee0',
  isPublic: false,
  isVerified: false,
  totalNutrition: {
    calories: 420, protein: 40, carbs: 48, fats: 14,
    fiber: 18, sugar: 2, sodium: 0.38, saturatedFat: 5,
  },
  usageCount: 1,
  createdAt: '2026-09-22T18:00:00.000Z',
  updatedAt: '2026-09-28T18:00:00.000Z',
  __v: 0,
} as const;

export const MEALS_LIST = { meals: [MEAL_ROW], total: 1, offset: 0, limit: 20 } as const;

/** Rule 3: `totalsPerServing`, never `nutrition`. */
export const RECIPE_ROW = {
  _id: '6ab0240000000000000f7fb1',
  name: 'NP024 Protein Oats',
  description: 'Quick breakfast',
  category: 'Breakfast',
  servings: 2,
  ingredients: [
    {
      foodId: '6ab0240000000000000f7f01',
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
  isPublic: true,
  createdBy: '6ab0240000000000000f7ee0',
  imageUrl: 'https://cdn.become.test/np024/oats.jpg',
  savedFoodId: '6ab0240000000000000f7f02',
  usageCount: 2,
  createdAt: '2026-09-20T07:00:00.000Z',
  updatedAt: '2026-09-28T07:00:00.000Z',
  __v: 0,
} as const;

export const RECIPES_LIST = { recipes: [RECIPE_ROW], total: 1, offset: 0, limit: 20 } as const;

export const TAGS = {
  defaults: ['breakfast', 'lunch', 'dinner', 'snack', 'pre-workout', 'post-workout'],
  userTags: ['before work', 'dinner', 'lunch', 'post-workout'],
} as const;

export const NUTRITION_GOALS = {
  _id: '6ab0240000000000000f7fc1',
  userId: '6ab0240000000000000f7ee0',
  calories: 2400,
  protein: 180,
  carbs: 250,
  fats: 75,
  waterGoal: 120,
  goalType: 'gain',
  activityLevel: 'active',
  macroPreset: 'high_protein',
  calcVersion: 3,
  calcWeightKg: 84.2,
  createdAt: '2026-09-20T07:00:00.000Z',
  updatedAt: '2026-09-28T07:00:00.000Z',
  __v: 0,
} as const;

/** Nothing saved yet: the hardcoded defaults, flagged. */
export const NUTRITION_GOALS_DEFAULT = {
  calories: 2000,
  protein: 150,
  carbs: 200,
  fats: 65,
  waterGoal: 96,
  goalType: 'maintain',
  activityLevel: 'moderate',
  _isDefault: true,
} as const;

export const NUTRITION_GOALS_REQUEST = {
  calories: 2400,
  protein: 180,
  carbs: 250,
  fats: 75,
  waterGoal: 120,
  goalType: 'gain',
  activityLevel: 'active',
  macroPreset: 'high_protein',
} as const;

export const NUTRITION_GOALS_WRITE = { success: true, goals: NUTRITION_GOALS } as const;

export const MEAL_SCHEDULE = {
  windows: [
    { tag: 'breakfast', startMinutes: 360, endMinutes: 600 },
    { tag: 'lunch', startMinutes: 660, endMinutes: 900 },
    // Unscheduled, but stored so its POSITION is remembered.
    { tag: 'before work', startMinutes: null, endMinutes: null },
    // Wraps past midnight — legitimate, not bad data.
    { tag: 'bed', startMinutes: 1380, endMinutes: 120 },
  ],
} as const;

export const MEAL_SCHEDULE_WRITE_REQUEST = MEAL_SCHEDULE;

/** The legacy compat day: the only source of water, quick adds and goals. */
export const NUTRITION_LOG_DAY = {
  userId: '6ab0240000000000000f7ee0',
  date: '2026-09-28T00:00:00.000Z',
  meals: [
    {
      id: '6ab0240000000000000f8001',
      mealType: 'lunch',
      foods: [
        {
          id: '6ab0240000000000000f8101',
          foodId: '6ab0240000000000000f7f01',
          variantId: '6ab0240000000000000f7f11',
          variantName: 'Bar',
          name: 'NP024 Protein Bar',
          brand: 'NP024 Foods',
          servingSize: 1,
          servingUnit: 'each',
          servings: 2,
          nutrition: { calories: 210, protein: 20, carbs: 24, fats: 7, fiber: 9, sugar: 1, sodium: 0.19 },
          loggedQuantity: 120,
          loggedUnit: 'g',
          loggedGramsPerServing: 60,
        },
      ],
      loggedAt: '2026-09-28T12:30:00.000Z',
    },
    {
      // Everything untimed / custom-tagged collapses into "snack" here.
      id: '6ab0240000000000000f8002',
      mealType: 'snack',
      foods: [
        {
          id: '6ab0240000000000000f8102',
          name: 'NP024 Handful of almonds',
          servingSize: 28,
          servingUnit: 'g',
          servings: 1,
          nutrition: { calories: 164, protein: 6, carbs: 6, fats: 14, fiber: 0, sugar: 0, sodium: 0 },
        },
      ],
      loggedAt: '2026-09-28T00:00:00.000Z',
    },
  ],
  water: { current: 64, goal: 120 },
  quickAdds: [
    {
      id: 'qa-np024-1',
      calories: 150,
      protein: 0,
      carbs: 38,
      fats: 0,
      note: 'orange juice',
      loggedAt: '2026-09-28T15:00:00.000Z',
    },
  ],
  // Quick adds INCLUDED — unlike GET /api/meal-logs.
  dailyTotals: { calories: 734, protein: 46, carbs: 92, fats: 28, fiber: 18, sugar: 2, sodium: 0.38 },
  goals: NUTRITION_GOALS,
} as const;

export const NUTRITION_SUMMARY_WEEK = {
  period: 'week',
  startDate: '2026-09-22',
  endDate: '2026-09-28',
  days: [
    { date: '2026-09-22', calories: 0, protein: 0, carbs: 0, fats: 0, fiber: 0, sugar: 0, sodium: 0, water: 0, mealCount: 0, hasData: false },
    { date: '2026-09-23', calories: 0, protein: 0, carbs: 0, fats: 0, fiber: 0, sugar: 0, sodium: 0, water: 0, mealCount: 0, hasData: false },
    { date: '2026-09-24', calories: 0, protein: 0, carbs: 0, fats: 0, fiber: 0, sugar: 0, sodium: 0, water: 0, mealCount: 0, hasData: false },
    { date: '2026-09-25', calories: 0, protein: 0, carbs: 0, fats: 0, fiber: 0, sugar: 0, sodium: 0, water: 0, mealCount: 0, hasData: false },
    { date: '2026-09-26', calories: 0, protein: 0, carbs: 0, fats: 0, fiber: 0, sugar: 0, sodium: 0, water: 0, mealCount: 0, hasData: false },
    { date: '2026-09-27', calories: 0, protein: 0, carbs: 0, fats: 0, fiber: 0, sugar: 0, sodium: 0, water: 0, mealCount: 0, hasData: false },
    { date: '2026-09-28', calories: 734, protein: 46, carbs: 92, fats: 28, fiber: 18, sugar: 2, sodium: 0.38, water: 64, mealCount: 2, hasData: true },
  ],
  averages: {
    calories: 734, protein: 46, carbs: 92, fats: 28, fiber: 18, water: 64,
    daysTracked: 1, totalDays: 7,
  },
} as const;

// ---------------------------------------------------------------------------
// ESTIMATE HISTORY (NP-141) — saved AI scans.
// ---------------------------------------------------------------------------
//
// Recorded from the real handlers (`GET /api/nutrition/scans` answers
// `{ scans, total, offset, limit }` with PlateScan documents recent-first;
// `GET /api/nutrition/scans/{id}` answers `{ scan }`). The photo scan keeps
// both the inline `thumb` and the blob `imageUrl`; the describe scan keeps
// neither. Items mirror the loggable shape so "Log again" is a repost.

export const NUTRITION_SCAN_PHOTO = {
  _id: '6ab1410000000000000f9001',
  source: 'photo',
  note: 'lunch bowl',
  tag: 'lunch',
  thumb: 'data:image/jpeg;base64,/9j/np141thumb',
  imageUrl: '/api/blob/scans/np141photo',
  items: [
    {
      _id: '6ab1410000000000000f9101',
      foodId: '6ab0240000000000000f7f01',
      name: 'NP141 Chicken bowl',
      brand: 'NP141 Foods',
      estimatedServing: '1 bowl',
      servingSize: 1,
      servingUnit: 'bowl',
      servings: 2,
      nutrition: { calories: 250, protein: 20, carbs: 20, fats: 8 },
      confidence: 0.9,
      matchKind: 'food',
    },
    {
      _id: '6ab1410000000000000f9102',
      name: 'NP141 Rice',
      servingSize: 1,
      servingUnit: 'cup',
      servings: 1,
      nutrition: { calories: 200, protein: 4, carbs: 44, fats: 0 },
    },
  ],
  totalNutrition: { calories: 700, protein: 44, carbs: 84, fats: 16 },
  loggedAt: '2026-09-28T12:00:00.000Z',
  mealLogId: '6ab0240000000000000f8001',
  createdAt: '2026-09-28T12:05:00.000Z',
  updatedAt: '2026-09-28T12:05:00.000Z',
  __v: 0,
} as const;

export const NUTRITION_SCAN_DESCRIBE = {
  _id: '6ab1410000000000000f9002',
  source: 'describe',
  note: 'chicken burrito bowl with rice',
  tag: 'dinner',
  items: [
    {
      name: 'NP141 Burrito bowl',
      servingSize: 1,
      servingUnit: 'bowl',
      servings: 1,
      nutrition: { calories: 650, protein: 35, carbs: 70, fats: 20 },
    },
  ],
  totalNutrition: { calories: 650, protein: 35, carbs: 70, fats: 20 },
  createdAt: '2026-09-27T19:00:00.000Z',
  updatedAt: '2026-09-27T19:00:00.000Z',
} as const;

export const NUTRITION_SCANS_LIST = {
  scans: [NUTRITION_SCAN_PHOTO, NUTRITION_SCAN_DESCRIBE],
  total: 2,
  offset: 0,
  limit: 60,
} as const;

export const NUTRITION_SCAN_DETAIL = { scan: NUTRITION_SCAN_PHOTO } as const;
