import mongoose, { Schema, Types } from 'mongoose'

// ---------------------------------------------------------------------------
// Meal — a saveable, reusable, shareable user-facing template.
//
// A Meal is what a user can name, tag, and reuse. Recipes are conceptually a
// Meal with `recipe.instructions` populated. MealLog (separate model) captures
// the actual eating event.
// ---------------------------------------------------------------------------

export interface IMealNutrition {
  calories: number
  protein: number
  carbs: number
  fats: number
  fiber?: number
  sugar?: number
  sodium?: number
  saturatedFat?: number
}

export interface IMealItem {
  _id?: Types.ObjectId
  foodId?: Types.ObjectId
  variantId?: Types.ObjectId
  variantName?: string
  // Snapshot fields for display — kept stable even if the underlying Food gets
  // modified or deleted.
  name: string
  brand?: string
  servingSize: number
  servingUnit: string
  servings: number
  nutrition: IMealNutrition
}

export interface IMealRecipe {
  instructions: string[]
  prepTimeMinutes?: number
  cookTimeMinutes?: number
  servings: number
}

export interface IMeal {
  _id?: Types.ObjectId
  name: string
  description?: string
  imageUrl?: string

  items: IMealItem[]

  recipe?: IMealRecipe
  tags: string[]

  createdBy?: Types.ObjectId
  isPublic: boolean
  isVerified: boolean

  totalNutrition: IMealNutrition

  usageCount: number

  createdAt?: Date
  updatedAt?: Date
}

// ---------------------------------------------------------------------------
// Schemas
// ---------------------------------------------------------------------------

const MealNutritionSchema = new Schema<IMealNutrition>({
  calories: { type: Number, required: true, default: 0 },
  protein: { type: Number, required: true, default: 0 },
  carbs: { type: Number, required: true, default: 0 },
  fats: { type: Number, required: true, default: 0 },
  fiber: { type: Number },
  sugar: { type: Number },
  sodium: { type: Number },
  saturatedFat: { type: Number },
}, { _id: false })

const MealItemSchema = new Schema<IMealItem>({
  foodId: { type: Schema.Types.ObjectId, ref: 'Food' },
  variantId: { type: Schema.Types.ObjectId },
  variantName: { type: String },
  name: { type: String, required: true },
  brand: { type: String },
  servingSize: { type: Number, required: true },
  servingUnit: { type: String, required: true },
  servings: { type: Number, required: true, default: 1 },
  nutrition: { type: MealNutritionSchema, required: true },
}, { _id: true })

const MealRecipeSchema = new Schema<IMealRecipe>({
  instructions: { type: [String], default: [] },
  prepTimeMinutes: { type: Number },
  cookTimeMinutes: { type: Number },
  servings: { type: Number, default: 1 },
}, { _id: false })

const MealSchema = new Schema<IMeal>({
  name: { type: String, required: true },
  description: { type: String },
  imageUrl: { type: String },

  items: { type: [MealItemSchema], default: [] },

  recipe: { type: MealRecipeSchema },
  tags: { type: [String], default: [] },

  createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
  isPublic: { type: Boolean, default: false },
  isVerified: { type: Boolean, default: false },

  totalNutrition: { type: MealNutritionSchema, default: () => ({
    calories: 0, protein: 0, carbs: 0, fats: 0,
  }) },

  usageCount: { type: Number, default: 0 },
}, {
  timestamps: true,
})

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

export function computeTotalNutrition(items: IMealItem[]): IMealNutrition {
  const totals: IMealNutrition = {
    calories: 0,
    protein: 0,
    carbs: 0,
    fats: 0,
    fiber: 0,
    sugar: 0,
    sodium: 0,
    saturatedFat: 0,
  }
  for (const item of items) {
    const s = item.servings ?? 1
    const n = item.nutrition
    totals.calories += (n.calories ?? 0) * s
    totals.protein  += (n.protein  ?? 0) * s
    totals.carbs    += (n.carbs    ?? 0) * s
    totals.fats     += (n.fats     ?? 0) * s
    totals.fiber!        += (n.fiber        ?? 0) * s
    totals.sugar!        += (n.sugar        ?? 0) * s
    totals.sodium!       += (n.sodium       ?? 0) * s
    totals.saturatedFat! += (n.saturatedFat ?? 0) * s
  }
  // Round to 1 decimal place to keep responses tidy.
  totals.calories = Math.round(totals.calories * 10) / 10
  totals.protein  = Math.round(totals.protein  * 10) / 10
  totals.carbs    = Math.round(totals.carbs    * 10) / 10
  totals.fats     = Math.round(totals.fats     * 10) / 10
  totals.fiber        = Math.round((totals.fiber!        ) * 10) / 10
  totals.sugar        = Math.round((totals.sugar!        ) * 10) / 10
  totals.sodium       = Math.round((totals.sodium!       ) * 1000) / 1000
  totals.saturatedFat = Math.round((totals.saturatedFat! ) * 10) / 10
  return totals
}

// ---------------------------------------------------------------------------
// Hooks
// ---------------------------------------------------------------------------

MealSchema.pre('save', async function () {
  this.totalNutrition = computeTotalNutrition(this.items as IMealItem[])
})

// ---------------------------------------------------------------------------
// Indexes
// ---------------------------------------------------------------------------

MealSchema.index({ name: 'text', tags: 'text' })
MealSchema.index({ createdBy: 1, updatedAt: -1 })
MealSchema.index({ isPublic: 1, isVerified: 1, usageCount: -1 })
MealSchema.index({ tags: 1 })

export default mongoose.models.Meal || mongoose.model<IMeal>('Meal', MealSchema)
