import { NextRequest, NextResponse } from 'next/server'
import dbConnect from '@/lib/mongodb'
import UserProgress from '@/models/UserProgress'
import Schedule from '@/models/Schedule'
import User from '@/models/User'
import { sendPushToUser } from '@/lib/pushNotification'

export async function GET(request: NextRequest) {
  // Verify cron secret
  const secret = request.headers.get('x-cron-secret') ||
    request.nextUrl.searchParams.get('secret')

  if (!secret || secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  await dbConnect()

  const now = new Date()
  const results = { streakAtRisk: 0, workoutReminder: 0, errors: 0 }

  // ── 1. Streak at-risk ──────────────────────────────────────────────────────
  // Users with an active streak (≥1 day) whose lastActivityDate is 23-47h ago
  const atRiskCutoff = new Date(now.getTime() - 23 * 60 * 60 * 1000)
  const atRiskExpiry = new Date(now.getTime() - 47 * 60 * 60 * 1000)

  const atRiskUsers = await UserProgress.find({
    streakDays: { $gte: 1 },
    lastActivityDate: { $gte: atRiskExpiry, $lte: atRiskCutoff },
    'notificationPrefs.streakAtRisk': { $ne: false },
  }).select('userId streakDays').lean()

  for (const u of atRiskUsers) {
    try {
      await sendPushToUser(String(u.userId), {
        title: `Don't break your ${u.streakDays}-day streak 🔥`,
        body: 'Log a workout, mood, or weight to keep it alive.',
        url: '/dashboard',
        tag: 'streak-at-risk',
      })
      results.streakAtRisk++
    } catch {
      results.errors++
    }
  }

  // ── 2. Workout reminder ────────────────────────────────────────────────────
  // Users with a workout scheduled today that's still 'scheduled'
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

  for (const sched of schedulesWithToday) {
    // Find the opt-out preference
    const progress = await UserProgress.findOne({ userId: sched.userId })
      .select('notificationPrefs').lean()

    if (progress?.notificationPrefs?.workoutReminder === false) continue

    // Find the actual workout title
    const todayWorkout = sched.scheduledWorkouts.find((w: { date: Date; status: string; dayLabel?: string; workoutTitle?: string }) => {
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
      results.workoutReminder++
    } catch {
      results.errors++
    }
  }

  // ── 3. Re-engagement (3+ days inactive with a streak of 0) ───────────────
  // Deliberately kept separate from streak-at-risk — this targets lapsed users
  const reEngageCutoff = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000)

  const lapsedUsers = await UserProgress.find({
    streakDays: 0,
    lastActivityDate: { $lte: reEngageCutoff },
    'notificationPrefs.reEngagement': { $ne: false },
  }).select('userId').lean()

  // Only send re-engagement if user has at least a push subscription
  // (sendPushToUser handles missing subs gracefully)
  for (const u of lapsedUsers) {
    // Rate-limit: check User model for last re-engagement send to avoid daily spam
    const user = await User.findById(u.userId).select('lastReEngagePushAt').lean()
    const lastSent = user?.lastReEngagePushAt ? new Date(user.lastReEngagePushAt) : null
    if (lastSent && now.getTime() - lastSent.getTime() < 7 * 24 * 60 * 60 * 1000) continue

    try {
      await sendPushToUser(String(u.userId), {
        title: "We miss you 👋",
        body: "Come back and keep building your best self.",
        url: '/dashboard',
        tag: 're-engagement',
      })
      // Record send time (fire-and-forget, no critical path)
      User.updateOne({ _id: u.userId }, { $set: { lastReEngagePushAt: now } }).catch(() => {})
    } catch {
      results.errors++
    }
  }

  return NextResponse.json({ success: true, ...results })
}
