import mongoose, { Schema, Document, Model, Types } from 'mongoose'

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
  reps: number
  weight: number
  completed: boolean
}

export interface IExerciseLog {
  name: string
  sets: ISetLog[]
}

export interface IWorkoutLog {
  date: Date
  programId: string
  phase: number
  day: string
  completed: boolean
  duration?: number // in minutes
  exercises: IExerciseLog[]
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
}

export interface IUserProgress {
  _id?: Types.ObjectId
  userId: Types.ObjectId
  height?: number // in inches for BMI calculation
  weightHistory: IWeightEntry[]
  moodHistory: IMoodEntry[]
  moodChangeHistory: IMoodChangeEntry[] // All mood changes for audit trail
  workoutLogs: IWorkoutLog[]
  activePrograms: IActiveProgram[]
  currentProgram?: {
    programId: string
    startDate: Date
    currentPhase: number
    currentWeek: number
  }
  streakDays: number
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
  reps: { type: Number, required: true },
  weight: { type: Number, required: true },
  completed: { type: Boolean, default: false }
}, { _id: false })

const ExerciseLogSchema = new Schema<IExerciseLog>({
  name: { type: String, required: true },
  sets: [SetLogSchema]
}, { _id: false })

const WorkoutLogSchema = new Schema<IWorkoutLog>({
  date: { type: Date, required: true },
  programId: { type: String, required: true },
  phase: { type: Number, required: true },
  day: { type: String, required: true },
  completed: { type: Boolean, default: false },
  duration: { type: Number },
  exercises: [ExerciseLogSchema]
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
  status: { type: String, enum: ['active', 'in-progress', 'paused', 'completed'], default: 'in-progress' }
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
  workoutLogs: [WorkoutLogSchema],
  activePrograms: { type: [ActiveProgramSchema], default: [] },
  currentProgram: {
    programId: String,
    startDate: Date,
    currentPhase: Number,
    currentWeek: Number
  },
  streakDays: { type: Number, default: 0 },
  totalWorkouts: { type: Number, default: 0 }
}, {
  timestamps: true
})

// Calculate BMI from weight and height
UserProgressSchema.methods.calculateBMI = function(weight: number): number | null {
  if (!this.height) return null
  // BMI = (weight in lbs * 703) / (height in inches)^2
  return (weight * 703) / (this.height * this.height)
}

export default mongoose.models.UserProgress || mongoose.model<IUserProgress>('UserProgress', UserProgressSchema)
