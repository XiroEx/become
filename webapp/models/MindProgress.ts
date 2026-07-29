import mongoose, { Schema, Document, Model, Types } from 'mongoose'

export interface IVisionAlignmentEntry {
  date: string  // YYYY-MM-DD
  score: number // 1–5
}

export interface IVision {
  habits: string
  mind: string
  body: string
  relationships: string
  environment: string
  identityStatement: string
  completedAt?: Date
  updatedAt?: Date
  alignmentHistory: IVisionAlignmentEntry[]
}

export interface IMindProgress extends Document {
  userId: Types.ObjectId
  chapter: 1 | 2 | 3 | 4 | 5
  xp: number
  /** Lifetime "Becoming score" — accrues from EVERY completed session (incl.
   *  training reps after the daily progression XP is spent). Never decreases.
   *  The grinder's reward + the score the Becoming tab surfaces. */
  xpBank: number
  /** Cumulative XP from ALL mind activity (main sessions + arsenal training) —
   *  drives the user's LEVEL (uncapped). Separate from `xp` (legacy progression)
   *  and from `chapter`. Seeded from xp+xpBank for pre-existing users. */
  levelXp: number
  /** Count of completed MAIN sessions — gates chapters (10 per chapter). */
  mainSessionCount: number
  /** True once the one-time evolutionScore → xp seeding has been considered.
   *  Without this the seeding re-fired every time `xp` hit 0, which meant an
   *  admin reset was partly undone on the very next page load (xp came back,
   *  levelXp was re-derived from it, and the level climbed off 1 again). */
  xpSeeded?: boolean
  /** When the last MAIN session was completed — enforces the 20h cooldown so a
   *  main session (and its chapter progress) can only happen once every 20h. */
  lastMainSessionAt?: Date
  /** Tools whose one-time onboarding intro the user has completed. A tool can be
   *  UNLOCKED (chapter) but not yet INTRODUCED — the intro flow runs on first
   *  open. Legacy docs (field absent) are grandfathered to their unlocked set. */
  introducedSystems?: string[]
  /** When the last growth moment (chapter level-up) happened — gates progression
   *  to at most one growth moment per local day, so volume can't rush the arc. */
  lastGrowthAt?: Date
  vision?: IVision
  chapterHistory: { chapter: number; unlockedAt: Date }[]
  selfDeclaredChapters: number[]  // chapters where user self-declared readiness (one per chapter)
  /** Last time a session actually ran a breath move — used to SPACE breath out so
   *  back-to-back sessions don't repeat it. */
  lastBreathAt?: Date
  /** Effective move kinds from the most recent session — used to avoid repeating
   *  the same modalities on a subsequent session in the same window. */
  recentKinds?: string[]
  createdAt: Date
  updatedAt: Date
}

const VisionAlignmentSchema = new Schema<IVisionAlignmentEntry>(
  {
    date: { type: String, required: true },
    score: { type: Number, required: true, min: 1, max: 5 },
  },
  { _id: false }
)

const VisionSchema = new Schema<IVision>(
  {
    habits: { type: String, maxlength: 1000 },
    mind: { type: String, maxlength: 1000 },
    body: { type: String, maxlength: 1000 },
    relationships: { type: String, maxlength: 1000 },
    environment: { type: String, maxlength: 1000 },
    identityStatement: { type: String, maxlength: 500 },
    completedAt: { type: Date },
    updatedAt: { type: Date },
    alignmentHistory: { type: [VisionAlignmentSchema], default: [] },
  },
  { _id: false }
)

const MindProgressSchema = new Schema<IMindProgress>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
    chapter: { type: Number, default: 1, min: 1, max: 5 },
    xp: { type: Number, default: 0, min: 0 },
    xpBank: { type: Number, default: 0, min: 0 },
    levelXp: { type: Number, default: 0, min: 0 },
    mainSessionCount: { type: Number, default: 0, min: 0 },
    xpSeeded: { type: Boolean },
    lastMainSessionAt: { type: Date },
    introducedSystems: { type: [String], default: undefined },
    lastGrowthAt: { type: Date },
    vision: { type: VisionSchema },
    chapterHistory: {
      type: [{ chapter: Number, unlockedAt: Date }],
      default: [],
      _id: false,
    },
    selfDeclaredChapters: { type: [Number], default: [] },
    lastBreathAt: { type: Date },
    recentKinds: { type: [String], default: [] },
  },
  { timestamps: true }
)

const MindProgress: Model<IMindProgress> =
  mongoose.models.MindProgress ||
  mongoose.model<IMindProgress>('MindProgress', MindProgressSchema)

export default MindProgress
