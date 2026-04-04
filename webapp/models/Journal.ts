import mongoose, { Schema } from 'mongoose'

export interface IJournalEntry {
  _id?: string
  userId: mongoose.Types.ObjectId | string
  date: Date
  content: string
  mood?: 1 | 2 | 3 | 4 | 5
  prompt?: string
  createdAt?: Date
  updatedAt?: Date
}

const JournalSchema = new Schema<IJournalEntry>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    date: { type: Date, required: true },
    content: { type: String, required: true, maxlength: 5000 },
    mood: { type: Number, enum: [1, 2, 3, 4, 5] },
    prompt: { type: String, maxlength: 500 },
  },
  { timestamps: true }
)

// One entry per user per day
JournalSchema.index({ userId: 1, date: 1 }, { unique: true })

export default mongoose.models.Journal || mongoose.model<IJournalEntry>('Journal', JournalSchema)
