import mongoose, { Schema } from 'mongoose'

export type SleepQuality = 1 | 2 | 3 | 4 | 5

export interface ISleepEntry {
  _id?: string
  userId: mongoose.Types.ObjectId | string
  date: Date           // normalized to start of local day (midnight UTC)
  bedtime: Date        // actual datetime user went to bed
  wakeTime: Date       // actual datetime user woke up
  durationMinutes: number  // calculated: (wakeTime - bedtime) in minutes
  quality: SleepQuality    // 1=poor, 2=fair, 3=okay, 4=good, 5=great
  notes?: string           // optional free text
  createdAt?: Date
  updatedAt?: Date
}

const SleepSchema = new Schema<ISleepEntry>({
  userId: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  date: {
    type: Date,
    required: true
  },
  bedtime: {
    type: Date,
    required: true
  },
  wakeTime: {
    type: Date,
    required: true
  },
  durationMinutes: {
    type: Number,
    required: true,
    min: 0,
    max: 1440
  },
  quality: {
    type: Number,
    enum: [1, 2, 3, 4, 5],
    required: true
  },
  notes: {
    type: String,
    maxlength: 1000
  }
}, {
  timestamps: true
})

// Compound unique index: one entry per user per day
SleepSchema.index({ userId: 1, date: 1 }, { unique: true })

export default mongoose.models.Sleep || mongoose.model<ISleepEntry>('Sleep', SleepSchema)
