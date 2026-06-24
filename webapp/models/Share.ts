import mongoose, { Schema, Types } from 'mongoose'

// ---------------------------------------------------------------------------
// Share — a public, read-only SNAPSHOT of a workout program, a single program
// workout, or a one-off / generated session. Self-contained (exercises already
// hydrated) so the public share page needs no auth and no coupling to the
// owner's live data. Any interaction on the public page prompts login.
// ---------------------------------------------------------------------------

export type ShareKind = 'program' | 'workout' | 'session'

export interface IShare {
  _id?: Types.ObjectId
  shareId: string            // public, url-safe token
  kind: ShareKind
  ownerId: Types.ObjectId
  ownerName?: string         // "Shared by <name>" on the public page
  title: string
  subtitle?: string
  // Frozen snapshot. For kind='program': { program }. For 'workout'/'session':
  // { workout }. Stored loosely (Mixed) — it's a denormalized copy, never queried.
  payload: Record<string, unknown>
  // When the share originates from a real Program, its id — lets a logged-in
  // recipient jump to / start the live program after signing in.
  sourceProgramId?: string
  views: number
  createdAt?: Date
  updatedAt?: Date
}

const ShareSchema = new Schema<IShare>({
  shareId: { type: String, required: true, unique: true, index: true },
  kind: { type: String, required: true, enum: ['program', 'workout', 'session'] },
  ownerId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  ownerName: { type: String },
  title: { type: String, required: true },
  subtitle: { type: String },
  payload: { type: Schema.Types.Mixed, required: true },
  sourceProgramId: { type: String },
  views: { type: Number, default: 0 },
}, { timestamps: true })

export default mongoose.models.Share || mongoose.model<IShare>('Share', ShareSchema)
