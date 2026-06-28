import mongoose, { Schema, Document } from 'mongoose'

export interface IFeedback extends Document {
  userId: mongoose.Types.ObjectId
  email: string
  type: 'bug' | 'feature' | 'general' | 'nutrition_generation'
  message: string
  metadata?: Record<string, unknown>
  createdAt: Date
}

const FeedbackSchema = new Schema<IFeedback>({
  userId: { type: Schema.Types.ObjectId, required: true, ref: 'User' },
  email: { type: String, required: true },
  type: { type: String, enum: ['bug', 'feature', 'general', 'nutrition_generation'], default: 'general' },
  message: { type: String, required: true, maxlength: 2000 },
  metadata: { type: Schema.Types.Mixed },
}, { timestamps: true })

export default mongoose.models.Feedback || mongoose.model<IFeedback>('Feedback', FeedbackSchema)
