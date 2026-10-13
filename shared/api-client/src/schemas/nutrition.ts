import { z } from 'zod';

// ---------------------------------------------------------------------------
// NUTRITION — the wire contract for the v1 food log (NP-024).
//
// This file used to describe the May contract: the legacy `/api/nutrition/log`
// day as the only day shape, a Food with a bare `nutrition` block and no
// serving basis, and a Recipe with `nutrition` where the web has always stored
// `totalsPerServing`. Native therefore read every recipe's macros as 0 and
// could not see servings, variants, tags or untimed logs at all.
//
// FOUR RULES TRAVEL WITH THIS FILE. They are asserted by
// webapp/tests/unit/contract/np024Nutrition.test.ts against the real handlers
// and by shared/api-client/tests/schemas.test.ts against recorded fixtures.
//
//  1. NUTRITION IS PER SERVING OF THE DEFAULT VARIANT — never per 100 g.
//     `webapp/lib/foodMath.ts` scales a variant's stored block by
//     `quantity / servingSize` (with `gramsPerServing` / `mlPerServing` as the
//     cross-family bridge). An OpenFoodFacts import happens to be per 100 g
//     because its `servingSize` IS 100; a bar whose serving is "1 each (60 g)"
//     is not. Anything that assumes /100 logs a bar as 1/100th of itself.
//
//  2. FOOD `source` IS `usda` | `openfoodfacts` | `manual`. There is no `off`.
//     The three are the `Food.source` enum in webapp/models/Food.ts.
//
//  3. A RECIPE'S PER-SERVING MACROS LIVE IN `totalsPerServing`
//     (webapp/models/Recipe.ts). `nutrition` was never a Recipe field.
//     `RecipeNutritionSchema` survives as a deprecated ALIAS of the totals
//     shape — the KEY is gone, because reading it is how native got 0.
//
//  4. THE CANONICAL DAY IS `GET /api/meal-logs?date=&tz=` → `{ logs,
//     dailyTotals }`. The legacy `GET /api/nutrition/log` day is kept because
//     it is still the ONLY source of `water` and `quickAdds` (and the web
//     dashboard still reads its `dailyTotals`); its `meals[].foods[]` shape is
//     a compat projection of MealLog, not a second store.
//
// Every response schema is `.passthrough()` so a shipped store build survives
// a server that grew a field. That tolerance is exactly why the webapp
// contract harness also fails on any UNDECLARED key and on any key the native
// app reads that went missing — see webapp/tests/unit/contract/_contract.ts.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Shared value objects
// ---------------------------------------------------------------------------

/**
 * A macro block. `calories/protein/carbs/fats` (fats PLURAL) are always
 * present — every writer in the web defaults them to 0 — and the micro four
 * are optional because `lib/mealItems.ts#coerceNutrition` omits a null rather
 * than storing a 0 it did not measure.
 */
export const MealNutritionSchema = z
  .object({
    calories: z.number(),
    protein: z.number(),
    carbs: z.number(),
    fats: z.number(),
    fiber: z.number().optional(),
    sugar: z.number().optional(),
    sodium: z.number().optional(),
    saturatedFat: z.number().optional(),
  })
  .passthrough();

/** @deprecated Use {@link MealNutritionSchema}. Kept until the screens move. */
export const FoodNutritionSchema = MealNutritionSchema;

/**
 * The same block, tolerant of an explicit null.
 *
 * @deprecated The real routes never send null for a macro — a Food variant's
 * nutrition is `required` on the model and the external mappers coerce with
 * `?? 0`. Use {@link MealNutritionSchema}; this alias exists so the previous
 * `FlexNutritionSchema` import keeps compiling.
 */
export const FlexNutritionSchema = z
  .object({
    calories: z.number().nullable().optional(),
    protein: z.number().nullable().optional(),
    carbs: z.number().nullable().optional(),
    fats: z.number().nullable().optional(),
    fiber: z.number().nullable().optional(),
    sugar: z.number().nullable().optional(),
    sodium: z.number().nullable().optional(),
    saturatedFat: z.number().nullable().optional(),
  })
  .passthrough();

export type MealNutrition = z.infer<typeof MealNutritionSchema>;
export type FoodNutrition = z.infer<typeof MealNutritionSchema>;

// ---------------------------------------------------------------------------
// MealLog — the canonical logged eating event (webapp/models/MealLog.ts)
// ---------------------------------------------------------------------------

/**
 * One logged food inside a MealLog.
 *
 * `nutrition` is the PER-SERVING block and `servings` is how much was eaten,
 * so a row's contribution to the day is `nutrition × servings`
 * (`webapp/models/Meal.ts#computeTotalNutrition`). Reading the block alone
 * shows one serving of a three-serving entry.
 *
 * The `logged*` quartet is picker PROVENANCE, not maths: it is what the member
 * actually typed, so re-opening an entry restores their quantity and unit
 * instead of re-deriving it from `servings × servingSize`.
 */
