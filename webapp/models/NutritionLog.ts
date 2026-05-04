import mongoose, { Schema, Types } from 'mongoose'

export interface IFoodEntry {
  id: string
  foodId?: Types.ObjectId | string
  variantId?: Types.ObjectId | string
  variantName?: string
  name: string
  brand?: string
  servingSize: number
  servingUnit: string
  servings: number
  nutrition: {
    calories: number
    protein: number
    carbs: number
    fats: number
    fiber?: number
    sugar?: number
    sodium?: number
  }
}

export interface IMeal {
  id: string
  mealType: 'breakfast' | 'lunch' | 'dinner' | 'snack'
  foods: IFoodEntry[]
  loggedAt: Date
}

export interface INutritionLog {
  _id?: Types.ObjectId
  userId: Types.ObjectId
  date: Date
  meals: IMeal[]
  water: {
    current: number
    goal: number
  }
  quickAdds: {
    id: string
    calories: number
    protein: number
    carbs: number
    fats: number
    note?: string
    loggedAt: Date
  }[]
  dailyTotals: {
    calories: number
    protein: number
    carbs: number
    fats: number
    fiber: number
    sugar: number
    sodium: number
  }
  createdAt?: Date
  updatedAt?: Date
  recalculateTotals(): void
}

const FoodEntryNutritionSchema = new Schema({
  calories: { type: Number, required: true },
  protein: { type: Number, required: true },
  carbs: { type: Number, required: true },
  fats: { type: Number, required: true },
  fiber: { type: Number },
  sugar: { type: Number },
  sodium: { type: Number }
}, { _id: false })

const FoodEntrySchema = new Schema<IFoodEntry>({
  id: { type: String, required: true },
  foodId: { type: Schema.Types.ObjectId, ref: 'Food' },
  variantId: { type: Schema.Types.ObjectId },
  variantName: { type: String },
  name: { type: String, required: true },
  brand: { type: String },
  servingSize: { type: Number, required: true },
  servingUnit: { type: String, required: true },
  servings: { type: Number, required: true },
  nutrition: { type: FoodEntryNutritionSchema, required: true }
}, { _id: false })

const MealSchema = new Schema<IMeal>({
  id: { type: String, required: true },
  mealType: { type: String, required: true, enum: ['breakfast', 'lunch', 'dinner', 'snack'] },
  foods: [FoodEntrySchema],
  loggedAt: { type: Date, required: true }
}, { _id: false })

const QuickAddSchema = new Schema({
  id: { type: String, required: true },
  calories: { type: Number, required: true },
  protein: { type: Number, required: true },
  carbs: { type: Number, required: true },
  fats: { type: Number, required: true },
  note: { type: String },
  loggedAt: { type: Date, required: true }
}, { _id: false })

const DailyTotalsSchema = new Schema({
  calories: { type: Number, default: 0 },
  protein: { type: Number, default: 0 },
  carbs: { type: Number, default: 0 },
  fats: { type: Number, default: 0 },
  fiber: { type: Number, default: 0 },
  sugar: { type: Number, default: 0 },
  sodium: { type: Number, default: 0 }
}, { _id: false })

const NutritionLogSchema = new Schema<INutritionLog>({
  userId: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  date: { type: Date, required: true },
  meals: { type: [MealSchema], default: [] },
  water: {
    current: { type: Number, default: 0 },
    goal: { type: Number, default: 96 }
  },
  quickAdds: { type: [QuickAddSchema], default: [] },
  dailyTotals: { type: DailyTotalsSchema, default: () => ({}) }
}, {
  timestamps: true
})

// Compound unique index on userId + date
NutritionLogSchema.index({ userId: 1, date: 1 }, { unique: true })

// Recalculate daily totals from meals and quick adds
NutritionLogSchema.methods.recalculateTotals = function () {
  const totals = {
    calories: 0,
    protein: 0,
    carbs: 0,
    fats: 0,
    fiber: 0,
    sugar: 0,
    sodium: 0
  }

  // Sum all foods from all meals
  for (const meal of this.meals) {
    for (const food of meal.foods) {
      totals.calories += food.nutrition.calories * food.servings
      totals.protein += food.nutrition.protein * food.servings
      totals.carbs += food.nutrition.carbs * food.servings
      totals.fats += food.nutrition.fats * food.servings
      totals.fiber += (food.nutrition.fiber || 0) * food.servings
      totals.sugar += (food.nutrition.sugar || 0) * food.servings
      totals.sodium += (food.nutrition.sodium || 0) * food.servings
    }
  }

  // Sum quick adds
  for (const qa of this.quickAdds) {
    totals.calories += qa.calories
    totals.protein += qa.protein
    totals.carbs += qa.carbs
    totals.fats += qa.fats
  }

  this.dailyTotals = totals
}

export default mongoose.models.NutritionLog || mongoose.model<INutritionLog>('NutritionLog', NutritionLogSchema)
