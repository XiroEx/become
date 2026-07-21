import mongoose, { Schema, Document, Model, Types } from 'mongoose'

export interface IMission extends Document {
  userId: Types.ObjectId
  purpose: string
  whyItMatters: string
  dailyAction: string
  // Movement is the point — "without movement there is no energy." Taking the
  // forward move builds a momentum streak (the daily-return hook for Mission).
  momentumStreak: number
  longestMomentumStreak: number
  lastMovedKey: string | null   // YYYY-MM-DD of the last forward move (local day)
  updatedAt: Date
}

const MissionSchema = new Schema<IMission>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
    purpose: { type: String, required: true, maxlength: 500 },
    whyItMatters: { type: String, required: true, maxlength: 1000 },
    dailyAction: { type: String, required: true, maxlength: 300 },
    momentumStreak: { type: Number, default: 0 },
    longestMomentumStreak: { type: Number, default: 0 },
    lastMovedKey: { type: String, default: null },
  },
  { timestamps: true }
)

const Mission: Model<IMission> =
  mongoose.models.Mission || mongoose.model<IMission>('Mission', MissionSchema)

export default Mission
