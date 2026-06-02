import mongoose, { Schema, Document, Model, Types } from 'mongoose'

// One record per user per local day — the daily Mind ritual. Marks that the
// user played today's session (the linear, full-screen experience) and how much
// XP it awarded. Idempotent per day via the unique (userId, dateKey) index, so
// re-playing doesn't farm XP. Phase 2+ will store per-move results + reflections
// here (the substrate the AI layer will ground on).

export interface IMindSessionMove {
  kind: string
  completedAt?: Date
}

export interface IMindSession extends Document {
  userId: Types.ObjectId
  dateKey: string // YYYY-MM-DD in the user's local timezone
  moves: IMindSessionMove[]
  xpAwarded: number
  completedAt: Date
  createdAt: Date
  updatedAt: Date
}

const MindSessionSchema = new Schema<IMindSession>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    dateKey: { type: String, required: true },
    moves: {
      type: [new Schema<IMindSessionMove>({ kind: String, completedAt: Date }, { _id: false })],
      default: [],
    },
    xpAwarded: { type: Number, default: 0 },
    completedAt: { type: Date, default: Date.now },
  },
  { timestamps: true },
)

MindSessionSchema.index({ userId: 1, dateKey: 1 }, { unique: true })

const MindSession: Model<IMindSession> =
  mongoose.models.MindSession || mongoose.model<IMindSession>('MindSession', MindSessionSchema)

export default MindSession