export const MealItemSchema = z
  .object({
    /** The subdocument id — how a single item is addressed for edit/delete. */
    _id: z.string().optional(),
    /** The Food this was logged from, when there is one (a quick add has none). */
    foodId: z.string().optional(),
    variantId: z.string().optional(),
    variantName: z.string().optional(),
    name: z.string(),
    brand: z.string().optional(),
    /** Rule 1: the basis the `nutrition` block is per ONE of. */
    servingSize: z.number(),
    servingUnit: z.string(),
    servings: z.number(),
    nutrition: MealNutritionSchema,
    /** Friendly amount label ("1 medium", "6 bites"). Presentation only. */
    servingLabel: z.string().optional(),
    loggedQuantity: z.number().optional(),
    loggedUnit: z.string().optional(),
    loggedGramsPerServing: z.number().optional(),
    loggedMlPerServing: z.number().optional(),
  })
  .passthrough();

/**
 * How a log was captured. A plain string on purpose: a web that grows a
 * seventh capture kind must not make a shipped build drop the whole day.
 */
export const MEAL_LOG_SOURCES = [
  'photo',
  'barcode',
  'upload',
  'describe',
  'search',
  'manual',
] as const;

export const MealLogSchema = z
  .object({
    _id: z.string(),
    user: z.string(),
    /** An INSTANT (ISO). Meaningless as a clock reading when `untimed`. */
    loggedAt: z.string(),
    /**
     * Logged for a DAY with no time of its own. `loggedAt` is still populated
     * so nothing downstream copes with a missing timestamp, but the day view
     * places these by their tag's window instead — otherwise everything logged
     * after midnight for the day that just ended sorts to the very top.
     */
    untimed: z.boolean().optional(),
    items: z.array(MealItemSchema).default([]),
    /** Provenance: the saved Meal template this was logged from. */
    mealId: z.string().optional(),
    mealName: z.string().optional(),
    /** One of {@link MEAL_LOG_SOURCES}; absent for an ordinary manual add. */
    source: z.string().optional(),
    /** Meal-time tags ("breakfast", "pre-workout", …). Order is the member's. */
    tags: z.array(z.string()).default([]),
    notes: z.string().optional(),
    /** Already `nutrition × servings` summed over `items`. */
    totalNutrition: MealNutritionSchema,
    /** Set only when the log was promoted from a MealPlan. */
    fromPlanId: z.string().optional(),
    createdAt: z.string().optional(),
    updatedAt: z.string().optional(),
    __v: z.number().optional(),
  })
  .passthrough();

/** One day of the canonical log: `GET /api/meal-logs?date=YYYY-MM-DD&tz=`. */
export const MealLogsDayResponseSchema = z
  .object({
    /** Echo of the requested LOCAL day key, not a UTC instant. */
    date: z.string(),
    logs: z.array(MealLogSchema).default([]),
    dailyTotals: MealNutritionSchema,
  })
  .passthrough();

/** `GET /api/meal-logs?from=&to=&tz=` — one entry per day, zero-days included. */
export const MealLogsRangeResponseSchema = z
  .object({
    days: z
      .array(
        z
          .object({
            date: z.string(),
            logs: z.array(MealLogSchema).default([]),
            dailyTotals: MealNutritionSchema,
          })
          .passthrough(),
      )
      .default([]),
  })
  .passthrough();

/** The loose item payload `POST /api/meal-logs` accepts (lib/mealItems.ts). */
export const MealItemInputSchema = z
  .object({
    foodId: z.string().optional(),
    variantId: z.string().optional(),
    variantName: z.string().optional(),
    name: z.string().optional(),
    brand: z.string().optional(),
    servingSize: z.number().optional(),
    servingUnit: z.string().optional(),
    servings: z.number().optional(),
    nutrition: MealNutritionSchema.partial().optional(),
    servingLabel: z.string().optional(),
    loggedQuantity: z.number().optional(),
    loggedUnit: z.string().optional(),
    loggedGramsPerServing: z.number().optional(),
    loggedMlPerServing: z.number().optional(),
  })
  .passthrough();

/**
 * `POST /api/meal-logs`. `items` must be non-empty — the route 400s otherwise.
 * Anything not sent is resolved from the Food + variant server-side, so a
 * `{ foodId, servings }` item is a complete log.
 */
export const MealLogCreateRequestSchema = z
  .object({
    items: z.array(MealItemInputSchema).min(1),
    /** An INSTANT. Omitted means now. */
    loggedAt: z.string().optional(),
    untimed: z.boolean().optional(),
    mealId: z.string().optional(),
    mealName: z.string().optional(),
    source: z.string().optional(),
    tags: z.array(z.string()).optional(),
    notes: z.string().optional(),
  })
  .passthrough();

/** The streak side-effect every food log reports. */
export const MealLogStreakSchema = z
  .object({
    streakDays: z.number(),
    streakExtended: z.boolean(),
    /** The milestone just crossed, or null. */
    newMilestone: z.number().nullable(),
  })
  .passthrough();

export const MealLogCreateResponseSchema = z
  .object({
    success: z.boolean(),
    log: MealLogSchema,
    /** Absent when the streak write failed — never fatal to the log. */
    streak: MealLogStreakSchema.optional(),
  })
  .passthrough();

export type MealItem = z.infer<typeof MealItemSchema>;
export type MealLog = z.infer<typeof MealLogSchema>;
export type MealLogsDayResponse = z.infer<typeof MealLogsDayResponseSchema>;
export type MealLogsRangeResponse = z.infer<typeof MealLogsRangeResponseSchema>;
export type MealItemInput = z.infer<typeof MealItemInputSchema>;
export type MealLogCreateRequest = z.infer<typeof MealLogCreateRequestSchema>;
export type MealLogCreateResponse = z.infer<typeof MealLogCreateResponseSchema>;

