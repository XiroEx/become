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
  vision?: IVision
  chapterHistory: { chapter: number; unlockedAt: Date }[]
  selfDeclaredChapters: number[]  // chapters where user self-declared readiness (one per chapter)
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
    vision: { type: VisionSchema },
    chapterHistory: {
      type: [{ chapter: Number, unlockedAt: Date }],
      default: [],
      _id: false,
    },
    selfDeclaredChapters: { type: [Number], default: [] },
  },
  { timestamps: true }
)

const MindProgress: Model<IMindProgress> =
  mongoose.models.MindProgress ||
  mongoose.model<IMindProgress>('MindProgress', MindProgressSchema)

export default MindProgress
