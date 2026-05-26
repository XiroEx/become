import { NextRequest, NextResponse } from 'next/server'
import dbConnect from '@/lib/mongodb'
import UserProgress from '@/models/UserProgress'
import Schedule from '@/models/Schedule'
import { sendPushToUser } from '@/lib/pushNotification'

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Returns the UTC calendar date string "YYYY-MM-DD" for comparison */
function utcDateKey(date: Date) {
  return date.toISOString().slice(0, 10)
}

/**
 * Convert a UTC time to the user's local hour given their stored offset.
 * `tzOffsetMinutes` matches Date.getTimezoneOffset(): positive when local is
 * BEHIND UTC (e.g. 300 for EST). Defaults to UTC when offset is unknown.
 */
function localHourForUser(now: Date, tzOffsetMinutes: number | undefined): number {
  const offset = Number.isFinite(tzOffsetMinutes as number) ? (tzOffsetMinutes as number) : 0
  const utcMs = now.getTime()
  const localMs = utcMs - offset * 60 * 1000
  return new Date(localMs).getUTCHours()
}

/** Local-date key (YYYY-MM-DD) for a user given their stored offset. */
function localDateKeyForUser(now: Date, tzOffsetMinutes: number | undefined): string {
  const offset = Number.isFinite(tzOffsetMinutes as number) ? (tzOffsetMinutes as number) : 0
  const localMs = now.getTime() - offset * 60 * 1000
  return new Date(localMs).toISOString().slice(0, 10)
}

// Local-hour windows (in user's local time)
const WORKOUT_REMINDER_START_HOUR = 7   // 7am local
const WORKOUT_REMINDER_END_HOUR = 11    // up to 10:59am local
const REENGAGEMENT_START_HOUR = 12      // 12pm local
const REENGAGEMENT_END_HOUR = 18        // up to 5:59pm local

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

  const results = {
    streakAtRisk: 0,
    workoutReminder: 0,
    reEngagement: 0,
    missedSlotsSynced: 0,
    skippedByWindow: 0,
    errors: 0,
  }

  // ── 0. Mark past-scheduled slots as missed in the DB ─────────────────────
  // Slot dates are stored as UTC midnight of the user's local day, so a slot
  // dated 2026-05-22T00:00Z represents local day 2026-05-22 for that user.
  // For the westernmost timezone (UTC-12), local 2026-05-22 ends at
  // 2026-05-23T12:00Z. A 48h cutoff is safe across every timezone — any slot
  // dated >48h ago is definitively in the past for the user, so flip it from
  // 'scheduled' to 'missed' so completion-rollup queries see consistent data
  // instead of relying on client-side display logic alone.
  const missedCutoff = new Date(now.getTime() - 48 * 60 * 60 * 1000)
  try {
    const missedSync = await Schedule.updateMany(
      { 'scheduledWorkouts': { $elemMatch: { status: 'scheduled', date: { $lt: missedCutoff } } } },
      { $set: { 'scheduledWorkouts.$[elem].status': 'missed' } },
      { arrayFilters: [{ 'elem.status': 'scheduled', 'elem.date': { $lt: missedCutoff } }] },
    )
    results.missedSlotsSynced = missedSync.modifiedCount ?? 0
  } catch (err) {
    console.error('missed-slot sync failed:', err)
    results.errors++
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

  // ── 2. Workout reminder (7am–11am LOCAL per user) ─────────────────────────
  // Cron runs hourly; for each user we compute their local hour from their
  // stored timezoneOffset and only send if it's morning for them. Users with
  // no captured tz default to UTC, preserving prior behavior.
  // Gate: one reminder per user per LOCAL calendar day.
  //
  // Find any user with a workout scheduled across a wide UTC window (covers
  // every timezone), then per-user filter to "today in their local time".
  const wideStart = new Date(now.getTime() - 36 * 60 * 60 * 1000)
  const wideEnd = new Date(now.getTime() + 36 * 60 * 60 * 1000)

  const schedulesWithRecent = await Schedule.find({
    scheduledWorkouts: {
      $elemMatch: {
        date: { $gte: wideStart, $lte: wideEnd },
        status: 'scheduled',
      },
    },
  }).select('userId scheduledWorkouts').lean()

  if (schedulesWithRecent.length > 0) {
    const userIds = schedulesWithRecent.map((s) => s.userId)
    const progressDocs = await UserProgress.find({ userId: { $in: userIds } })
      .select('userId notificationPrefs lastPushSentAt timezoneOffset')
      .lean()

    const progressByUserId = new Map(
      progressDocs.map((p) => [String(p.userId), p]),
    )

    for (const sched of schedulesWithRecent) {
      const progress = progressByUserId.get(String(sched.userId))

      if (progress?.notificationPrefs?.workoutReminder === false) continue

      const userLocalHour = localHourForUser(now, progress?.timezoneOffset)
      if (userLocalHour < WORKOUT_REMINDER_START_HOUR || userLocalHour > WORKOUT_REMINDER_END_HOUR) {
        continue
      }

      const userLocalDateKey = localDateKeyForUser(now, progress?.timezoneOffset)
      const lastSent = progress?.lastPushSentAt?.workoutReminder
      if (lastSent && localDateKeyForUser(new Date(lastSent), progress?.timezoneOffset) === userLocalDateKey) {
        continue
      }

      // Find the workout scheduled for the user's local today. Each slot's
      // date field is UTC midnight of the local day, so compare date keys.
      const todayWorkout = (sched.scheduledWorkouts as Array<{
        date: Date; status: string; dayLabel?: string; workoutTitle?: string
      }>).find((w) => {
        if (w.status !== 'scheduled') return false
        return localDateKeyForUser(new Date(w.date), progress?.timezoneOffset) === userLocalDateKey
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

  // ── 3. Re-engagement (12pm–5:59pm LOCAL per user, 7-day rate limit) ──────
  // Same per-user local-hour gating as workout reminder.
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
  }).select('userId timezoneOffset').lean()

  for (const u of lapsedUsers) {
    const userLocalHour = localHourForUser(now, u.timezoneOffset)
    if (userLocalHour < REENGAGEMENT_START_HOUR || userLocalHour > REENGAGEMENT_END_HOUR) {
      results.skippedByWindow++
      continue
    }
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

  return NextResponse.json({ success: true, ...results })
}
