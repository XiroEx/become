import dbConnect from '@/lib/mongodb'
import UserProgress from '@/models/UserProgress'
import { STREAK_MILESTONES, MAX_FREEZES } from '@/lib/streakConstants'

export { STREAK_MILESTONES, MAX_FREEZES }

// Earn a freeze back at every 7-day streak milestone (7, 14, 21 ...)
const FREEZE_EARN_INTERVAL = 7

export interface StreakResult {
  streakDays: number
  longestStreak: number
  streakFreezes: number
  streakExtended: boolean   // true if this call pushed the streak forward
  freezeUsed: boolean       // true if a freeze was auto-consumed
  newMilestone: number | null  // set when a milestone was just crossed
  alreadyLoggedToday: boolean
}

function startOfDay(d: Date): Date {
  const r = new Date(d)
  r.setHours(0, 0, 0, 0)
  return r
}

function daysDiff(a: Date, b: Date): number {
  return Math.round((startOfDay(b).getTime() - startOfDay(a).getTime()) / 86_400_000)
}

/**
 * Records a streak-worthy activity for a user.
 * Safe to call multiple times per day — only counts once.
 *
 * @param userId  - MongoDB user ID string
 * @param email   - user email for milestone emails (optional, fire-and-forget)
 */
export async function recordStreakActivity(
  userId: string,
  email: string | undefined
): Promise<StreakResult> {
  await dbConnect()

  const progress = await UserProgress.findOne({ userId })

  const today = startOfDay(new Date())

  // Bootstrap if no progress doc yet
  if (!progress) {
    await UserProgress.create({
      userId,
      streakDays: 1,
      longestStreak: 1,
      lastActivityDate: today,
      streakFreezes: 1,
      milestonesReached: [],
    })
    // Check 1-day milestone (none yet, 3 is the first)
    return {
      streakDays: 1,
      longestStreak: 1,
      streakFreezes: 1,
      streakExtended: true,
      freezeUsed: false,
      newMilestone: null,
      alreadyLoggedToday: false,
    }
  }

  const lastActivity = progress.lastActivityDate
    ? startOfDay(new Date(progress.lastActivityDate))
    : null

  // Already logged today — no-op
  if (lastActivity && daysDiff(lastActivity, today) === 0) {
    return {
      streakDays: progress.streakDays,
      longestStreak: progress.longestStreak ?? progress.streakDays,
      streakFreezes: progress.streakFreezes ?? 1,
      streakExtended: false,
      freezeUsed: false,
      newMilestone: null,
      alreadyLoggedToday: true,
    }
  }

  const diff = lastActivity ? daysDiff(lastActivity, today) : 999
  let newStreak = progress.streakDays ?? 0
  let freezeUsed = false
  let freezes = progress.streakFreezes ?? 1

  if (diff === 1) {
    // Consecutive day — extend streak
    newStreak += 1
  } else if (diff === 2 && freezes > 0) {
    // Missed exactly one day — auto-apply freeze
    newStreak += 1
    freezes -= 1
    freezeUsed = true
  } else {
    // Gap too large or no freezes — reset
    newStreak = 1
  }

  // Award a freeze back at every FREEZE_EARN_INTERVAL streak days (max MAX_FREEZES)
  if (newStreak % FREEZE_EARN_INTERVAL === 0 && freezes < MAX_FREEZES) {
    freezes = Math.min(freezes + 1, MAX_FREEZES)
  }

  const longestStreak = Math.max(progress.longestStreak ?? 0, newStreak)

  // Check for a newly crossed milestone
  const alreadyReached = new Set<number>(progress.milestonesReached ?? [])
  const newMilestone = STREAK_MILESTONES.find(
    (m) => newStreak >= m && !alreadyReached.has(m)
  ) ?? null

  const updatedMilestones = newMilestone
    ? [...alreadyReached, newMilestone]
    : [...alreadyReached]

  await UserProgress.updateOne(
    { userId },
    {
      $set: {
        streakDays: newStreak,
        longestStreak,
        lastActivityDate: today,
        streakFreezes: freezes,
        milestonesReached: updatedMilestones,
      },
    }
  )

  // Send milestone email fire-and-forget
  if (newMilestone && email) {
    const lastEmailDate = progress.lastStreakEmailDate
      ? startOfDay(new Date(progress.lastStreakEmailDate))
      : null
    // Throttle: only 1 email per day max
    const emailedToday = lastEmailDate && daysDiff(lastEmailDate, today) === 0
    if (!emailedToday) {
      const confirmedEmail = email // capture for closure — already narrowed above
      import('@/lib/email')
        .then(({ sendStreakMilestoneEmail }) =>
          sendStreakMilestoneEmail(confirmedEmail!, newMilestone, newStreak)
        )
        .catch(() => {})
      UserProgress.updateOne({ userId }, { $set: { lastStreakEmailDate: today } }).catch(() => {})
    }
  }

  return {
    streakDays: newStreak,
    longestStreak,
    streakFreezes: freezes,
    streakExtended: true,
    freezeUsed,
    newMilestone,
    alreadyLoggedToday: false,
  }
}
