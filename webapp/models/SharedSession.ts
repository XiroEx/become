import mongoose, { Schema, Types } from 'mongoose'

// ---------------------------------------------------------------------------
// SharedSession — a public, read-only SNAPSHOT of one or more Mind sessions,
// addressable by an unguessable `token`. Mind sessions are composed at runtime
// (lib/mind/composeSession) rather than stored, so a share captures the exact
// composed plan(s) so the recipient sees what the sender saw.
//
//   kind: 'session'  → a single one-off / generated session (1 entry)
//   kind: 'program'  → an ordered bundle of sessions (N entries)
//
// The public viewer renders these via SessionPlayer in gated mode (no writes;
// any interaction prompts login). The stored `plan` mirrors MindSessionPlan
// from lib/mind/moves; kept as Mixed so the snapshot is decoupled from the
// runtime type and survives future Move-shape changes.
// ---------------------------------------------------------------------------

export interface ISharedSessionEntry {
  title?: string
  // Snapshot of a MindSessionPlan ({ intro, moves[], rewardXp }).
  plan: unknown
}

export interface ISharedSession {
  _id?: Types.ObjectId
  token: string
  owner: Types.ObjectId
  ownerName?: string
  kind: 'session' | 'program'
  title: string
  description?: string
  sessions: ISharedSessionEntry[]
  /** When the source was a themed/system session (lib/mind THEME_CONFIG). */
  sourceSystemId?: string
  /** Optional link back to a workout Program when shared from one. */
  programId?: Types.ObjectId
  viewCount: number
  createdAt?: Date
  updatedAt?: Date
}

const EntrySchema = new Schema<ISharedSessionEntry>({
  title: { type: String },
  plan: { type: Schema.Types.Mixed, required: true },
}, { _id: false })

const SharedSessionSchema = new Schema<ISharedSession>({
  token: { type: String, required: true, unique: true, index: true },
  owner: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  ownerName: { type: String },
  kind: { type: String, enum: ['session', 'program'], required: true, default: 'session' },
  title: { type: String, required: true },
  description: { type: String },
  sessions: {
    type: [EntrySchema],
    required: true,
    validate: { validator: (a: ISharedSessionEntry[]) => Array.isArray(a) && a.length > 0, message: 'At least one session is required' },
  },
  sourceSystemId: { type: String },
  programId: { type: Schema.Types.ObjectId, ref: 'Program' },
  viewCount: { type: Number, default: 0 },
}, { timestamps: true })

export default mongoose.models.SharedSession || mongoose.model<ISharedSession>('SharedSession', SharedSessionSchema)
