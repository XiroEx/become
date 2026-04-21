import mongoose, { Schema, Types } from 'mongoose'

export interface IWeightEntry {
  date: Date
  weight: number // in lbs
  bodyFat?: number // percentage
}

export interface IMoodEntry {
  date: Date
  mood: 1 | 2 | 3 | 4 | 5 // 1 = bad, 2 = not great, 3 = okay, 4 = pretty good, 5 = great
}

export interface IMoodChangeEntry {
  timestamp: Date
  date: Date // The day this mood is for
  previousMood: 1 | 2 | 3 | 4 | 5 | null
  newMood: 1 | 2 | 3 | 4 | 5
}

export interface ISetLog {
  setNumber: number
  reps?: number       // null for time-only exercises (planks, holds, intervals)
  weight?: number     // null for bodyweight / cardio exercises
  duration?: number   // seconds — for time / time_distance / intervals tracking types
  distance?: number   // meters — for time_distance tracking type
  speed?: number      // mph — for time_distance / intervals tracking types
  completed: boolean
}

export interface IExerciseLog {
  name: string
  exerciseSlug?: string          // The exercise slug used (may differ from program if swapped)
  sets: ISetLog[]
  // Grouping metadata (mirrors program exercise grouping for analysis)
  groupId?: string
  groupType?: string
  // Exercise swap tracking
  originalExerciseSlug?: string  // If swapped, the originally programmed exercise slug
  swappedFromName?: string       // The original exercise name before swap
}

export interface IWorkoutLog {
  date: Date
  programId: string
  phase: number
  day: string
  completed: boolean
  duration?: number // in minutes
  notes?: string
  exercises: IExerciseLog[]
}

export interface IExerciseSwap {
  originalSlug: string       // The originally programmed exercise slug
  replacementSlug: string    // The replacement exercise slug
  replacementName: string    // The replacement exercise name (for display)
  swappedAt: Date
}

export interface IActiveProgram {
  programId: string
  programName: string
  startDate: Date
  currentPhase: number
  currentDay: string
  completedWorkouts: number
  totalWorkouts: number // Total workouts in program
  lastWorkoutDate?: Date
  status: 'active' | 'in-progress' | 'paused' | 'completed'
  hasSchedule?: boolean
  exerciseSwaps?: IExerciseSwap[] // Permanent swaps for this program
}

export interface IUserProgress {
  _id?: Types.ObjectId
  userId: Types.ObjectId
  height?: number // in inches for BMI calculation
  weightHistory: IWeightEntry[]
  moodHistory: IMoodEntry[]
  moodChangeHistory: IMoodChangeEntry[] // All mood changes for audit trail
  weightSkipTracking?: {
    lastPromptDate?: Date // Last date we prompted for weight
    lastWeightDate?: Date // Last date weight was logged
    consecutiveSkips: number // Number of consecutive days skipped
  }
  workoutLogs: IWorkoutLog[]
  activePrograms: IActiveProgram[]
  currentProgram?: {
    programId: string
    startDate: Date
    currentPhase: number
    currentWeek: number
  }
  streakDays: number
  longestStreak: number
  lastActivityDate?: Date
  streakFreezes: number
  milestonesReached: number[]
  lastStreakEmailDate?: Date
  totalWorkouts: number
  createdAt?: Date
  updatedAt?: Date
}

const WeightEntrySchema = new Schema<IWeightEntry>({
  date: { type: Date, required: true },
  weight: { type: Number, required: true },
  bodyFat: { type: Number }
}, { _id: false })

const MoodEntrySchema = new Schema<IMoodEntry>({
  date: { type: Date, required: true },
  mood: { type: Number, required: true, min: 1, max: 5 }
}, { _id: false })

const MoodChangeEntrySchema = new Schema<IMoodChangeEntry>({
  timestamp: { type: Date, required: true },
  date: { type: Date, required: true },
  previousMood: { type: Number, min: 1, max: 5, default: null },
  newMood: { type: Number, required: true, min: 1, max: 5 }
}, { _id: false })

