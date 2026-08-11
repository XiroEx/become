import mongoose, { Schema, Types } from 'mongoose'

// ---------------------------------------------------------------------------
// Food — replaces FoodItem.
//
// Our DB is the primary food source. USDA + OpenFoodFacts are seed/backup
// sources: when a user picks an external food it gets imported into this
// collection. A single Food document can have multiple variants representing
// different prep states (raw / cooked / scrambled, etc).
// ---------------------------------------------------------------------------

export type FoodCategory =
  | 'Protein'
  | 'Grain'
  | 'Fruit'
  | 'Vegetable'
  | 'Dairy'
  | 'Fat'
  | 'Beverage'
  | 'Condiment'
  | 'Snack'
  | 'Other'

export type ServingUnit =
  | 'g'
  | 'oz'
  | 'cup'
  | 'each'
  | 'ml'
  | 'tbsp'
  | 'tsp'
  | 'slice'
  | 'scoop'
  | 'serving'

export type FoodSource = 'usda' | 'openfoodfacts' | 'manual'

export interface IFoodNutrition {
  calories: number
  protein: number
  carbs: number
  fats: number
  fiber?: number
  sugar?: number
  sodium?: number
  saturatedFat?: number
}

export interface IAlternateServing {
  label: string
  multiplier: number
}

export interface IFoodVariant {
  _id?: Types.ObjectId
  name: string
  isDefault: boolean
  servingSize: number
  servingUnit: ServingUnit
  /**
   * Optional human-friendly label for the default serving (e.g. "1 cup",
   * "1 medium banana"). The picker uses this in place of "240 g" / "118 g".
   * Pulled from USDA householdServingFullText or OpenFoodFacts serving_size.
   * The math always uses servingSize+servingUnit; displayLabel is presentation-only.
   */
  displayLabel?: string
  alternateServings: IAlternateServing[]
  nutrition: IFoodNutrition

  /**
   * Cross-domain bridge — grams in one canonical serving (servingSize × servingUnit).
   * Optional. Stored canonical; input UIs may accept any mass unit (oz, lb, g)
   * and convert via `parseQuantityString` before persisting.
   *
   * Populated from:
   *   - USDA: parsed from householdServingFullText when it includes a gram value
   *   - OpenFoodFacts: parsed from serving_size text
   *   - Manual / recipe-sourced: optional; recipe save-as-food sets it from totals
   *
   * Don't compute this from servingSize when servingUnit is each/slice/scoop/serving —
   * we don't actually know the gram weight in those cases.
   */
  gramsPerServing?: number

  /**
   * Cross-domain bridge — millilitres in one canonical serving. Optional.
   * Input UIs may accept any volume unit (fl oz, cup, tbsp, tsp, ml).
   */
  mlPerServing?: number

  /**
   * When merged into a multi-variant Food, this variant's source-specific
   * external id (e.g. USDA fdcId). The top-level `externalId` is preserved as
   * the *primary* variant's id; alternates carry their own here so re-imports
   * hit the right upstream record and idempotency holds across merges.
   */
  externalId?: string

  /**
   * Mirrors the parent's `externalDataType` — set on each merged variant so
   * we can tell which USDA dataset (Foundation / SR Legacy / Survey) each one
   * came from after merging. Useful in admin UI for transparency.
   */
  externalDataType?: string
}

export interface IFood {
  _id?: Types.ObjectId
  name: string
  slug: string
  brand?: string
  category: FoodCategory

  variants: IFoodVariant[]
  aliases: string[]

  source: FoodSource
  externalId?: string
  externalDataType?: string

  isFirstClass: boolean
  isVerified: boolean

  /**
   * Verification pipeline state. Supersedes the bare `isVerified` boolean,
   * which recorded THAT something was trusted but never why, by whom, against
   * what evidence, or when it should be rechecked.
   *
   * `claimedAt` is the concurrency guard: two users flagging the same food at
   * once must produce one run, not two. It carries a TTL rather than being a
   * permanent lock, because runs die mid-flight and a permanent lock would
   * wedge a food as unverifiable forever. See lib/nutrition/flagPolicy.ts.
   */
  verification?: {
    state: 'unverified' | 'queued' | 'running' | 'verified' | 'insufficient'
    /** How strong the verification is, not merely whether it happened. */
    tier?: 'self-consistent' | 'corroborated' | 'label-verified'
    evidence?: Array<{
      url?: string
      source?: string
      extractedValues?: Record<string, number | string>
      model?: string
      at?: Date
    }>
    runId?: string
    claimedAt?: Date
    verifiedAt?: Date
    /** Branded products get reformulated; a verification is not forever. */
    expiresAt?: Date
    /** A flag arrived mid-run — re-run ONCE on completion, never a loop. */
    recheckRequested?: boolean
    /** Distinct users who have flagged this. Corroboration, not a spam count. */
    flagCount?: number
    lastOutcome?: string
  }

  barcode?: string
  imageUrl?: string

  usageCount: number
  createdBy?: Types.ObjectId

  /** When this Food was minted from a Recipe (recipe → "save as food"), the
   *  source recipe id — so the Food links back to the recipe it came from. */
  recipeId?: Types.ObjectId

  /**
   * When true, this Food has been auto-flagged (or admin-flagged) for review
   * — typically because nutrition values are suspect, the slug had to be
   * collision-suffixed past -2, or the food has no usable nutrition. Surfaced
   * in the admin Foods section. See `lib/foodReview.ts` for the auto-flag
   * rules.
   */
  needsReview?: boolean

