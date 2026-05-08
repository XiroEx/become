import mongoose, { Schema, Types } from 'mongoose'

export interface IRecipeIngredient {
  foodId?: Types.ObjectId
  variantId?: Types.ObjectId
  variantName?: string
  name: string
  amount: number
  unit: string
  nutrition: {
    calories: number
    protein: number
    carbs: number
    fats: number
  }
}

export interface IRecipe {
  _id?: Types.ObjectId
  name: string
  description?: string
  category: string
  servings: number
  ingredients: IRecipeIngredient[]
  instructions: string[]
  prepTime?: number
  cookTime?: number
  totalsPerServing: {
    calories: number
    protein: number
    carbs: number
    fats: number
    fiber?: number
  }
  /**
   * Optional explicit per-serving bridges for when the recipe is later turned
   * into a Food. The recipe creator UI captures these so the resulting Food
   * variant can use them in the picker (UNITS_AND_SERVINGS_PLAN §10.8).
   */
  gramsPerServing?: number
  mlPerServing?: number
  tags: string[]
  isPublic: boolean
  createdBy?: Types.ObjectId
  imageUrl?: string
  usageCount: number
  createdAt?: Date
  updatedAt?: Date
}

const IngredientNutritionSchema = new Schema({
  calories: { type: Number, required: true },
  protein: { type: Number, required: true },
  carbs: { type: Number, required: true },
  fats: { type: Number, required: true }
}, { _id: false })

const RecipeIngredientSchema = new Schema<IRecipeIngredient>({
  foodId: { type: Schema.Types.ObjectId, ref: 'Food' },
  variantId: { type: Schema.Types.ObjectId },
  variantName: { type: String },
  name: { type: String, required: true },
  amount: { type: Number, required: true },
  unit: { type: String, required: true },
  nutrition: { type: IngredientNutritionSchema, required: true }
}, { _id: false })

const TotalsPerServingSchema = new Schema({
  calories: { type: Number, required: true },
  protein: { type: Number, required: true },
  carbs: { type: Number, required: true },
  fats: { type: Number, required: true },
  fiber: { type: Number }
}, { _id: false })

const RecipeSchema = new Schema<IRecipe>({
  name: { type: String, required: true },
  description: { type: String },
  category: { type: String, required: true },
  servings: { type: Number, default: 1 },
  ingredients: { type: [RecipeIngredientSchema], default: [] },
  instructions: { type: [String], default: [] },
  prepTime: { type: Number },
  cookTime: { type: Number },
  totalsPerServing: { type: TotalsPerServingSchema, required: true },
  gramsPerServing: { type: Number },
  mlPerServing: { type: Number },
  tags: { type: [String], default: [] },
  isPublic: { type: Boolean, default: true },
  createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
  imageUrl: { type: String },
  usageCount: { type: Number, default: 0 }
}, {
  timestamps: true
})

// Indexes
RecipeSchema.index({ name: 'text' })
RecipeSchema.index({ createdBy: 1 })
RecipeSchema.index({ isPublic: 1 })
RecipeSchema.index({ tags: 1 })

export default mongoose.models.Recipe || mongoose.model<IRecipe>('Recipe', RecipeSchema)
