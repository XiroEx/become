import mongoose, { Schema, Document, Model, Types } from 'mongoose'

// MindJournal — every interactive completion in the Mind system dashboards
// writes one of these: guided-protocol runs, fear-breakdown answers (real
// journaling), pattern-catches. The substrate for track-record feeds, the
// Becoming evidence wall, and AI-engine grounding.

export interface IMindJournalEntryLine {
  prompt: string
  answer: string
}

export interface IMindJournal extends Document {
  userId: Types.ObjectId
  /** System id: 'anti-sabotage' | 'discipline' | ... */
  system: string
  /** 'protocol' (guided run) | 'fear-breakdown' (journaled answers) | 'pattern-catch' */
  kind: string
  title: string
  lines: IMindJournalEntryLine[]
  createdAt: Date
}

const MindJournalSchema = new Schema<IMindJournal>({
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  system: { type: String, required: true },
  kind: { type: String, required: true },
  title: { type: String, required: true, maxlength: 200 },
  lines: {
    type: [new Schema<IMindJournalEntryLine>({
      prompt: { type: String, maxlength: 500 },
      answer: { type: String, maxlength: 2000 },
    }, { _id: false })],
    default: [],
  },
  createdAt: { type: Date, default: Date.now },
})

MindJournalSchema.index({ userId: 1, system: 1, createdAt: -1 })

const MindJournal: Model<IMindJournal> =
  mongoose.models.MindJournal || mongoose.model<IMindJournal>('MindJournal', MindJournalSchema)

export default MindJournal
