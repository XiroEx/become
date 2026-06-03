// Become → redReward stats snapshot builder (Phase B2; wired into events in B4).
//
// evaluate(userId, stats) takes the FULL current stats snapshot (not deltas) —
// it's idempotent, so it's safe to rebuild and pass the whole snapshot on every
// key event (workout logged, mind session completed, streak tick, chapter level-up).
//
// Canonical stat keys (spec §3 / plan §3): streakDays, totalWorkouts,
// workoutsLogged, chapter, xp, mindSessions. These map 1:1 to the achievement
// criteria in lib/reward/achievements.ts. Add keys here as new signals come online
// (e.g. visionComplete) — a missing stat just keeps its criterion false, never errors.
//
// SERVER-ONLY: reads Become's mongoose models. Callers must `await dbConnect()` first.

import type { StatsObject } from '@redbtn/redreward/types'
import UserProgress from '@/models/UserProgress'
import MindProgress from '@/models/MindProgress'
import MindSession from '@/models/MindSession'

/**
 * Build the canonical Become stats snapshot for a user. Pass the result straight
 * to getRedReward().evaluate(userId, stats). `userId` is the verifyAuth string id
 * (mongoose casts it to ObjectId for the `userId` model fields).
 */
export async function buildStats(userId: string): Promise<StatsObject> {
  const [up, mp, mindSessions] = await Promise.all([
    UserProgress.findOne({ userId }).lean(),
    MindProgress.findOne({ userId }).lean(),
    MindSession.countDocuments({ userId }),
  ])

  return {
    streakDays: up?.streakDays ?? 0,
    totalWorkouts: up?.totalWorkouts ?? 0,
    workoutsLogged: up?.workoutLogs?.length ?? 0,
    chapter: mp?.chapter ?? 1,
    xp: mp?.xp ?? 0,
    mindSessions,
  }
}
