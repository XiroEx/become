// Goal — the dated, per-pillar record of what a member is working toward.
//
// User.profile holds the member's FACTS (target weight, days per week, height…)
// and stays the input everything reads. What profile cannot hold is time: when
// the goal started, what the numbers were then, how fast they meant to move,
// whether it was reached. That is this document — one active per pillar, kept
// as history when achieved or replaced, so "then → now → next" has a real
// "then" instead of "earliest data".
//
//   nutrition  kind 'weight' (lose/gain to a target) or 'maintain' (hold a band)
//   training   kind 'consistency' (days/week) with optional lift targets
//
// Mind already has its own baseline (IdentityProfile) and score (XP/chapters).

import mongoose, { Schema, Document, Types } from 'mongoose'

export type GoalPillar = 'nutrition' | 'training'
export type GoalStatus = 'active' | 'achieved' | 'replaced'
export type GoalKind = 'weight' | 'maintain' | 'consistency'
export type GoalDirection = 'lose' | 'maintain' | 'gain'

export interface IGoalLiftTarget {
  slug: string
  name: string
  baselineE1RM: number
  targetE1RM: number
  /** Optional deadline. */
  by?: Date
}

export interface IGoalPR {
  slug: string
  name: string
  e1RM: number
  weight?: number
  reps?: number
}

export interface IGoal extends Document {
  userId: Types.ObjectId
  pillar: GoalPillar
  status: GoalStatus
  kind: GoalKind
  startedAt: Date
  achievedAt?: Date
  replacedAt?: Date
  /** First weigh-in that landed inside the finish band — set once, even though
   *  `status` doesn't flip to 'achieved' until the band holds for a week. This
   *  is what lets the app congratulate the member the moment they cross the
   *  line instead of a week later when the official confirmation lands. */
  reachedTargetAt?: Date
  baseline: {
    weightKg?: number
    date?: Date
    daysPerWeek?: number
    prs?: IGoalPR[]
  }
  target: {
    weightKg?: number
    direction?: GoalDirection
    /** Chosen pace, always positive; direction says which way. */
    paceKgPerWeek?: number
    /** Maintain: "on target" inside ± this. */
    bandKg?: number
    daysPerWeek?: number
    programId?: string
    lifts?: IGoalLiftTarget[]
  }
  adherence: {
    logDaysPerWeek: number
    proteinDaysPerWeek: number
  }
  /** Snapshot when the goal ended (achieved/replaced). */
  final?: { weightKg?: number; date?: Date; daysPerWeek?: number }
  createdAt: Date
  updatedAt: Date
}

const LiftTargetSchema = new Schema<IGoalLiftTarget>({
  slug: { type: String, required: true },
  name: { type: String, required: true },
  baselineE1RM: { type: Number, required: true },
  targetE1RM: { type: Number, required: true },
  by: { type: Date },
}, { _id: false })

const PRSchema = new Schema<IGoalPR>({
  slug: { type: String, required: true },
  name: { type: String, required: true },
  e1RM: { type: Number, required: true },
  weight: { type: Number },
  reps: { type: Number },
}, { _id: false })

const GoalSchema = new Schema<IGoal>({
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  pillar: { type: String, enum: ['nutrition', 'training'], required: true },
  status: { type: String, enum: ['active', 'achieved', 'replaced'], default: 'active', required: true },
  kind: { type: String, enum: ['weight', 'maintain', 'consistency'], required: true },
  startedAt: { type: Date, required: true },
  achievedAt: { type: Date },
  replacedAt: { type: Date },
  reachedTargetAt: { type: Date },
  baseline: {
    weightKg: { type: Number },
    date: { type: Date },
    daysPerWeek: { type: Number },
    prs: { type: [PRSchema], default: undefined },
  },
  target: {
    weightKg: { type: Number },
    direction: { type: String, enum: ['lose', 'maintain', 'gain'] },
    paceKgPerWeek: { type: Number },
    bandKg: { type: Number },
    daysPerWeek: { type: Number },
    programId: { type: String },
    lifts: { type: [LiftTargetSchema], default: undefined },
  },
  adherence: {
    logDaysPerWeek: { type: Number, default: 5 },
    proteinDaysPerWeek: { type: Number, default: 5 },
  },
  final: {
    weightKg: { type: Number },
    date: { type: Date },
    daysPerWeek: { type: Number },
  },
}, { timestamps: true })

// One ACTIVE goal per pillar per member.
GoalSchema.index({ userId: 1, pillar: 1, status: 1 })
GoalSchema.index(
  { userId: 1, pillar: 1 },
  { unique: true, partialFilterExpression: { status: 'active' } },
)

const Goal = mongoose.models.Goal || mongoose.model<IGoal>('Goal', GoalSchema)
export default Goal