const SetLogSchema = new Schema<ISetLog>({
  setNumber: { type: Number, required: true },
  reps:     { type: Number, default: null },    // null for time-only exercises
  weight:   { type: Number, default: null },    // null for bodyweight/cardio
  duration: { type: Number, default: null },    // seconds (time / intervals / time_distance)
  distance: { type: Number, default: null },    // meters (time_distance)
  speed:    { type: Number, default: null },    // mph (time_distance / intervals)
  completed: { type: Boolean, default: false }
}, { _id: false })

const ExerciseLogSchema = new Schema<IExerciseLog>({
  name: { type: String, required: true },
  exerciseSlug: { type: String },
  sets: [SetLogSchema],
  groupId: { type: String },
  groupType: { type: String },
  originalExerciseSlug: { type: String },
  swappedFromName: { type: String }
}, { _id: false })

const WorkoutLogSchema = new Schema<IWorkoutLog>({
  date: { type: Date, required: true },
  programId: { type: String, required: true },
  phase: { type: Number, required: true },
  day: { type: String, required: true },
  completed: { type: Boolean, default: false },
  duration: { type: Number },
  notes: { type: String },
  exercises: [ExerciseLogSchema]
}, { _id: false })

const ExerciseSwapSchema = new Schema({
  originalSlug: { type: String, required: true },
  replacementSlug: { type: String, required: true },
  replacementName: { type: String, required: true },
  swappedAt: { type: Date, default: Date.now }
}, { _id: false })

const ActiveProgramSchema = new Schema<IActiveProgram>({
  programId: { type: String, required: true },
  programName: { type: String, required: true },
  startDate: { type: Date, required: true },
  currentPhase: { type: Number, default: 0 },
  currentDay: { type: String, default: 'Day 1' },
  completedWorkouts: { type: Number, default: 0 },
  totalWorkouts: { type: Number, required: true },
  lastWorkoutDate: { type: Date },
  status: { type: String, enum: ['active', 'in-progress', 'paused', 'completed'], default: 'in-progress' },
  hasSchedule: { type: Boolean, default: false },
  exerciseSwaps: { type: [ExerciseSwapSchema], default: [] }
}, { _id: false })

const UserProgressSchema = new Schema<IUserProgress>({
  userId: { 
    type: Schema.Types.ObjectId, 
    ref: 'User', 
    required: true, 
    unique: true 
  },
  height: { type: Number },
  weightHistory: [WeightEntrySchema],
  moodHistory: [MoodEntrySchema],
  moodChangeHistory: [MoodChangeEntrySchema],
  weightSkipTracking: {
    lastPromptDate: { type: Date },
    lastWeightDate: { type: Date },
    consecutiveSkips: { type: Number, default: 0 }
  },
  workoutLogs: [WorkoutLogSchema],
  activePrograms: { type: [ActiveProgramSchema], default: [] },
  currentProgram: {
    programId: String,
    startDate: Date,
    currentPhase: Number,
    currentWeek: Number
  },
  streakDays: { type: Number, default: 0 },
  longestStreak: { type: Number, default: 0 },
  lastActivityDate: { type: Date },
  streakFreezes: { type: Number, default: 1 },
  milestonesReached: { type: [Number], default: [] },
  lastStreakEmailDate: { type: Date },
  totalWorkouts: { type: Number, default: 0 }
}, {
  timestamps: true
})

// Indexes for common queries
UserProgressSchema.index({ 'activePrograms.programId': 1 })
UserProgressSchema.index({ 'workoutLogs.programId': 1, 'workoutLogs.date': -1 })

// Calculate BMI from weight and height
UserProgressSchema.methods.calculateBMI = function(weight: number): number | null {
  if (!this.height) return null
  // BMI = (weight in lbs * 703) / (height in inches)^2
  return (weight * 703) / (this.height * this.height)
}

export default mongoose.models.UserProgress || mongoose.model<IUserProgress>('UserProgress', UserProgressSchema)
