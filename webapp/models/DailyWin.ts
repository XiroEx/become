import mongoose, { Schema, Document, Model, Types } from 'mongoose'

export interface IDailyWin extends Document {
  userId: Types.ObjectId
  date: Date     // midnight UTC
  win: string
  createdAt: Date
}

const DailyWinSchema = new Schema<IDailyWin>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    date: { type: Date, required: true },
    win: { type: String, required: true, maxlength: 500 },
  },
  { timestamps: true }
)

DailyWinSchema.index({ userId: 1, date: -1 })

const DailyWin: Model<IDailyWin> =
  mongoose.models.DailyWin || mongoose.model<IDailyWin>('DailyWin', DailyWinSchema)

export default DailyWin
