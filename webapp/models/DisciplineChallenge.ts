import mongoose, { Schema, Document, Model, Types } from 'mongoose'

export interface IDisciplineChallenge extends Document {
  userId: Types.ObjectId
  date: Date          // normalized to midnight UTC — one per user per day
  challenge: string
  completed: boolean
  excuse?: string
  excuseResponse?: string
  completedAt?: Date
}

const DisciplineChallengeSchema = new Schema<IDisciplineChallenge>({
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  date: { type: Date, required: true },
  challenge: { type: String, required: true },
  completed: { type: Boolean, default: false },
  excuse: { type: String },
  excuseResponse: { type: String },
  completedAt: { type: Date },
})

// One challenge per user per day
DisciplineChallengeSchema.index({ userId: 1, date: 1 }, { unique: true })

const DisciplineChallenge: Model<IDisciplineChallenge> =
  mongoose.models.DisciplineChallenge ||
  mongoose.model<IDisciplineChallenge>('DisciplineChallenge', DisciplineChallengeSchema)

export default DisciplineChallenge