  /**
   * Hard-hidden from all user-facing search. Set only on entries whose source
   * nutrition is physically impossible AND unrecoverable (e.g. an OFF per-100 of
   * 18000 cal with no valid kJ fallback) — hiding prevents a serving change from
   * exposing the garbage value. Distinct from `needsReview` (a broad admin queue
   * flag on thousands of otherwise-usable foods). The search route excludes these.
   */
  hiddenFromSearch?: boolean

  /**
   * Coarse grouping key used by future variant-merging passes — e.g. "Tea,
   * hot, herbal" → "tea". Lets us cluster the same conceptual food (Eggs,
   * Chicken Breast, Tea) across prep variants without committing to a hard
   * canonical record yet. Populated at import time by `lib/foodGrouping.ts`.
   * Always lowercase, alphanumeric + spaces only.
   */
  groupKey?: string

  createdAt?: Date
  updatedAt?: Date
}

// ---------------------------------------------------------------------------
// Schemas
// ---------------------------------------------------------------------------

const NutritionSchema = new Schema<IFoodNutrition>({
  calories: { type: Number, required: true },
  protein: { type: Number, required: true },
  carbs: { type: Number, required: true },
  fats: { type: Number, required: true },
  fiber: { type: Number },
  sugar: { type: Number },
  sodium: { type: Number },
  saturatedFat: { type: Number },
}, { _id: false })

const AlternateServingSchema = new Schema<IAlternateServing>({
  label: { type: String, required: true },
  multiplier: { type: Number, required: true },
}, { _id: false })

const VariantSchema = new Schema<IFoodVariant>({
  name: { type: String, required: true },
  isDefault: { type: Boolean, default: false },
  servingSize: { type: Number, required: true },
  servingUnit: {
    type: String,
    required: true,
    enum: ['g', 'oz', 'cup', 'each', 'ml', 'tbsp', 'tsp', 'slice', 'scoop', 'serving'],
  },
  displayLabel: { type: String },
  alternateServings: { type: [AlternateServingSchema], default: [] },
  nutrition: { type: NutritionSchema, required: true },
  gramsPerServing: { type: Number },
  mlPerServing: { type: Number },
  externalId: { type: String },
  externalDataType: { type: String },
}, { _id: true })

const FoodSchema = new Schema<IFood>({
  name: { type: String, required: true },
  slug: { type: String, required: true },
  brand: { type: String },
  category: {
    type: String,
    required: true,
    enum: ['Protein', 'Grain', 'Fruit', 'Vegetable', 'Dairy', 'Fat', 'Beverage', 'Condiment', 'Snack', 'Other'],
  },

  variants: {
    type: [VariantSchema],
    required: true,
    validate: {
      validator: (arr: IFoodVariant[]) => Array.isArray(arr) && arr.length > 0,
      message: 'A food must have at least one variant',
    },
  },

  aliases: { type: [String], default: [] },

  source: { type: String, required: true, enum: ['usda', 'openfoodfacts', 'manual'] },
  externalId: { type: String },
  externalDataType: { type: String },

  isFirstClass: { type: Boolean, default: false },
  isVerified: { type: Boolean, default: false },
  verification: {
    state: {
      type: String,
      enum: ['unverified', 'queued', 'running', 'verified', 'insufficient'],
      default: 'unverified',
    },
    tier: { type: String, enum: ['self-consistent', 'corroborated', 'label-verified'] },
    evidence: [{
      url: { type: String },
      source: { type: String },
      extractedValues: { type: Schema.Types.Mixed },
      model: { type: String },
      at: { type: Date },
    }],
    runId: { type: String },
    claimedAt: { type: Date },
    verifiedAt: { type: Date },
    expiresAt: { type: Date },
    recheckRequested: { type: Boolean },
    flagCount: { type: Number },
    lastOutcome: { type: String },
  },

  barcode: { type: String },
  imageUrl: { type: String },

  usageCount: { type: Number, default: 0 },
  createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
  recipeId: { type: Schema.Types.ObjectId, ref: 'Recipe' },

  needsReview: { type: Boolean, default: false },
  hiddenFromSearch: { type: Boolean, default: false },
  groupKey: { type: String },
}, {
  timestamps: true,
})

// Ensure exactly one variant is marked default; if none, mark the first.
FoodSchema.pre('validate', function () {
  if (Array.isArray(this.variants) && this.variants.length > 0) {
    const defaults = this.variants.filter(v => v.isDefault)
    if (defaults.length === 0) {
      this.variants[0].isDefault = true
    } else if (defaults.length > 1) {
      // Keep only the first default
      let kept = false
      for (const v of this.variants) {
        if (v.isDefault) {
          if (kept) v.isDefault = false
          else kept = true
        }
      }
    }
  }
})

// ---------------------------------------------------------------------------
// Indexes
// ---------------------------------------------------------------------------

FoodSchema.index({ name: 'text', brand: 'text', aliases: 'text' })
FoodSchema.index({ slug: 1 }, { unique: true })
FoodSchema.index({ barcode: 1 }, { unique: true, sparse: true })
FoodSchema.index({ category: 1, isFirstClass: -1 })
FoodSchema.index({ source: 1, externalId: 1 }, { unique: true, sparse: true })
// Admin reviews: surface flagged foods quickly without a full collection scan.
FoodSchema.index({ needsReview: 1, updatedAt: -1 })
// Variant-merging passes filter by groupKey; sparse so manual foods
// without a groupKey don't bloat the index.
FoodSchema.index({ groupKey: 1 }, { sparse: true })
// Variant-level externalId: when merging USDA Foundation/SR Legacy variants
// into a single Food doc, each variant carries its own fdcId so re-imports
// can find the parent quickly. Sparse — only USDA-source variants populate it.
FoodSchema.index({ 'variants.externalId': 1, source: 1 }, { sparse: true })

export default mongoose.models.Food || mongoose.model<IFood>('Food', FoodSchema)
