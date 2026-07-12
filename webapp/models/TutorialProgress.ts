import mongoose, { Schema, type Document, type Model } from 'mongoose'
import type { TutorialProgressState } from '@/lib/redtutorial'

// Per-user tutorial/tour progress (one blob per user, account-based so tours
// don't replay on every device). Written by /api/tutorial-progress; the shape
// of `state` is owned by @redbtn/redtutorial (TutorialProgressState).
export interface ITutorialProgress extends Document {
  userId: mongoose.Types.ObjectId
  state: TutorialProgressState
  createdAt: Date
  updatedAt: Date
}

const TutorialProgressSchema = new Schema<ITutorialProgress>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
    state: { type: Schema.Types.Mixed, required: true },
  },
  { timestamps: true }
)

const TutorialProgress: Model<ITutorialProgress> =
  mongoose.models.TutorialProgress ||
  mongoose.model<ITutorialProgress>('TutorialProgress', TutorialProgressSchema)

export default TutorialProgress
