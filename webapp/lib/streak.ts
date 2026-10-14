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

export interface StreakAliveInput {
  lastActivityDate: Date | string | null | undefined
  streakFreezes: number
}

/**
 * Does a stored streak survive to the member's NEXT log — i.e. would the next
 * activity extend it (or have a freeze auto-save it), rather than resetting
 * it to 1?
 *
 * This is the SAME day-math (`startOfDay` + `daysDiff`) recordStreakActivity
 * uses to decide a streak's fate, so the write path and every read path share
 * one definition and can never drift apart:
 *   diff === 0 → already logged today, alive (as stored)
 *   diff === 1 → next log extends it, alive
 *   diff === 2 and a freeze is in hand → next log auto-applies a freeze, alive
 *   anything else (including no activity on record at all) → the next log
 *     would reset it to 1 — the stored number is already dead
 *
 * `today` defaults to "now". A caller reading on behalf of a specific member
 * timezone (GET /api/streak) should pass `today` shifted by that caller's tz
 * offset — the same shift `localDateKey` in lib/dayWindow.ts uses — so the
 * day boundary lines up with the caller's own calendar day rather than the
 * server's.
 */
export function isStreakAlive(
  { lastActivityDate, streakFreezes }: StreakAliveInput,
  today: Date = new Date()
): boolean {
  if (!lastActivityDate) return false
  const diff = daysDiff(startOfDay(new Date(lastActivityDate)), startOfDay(today))
  if (diff === 0 || diff === 1) return true
  return diff === 2 && streakFreezes > 0
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

  if (!isStreakAlive({ lastActivityDate: lastActivity, streakFreezes: freezes }, today)) {
    // Gap too large or no freezes — reset. isStreakAlive is the same
    // decision GET /api/streak reads, so the two can never drift.
    newStreak = 1
  } else if (diff === 2) {
    // Missed exactly one day — isStreakAlive only agreed this is alive
    // because a freeze is in hand, so auto-apply it.
    newStreak += 1
    freezes -= 1
    freezeUsed = true
  } else {
    // Consecutive day — extend streak
    newStreak += 1
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

  // Fire-and-forget push when a freeze just got consumed so the user
  // understands the missed day didn't break their streak.
  if (freezeUsed) {
    import('@/lib/pushNotification')
      .then(({ sendPushToUser }) =>
        sendPushToUser(userId, {
          title: 'Streak freeze used ❄',
          body:
            freezes > 0
              ? `Yesterday slipped — your freeze saved your ${newStreak}-day streak. ${freezes} freeze${freezes === 1 ? '' : 's'} left.`
              : `Yesterday slipped — your last freeze saved your ${newStreak}-day streak. Earn another at every 7-day milestone.`,
          url: '/dashboard',
          tag: 'streak-freeze-used',
        }),
      )
      .catch(() => {})
  }

  // Send milestone email fire-and-forget
  if (newMilestone && email) {
    const lastEmailDate = progress.lastStreakEmailDate
      ? startOfDay(new Date(progress.lastStreakEmailDate))
      : null
    // Throttle: only 1 email per day max
    const emailedToday = lastEmailDate && daysDiff(lastEmailDate, today) === 0
    if (!emailedToday) {
      const confirmedEmail = email // capture for closure — already narrowed above
      // Engagement mail honours the opt-out (the unsubscribe link in every
      // such email, and the Settings toggle). Absent = on. Read at send time,
      // not from a cached user, so an unsubscribe takes effect immediately.
      Promise.all([import('@/lib/email'), import('@/models/User')])
        .then(async ([{ sendStreakMilestoneEmail }, { default: User }]) => {
          const row = await User.findById(userId)
            .select('emailPreferences')
            .lean<{ emailPreferences?: { engagement?: boolean } } | null>()
          if (row?.emailPreferences?.engagement === false) return
          await sendStreakMilestoneEmail(confirmedEmail!, newMilestone, newStreak, userId)
        })
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