// ---------------------------------------------------------------------------
// Food + FoodVariant (webapp/models/Food.ts, flattened by
// webapp/lib/foodImport.ts#flattenFoodForResponse)
// ---------------------------------------------------------------------------

/** Rule 2. Mirrors the `Food.source` enum exactly. */
export const FoodSourceSchema = z.enum(['usda', 'openfoodfacts', 'manual']);

/**
 * The serving units the model's enum allows. `servingUnit` itself stays a
 * plain string so a catalogue that grows a unit cannot make a shipped build
 * drop a whole food.
 */
export const FOOD_SERVING_UNITS = [
  'g',
  'oz',
  'cup',
  'each',
  'ml',
  'tbsp',
  'tsp',
  'slice',
  'scoop',
  'serving',
] as const;

/** A named multiple of the variant's serving ("100 g" at 1.0, "1 cup" at 0.5). */
export const AlternateServingSchema = z
  .object({
    label: z.string(),
    multiplier: z.number(),
  })
  .passthrough();

/**
 * One prep state of a food (raw / cooked / scrambled) with its own serving
 * basis and macros. Exactly one variant carries `isDefault`, and the flattened
 * top-level fields on {@link FoodSchema} mirror THAT variant.
 *
 * `gramsPerServing` / `mlPerServing` are the cross-domain BRIDGES: they are
 * what makes "how many grams is one bar" answerable at all, and they are the
 * only honest weight for a count-native serving (`each`, `slice`, `scoop`,
 * `serving`). Absent means unknown — never derive one from `servingSize`.
 */
export const FoodVariantSchema = z
  .object({
    _id: z.string().optional(),
    name: z.string(),
    isDefault: z.boolean().optional(),
    /** Rule 1: the amount whose nutrition IS the `nutrition` block below. */
    servingSize: z.number(),
    /** One of {@link FOOD_SERVING_UNITS}. */
    servingUnit: z.string(),
    /** Friendly label for one serving ("1 cup", "1 medium banana"). */
    displayLabel: z.string().optional(),
    alternateServings: z.array(AlternateServingSchema).default([]),
    nutrition: MealNutritionSchema,
    gramsPerServing: z.number().optional(),
    mlPerServing: z.number().optional(),
    /** This variant's own upstream id, so a re-import hits the right record. */
    externalId: z.string().optional(),
    externalDataType: z.string().optional(),
  })
  .passthrough();

/** Serialized `Food.reviewFlag`, minus the internal `updatedBy`. */
export const FoodReviewFlagSchema = z
  .object({
    owner: z.string(),
    issueCodes: z.array(z.string()).default([]),
    ruleVersion: z.string(),
    origin: z.string(),
    updatedAt: z.string(),
  })
  .passthrough();

/**
 * A food as every list and detail route sends it.
 *
 * The top level is the DEFAULT VARIANT flattened (`servingSize`,
 * `servingUnit`, `displayLabel`, `alternateServings`, `nutrition`,
 * `gramsPerServing`, `mlPerServing`) beside the document's own fields, with
 * `variants[]` carried whole for the picker. Take a variant WHOLE — never pair
 * one variant's nutrition with another's bridge.
 *
 * `_id` is not always an ObjectId. A live search hit that is not in our
 * catalogue yet is `usda-<fdcId>` or `off-<code>`; a barcode preview the
 * server refuses to persist is `preview-off-<code>` with `persistable: false`;
 * a log row whose Food is gone is `legacy-<name>`. Only an ObjectId may be
 * sent as a `foodId`, which is why `persistable` exists.
 */
export const FoodSchema = z
  .object({
    _id: z.string(),
    /** Some older callers echo `id` instead of `_id`. */
    id: z.string().optional(),
    name: z.string(),
    slug: z.string().optional(),
    brand: z.string().nullable().optional(),
    category: z.string().optional(),

    // --- the default variant, flattened -----------------------------------
    servingSize: z.number().optional(),
    servingUnit: z.string().optional(),
    displayLabel: z.string().optional(),
    alternateServings: z.array(AlternateServingSchema).default([]),
    nutrition: MealNutritionSchema.optional(),
    gramsPerServing: z.number().optional(),
    mlPerServing: z.number().optional(),

    // --- every variant, for the picker ------------------------------------
    variants: z.array(FoodVariantSchema).default([]),
    /** Search synonyms. On catalogue rows only; nothing on the device reads them. */
    aliases: z.array(z.string()).optional(),

    barcode: z.string().optional(),
    imageUrl: z.string().optional(),
    /** Admin-curated essential — outranks any mirrored upstream record. */
    isFirstClass: z.boolean().optional(),
    /** Curated and checked by us, not merely mirrored from USDA/OFF. */
    isVerified: z.boolean().optional(),
    usageCount: z.number().optional(),
    /** Rule 2. Absent only on a row synthesised from a log snapshot. */
    source: FoodSourceSchema.optional(),
    externalId: z.string().optional(),
    externalDataType: z.string().optional(),
    /** USDA dataset of a live search hit (Foundation / SR Legacy / Branded). */
    dataType: z.string().optional(),

    /**
     * Provenance, NOT ownership: it names whoever first caused the row to
     * exist, including a catalogue row materialised by their search. A client
     * that hides Edit/Delete behind `createdBy === me` shows them on rows the
     * server will 403. Ownership is `authoredBy`, or `createdBy` on a
     * `source: 'manual'` row (webapp/lib/nutrition/foodOwnership.ts).
     */
    createdBy: z.string().optional(),
    /** The member who DELIBERATELY authored this — the custom-foods quota key. */
    authoredBy: z.string().optional(),
    needsReview: z.boolean().optional(),
    reviewFlag: FoodReviewFlagSchema.optional(),
    groupKey: z.string().optional(),
    createdAt: z.string().optional(),
    updatedAt: z.string().optional(),
    __v: z.number().optional(),

    // --- per-surface additions --------------------------------------------
    /** Saved by this member (`GET /api/me/foods`, search, overview). */
    isSaved: z.boolean().optional(),
    /** When it was saved (`GET /api/me/foods`). */
    savedAt: z.string().optional(),
    /** When it was last logged (`GET /api/nutrition/foods/recent`). */
    lastLoggedAt: z.string().optional(),
    /** How often it was logged (`GET /api/nutrition/foods/frequent`). */
    count: z.number().optional(),
    /** Crowned top result of a confident search (page 0 only). */
    isBestMatch: z.boolean().optional(),
    /**
     * `false` on a barcode/live-OpenFoodFacts PREVIEW the server could not
     * persist. Its `_id` is not a Food id: log it by value, never by `foodId`.
     */
    persistable: z.boolean().optional(),
    /** OpenFoodFacts passthrough — snake_case upstream, kept verbatim. */
    image_url: z.string().optional(),
    nutriscore_grade: z.string().optional(),
  })
  .passthrough();

