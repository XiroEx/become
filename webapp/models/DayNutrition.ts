import mongoose, { Schema, Types } from 'mongoose'
import type { IQuickAdd } from '@/lib/nutritionTypes'

// ---------------------------------------------------------------------------
// DayNutrition — the per-day, non-food nutrition state for a user.
//
// Food logging lives entirely in MealLog. The only day-level things that are
// NOT food items are:
//   - water  (intake vs goal)
//   - quickAdds (macros-only entries: "just add 300 cal", no specific food)
//
// This model replaces the old NutritionLog, which also carried a now-dead
// `meals[]` / `dailyTotals` mirror of the food log. We keep the original
// `nutritionlogs` collection name so existing rows are read in place — no data
// migration required; only the food-mirror fields are dropped.
// ---------------------------------------------------------------------------

export interface IDayNutrition {
  _id?: Types.ObjectId
  userId: Types.ObjectId
  date: Date
  water: {
    current: number
    goal: number
  }
  quickAdds: IQuickAdd[]
  createdAt?: Date
  updatedAt?: Date
}

const QuickAddSchema = new Schema<IQuickAdd>({
  id: { type: String, required: true },
  calories: { type: Number, required: true },
  protein: { type: Number, required: true },
  carbs: { type: Number, required: true },
  fats: { type: Number, required: true },
  note: { type: String },
  loggedAt: { type: Date, required: true },
}, { _id: false })

const DayNutritionSchema = new Schema<IDayNutrition>({
  userId: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  date: { type: Date, required: true },
  water: {
    current: { type: Number, default: 0 },
    goal: { type: Number, default: 96 },
  },
  quickAdds: { type: [QuickAddSchema], default: [] },
}, {
  timestamps: true,
  collection: 'nutritionlogs', // reuse existing collection — water/quickAdds rows stay in place
})

// One row per user per (UTC-midnight-of-local) day.
DayNutritionSchema.index({ userId: 1, date: 1 }, { unique: true })

export default mongoose.models.DayNutrition || mongoose.model<IDayNutrition>('DayNutrition', DayNutritionSchema)
