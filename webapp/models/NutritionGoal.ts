import mongoose, { Schema, Types } from 'mongoose'

export interface INutritionGoal {
  _id?: Types.ObjectId
  userId: Types.ObjectId
  calories: number
  protein: number
  carbs: number
  fats: number
  fiber?: number
  waterGoal: number
  goalType: 'lose' | 'maintain' | 'gain'
  activityLevel: 'sedentary' | 'light' | 'moderate' | 'active' | 'very_active'
  createdAt?: Date
  updatedAt?: Date
}

const NutritionGoalSchema = new Schema<INutritionGoal>({
  userId: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    unique: true
  },
  calories: { type: Number, default: 2000 },
  protein: { type: Number, default: 150 },
  carbs: { type: Number, default: 200 },
  fats: { type: Number, default: 65 },
  fiber: { type: Number },
  waterGoal: { type: Number, default: 96 },
  goalType: {
    type: String,
    enum: ['lose', 'maintain', 'gain'],
    default: 'maintain'
  },
  activityLevel: {
    type: String,
    enum: ['sedentary', 'light', 'moderate', 'active', 'very_active'],
    default: 'moderate'
  }
}, {
  timestamps: true
})

export default mongoose.models.NutritionGoal || mongoose.model<INutritionGoal>('NutritionGoal', NutritionGoalSchema)
