import mongoose, { Schema, Types } from 'mongoose'

// Binary storage for a Recipe's hero image. Same pattern as MealImage /
// ProgramImage — stored in a separate collection so lean recipe queries
// don't pull image bytes into RAM. One image per recipe.
export interface IRecipeImage {
  recipeId: Types.ObjectId
  contentType: string
  data: Buffer
  createdAt?: Date
  updatedAt?: Date
}

const RecipeImageSchema = new Schema<IRecipeImage>({
  recipeId: { type: Schema.Types.ObjectId, ref: 'Recipe', required: true },
  contentType: { type: String, required: true, default: 'image/jpeg' },
  data: { type: Buffer, required: true },
}, {
  timestamps: true,
})

RecipeImageSchema.index({ recipeId: 1 }, { unique: true })

export default mongoose.models.RecipeImage || mongoose.model<IRecipeImage>('RecipeImage', RecipeImageSchema)