/** @deprecated Use {@link FoodSchema}. Kept until the screens move. */
export const FoodDetailFoodSchema = FoodSchema;
/** @deprecated Use {@link FoodSchema}. Kept until the screens move. */
export const FoodSearchItemSchema = FoodSchema;

/** `GET /api/nutrition/foods?q=` — our catalogue first, then USDA, then OFF. */
export const FoodSearchResponseSchema = z
  .object({
    foods: z.array(FoodSchema).default([]),
    total: z.number().optional(),
    offset: z.number().optional(),
    limit: z.number().optional(),
  })
  .passthrough();

/** `GET /api/nutrition/foods/[id]` — by ObjectId OR by slug. */
export const FoodDetailResponseSchema = z
  .object({
    food: FoodSchema,
  })
  .passthrough();

/** `GET /api/me/foods` — the member's saved foods, newest save first. */
export const SavedFoodsResponseSchema = z
  .object({
    foods: z.array(FoodSchema).default([]),
  })
  .passthrough();

/** `GET /api/nutrition/foods/recent` — distinct, last 14 days, newest first. */
export const RecentFoodsResponseSchema = SavedFoodsResponseSchema;

/** `GET /api/nutrition/foods/frequent` — most-logged first, with `count`. */
export const FrequentFoodsResponseSchema = SavedFoodsResponseSchema;

/**
 * `GET /api/nutrition/foods/barcode?code=` — one food or an explicit null.
 *
 * A miss is `{ food: null }` with a 200, because "nothing is keyed on this
 * barcode" is an answer, not an error.
 */
export const FoodBarcodeResponseSchema = z
  .object({
    food: FoodSchema.nullable(),
  })
  .passthrough();

/** `POST /api/nutrition/foods/import` — three body shapes, one response. */
export const FoodImportRequestSchema = z
  .object({
    source: FoodSourceSchema,
    /** Required for `usda` (the fdcId) and `openfoodfacts` (the code). */
    externalId: z.string().optional(),
    /** Required for `manual`. May also be sent flattened onto the body. */
    data: z.unknown().optional(),
  })
  .passthrough();

export const FoodImportResponseSchema = z
  .object({
    success: z.boolean(),
    /** false when the row already existed — the import is idempotent. */
    created: z.boolean(),
    food: FoodSchema,
  })
  .passthrough();

export type AlternateServing = z.infer<typeof AlternateServingSchema>;
export type FoodVariant = z.infer<typeof FoodVariantSchema>;
export type FoodSource = z.infer<typeof FoodSourceSchema>;
export type Food = z.infer<typeof FoodSchema>;
export type FoodSearchItem = z.infer<typeof FoodSchema>;
export type FoodDetailFood = z.infer<typeof FoodSchema>;
export type FoodSearchResponse = z.infer<typeof FoodSearchResponseSchema>;
export type FoodDetailResponse = z.infer<typeof FoodDetailResponseSchema>;
export type SavedFoodsResponse = z.infer<typeof SavedFoodsResponseSchema>;
export type FoodBarcodeResponse = z.infer<typeof FoodBarcodeResponseSchema>;
export type FoodImportRequest = z.infer<typeof FoodImportRequestSchema>;
export type FoodImportResponse = z.infer<typeof FoodImportResponseSchema>;

// ---------------------------------------------------------------------------
// Meal — a saveable, reusable template (webapp/models/Meal.ts)
// ---------------------------------------------------------------------------

/**
 * The recipe half of a Meal. A Meal with `recipe.instructions` populated IS a
 * recipe in the product sense — this is not the separate Recipe document.
 */
