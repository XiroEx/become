// StreakCredit — an admin-granted "this day counts" for one pillar.
//
// Pillar streaks (workout / nutrition / mindset, and super which is derived
// from them) are computed from the member's real logs. When the app was down,
// or a coach wants to honour a streak, an admin credits specific days for
// specific pillars; the computation unions credits into the real activity.
// Every credit records who granted it and why, and can be removed.
//
// The OVERALL day streak is a stored counter (UserProgress.streakDays); it is
// adjusted directly by /api/admin/streaks and audited here with kind 'overall'.

import mongoose, { Schema, Document, Types } from 'mongoose'

export type CreditPillar = 'workout' | 'nutrition' | 'mindset'
export const CREDIT_PILLARS: CreditPillar[] = ['workout', 'nutrition', 'mindset']

export interface IStreakCredit extends Document {
  userId: Types.ObjectId
  kind: 'credit' | 'overall'
  /** For kind 'credit'. */
  pillar?: CreditPillar
  /** YYYY-MM-DD in the member's local zone (the day being credited, or the day of an overall adjustment). */
  dayKey: string
  reason: string
  createdBy: string
  /** For kind 'overall': what changed. */
  meta?: Record<string, unknown>
  createdAt: Date
}

const StreakCreditSchema = new Schema<IStreakCredit>({
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  kind: { type: String, enum: ['credit', 'overall'], default: 'credit', required: true },
  pillar: { type: String, enum: CREDIT_PILLARS },
  dayKey: { type: String, required: true },
  reason: { type: String, default: '' },
  createdBy: { type: String, default: '' },
  meta: { type: Schema.Types.Mixed },
  createdAt: { type: Date, default: Date.now },
})

// One credit per (user, pillar, day) — re-crediting is a no-op, not a duplicate.
StreakCreditSchema.index(
  { userId: 1, pillar: 1, dayKey: 1 },
  { unique: true, partialFilterExpression: { kind: 'credit' } },
)

const StreakCredit =
  mongoose.models.StreakCredit || mongoose.model<IStreakCredit>('StreakCredit', StreakCreditSchema)

export default StreakCredit
