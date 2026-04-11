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
  },
  { timestamps: true }
)

const IdentityProfile: Model<IIdentityProfile> =
  mongoose.models.IdentityProfile ||
  mongoose.model<IIdentityProfile>('IdentityProfile', IdentityProfileSchema)

export default IdentityProfile
