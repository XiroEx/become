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

  barcode?: string
  imageUrl?: string

  usageCount: number
  createdBy?: Types.ObjectId

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
    enum: ['g', 'oz', 'cup', 'each', 'ml', 'tbsp', 'tsp', 'slice', 'scoop'],
  },
  displayLabel: { type: String },
  alternateServings: { type: [AlternateServingSchema], default: [] },
  nutrition: { type: NutritionSchema, required: true },
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

  barcode: { type: String },
  imageUrl: { type: String },

  usageCount: { type: Number, default: 0 },
  createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
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

export default mongoose.models.Food || mongoose.model<IFood>('Food', FoodSchema)
