import mongoose, { Schema, Document, Model, Types } from 'mongoose'

// MindNonNegotiable — a standing personal standard the user commits to in the
// Discipline system. Daily check-off with a BREAKABLE streak (the thing that
// makes Discipline distinct from the other Mind systems and pulls the user
// back daily). Streak uses the app's today-or-yesterday tolerance.

export interface IMindNonNegotiable extends Document {
  userId: Types.ObjectId
  text: string
  active: boolean
  currentStreak: number
  longestStreak: number
  /** Local YYYY-MM-DD of the last day this was checked off. */
  lastCheckedKey?: string | null
  createdAt: Date
}

const MindNonNegotiableSchema = new Schema<IMindNonNegotiable>({
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  text: { type: String, required: true, maxlength: 200 },
  active: { type: Boolean, default: true },
  currentStreak: { type: Number, default: 0 },
  longestStreak: { type: Number, default: 0 },
  lastCheckedKey: { type: String, default: null },
  createdAt: { type: Date, default: Date.now },
})

MindNonNegotiableSchema.index({ userId: 1, active: 1, createdAt: 1 })

const MindNonNegotiable: Model<IMindNonNegotiable> =
  mongoose.models.MindNonNegotiable ||
  mongoose.model<IMindNonNegotiable>('MindNonNegotiable', MindNonNegotiableSchema)

export default MindNonNegotiable
