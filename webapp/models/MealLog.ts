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
  /** Logged for a DAY with no time — see the untimed field below. */
  untimed?: boolean

  items: IMealItem[]

  // Provenance — was this logged from a saved Meal template?
  mealId?: Types.ObjectId
  mealName?: string

  // How this entry was captured — lets the day view group a multi-food capture
  // (photo/barcode/upload/describe) under a source-colored card, even when it
  // wasn't saved as a Meal. undefined = ordinary manual/search add.
  source?: 'photo' | 'barcode' | 'upload' | 'describe' | 'search' | 'manual'

  tags: string[]
  notes?: string

  totalNutrition: IMealNutrition

  // Back-reference: the plan this log was promoted from. Optional; only set
  // when the log was created via /api/meal-plans/[id]/promote. Lets the UI
  // tag a log card "from plan" and lets DELETE on the log flip the plan
  // status from 'promoted' back to 'active' (see plan §9.1).
  fromPlanId?: Types.ObjectId

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
  servingLabel: { type: String },
  loggedQuantity: { type: Number },
  loggedUnit: { type: String },
  loggedGramsPerServing: { type: Number },
  loggedMlPerServing: { type: Number },
}, { _id: true })

const MealLogSchema = new Schema<IMealLog>({
  user: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true,
  },
  loggedAt: { type: Date, required: true },
  // Logged for a day with no time of its own.
  //
  // loggedAt is still populated (nothing downstream should have to cope with a
  // missing timestamp) but its CLOCK reading is not meaningful. The day view
  // places these by the tag's anchor instead. This exists because someone up
  // past midnight logging food for the day that just ended would otherwise have
  // every one of those entries sort to the very top of that day.
  untimed: { type: Boolean, default: false },

  items: { type: [MealLogItemSchema], default: [] },

  mealId: { type: Schema.Types.ObjectId, ref: 'Meal' },
  mealName: { type: String },

  source: { type: String, enum: ['photo', 'barcode', 'upload', 'describe', 'search', 'manual'] },

  tags: { type: [String], default: [] },
  notes: { type: String },

  totalNutrition: { type: MealLogNutritionSchema, default: () => ({
    calories: 0, protein: 0, carbs: 0, fats: 0,
  }) },

  fromPlanId: { type: Schema.Types.ObjectId, ref: 'MealPlan' },
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
