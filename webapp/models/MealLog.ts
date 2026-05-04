import mongoose, { Schema, Types } from 'mongoose'
import { IMealItem, IMealNutrition, computeTotalNutrition } from './Meal'

// ---------------------------------------------------------------------------
// MealLog — a single logged eating event for a user. Independent of Meal
// templates (though may reference one via mealId for provenance).
// ---------------------------------------------------------------------------

export interface IMealLog {
  _id?: Types.ObjectId
  user: Types.ObjectId
  loggedAt: Date

  items: IMealItem[]

  // Provenance — was this logged from a saved Meal template?
  mealId?: Types.ObjectId
  mealName?: string

  tags: string[]
  notes?: string

  totalNutrition: IMealNutrition

  createdAt?: Date
  updatedAt?: Date
}

// ---------------------------------------------------------------------------
// Schemas
// ---------------------------------------------------------------------------

const MealLogNutritionSchema = new Schema<IMealNutrition>({
  calories: { type: Number, required: true, default: 0 },
  protein: { type: Number, required: true, default: 0 },
  carbs: { type: Number, required: true, default: 0 },
  fats: { type: Number, required: true, default: 0 },
  fiber: { type: Number },
  sugar: { type: Number },
  sodium: { type: Number },
  saturatedFat: { type: Number },
}, { _id: false })

const MealLogItemSchema = new Schema<IMealItem>({
  foodId: { type: Schema.Types.ObjectId, ref: 'Food' },
  variantId: { type: Schema.Types.ObjectId },
  variantName: { type: String },
  name: { type: String, required: true },
  brand: { type: String },
  servingSize: { type: Number, required: true },
  servingUnit: { type: String, required: true },
  servings: { type: Number, required: true, default: 1 },
  nutrition: { type: MealLogNutritionSchema, required: true },
}, { _id: true })

const MealLogSchema = new Schema<IMealLog>({
  user: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true,
  },
  loggedAt: { type: Date, required: true },

  items: { type: [MealLogItemSchema], default: [] },

  mealId: { type: Schema.Types.ObjectId, ref: 'Meal' },
  mealName: { type: String },

  tags: { type: [String], default: [] },
  notes: { type: String },

  totalNutrition: { type: MealLogNutritionSchema, default: () => ({
    calories: 0, protein: 0, carbs: 0, fats: 0,
  }) },
}, {
  timestamps: true,
})

// ---------------------------------------------------------------------------
// Hooks — recompute totalNutrition on save
// ---------------------------------------------------------------------------

MealLogSchema.pre('save', async function () {
  this.totalNutrition = computeTotalNutrition(this.items as IMealItem[])
})

// ---------------------------------------------------------------------------
// Indexes
// ---------------------------------------------------------------------------

MealLogSchema.index({ user: 1, loggedAt: -1 })
MealLogSchema.index({ user: 1, tags: 1 })
MealLogSchema.index({ mealId: 1 })

export default mongoose.models.MealLog || mongoose.model<IMealLog>('MealLog', MealLogSchema)