export const MealRecipeSchema = z
  .object({
    instructions: z.array(z.string()).default([]),
    prepTimeMinutes: z.number().optional(),
    cookTimeMinutes: z.number().optional(),
    servings: z.number().optional(),
    /** Per-serving bridges that win when the Meal is saved as a Food. */
    gramsPerServing: z.number().optional(),
    mlPerServing: z.number().optional(),
  })
  .passthrough();

export const MealSchema = z
  .object({
    _id: z.string(),
    name: z.string(),
    description: z.string().optional(),
    imageUrl: z.string().optional(),
    items: z.array(MealItemSchema).default([]),
    recipe: MealRecipeSchema.optional(),
    tags: z.array(z.string()).default([]),
    /** Pre-selected meal-time slot. The member may still log it to ANY tag. */
    defaultTag: z.string().optional(),
    createdBy: z.string().optional(),
    isPublic: z.boolean().optional(),
    isVerified: z.boolean().optional(),
    totalNutrition: MealNutritionSchema,
    usageCount: z.number().optional(),
    createdAt: z.string().optional(),
    updatedAt: z.string().optional(),
    __v: z.number().optional(),
  })
  .passthrough();

/** `GET /api/meals` — the member's own plus public/verified ones. */
export const MealsListResponseSchema = z
  .object({
    meals: z.array(MealSchema).default([]),
    total: z.number().optional(),
    offset: z.number().optional(),
    limit: z.number().optional(),
  })
  .passthrough();

export type MealRecipe = z.infer<typeof MealRecipeSchema>;
export type Meal = z.infer<typeof MealSchema>;
export type MealsListResponse = z.infer<typeof MealsListResponseSchema>;

// ---------------------------------------------------------------------------
// Recipe (webapp/models/Recipe.ts)
// ---------------------------------------------------------------------------

/** Rule 3: the per-serving totals. `fiber` is the only optional macro. */
export const RecipeTotalsSchema = z
  .object({
    calories: z.number(),
    protein: z.number(),
    carbs: z.number(),
    fats: z.number(),
    fiber: z.number().optional(),
  })
  .passthrough();

/** @deprecated Rule 3 — use {@link RecipeTotalsSchema}; the KEY is `totalsPerServing`. */
export const RecipeNutritionSchema = RecipeTotalsSchema;

/**
 * One ingredient. `nutrition` here is the contribution of `amount × unit` of
 * this ingredient to the WHOLE recipe, not a per-serving figure: the route
 * sums these and divides by `servings` to get `totalsPerServing`.
 */
export const RecipeIngredientSchema = z
  .object({
    foodId: z.string().optional(),
    variantId: z.string().optional(),
    variantName: z.string().optional(),
    name: z.string(),
    amount: z.number().optional(),
    unit: z.string().optional(),
    nutrition: z
      .object({
        calories: z.number(),
        protein: z.number(),
        carbs: z.number(),
        fats: z.number(),
      })
      .passthrough()
      .optional(),
  })
  .passthrough();

export const RecipeSchema = z
  .object({
    _id: z.string().optional(),
    id: z.string().optional(),
    name: z.string(),
    description: z.string().optional(),
    category: z.string().optional(),
    servings: z.number().optional(),
    ingredients: z.array(RecipeIngredientSchema).default([]),
    instructions: z.array(z.string()).default([]),
    prepTime: z.number().optional(),
    cookTime: z.number().optional(),
    /**
     * Rule 3. REQUIRED, because it is `required` on the model and because
     * reading a renamed/absent macro block as 0 is the bug this ticket exists
     * to close: a parse failure is loud, a silent 0 is not.
     */
    totalsPerServing: RecipeTotalsSchema,
    /** Per-serving bridges captured for a later "save as food". */
    gramsPerServing: z.number().optional(),
    mlPerServing: z.number().optional(),
    tags: z.array(z.string()).default([]),
    isPublic: z.boolean().optional(),
    createdBy: z.string().optional(),
    imageUrl: z.string().optional(),
    /**
     * The Food this recipe was saved as. When set, the recipe is logged by
     * logging that Food — a recipe is never logged directly. Drives the
     * "Save or Log" affordance.
     */
    savedFoodId: z.string().optional(),
    usageCount: z.number().optional(),
    createdAt: z.string().optional(),
    updatedAt: z.string().optional(),
    __v: z.number().optional(),
  })
  .passthrough();

/** `GET /api/nutrition/recipes` — public plus the member's own. */
export const RecipesListResponseSchema = z
  .object({
    recipes: z.array(RecipeSchema).default([]),
    total: z.number().optional(),
    offset: z.number().optional(),
    limit: z.number().optional(),
  })
  .passthrough();

/** `GET /api/nutrition/recipes/[id]` returns the recipe doc DIRECTLY. */
export const RecipeDetailResponseSchema = RecipeSchema;

export type RecipeTotals = z.infer<typeof RecipeTotalsSchema>;
export type RecipeNutrition = z.infer<typeof RecipeTotalsSchema>;
export type RecipeIngredient = z.infer<typeof RecipeIngredientSchema>;
export type Recipe = z.infer<typeof RecipeSchema>;
export type RecipesListResponse = z.infer<typeof RecipesListResponseSchema>;
export type RecipeDetailResponse = z.infer<typeof RecipeDetailResponseSchema>;

// ---------------------------------------------------------------------------
// Tags, goals, meal-time windows
// ---------------------------------------------------------------------------

