import mongoose, { Schema, Types } from 'mongoose'

// ---------------------------------------------------------------------------
// MealImage — binary storage for a Meal's hero image.
//
// Stored in a separate collection from Meal so that:
//   - Listing meals (which is read-heavy) doesn't pull image bytes into RAM
//   - Lean meal queries stay tiny
//   - One image per meal (unique index on mealId; replace on re-upload)
//
// Server-side resize (sharp) downsamples to ≤1200×1200 JPEG q≈80 before
// storage. Final blob is typically 50–150KB. Mongo's 16MB doc cap is plenty.
// ---------------------------------------------------------------------------

export interface IMealImage {
  _id?: Types.ObjectId
  mealId: Types.ObjectId
  contentType: string
  data: Buffer
  createdAt?: Date
  updatedAt?: Date
}

const MealImageSchema = new Schema<IMealImage>({
  mealId: { type: Schema.Types.ObjectId, ref: 'Meal', required: true },
  contentType: { type: String, required: true, default: 'image/jpeg' },
  data: { type: Buffer, required: true },
}, {
  timestamps: true,
})

// One image per meal; uploading another replaces the existing one.
MealImageSchema.index({ mealId: 1 }, { unique: true })

export default mongoose.models.MealImage || mongoose.model<IMealImage>('MealImage', MealImageSchema)
