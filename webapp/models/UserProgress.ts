import mongoose, { Schema, Types } from 'mongoose'
import type { IExercisePR, IPRDimension } from '@/lib/exercisePRs'

export interface IWeightEntry {
  date: Date
  /** Raw number the member typed, in `unit`. */
  weight: number
  /** The unit `weight` was entered in. Absent on entries logged before this
   *  field existed — treat those as the member's current profile unit, which is
   *  what they were using at the time. */
  unit?: 'lbs' | 'kg'
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
  groupLabel?: string
  groupRounds?: number
  // Added mid-session ("build as you go") rather than programmed. A program
  // workout rebuilds its exercise list from the program on every load, so
  // without this flag anything added during the session would vanish on
  // resume and leave its logged sets orphaned.
  addedAdHoc?: boolean
  // What was prescribed for an added exercise (sets/reps/duration/rest). The
  // logged sets alone cannot say whether an untouched 3x12 was three sets of
  // twelve or three sets of nothing.
  prescription?: {
    sets?: number
    reps?: string
    duration?: string
    rest?: string
    trackingType?: string
  }
  // Exercise swap tracking
  originalExerciseSlug?: string  // If swapped, the originally programmed exercise slug
  swappedFromName?: string       // The original exercise name before swap
}

export interface IWorkoutLog {
  date: Date
  // Program-bound logs carry programId/phase/day. Quick (ad-hoc) sessions have
  // no program — programId/phase/day are absent and `kind` is 'quick'.
  programId?: string
  phase?: number
  day?: string
  // The exact Schedule.scheduledWorkouts[].date this program log fulfills (gap 3).
  // Lets skip/complete/count target the EXACT calendar slot instead of a
  // dayLabel±14d heuristic. Absent on legacy logs and on quick sessions.
  scheduledDate?: Date
  // 'program' (default, legacy) = part of an enrolled program; 'quick' = an
  // ad-hoc session not attached to any program.
  kind?: 'program' | 'quick'
  // Display title for quick sessions (e.g. "Push Day", "Quick Legs").
  title?: string
  // Client-generated id used to match-for-update a quick session across
  // incremental saves within the same live session (program logs use
  // programId+day+today instead).
  sessionId?: string
  // Optional focus tag for quick sessions (e.g. 'push' | 'legs' | 'full').
  focus?: string
  completed: boolean
  // Quick sessions only: a planned session the user deliberately skipped. Never
  // set on program logs (those track skips on the Schedule slot instead).
  skipped?: boolean
  duration?: number // in minutes (final, set on completion)
  startedAt?: Date // First time the live view was opened / first set saved
  activeSeconds?: number // Accumulated active seconds across all sessions
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
  // Daily check-in gating. Lives on the server, not in localStorage, so that a
  // member who checks in from the home-screen PWA is not asked again in Safari
  // (iOS gives standalone web apps their own storage container).
  checkIn?: {
    lastSkippedDate?: Date // Local day on which "Skip for Today" was pressed
    lastShownAt?: Date // Last time the modal was actually put in front of them
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
  /**
   * Local day keys covered by a super-streak freeze. One freeze at a time,
   * earned back a month after it is spent (see lib/streaks/freeze).
   */
  superFreezeDays?: string[]
  lastActivityDate?: Date
  streakFreezes: number
  milestonesReached: number[]
  lastStreakEmailDate?: Date
  totalWorkouts: number
  /** Master switch. Undefined/missing reads as ON — same opt-out convention as
   *  notificationPrefs.<category> below. Only an explicit false, set when the
   *  user turns notifications off in Settings, blocks new subscriptions. */
  notificationsEnabled?: boolean
  notificationPrefs?: {
    streakAtRisk?: boolean
    workoutReminder?: boolean
    mealReminder?: boolean
    reEngagement?: boolean
    chatMessage?: boolean
    /** The daily Mind session nudge — the core ritual, which had no reminder at all. */
    mindReminder?: boolean
    goalNudge?: boolean
    superStreakAtRisk?: boolean
    /** Daily mood + weight check-in — a push so it reaches members who don't
     *  happen to open the app during the window the in-app modal relies on. */
    checkInReminder?: boolean
  }
  lastPushSentAt?: {
    streakAtRisk?: Date
    workoutReminder?: Date
    mealReminder?: Date
    reEngagement?: Date
    mindReminder?: Date
    /** "Your program has no training days set" nudge. */
    scheduleSetup?: Date
    goalNudge?: Date
    goalNudgeKey?: string
    goalNudgeKeyAt?: Date
    superStreakAtRisk?: Date
    checkInReminder?: Date
  }
  // Browser-reported Date.getTimezoneOffset() in minutes — positive when local
  // is BEHIND UTC (e.g. 300 for EST). Captured opportunistically from tz-aware
  // requests so the cron can send notifications at a reasonable LOCAL hour.
  timezoneOffset?: number
  /**
   * IANA zone, e.g. "America/New_York". Preferred over timezoneOffset because a
   * stored offset is a snapshot: it is wrong for half the year the moment
   * daylight saving moves, and only self-corrects if the member opens the app.
   * A zone name stays right forever, including for members who go quiet.
   */
  timezone?: string
  // Persisted personal records, kept in lockstep with workoutLogs by the
  // POST /api/workouts save path. Read by GET endpoints instead of recomputing
  // from workoutLogs on every request.
  exercisePRs: IExercisePR[]
  // Suggestion-engine dismissals. Each entry silences a suggestion by id
  // until its source's cooldownDays elapse (or permanently when cooldownDays
  // is undefined). Defaults to [] for legacy documents — no migration needed.
  dismissedSuggestions: IDismissedSuggestion[]
  // Dashboard rotator pins — ids that always appear first in the dashboard
  // tile list, in this exact order. Defaults to [].
  pinnedTiles: string[]
  // Dashboard rotator history: per-id last-shown timestamps. Stored as an
  // array of { id, at } subdocs (not a Map) so .lean() queries return plain
  // JSON arrays that downstream code can iterate without Mongoose Map APIs.
  tileLastShownAt: ITileLastShown[]
  // Unified dashboard tile layout (supersedes pinnedTiles). Ordered list of
  // stat/metric/smart-rotating tiles with size + lock. Defaults to [] for
  // legacy docs; the layout API migrates from pinnedTiles on first GET.
  dashboardLayout: IDashboardTile[]
  // Adaptive smart-tile engagement: per-key tap counts driving the smart tile's
  // relevance boost (cards the user opens drift toward the front). Keyed by
  // `stat:<id>` / `metric:<id>`. Defaults to [] for legacy docs.
  tileEngagement: ITileEngagement[]
  createdAt?: Date
  updatedAt?: Date
}

export interface IDismissedSuggestion {
  id: string
  dismissedAt: Date
}

export interface ITileLastShown {
  id: string
  at: Date
}

export interface ITileEngagement {
  key: string // `stat:<id>` / `metric:<id>`
  taps: number
  lastTapAt?: Date | null
}

// Unified dashboard tile (see lib/dashboardLayout/types.ts for the canonical
// shape + validators). Persisted in document order; max 20 enforced at the API.
export interface IDashboardTile {
  id: string
  kind: 'stat' | 'metric' | 'smart-rotating'
  size: '1x1' | '2x1'
  locked?: string | null
  /** Optional per-tile settings (smart tile: pool + intervalMs). */
  settings?: { pool?: string[]; intervalMs?: number } | null
}

const WeightEntrySchema = new Schema<IWeightEntry>({
  date: { type: Date, required: true },
  weight: { type: Number, required: true },
  unit: { type: String, enum: ['lbs', 'kg'] },
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

const PrescriptionSchema = new Schema({
  sets: { type: Number },
  reps: { type: String },
  duration: { type: String },
  rest: { type: String },
  trackingType: { type: String },
}, { _id: false })

const ExerciseLogSchema = new Schema<IExerciseLog>({
  name: { type: String, required: true },
  exerciseSlug: { type: String },
  sets: [SetLogSchema],
  groupId: { type: String },
  groupType: { type: String },
  groupLabel: { type: String },
  groupRounds: { type: Number },
  addedAdHoc: { type: Boolean },
  prescription: { type: PrescriptionSchema, default: undefined },
  originalExerciseSlug: { type: String },
  swappedFromName: { type: String }
}, { _id: false })

const WorkoutLogSchema = new Schema<IWorkoutLog>({
  date: { type: Date, required: true },
  // Optional so ad-hoc quick sessions (no program) can be logged. Program logs
  // still always set these.
  programId: { type: String },
  phase: { type: Number },
  day: { type: String },
  scheduledDate: { type: Date },
  kind: { type: String, enum: ['program', 'quick'], default: 'program' },
  title: { type: String },
  sessionId: { type: String },
  focus: { type: String },
  completed: { type: Boolean, default: false },
  skipped: { type: Boolean },
  duration: { type: Number },
  startedAt: { type: Date },
  activeSeconds: { type: Number, default: 0 },
  notes: { type: String },
  exercises: [ExerciseLogSchema]
}, { _id: false })

const PRDimensionSchema = new Schema<IPRDimension>({
  weight: { type: Number, required: true },
  reps:   { type: Number, required: true },
  e1rm:   { type: Number },
  date:   { type: Date, required: true },
  programId: { type: String },
}, { _id: false })

const ExercisePRSchema = new Schema<IExercisePR>({
  exerciseSlug: { type: String, required: true },
  exerciseName: { type: String, required: true },
  maxWeight: { type: PRDimensionSchema, default: null },
  maxReps:   { type: PRDimensionSchema, default: null },
  maxE1RM:   { type: PRDimensionSchema, default: null },
}, { _id: false })

const ExerciseSwapSchema = new Schema({
  originalSlug: { type: String, required: true },
  replacementSlug: { type: String, required: true },
  replacementName: { type: String, required: true },
  swappedAt: { type: Date, default: Date.now }
}, { _id: false })

const DismissedSuggestionSchema = new Schema<IDismissedSuggestion>({
  id: { type: String, required: true },
  dismissedAt: { type: Date, required: true, default: Date.now },
}, { _id: false })

const DashboardTileSchema = new Schema<IDashboardTile>({
  id: { type: String, required: true },
  kind: { type: String, required: true, enum: ['stat', 'metric', 'smart-rotating'] },
  size: { type: String, required: true, enum: ['1x1', '2x1'], default: '1x1' },
  locked: { type: String, default: null },
  settings: {
    type: new Schema<{ pool?: string[]; intervalMs?: number }>({
      pool: { type: [String], default: undefined },
      intervalMs: { type: Number, default: undefined },
    }, { _id: false }),
    default: undefined,
  },
}, { _id: false })

const TileLastShownSchema = new Schema<ITileLastShown>({
  id: { type: String, required: true },
  at: { type: Date, required: true, default: Date.now },
}, { _id: false })

const TileEngagementSchema = new Schema<ITileEngagement>({
  key: { type: String, required: true },
  taps: { type: Number, required: true, default: 0 },
  lastTapAt: { type: Date, default: null },
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
  checkIn: {
    lastSkippedDate: { type: Date },
    lastShownAt: { type: Date }
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
  superFreezeDays: { type: [String], default: [] },
  longestStreak: { type: Number, default: 0 },
  lastActivityDate: { type: Date },
  streakFreezes: { type: Number, default: 1 },
  milestonesReached: { type: [Number], default: [] },
  lastStreakEmailDate: { type: Date },
  totalWorkouts: { type: Number, default: 0 },
  notificationsEnabled: { type: Boolean },
  notificationPrefs: {
    streakAtRisk: { type: Boolean },
    workoutReminder: { type: Boolean },
    mealReminder: { type: Boolean },
    reEngagement: { type: Boolean },
    chatMessage: { type: Boolean },
    mindReminder: { type: Boolean },
    goalNudge: { type: Boolean },
    superStreakAtRisk: { type: Boolean },
    checkInReminder: { type: Boolean },
  },
  lastPushSentAt: {
    streakAtRisk: { type: Date },
    workoutReminder: { type: Date },
    mealReminder: { type: Date },
    reEngagement: { type: Date },
    mindReminder: { type: Date },
    scheduleSetup: { type: Date },
    goalNudge: { type: Date },
    goalNudgeKey: { type: String },
    goalNudgeKeyAt: { type: Date },
    superStreakAtRisk: { type: Date },
    checkInReminder: { type: Date },
  },
  timezoneOffset: { type: Number },
  timezone: { type: String },
  exercisePRs: { type: [ExercisePRSchema], default: [] },
  dismissedSuggestions: { type: [DismissedSuggestionSchema], default: [] },
  pinnedTiles: { type: [String], default: [] },
  tileLastShownAt: { type: [TileLastShownSchema], default: [] },
  dashboardLayout: { type: [DashboardTileSchema], default: [] },
  tileEngagement: { type: [TileEngagementSchema], default: [] },
}, {
  timestamps: true
})

// Indexes for common queries
UserProgressSchema.index({ 'activePrograms.programId': 1 })
UserProgressSchema.index({ 'workoutLogs.programId': 1, 'workoutLogs.date': -1 })
UserProgressSchema.index({ userId: 1, 'exercisePRs.exerciseSlug': 1 })

// Calculate BMI from weight and height
UserProgressSchema.methods.calculateBMI = function(weight: number): number | null {
  if (!this.height) return null
  // BMI = (weight in lbs * 703) / (height in inches)^2
  return (weight * 703) / (this.height * this.height)
}

export default mongoose.models.UserProgress || mongoose.model<IUserProgress>('UserProgress', UserProgressSchema)
