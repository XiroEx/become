import mongoose, { Schema, Document, Model, Types } from 'mongoose'

export type StartingPoint = 'lost' | 'stuck' | 'building' | 'leveling_up'
export type PrimaryObstacle = 'clarity' | 'discipline' | 'motivation' | 'environment'

export interface IIdentityProfile extends Document {
  userId: Types.ObjectId
  currentSelf: string       // honest description of where they are now
  futureSelf: string        // who they are becoming
  primaryObstacle: PrimaryObstacle
  startingPoint: StartingPoint
  onboardingCompleted: boolean
  evolutionScore: number    // 0–100, persisted on each GET so history is trackable
  // Daily affirmation of the future self — identity installation through
  // repetition. A breakable streak (parallels Discipline's non-negotiables) that
  // pulls the user back to the Self-Image system each day.
  affirmStreak: number
  longestAffirmStreak: number
  lastAffirmedKey: string | null   // YYYY-MM-DD of the last affirmation (local day)
  updatedAt: Date
  createdAt: Date
}

const IdentityProfileSchema = new Schema<IIdentityProfile>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
    currentSelf: { type: String, required: true, maxlength: 500 },
    futureSelf: { type: String, required: true, maxlength: 500 },
    primaryObstacle: {
      type: String,
      enum: ['clarity', 'discipline', 'motivation', 'environment'],
      required: true,
    },
    startingPoint: {
      type: String,
      enum: ['lost', 'stuck', 'building', 'leveling_up'],
      required: true,
    },
    onboardingCompleted: { type: Boolean, default: false },
    evolutionScore: { type: Number, default: 0, min: 0, max: 100 },
    affirmStreak: { type: Number, default: 0 },
    longestAffirmStreak: { type: Number, default: 0 },
    lastAffirmedKey: { type: String, default: null },
  },
  { timestamps: true }
)

const IdentityProfile: Model<IIdentityProfile> =
  mongoose.models.IdentityProfile ||
  mongoose.model<IIdentityProfile>('IdentityProfile', IdentityProfileSchema)

export default IdentityProfile
