import { NextRequest, NextResponse } from 'next/server'
import dbConnect from '@/lib/mongodb'
import UserProgress from '@/models/UserProgress'
import Schedule from '@/models/Schedule'
import { sendPushToUser } from '@/lib/pushNotification'

// ── Helpers ──────────────────────────────────────────────────────────────────

function utcHour(date: Date) {
  return date.getUTCHours()
}

/** Returns the UTC calendar date string "YYYY-MM-DD" for comparison */
function utcDateKey(date: Date) {
  return date.toISOString().slice(0, 10)
}

function hoursSince(date: Date | null | undefined, now: Date): number {
  if (!date) return Infinity
  return (now.getTime() - new Date(date).getTime()) / (1000 * 60 * 60)
}

// ── Route ─────────────────────────────────────────────────────────────────────

export async function GET(request: NextRequest) {
  const secret =
    request.headers.get('x-cron-secret') ||
    request.nextUrl.searchParams.get('secret')

  if (!secret || secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  await dbConnect()

  const now = new Date()
  const hour = utcHour(now)
  const todayKey = utcDateKey(now)

  const results = {
    streakAtRisk: 0,
    workoutReminder: 0,
    reEngagement: 0,
    skippedByWindow: 0,
    errors: 0,
  }

  // ── 1. Streak at-risk (any hour — urgent) ─────────────────────────────────
  // lastActivityDate 23-47h ago means their streak expires within the next 24h.
  // Gate: skip if we already sent this notification within the last 20h (prevents
  // re-sending on consecutive hourly sweeps while still in the danger window).

  const atRiskCutoff = new Date(now.getTime() - 23 * 60 * 60 * 1000)
  const atRiskExpiry = new Date(now.getTime() - 47 * 60 * 60 * 1000)
  const streakRateLimitCutoff = new Date(now.getTime() - 20 * 60 * 60 * 1000)

  const atRiskUsers = await UserProgress.find({
    streakDays: { $gte: 1 },
    lastActivityDate: { $gte: atRiskExpiry, $lte: atRiskCutoff },
    'notificationPrefs.streakAtRisk': { $ne: false },
    $or: [
      { 'lastPushSentAt.streakAtRisk': { $exists: false } },
      { 'lastPushSentAt.streakAtRisk': null },
      { 'lastPushSentAt.streakAtRisk': { $lte: streakRateLimitCutoff } },
    ],
  }).select('userId streakDays').lean()

  for (const u of atRiskUsers) {
    try {
      await sendPushToUser(String(u.userId), {
        title: `Don't break your ${u.streakDays}-day streak 🔥`,
        body: 'Log a workout, mood, or weight to keep it alive.',
        url: '/dashboard',
        tag: 'streak-at-risk',
      })
      UserProgress.updateOne(
        { userId: u.userId },
        { $set: { 'lastPushSentAt.streakAtRisk': now } },
      ).catch(() => {})
      results.streakAtRisk++
    } catch {
      results.errors++
    }
  }

  // ── 2. Workout reminder (7am–1pm UTC only) ────────────────────────────────
  // Only runs during a reasonable morning window so reminders don't arrive at
  // midnight. Gate: one reminder per UTC calendar day per user.

  if (hour >= 7 && hour < 13) {
    const todayStart = new Date(now)
    todayStart.setUTCHours(0, 0, 0, 0)
    const todayEnd = new Date(now)
    todayEnd.setUTCHours(23, 59, 59, 999)

    const schedulesWithToday = await Schedule.find({
      scheduledWorkouts: {
        $elemMatch: {
          date: { $gte: todayStart, $lte: todayEnd },
          status: 'scheduled',
        },
      },
    }).select('userId scheduledWorkouts').lean()

    if (schedulesWithToday.length > 0) {
      // Bulk-fetch progress for all matched users (avoid N+1)
      const userIds = schedulesWithToday.map((s) => s.userId)
      const progressDocs = await UserProgress.find({ userId: { $in: userIds } })
        .select('userId notificationPrefs lastPushSentAt')
        .lean()

      const progressByUserId = new Map(
        progressDocs.map((p) => [String(p.userId), p]),
      )

      for (const sched of schedulesWithToday) {
        const progress = progressByUserId.get(String(sched.userId))

        // Respect opt-out
        if (progress?.notificationPrefs?.workoutReminder === false) continue

        // Skip if already sent today
        const lastSent = progress?.lastPushSentAt?.workoutReminder
        if (lastSent && utcDateKey(new Date(lastSent)) === todayKey) continue

        const todayWorkout = (sched.scheduledWorkouts as Array<{
          date: Date; status: string; dayLabel?: string; workoutTitle?: string
        }>).find((w) => {
          const d = new Date(w.date)
          return d >= todayStart && d <= todayEnd && w.status === 'scheduled'
        })
        if (!todayWorkout) continue

        try {
          await sendPushToUser(String(sched.userId), {
            title: "Today's workout is ready 💪",
            body: todayWorkout.workoutTitle || todayWorkout.dayLabel || 'Tap to start your session.',
            url: '/dashboard/calendar',
            tag: 'workout-reminder',
          })
          UserProgress.updateOne(
            { userId: sched.userId },
            { $set: { 'lastPushSentAt.workoutReminder': now } },
          ).catch(() => {})
          results.workoutReminder++
        } catch {
          results.errors++
        }
      }
    }
  } else {
    results.skippedByWindow++
  }

  // ── 3. Re-engagement (12pm–6pm UTC, 7-day rate limit) ────────────────────
  // Targets users with no streak who've been inactive 3+ days.
  // Only sends during afternoon UTC so it hits a reasonable time globally.

  if (hour >= 12 && hour < 18) {
    const reEngageCutoff = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000)
    const reEngageRateLimit = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)

    const lapsedUsers = await UserProgress.find({
      streakDays: 0,
      'notificationPrefs.reEngagement': { $ne: false },
      $and: [
        {
          $or: [
            { lastActivityDate: { $exists: false } },
            { lastActivityDate: { $lte: reEngageCutoff } },
          ],
        },
        {
          $or: [
            { 'lastPushSentAt.reEngagement': { $exists: false } },
            { 'lastPushSentAt.reEngagement': null },
            { 'lastPushSentAt.reEngagement': { $lte: reEngageRateLimit } },
          ],
        },
      ],
    }).select('userId').lean()

    for (const u of lapsedUsers) {
      try {
        await sendPushToUser(String(u.userId), {
          title: 'We miss you 👋',
          body: 'Come back and keep building your best self.',
          url: '/dashboard',
          tag: 're-engagement',
        })
        UserProgress.updateOne(
          { userId: u.userId },
          { $set: { 'lastPushSentAt.reEngagement': now } },
        ).catch(() => {})
        results.reEngagement++
      } catch {
        results.errors++
      }
    }
  } else {
    results.skippedByWindow++
  }

  return NextResponse.json({ success: true, hour, ...results })
}
