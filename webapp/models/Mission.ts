import mongoose, { Schema, Document, Model, Types } from 'mongoose'

export interface IMission extends Document {
  userId: Types.ObjectId
  purpose: string
  whyItMatters: string
  dailyAction: string
  updatedAt: Date
}

const MissionSchema = new Schema<IMission>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
    purpose: { type: String, required: true, maxlength: 500 },
    whyItMatters: { type: String, required: true, maxlength: 1000 },
    dailyAction: { type: String, required: true, maxlength: 300 },
  },
  { timestamps: true }
)

const Mission: Model<IMission> =
  mongoose.models.Mission || mongoose.model<IMission>('Mission', MissionSchema)

export default Mission