/**
 * `GET /api/tags`. `defaults` is the app-wide list; `userTags` is derived from
 * the member's logs, saved meals AND their meal-time schedule — the schedule
 * is the only place a tag can exist before anything is logged under it.
 */
export const TagsResponseSchema = z
  .object({
    defaults: z.array(z.string()).default([]),
    userTags: z.array(z.string()).default([]),
  })
  .passthrough();

/**
 * A NutritionGoal row (webapp/models/NutritionGoal.ts).
 *
 * Everything is optional because this same shape is served three ways: the
 * stored document, the five-key hardcoded default the legacy day falls back
 * to, and the `_isDefault` body `GET /api/nutrition/goals` answers for a
 * member who has never saved any. `calories` and the macros always agree with
 * each other — the route reconciles them before writing.
 */
export const NutritionGoalsSchema = z
  .object({
    _id: z.string().optional(),
    userId: z.string().optional(),
    calories: z.number().optional(),
    protein: z.number().optional(),
    carbs: z.number().optional(),
    fats: z.number().optional(),
    fiber: z.number().optional(),
    /** Fluid ounces per day. */
    waterGoal: z.number().optional(),
    /** `lose` | `maintain` | `gain`. */
    goalType: z.string().optional(),
    /** `sedentary` | `light` | `moderate` | `active` | `very_active`. */
    activityLevel: z.string().optional(),
    /**
     * Which split produced these. `custom` means the member typed them, and
     * those are NEVER recomputed underneath them.
     */
    macroPreset: z.string().optional(),
    /** Version of the macro maths; a stale row is recomputed on read. */
    calcVersion: z.number().optional(),
    /** The rolling-average bodyweight (kg) the targets were computed from. */
    calcWeightKg: z.number().optional(),
    createdAt: z.string().optional(),
    updatedAt: z.string().optional(),
    __v: z.number().optional(),
  })
  .passthrough();

/**
 * `GET /api/nutrition/goals` answers the row DIRECTLY (not wrapped), and adds
 * `_isDefault: true` when nothing has been saved yet.
 */
export const NutritionGoalsResponseSchema = NutritionGoalsSchema.extend({
  _isDefault: z.boolean().optional(),
}).passthrough();

/**
 * `POST /api/nutrition/goals` — the body onboarding writes (NP-056).
 *
 * Partial on purpose: sending macros without calories (or the reverse) is
 * normal, and the route merges onto what is stored and then reconciles the two
 * halves so a row can never be left contradicting itself.
 */
export const NutritionGoalsRequestSchema = z
  .object({
    calories: z.number().optional(),
    protein: z.number().optional(),
    carbs: z.number().optional(),
    fats: z.number().optional(),
    fiber: z.number().optional(),
    waterGoal: z.number().optional(),
    goalType: z.string().optional(),
    activityLevel: z.string().optional(),
    macroPreset: z.string().optional(),
  })
  .passthrough();

export const NutritionGoalsWriteResponseSchema = z
  .object({
    success: z.boolean(),
    goals: NutritionGoalsSchema,
  })
  .passthrough();

/**
 * One meal-tag time window (webapp/models/MealTagSchedule.ts).
 *
 * `null` is a first-class value: an UNSCHEDULED tag still gets a row so its
 * POSITION is remembered, and array order IS the member's meal order — which
 * is what places an entry logged without a time. A window whose end is <= its
 * start wraps past midnight ("bed" 23:00–02:00 → 1380 / 120); that is
 * legitimate, not bad data.
 */
export const MealScheduleWindowSchema = z
  .object({
    tag: z.string(),
    /** Minutes from LOCAL midnight, 0-1439, or null when unscheduled. */
    startMinutes: z.number().nullable().optional(),
    endMinutes: z.number().nullable().optional(),
  })
  .passthrough();

/** `GET`/`PUT`/`POST /api/nutrition/meal-schedule` all answer this. */
export const MealScheduleResponseSchema = z
  .object({
    windows: z.array(MealScheduleWindowSchema).default([]),
  })
  .passthrough();

/** `PUT` replaces the WHOLE set — a missing window is a deletion. */
export const MealScheduleWriteRequestSchema = z
  .object({
    windows: z.array(MealScheduleWindowSchema),
  })
  .passthrough();

/** `POST` appends ONE tag, so screens that do not hold the whole list cannot race. */
export const MealScheduleAddTagRequestSchema = z
  .object({
    tag: z.string(),
  })
  .passthrough();

export type TagsResponse = z.infer<typeof TagsResponseSchema>;
export type NutritionGoals = z.infer<typeof NutritionGoalsSchema>;
export type NutritionGoalsResponse = z.infer<typeof NutritionGoalsResponseSchema>;
export type NutritionGoalsRequest = z.infer<typeof NutritionGoalsRequestSchema>;
export type NutritionGoalsWriteResponse = z.infer<typeof NutritionGoalsWriteResponseSchema>;
export type MealScheduleWindow = z.infer<typeof MealScheduleWindowSchema>;
export type MealScheduleResponse = z.infer<typeof MealScheduleResponseSchema>;
export type MealScheduleWriteRequest = z.infer<typeof MealScheduleWriteRequestSchema>;

// ---------------------------------------------------------------------------
// The four short lists behind an empty search box
// ---------------------------------------------------------------------------

