import mongoose, { Schema, Types } from 'mongoose'
import { IMealNutrition } from './Meal'

// ---------------------------------------------------------------------------
// PlateScan — a saved record of an AI nutrition scan (photo or describe). Gives
// users a browsable history of what they scanned, with enough detail to re-log
// it. Items mirror the loggable shape (name/brand/serving/nutrition + optional
// foodId for matched DB foods) so "Log again" is a straight repost.
// ---------------------------------------------------------------------------

export interface IPlateScanItem {
  foodId?: Types.ObjectId
  name: string
  brand?: string
  /** The AI's serving phrase ("1 cup", "~150 g") — display only. */
  estimatedServing?: string
  servingSize: number
  servingUnit: string
  servings: number
  nutrition: IMealNutrition
  confidence?: number
  /** Set when this item was reconciled to a DB entry. */
  matchKind?: 'food' | 'meal' | 'recipe'
}

export interface IPlateScan {
  _id?: Types.ObjectId
  user: Types.ObjectId
  source: 'photo' | 'describe'
  note?: string
  tag?: string
  /** Small data-URL thumbnail of the photo (photo scans only) for the history
   *  list. Kept tiny (~256px / low quality) so it's cheap to store inline. */
  thumb?: string
  /** Full(er)-res scan image stored in blob storage (MinIO), served same-origin
   *  via /api/blob/<key>. Optional — older scans only have the inline `thumb`.
   *  The list uses `thumb` for speed; detail/re-open prefers `imageUrl`. */
  imageUrl?: string
  items: IPlateScanItem[]
  totalNutrition: IMealNutrition
  /** When/whether the scan was logged, and the resulting meal log. */
  loggedAt?: Date
  mealLogId?: Types.ObjectId
  createdAt?: Date
  updatedAt?: Date
}

const NutritionSchema = new Schema<IMealNutrition>({
  calories: { type: Number, required: true, default: 0 },
  protein: { type: Number, required: true, default: 0 },
  carbs: { type: Number, required: true, default: 0 },
  fats: { type: Number, required: true, default: 0 },
  fiber: { type: Number },
  sugar: { type: Number },
  sodium: { type: Number },
  saturatedFat: { type: Number },
}, { _id: false })

const PlateScanItemSchema = new Schema<IPlateScanItem>({
  foodId: { type: Schema.Types.ObjectId, ref: 'Food' },
  name: { type: String, required: true },
  brand: { type: String },
  estimatedServing: { type: String },
  servingSize: { type: Number, required: true, default: 1 },
  servingUnit: { type: String, required: true, default: 'serving' },
  servings: { type: Number, required: true, default: 1 },
  nutrition: { type: NutritionSchema, required: true },
  confidence: { type: Number },
  matchKind: { type: String, enum: ['food', 'meal', 'recipe'] },
}, { _id: true })

const PlateScanSchema = new Schema<IPlateScan>({
  user: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  source: { type: String, enum: ['photo', 'describe'], required: true, default: 'photo' },
  note: { type: String },
  tag: { type: String },
  thumb: { type: String },
  imageUrl: { type: String },
  items: { type: [PlateScanItemSchema], default: [] },
  totalNutrition: { type: NutritionSchema, default: () => ({ calories: 0, protein: 0, carbs: 0, fats: 0 }) },
  loggedAt: { type: Date },
  mealLogId: { type: Schema.Types.ObjectId, ref: 'MealLog' },
}, { timestamps: true })

// Recent-first listing per user.
PlateScanSchema.index({ user: 1, createdAt: -1 })

const PlateScan: mongoose.Model<IPlateScan> =
  mongoose.models.PlateScan || mongoose.model<IPlateScan>('PlateScan', PlateScanSchema)

export default PlateScan
