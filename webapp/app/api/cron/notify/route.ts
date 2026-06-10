import { NextRequest, NextResponse } from 'next/server'
import dbConnect from '@/lib/mongodb'
import UserProgress from '@/models/UserProgress'
import Schedule from '@/models/Schedule'
import ProgramModel from '@/models/Program'
import { sendPushToUser } from '@/lib/pushNotification'
import {
  REENGAGEMENT_END_HOUR,
  REENGAGEMENT_START_HOUR,
  WORKOUT_REMINDER_END_HOUR,
  WORKOUT_REMINDER_START_HOUR,
  WORKOUT_SCHEDULE_SELECT,
  isActiveProgramForSchedule,
  localDateKeyForUser,
  localHourForUser,
  workoutTitleForDay,
} from '@/lib/notifications/cronNotify'

// ── Helpers ──────────────────────────────────────────────────────────────────

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
  // no captured timezone are skipped until the client records an offset.
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
  }).select(WORKOUT_SCHEDULE_SELECT).lean()

  if (schedulesWithRecent.length > 0) {
    const userIds = schedulesWithRecent.map((s) => s.userId)
    const progressDocs = await UserProgress.find({ userId: { $in: userIds } })
      .select('userId notificationPrefs lastPushSentAt timezoneOffset activePrograms')
      .lean()

    const progressByUserId = new Map(
      progressDocs.map((p) => [String(p.userId), p]),
    )

    // Aggregate per USER (not per schedule): a user with two active programs
    // should get ONE reminder for the workout they'd actually do next, picked
    // the SAME way the dashboard does (earliest upcoming scheduled slot) — not
    // one push per schedule, and not a stale program's slot.
    type SlotCand = { date: Date; phase?: number; dayLabel?: string; workoutTitle?: string; programId?: string }
    const userSlots = new Map<string, SlotCand[]>()
    for (const sched of schedulesWithRecent) {
      const progress = progressByUserId.get(String(sched.userId))
      if (progress?.notificationPrefs?.workoutReminder === false) continue
      // Only the user's actively-running programs — a paused/abandoned split
      // still carries scheduled slots and must not drive reminders.
      if (!isActiveProgramForSchedule(progress?.activePrograms, sched.programId)) continue
      const arr = userSlots.get(String(sched.userId)) ?? []
      for (const w of sched.scheduledWorkouts as Array<{
        date: Date; status: string; phase?: number; dayLabel?: string; workoutTitle?: string
      }>) {
        if (w.status !== 'scheduled') continue
        arr.push({ date: new Date(w.date), phase: w.phase, dayLabel: w.dayLabel, workoutTitle: w.workoutTitle, programId: sched.programId })
      }
      userSlots.set(String(sched.userId), arr)
    }

    // Cache program lookups (live definition → accurate day title).
    const programCache = new Map<string, { phases?: unknown[] } | null>()
    const getProgram = async (pid?: string) => {
      if (!pid) return null
      if (programCache.has(pid)) return programCache.get(pid) ?? null
      const p = await ProgramModel.findOne({ program_id: pid })
        .select('phases')
        .lean<{ phases?: unknown[] } | null>()
      programCache.set(pid, p)
      return p
    }

    for (const [userId, slots] of userSlots) {
      const progress = progressByUserId.get(userId)

      // Skip when we don't know the user's timezone — otherwise the UTC
      // fallback fires reminders in the small hours of their local day.
      const userLocalHour = localHourForUser(now, progress?.timezoneOffset)
      if (userLocalHour === null) continue
      if (userLocalHour < WORKOUT_REMINDER_START_HOUR || userLocalHour > WORKOUT_REMINDER_END_HOUR) continue

      const userLocalDateKey = localDateKeyForUser(now, progress?.timezoneOffset)
      const lastSent = progress?.lastPushSentAt?.workoutReminder
      if (lastSent && localDateKeyForUser(new Date(lastSent), progress?.timezoneOffset) === userLocalDateKey) {
        continue
      }

      // The next upcoming scheduled workout (earliest slot with local-date-key
      // >= today). Each slot's date is UTC midnight of its local day.
      const upcoming = slots
        .map((s) => ({ ...s, key: localDateKeyForUser(new Date(s.date), progress?.timezoneOffset) }))
        .filter((s) => s.key >= userLocalDateKey)
        .sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : a.date.getTime() - b.date.getTime()))
      const best = upcoming[0]
      // Only send the "today's workout is ready" push when the next one IS today.
      if (!best || best.key !== userLocalDateKey) continue

      // Resolve the title from the LIVE program (the slot's cached title can be
      // stale after a program edit — this is the "wrong workout name" bug).
      const program = await getProgram(best.programId)
      const liveTitle = program ? workoutTitleForDay(program.phases ?? [], best.phase ?? 1, best.dayLabel ?? '') : null
      const titleText = liveTitle || best.workoutTitle || best.dayLabel || 'Tap to start your session.'
      const body =
        best.dayLabel && !titleText.toLowerCase().includes(best.dayLabel.toLowerCase())
          ? `${best.dayLabel} · ${titleText}`
          : titleText

      try {
        await sendPushToUser(userId, {
          title: "Today's workout is ready 💪",
          body,
          url: '/dashboard/calendar',
          tag: 'workout-reminder',
        })
        UserProgress.updateOne(
          { userId },
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
    if (userLocalHour === null) {
      results.skippedByWindow++
      continue
    }
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