/**
 * `GET /api/nutrition/foods/overview` — a five-row preview of each chip.
 *
 * EVERY food row is flattened, because the row renderer reads
 * `nutrition`/`servingSize` at the top level; a raw Food document there takes
 * the screen down. Rows are ordered by what was LOGGED most recently, and the
 * four sections are deduped against each other in display order, so a food
 * that is saved AND recent AND frequent appears once, in the first section it
 * qualifies for.
 */
export const FoodOverviewResponseSchema = z
  .object({
    foods: z.array(FoodSchema).default([]),
    meals: z.array(MealSchema).default([]),
    recent: z.array(FoodSchema).default([]),
    frequent: z.array(FoodSchema).default([]),
  })
  .passthrough();

export type FoodOverviewResponse = z.infer<typeof FoodOverviewResponseSchema>;

// ---------------------------------------------------------------------------
// The legacy day, and the trend the dashboard draws
// ---------------------------------------------------------------------------

/** A macros-only day entry with no food behind it ("just add 300 cal"). */
export const QuickAddSchema = z
  .object({
    id: z.string(),
    calories: z.number(),
    protein: z.number(),
    carbs: z.number(),
    fats: z.number(),
    note: z.string().optional(),
    loggedAt: z.string(),
  })
  .passthrough();

/** Water for the day, in fluid ounces. */
export const WaterIntakeSchema = z
  .object({
    current: z.number(),
    goal: z.number(),
  })
  .passthrough();

/**
 * One logged food in the LEGACY day projection. `id` is the MealLog ITEM's
 * `_id` — it is what `PUT`/`DELETE /api/nutrition/log` address.
 *
 * Only `name` and `nutrition` are required. The handler does send the id and the
 * serving basis on every row, and the webapp contract harness pins each of them
 * by name; this shape stays deliberately tolerant because it is the DEPRECATED
 * one that a shipped build reads until the screens move to
 * {@link MealLogsDayResponseSchema}, where the basis IS required.
 */
export const LegacyLogFoodSchema = z
  .object({
    id: z.string().optional(),
    foodId: z.string().optional(),
    variantId: z.string().optional(),
    variantName: z.string().optional(),
    name: z.string(),
    brand: z.string().optional(),
    servingSize: z.number().optional(),
    servingUnit: z.string().optional(),
    servings: z.number().optional(),
    nutrition: MealNutritionSchema,
    loggedQuantity: z.number().optional(),
    loggedUnit: z.string().optional(),
    loggedGramsPerServing: z.number().optional(),
    loggedMlPerServing: z.number().optional(),
  })
  .passthrough();

/**
 * One meal bucket of the legacy day. Every MealLog sharing a primary tag is
 * COLLAPSED into one of these, because the old UI assumed exactly one entry
 * per `mealType`. `id` is the first contributing MealLog's `_id`, so it does
 * not address the bucket — use the canonical `GET /api/meal-logs` when you
 * need real logs.
 */
export const LegacyLogMealSchema = z
  .object({
    id: z.string().optional(),
    /** `breakfast` | `lunch` | `dinner` | `snack`; anything else becomes snack. */
    mealType: z.string(),
    foods: z.array(LegacyLogFoodSchema).default([]),
    loggedAt: z.string().optional(),
  })
  .passthrough();

/**
 * `GET /api/nutrition/log?date=&tz=` — the legacy compat day.
 *
 * Rule 4: keep reading this for `water`, `quickAdds` and `goals`, which live
 * nowhere else, and for `dailyTotals` (which INCLUDE quick adds, unlike
 * `GET /api/meal-logs`). Read `meals` only until the screens move to
 * {@link MealLogsDayResponseSchema} — it cannot express an untimed log, a
 * custom tag, or more than one entry per meal.
 *
 * `date` here is the UTC MIDNIGHT instant of the local day key, not the key.
 */
export const NutritionLogDayResponseSchema = z
  .object({
    userId: z.string().optional(),
    date: z.string().optional(),
    meals: z.array(LegacyLogMealSchema).default([]),
    water: WaterIntakeSchema.optional(),
    quickAdds: z.array(QuickAddSchema).default([]),
    /** MealLog totals PLUS quick adds. Never stored — computed per request. */
    dailyTotals: MealNutritionSchema.optional(),
    goals: NutritionGoalsSchema.optional(),
  })
  .passthrough();

/** @deprecated Use {@link NutritionLogDayResponseSchema} (or, better, {@link MealLogsDayResponseSchema}). */
export const MealLogResponseSchema = NutritionLogDayResponseSchema;
/** @deprecated Use {@link LegacyLogFoodSchema}. */
export const MealLogFoodSchema = LegacyLogFoodSchema;
/** @deprecated Use {@link LegacyLogMealSchema}. */
export const MealLogMealSchema = LegacyLogMealSchema;

/** The write responses of the legacy day echo the whole day under `log`. */
export const NutritionLogWriteResponseSchema = z
  .object({
    success: z.boolean(),
    log: NutritionLogDayResponseSchema,
    streak: MealLogStreakSchema.optional(),
  })
  .passthrough();

/**
 * `GET /api/nutrition/summary?period=week|month&tz=` — the dashboard's trend.
 *
 * Totals are computed from MealLog plus quick adds on every request, never
 * from a stored mirror. Every day in the span is present, `hasData: false`
 * ones included, and `averages` divides by the days WITH data only.
 */
