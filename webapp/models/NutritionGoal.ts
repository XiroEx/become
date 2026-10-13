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
  /**
   * Which split produced these numbers. 'custom' means the member typed them
   * by hand — those are never recomputed for them.
   */
  macroPreset?: 'recommended' | 'balanced' | 'high_protein' | 'low_carb' | 'custom'
  /**
   * Version of the macro maths these numbers came out of. Targets are computed
   * once and persisted, so a fix to the algorithm does not reach anyone who
   * already onboarded. Stamping the version lets a stale row be recomputed on
   * the next read instead of needing a migration.
   */
  calcVersion?: number
  /**
   * The (rolling-average) bodyweight, in kg, these targets were last computed
   * from. Read alongside a fresh trend weight to decide whether logged weight
   * has moved enough since to be worth recalculating — see
   * lib/goals/trend.ts. Without this a fixed calorie target just sits there
   * forever once the member stops opening the goals page manually.
   */
  calcWeightKg?: number
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
  },
  macroPreset: {
    type: String,
    enum: ['recommended', 'balanced', 'high_protein', 'low_carb', 'custom']
  },
  calcVersion: { type: Number },
  calcWeightKg: { type: Number }
}, {
  timestamps: true
})

export default mongoose.models.NutritionGoal || mongoose.model<INutritionGoal>('NutritionGoal', NutritionGoalSchema)
