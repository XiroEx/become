import mongoose, { Schema, Document, Model, Types } from 'mongoose'

export interface IDailyContentLog extends Document {
  userId: Types.ObjectId
  date: Date        // midnight UTC — one record per user per day
  state: string     // mind state selected at check-in
  contentId: string // which content piece was surfaced
  ctaClicked: boolean
  createdAt: Date
  updatedAt: Date
}

const DailyContentLogSchema = new Schema<IDailyContentLog>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    date: { type: Date, required: true },
    state: { type: String, required: true },
    contentId: { type: String, required: true },
    ctaClicked: { type: Boolean, default: false },
  },
  { timestamps: true }
)

DailyContentLogSchema.index({ userId: 1, date: 1 }, { unique: true })

const DailyContentLog: Model<IDailyContentLog> =
  mongoose.models.DailyContentLog ||
  mongoose.model<IDailyContentLog>('DailyContentLog', DailyContentLogSchema)

export default DailyContentLog
