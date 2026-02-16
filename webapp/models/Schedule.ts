import mongoose, { Schema, Document, Model, Types } from 'mongoose'

export interface IScheduleSettings {
  trainingDays: number[]       // 0=Sun, 1=Mon, ..., 6=Sat
  startDate: Date              // When the schedule begins
  autoAdvance: boolean         // Auto-generate next week's schedule
}

export interface IScheduledWorkout {
  date: Date                   // Calendar date for this workout
  programId: string            // Ref to program
  phase: number                // Phase number (1-based)
  dayLabel: string             // "Day 1", "Day 2", etc.
  workoutTitle: string         // Cached: "Upper Body Strength"
  status: 'scheduled' | 'completed' | 'missed' | 'skipped' | 'rest'
  completedAt?: Date
  notes?: string
}

export interface ISchedule extends Document {
  userId: Types.ObjectId
  programId: string
  programName: string
  settings: IScheduleSettings
  scheduledWorkouts: IScheduledWorkout[]
  createdAt: Date
  updatedAt: Date
}

const ScheduleSettingsSchema = new Schema<IScheduleSettings>({
  trainingDays: [{ type: Number, min: 0, max: 6 }],
  startDate: { type: Date, required: true },
  autoAdvance: { type: Boolean, default: true },
}, { _id: false })

const ScheduledWorkoutSchema = new Schema<IScheduledWorkout>({
  date: { type: Date, required: true },
  programId: { type: String, required: true },
  phase: { type: Number, required: true },
  dayLabel: { type: String, required: true },
  workoutTitle: { type: String, required: true },
  status: { 
    type: String, 
    enum: ['scheduled', 'completed', 'missed', 'skipped', 'rest'],
    default: 'scheduled' 
  },
  completedAt: { type: Date },
  notes: { type: String },
}, { _id: false })

const ScheduleSchema = new Schema<ISchedule>({
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  programId: { type: String, required: true },
  programName: { type: String, required: true },
  settings: { type: ScheduleSettingsSchema, required: true },
  scheduledWorkouts: [ScheduledWorkoutSchema],
}, {
  timestamps: true,
})

// Compound index: one schedule per user per program
ScheduleSchema.index({ userId: 1, programId: 1 }, { unique: true })
// For efficient date range queries
ScheduleSchema.index({ userId: 1, 'scheduledWorkouts.date': 1 })

const Schedule: Model<ISchedule> = mongoose.models.Schedule || mongoose.model<ISchedule>('Schedule', ScheduleSchema)

export default Schedule
