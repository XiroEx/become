// The member's STORED lb/kg preference, read safely for the workout-save path
// (NP-209). `profile.weightUnit` carries no default any more (models/User.ts)
// so this answers `undefined` for "never asked" — callers that need a display
// value fall back to `?? 'lbs'` themselves; this function never does that
// substitution, so a caller that needs to know "did they actually choose"
// (stampWeightUnit.ts) can tell the difference.
//
// MUST NEVER THROW. `userId` here is a raw session/auth value, not always a
// real ObjectId — test fixtures (and in principle a stale/forged token) use
// ids like "replay-user", and `User.findById` on that casts with
// `CastError: Cast to ObjectId failed`, which took down the whole workout
// save path when this was first wired in (see the PR #1976 CI failure this
// file exists to fix). A bad/missing id degrades to "unknown" rather than
// 500ing a save that has nothing to do with weight units.
import mongoose from 'mongoose'
import User from '@/models/User'

export async function memberWeightUnit(
  userId: string | null | undefined,
): Promise<'lbs' | 'kg' | undefined> {
  try {
    if (!userId || typeof userId !== 'string' || !mongoose.Types.ObjectId.isValid(userId)) {
      return undefined
    }
    const user = await User.findById(userId)
      .select('profile.weightUnit')
      .lean<{ profile?: { weightUnit?: 'lbs' | 'kg' } } | null>()
    return user?.profile?.weightUnit
  } catch (err) {
    console.error('memberWeightUnit lookup failed:', err)
    return undefined
  }
}