export const NutritionSummaryDaySchema = z
  .object({
    /** A LOCAL day key (YYYY-MM-DD). */
    date: z.string(),
    calories: z.number(),
    protein: z.number(),
    carbs: z.number(),
    fats: z.number(),
    fiber: z.number(),
    sugar: z.number(),
    sodium: z.number(),
    water: z.number(),
    /** Number of MealLogs, not of items. */
    mealCount: z.number(),
    hasData: z.boolean(),
  })
  .passthrough();

export const NutritionSummaryAveragesSchema = z
  .object({
    calories: z.number(),
    protein: z.number(),
    carbs: z.number(),
    fats: z.number(),
    fiber: z.number(),
    water: z.number(),
    daysTracked: z.number(),
    totalDays: z.number(),
  })
  .passthrough();

export const NutritionSummaryResponseSchema = z
  .object({
    period: z.string(),
    startDate: z.string(),
    endDate: z.string(),
    days: z.array(NutritionSummaryDaySchema).default([]),
    averages: NutritionSummaryAveragesSchema,
  })
  .passthrough();

export type QuickAdd = z.infer<typeof QuickAddSchema>;
export type WaterIntake = z.infer<typeof WaterIntakeSchema>;
export type LegacyLogFood = z.infer<typeof LegacyLogFoodSchema>;
export type LegacyLogMeal = z.infer<typeof LegacyLogMealSchema>;
export type NutritionLogDayResponse = z.infer<typeof NutritionLogDayResponseSchema>;
/** @deprecated Use {@link NutritionLogDayResponse}. */
export type MealLogResponse = z.infer<typeof NutritionLogDayResponseSchema>;
/** @deprecated Use {@link LegacyLogFood}. */
export type MealLogFood = z.infer<typeof LegacyLogFoodSchema>;
/** @deprecated Use {@link LegacyLogMeal}. */
export type MealLogMeal = z.infer<typeof LegacyLogMealSchema>;
export type NutritionLogWriteResponse = z.infer<typeof NutritionLogWriteResponseSchema>;
export type NutritionSummaryDay = z.infer<typeof NutritionSummaryDaySchema>;
export type NutritionSummaryResponse = z.infer<typeof NutritionSummaryResponseSchema>;

// ---------------------------------------------------------------------------
// Estimate history — saved AI scans (NP-141)
// ---------------------------------------------------------------------------
//
// The wire contract for `GET /api/nutrition/scans?limit=` (recent first),
// `GET /api/nutrition/scans/{id}` (re-open into the review), and
// `DELETE /api/nutrition/scans/{id}` (optimistic removal).
//
// Items mirror the loggable shape (name/brand/serving/nutrition + optional
// foodId for matched DB foods) so \"Log again\" is a straight repost through
// `POST /api/meal-logs` (`webapp/models/PlateScan.ts`).
// ---------------------------------------------------------------------------

/** One item inside a saved estimate. `nutrition` is PER-SERVING. */
export const NutritionScanItemSchema = z
  .object({
    _id: z.string().optional(),
    foodId: z.string().optional(),
    name: z.string(),
    brand: z.string().optional(),
    /** The AI's serving phrase (\"1 cup\", \"~150 g\") — display only. */
    estimatedServing: z.string().optional(),
    servingSize: z.number().optional(),
    servingUnit: z.string().optional(),
    servings: z.number().optional(),
    nutrition: MealNutritionSchema,
    confidence: z.number().optional(),
    /** Set when this item was reconciled to a DB entry. */
    matchKind: z.string().optional(),
  })
  .passthrough();

/**
 * A saved estimate. `source` is `photo` | `describe` on the wire (a library
 * upload is stored as `photo`); it stays a plain string so a server that
 * grows a kind cannot make a shipped build drop the whole list.
 */
export const NutritionScanSchema = z
  .object({
    _id: z.string(),
    source: z.string(),
    note: z.string().optional(),
    tag: z.string().optional(),
    /** Small inline data-URL thumbnail (photo scans only). */
    thumb: z.string().optional(),
    /** Full-res scan image in blob storage (`/api/blob/…`), via AuthedImage. */
    imageUrl: z.string().optional(),
    items: z.array(NutritionScanItemSchema).default([]),
    totalNutrition: MealNutritionSchema,
    loggedAt: z.string().optional(),
    mealLogId: z.string().optional(),
    createdAt: z.string().optional(),
    updatedAt: z.string().optional(),
    __v: z.number().optional(),
  })
  .passthrough();

/** `GET /api/nutrition/scans?limit=&offset=` — recent first. */
export const NutritionScansResponseSchema = z
  .object({
    scans: z.array(NutritionScanSchema).default([]),
    total: z.number().optional(),
    offset: z.number().optional(),
    limit: z.number().optional(),
  })
  .passthrough();

/** `GET /api/nutrition/scans/{id}` — one saved estimate for the review. */
export const NutritionScanResponseSchema = z
  .object({
    scan: NutritionScanSchema,
  })
  .passthrough();

export type NutritionScanItem = z.infer<typeof NutritionScanItemSchema>;
export type NutritionScan = z.infer<typeof NutritionScanSchema>;
export type NutritionScansResponse = z.infer<typeof NutritionScansResponseSchema>;
export type NutritionScanResponse = z.infer<typeof NutritionScanResponseSchema>;
