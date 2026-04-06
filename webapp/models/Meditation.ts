import mongoose, { Schema } from 'mongoose'

export interface IMeditationSession {
  _id?: string
  userId: mongoose.Types.ObjectId | string
  categoryId: string        // e.g. 'box', 'release', 'recovery'
  categoryName: string      // e.g. 'Box Breathing'
  durationMinutes: number   // session length chosen
  completedAt: Date         // when the session finished
  createdAt?: Date
}

const MeditationSchema = new Schema<IMeditationSession>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    categoryId: { type: String, required: true },
    categoryName: { type: String, required: true },
    durationMinutes: { type: Number, required: true, min: 1, max: 60 },
    completedAt: { type: Date, required: true },
  },
  { timestamps: true },
)

// Index for fast per-user queries sorted by date
MeditationSchema.index({ userId: 1, completedAt: -1 })

const Meditation =
  mongoose.models.Meditation ||
  mongoose.model<IMeditationSession>('Meditation', MeditationSchema)

export default Meditation
