import { NextRequest, NextResponse } from 'next/server'
import dbConnect from '@/lib/mongodb'
import UserProgress from '@/models/UserProgress'
import Schedule from '@/models/Schedule'
import ProgramModel from '@/models/Program'
import MealLog from '@/models/MealLog'
import { sendPushToUser, type PushPayload } from '@/lib/pushNotification'
import { computeGoalProgress } from '@/lib/goals/progress'
import { pickGoalNudge } from '@/lib/goals/suggestions'
import { computeStreaks } from '@/lib/streaks/compute'
import { superAtRisk, SUPER_AT_RISK_START_HOUR, SUPER_AT_RISK_END_HOUR, type StreaksLite } from '@/lib/streaks/tile'
import MindProgress from '@/models/MindProgress'
import MindSession from '@/models/MindSession'
import { mainSessionAvailable } from '@/lib/mindXP'
import { getRuntimeConfig } from '@/lib/runtimeConfig'
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
  MIND_REMINDER_START_HOUR,
  GOAL_NUDGE_START_HOUR,
  GOAL_NUDGE_END_HOUR,
  GOAL_NUDGE_KEY_COOLDOWN_DAYS,
  slotDateKey,
  MIND_REMINDER_END_HOUR,
  CHECK_IN_REMINDER_START_HOUR,
  CHECK_IN_REMINDER_END_HOUR,
} from '@/lib/notifications/cronNotify'
import { checkInFactsForToday } from '@/lib/checkin/todayFacts'

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Per-notification outcome counters.
 *
 * The old route counted only successful sends, so "19 users qualified but none of
 * them has ever enabled push" and "nobody qualified" both reported `0` — with
 * `errors: 0` as well, because a user with no subscription never even attempts a
 * send. The cron looked perfectly healthy while delivering nothing. Splitting
 * `qualified` from `delivered` makes that visible at a glance.
 */
interface Tally {
  /** Passed every filter and we tried to reach them. */
  qualified: number
  /** A push service accepted it. */
  delivered: number
  /** Qualified, but the user has no usable push subscription. */
  noSubscription: number
  /** A push service rejected it, or the send threw. */
  failed: number
}

const tally = (): Tally => ({ qualified: 0, delivered: 0, noSubscription: 0, failed: 0 })

/**
 * Send one notification and record the real outcome. `onDelivered` only runs on a
 * genuine delivery — stamping a failure would suppress tomorrow's retry and the
 * user would never hear from us.
 */
async function deliver(
  t: Tally,
  userId: string,
  payload: PushPayload,
  onDelivered: () => void,
): Promise<void> {
  t.qualified++
  try {
    const sent = await sendPushToUser(userId, payload)
    if (sent.delivered > 0) {
      t.delivered++
      onDelivered()
    } else if (sent.attempted > 0) {
      t.failed++
    } else {
      t.noSubscription++
    }
  } catch {
    t.failed++
  }
}

// ── Route ─────────────────────────────────────────────────────────────────────

export async function GET(request: NextRequest) {
  const secret =
    request.headers.get('x-cron-secret') ||
    request.nextUrl.searchParams.get('secret')

  const { admin } = await getRuntimeConfig()
  if (!secret || !admin.cronSecret || secret !== admin.cronSecret) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  await dbConnect()

  const now = new Date()

  const t = {
    streakAtRisk: tally(),
    workoutReminder: tally(),
    mealReminder: tally(),
    reEngagement: tally(),
    mindReminder: tally(),
    scheduleSetup: tally(),
    goalNudge: tally(),
    superStreakAtRisk: tally(),
    checkInReminder: tally(),
  }
  const results = {
    missedSlotsSynced: 0,
    skippedByWindow: 0,
    /** Users with an in-progress program but NO schedule document — they can
     *  never receive a workout reminder, and their calendar is empty. */
    activeProgramsWithoutSchedule: 0,
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
    await deliver(t.streakAtRisk, String(u.userId), {
      title: `Don't break your ${u.streakDays}-day streak 🔥`,
      body: 'Log a workout, mood, or weight to keep it alive.',
      url: '/dashboard',
      tag: 'streak-at-risk',
    }, () => {
      UserProgress.updateOne(
        { userId: u.userId },
        { $set: { 'lastPushSentAt.streakAtRisk': now } },
      ).catch(() => {})
    })
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
      .select('userId notificationPrefs lastPushSentAt timezoneOffset timezone activePrograms')
      .lean()

    const progressByUserId = new Map(
      progressDocs.map((p) => [String(p.userId), p]),
    )

    // Aggregate per USER (not per schedule): a user with two active programs
    // should get ONE reminder for the workout they'd actually do next, picked
    // the SAME way the dashboard does (earliest upcoming scheduled slot) — not
    // one push per schedule, and not a stale program's slot.
    type SlotCand = { date: Date; status: string; phase?: number; dayLabel?: string; workoutTitle?: string; programId?: string }
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
        // Keep UNCOMPLETED slots — both upcoming ('scheduled') and recently
        // 'missed' — so a user who's behind catches up on the workout they still
        // owe (e.g. a missed Day 3 Legs) instead of skipping to today's Day 4.
        if (w.status !== 'scheduled' && w.status !== 'missed') continue
        arr.push({ date: new Date(w.date), status: w.status, phase: w.phase, dayLabel: w.dayLabel, workoutTitle: w.workoutTitle, programId: sched.programId })
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
      const userLocalHour = localHourForUser(now, progress?.timezoneOffset, progress?.timezone)
      if (userLocalHour === null) continue
      if (userLocalHour < WORKOUT_REMINDER_START_HOUR || userLocalHour > WORKOUT_REMINDER_END_HOUR) continue

      const userLocalDateKey = localDateKeyForUser(now, progress?.timezoneOffset, progress?.timezone)
      const lastSent = progress?.lastPushSentAt?.workoutReminder
      if (lastSent && localDateKeyForUser(new Date(lastSent), progress?.timezoneOffset, progress?.timezone) === userLocalDateKey) {
        continue
      }

      // A slot's date is a day MARKER, not an instant — read it as a plain
      // calendar date, exactly as the dashboard does. Putting it through the
      // user's offset shifted every slot a day earlier for anyone behind UTC,
      // which is what made this push name tomorrow's workout.
      const keyed = slots.map((s) => ({ ...s, key: slotDateKey(s.date) }))

      // Only nudge on a training day: there must be a slot scheduled for TODAY.
      const todaySlots = keyed.filter((s) => s.status === 'scheduled' && s.key === userLocalDateKey)
      if (todaySlots.length === 0) continue

      // Name TODAY's workout — the same one the dashboard's "Up Next" shows.
      //
      // This used to name the oldest workout still owed instead. That rule was
      // added to stop the push naming "the next calendar day" (c7f03c0), but
      // that symptom WAS the date-marker shift above: with the dates read
      // correctly there is no next-day drift to work around, and telling
      // someone whose calendar says Legs that their workout is Chest is simply
      // wrong. The backlog is still worth mentioning, so it rides along as a
      // count rather than replacing what today actually is.
      const best = todaySlots.sort((a, b) => a.date.getTime() - b.date.getTime())[0]

      // Overdue, within a 7-day window so we don't nag about ancient misses.
      const CATCHUP_WINDOW_MS = 7 * 24 * 60 * 60 * 1000
      const cutoffMs = now.getTime() - CATCHUP_WINDOW_MS
      const overdue = keyed.filter(
        (s) => s.key < userLocalDateKey && new Date(s.date).getTime() >= cutoffMs,
      ).length

      // Resolve the title from the LIVE program (the slot's cached title can be
      // stale after a program edit — this is the "wrong workout name" bug).
      const program = await getProgram(best.programId)
      const liveTitle = program ? workoutTitleForDay(program.phases ?? [], best.phase ?? 1, best.dayLabel ?? '') : null
      const titleText = liveTitle || best.workoutTitle || best.dayLabel || 'Tap to start your session.'
      const named =
        best.dayLabel && !titleText.toLowerCase().includes(best.dayLabel.toLowerCase())
          ? `${best.dayLabel} · ${titleText}`
          : titleText
      const body = overdue > 0 ? `${named} · ${overdue} to catch up` : named

      await deliver(t.workoutReminder, userId, {
        title: "Today's workout is ready 💪",
        body,
        url: '/dashboard/calendar',
        tag: 'workout-reminder',
      }, () => {
        UserProgress.updateOne(
          { userId },
          { $set: { 'lastPushSentAt.workoutReminder': now } },
        ).catch(() => {})
      })
    }
  }

  // ── 2.5 Meal-log reminder (5pm–8pm LOCAL, nutrition users only) ──────────
  // Only users who actually use nutrition (≥3 logged meals in the last 10
  // days) get this; fires when their local evening arrives with NOTHING
  // logged today. One per local day, pref-gated (notificationPrefs.mealReminder).
  try {
    const tenDaysAgo = new Date(now.getTime() - 10 * 24 * 60 * 60 * 1000)
    const activeLoggers: Array<{ _id: unknown; count: number; lastLoggedAt: Date }> = await MealLog.aggregate([
      { $match: { loggedAt: { $gte: tenDaysAgo } } },
      { $group: { _id: '$user', count: { $sum: 1 }, lastLoggedAt: { $max: '$loggedAt' } } },
      { $match: { count: { $gte: 3 } } },
    ])
    if (activeLoggers.length > 0) {
      const loggerIds = activeLoggers.map((u) => u._id)
      const loggerProgress = await UserProgress.find({ userId: { $in: loggerIds } })
        .select('userId notificationPrefs lastPushSentAt timezoneOffset timezone')
        .lean()
      for (const progress of loggerProgress) {
        if (progress?.notificationPrefs?.mealReminder === false) continue
        const userLocalHour = localHourForUser(now, progress?.timezoneOffset, progress?.timezone)
        if (userLocalHour === null) continue
        if (userLocalHour < 17 || userLocalHour > 20) continue

        const userLocalDateKey = localDateKeyForUser(now, progress?.timezoneOffset, progress?.timezone)
        const lastSent = progress?.lastPushSentAt?.mealReminder
        if (lastSent && localDateKeyForUser(new Date(lastSent), progress?.timezoneOffset, progress?.timezone) === userLocalDateKey) continue

        // Anything logged in the user's local today? Local midnight in UTC =
        // dateKey 00:00Z + tz offset minutes.
        const offset = Number.isFinite(progress?.timezoneOffset as number) ? (progress!.timezoneOffset as number) : 0
        const dayStartUtc = new Date(new Date(`${userLocalDateKey}T00:00:00Z`).getTime() + offset * 60 * 1000)
        const dayEndUtc = new Date(dayStartUtc.getTime() + 24 * 60 * 60 * 1000)
        const loggedToday = await MealLog.exists({
          user: progress.userId,
          loggedAt: { $gte: dayStartUtc, $lt: dayEndUtc },
        })
        if (loggedToday) continue

        await deliver(t.mealReminder, String(progress.userId), {
          title: 'Log today\'s food 🍽️',
          body: 'A quick log keeps your nutrition picture honest. It takes 30 seconds.',
          url: '/dashboard/nutrition',
          tag: 'meal-reminder',
        }, () => {
          UserProgress.updateOne(
            { userId: progress.userId },
            { $set: { 'lastPushSentAt.mealReminder': now } },
          ).catch(() => {})
        })
      }
    }
  } catch (err) {
    console.error('meal-reminder sweep failed:', err)
    results.errors++
  }

  // ── 2.6 Daily Mind session (7am-11am LOCAL) ──────────────────────────────
  // The main Mind session is the app's core daily ritual and had NO reminder at
  // all — the cron only ever nudged workouts, meals, streaks and lapses. Fires
  // when their main session is off its 20h cooldown and they have not completed
  // one today.
  //
  // At most ONE morning push per user: if a workout reminder already went out
  // today, we stay quiet rather than stacking two notifications in one morning.
  try {
    const mindCandidates = await UserProgress.find({
      'notificationPrefs.mindReminder': { $ne: false },
      timezoneOffset: { $exists: true },
    }).select('userId timezoneOffset timezone lastPushSentAt').lean()

    for (const progress of mindCandidates) {
      const userLocalHour = localHourForUser(now, progress?.timezoneOffset, progress?.timezone)
      if (userLocalHour === null) continue
      if (userLocalHour < MIND_REMINDER_START_HOUR || userLocalHour > MIND_REMINDER_END_HOUR) continue

      const userLocalDateKey = localDateKeyForUser(now, progress?.timezoneOffset, progress?.timezone)

      // One per local day.
      const lastSent = progress?.lastPushSentAt?.mindReminder
      if (lastSent && localDateKeyForUser(new Date(lastSent), progress?.timezoneOffset, progress?.timezone) === userLocalDateKey) continue

      // The workout reminder no longer suppresses this one. It used to, to avoid
      // stacking two pushes in one morning — but training days are most days,
      // so in practice the mindset nudge almost never fired at all. They are
      // separate rituals and each deserves its own reminder; the windows are
      // staggered (workout 7am, mind 8am) so they don't arrive together.

      // Already did today's session? Nothing to nudge.
      const doneToday = await MindSession.exists({ userId: progress.userId, dateKey: userLocalDateKey })
      if (doneToday) continue

      // Respect the 20h main-session cooldown — nudging toward a locked session
      // would send them to Training Grounds, not the session.
      const mind = await MindProgress.findOne({ userId: progress.userId })
        .select('lastMainSessionAt completedMainSessions')
        .lean<{ lastMainSessionAt?: Date; completedMainSessions?: number } | null>()
      if (!mainSessionAvailable(mind?.lastMainSessionAt, now.getTime())) continue

      // "Have they ever done one?" is a question about sessions, so it reads the
      // session counter. mainSessionCount is chapter progress and is seeded from
      // the intake answer, so it told someone who had never opened a session
      // that "today's module is ready".
      const started = (mind?.completedMainSessions ?? 0) > 0
      await deliver(t.mindReminder, String(progress.userId), {
        title: started ? "Today's mindset module is ready 🧠" : 'Start your first session 🧠',
        body: started
          ? 'A few minutes on your mindset before the day takes over.'
          : 'Five minutes to set how today goes. Begin the path.',
        url: '/dashboard/mind',
        tag: 'mind-reminder',
      }, () => {
        UserProgress.updateOne(
          { userId: progress.userId },
          { $set: { 'lastPushSentAt.mindReminder': now } },
        ).catch(() => {})
      })
    }
  } catch (err) {
    console.error('mind-reminder sweep failed:', err)
    results.errors++
  }

  // ── 2.6b Super streak at risk (4pm-9pm LOCAL) ─────────────────────────────
  // The super streak (food + mindset + trained, every day) is the hardest thing
  // to hold, and it is lost silently at midnight. Late afternoon, while there is
  // still time to act, tell the member exactly which piece is missing. Only for
  // streaks long enough to be worth protecting, once per local day.
  try {
    const superCandidates = await UserProgress.find({
      'notificationPrefs.superStreakAtRisk': { $ne: false },
      timezoneOffset: { $exists: true },
    }).select('userId timezoneOffset timezone lastPushSentAt').lean()

    for (const progress of superCandidates) {
      const userLocalHour = localHourForUser(now, progress?.timezoneOffset, progress?.timezone)
      if (userLocalHour === null) continue
      if (userLocalHour < SUPER_AT_RISK_START_HOUR || userLocalHour > SUPER_AT_RISK_END_HOUR) continue
      const userLocalDateKey = localDateKeyForUser(now, progress?.timezoneOffset, progress?.timezone)
      const lastSent = progress?.lastPushSentAt?.superStreakAtRisk
      if (lastSent && localDateKeyForUser(new Date(lastSent), progress?.timezoneOffset, progress?.timezone) === userLocalDateKey) continue

      let streaks: StreaksLite
      try {
        streaks = await computeStreaks(String(progress.userId), progress.timezoneOffset ?? 0, now) as unknown as StreaksLite
      } catch { continue }
      const risk = superAtRisk(streaks, userLocalHour)
      if (!risk.atRisk) continue

      await deliver(t.superStreakAtRisk, String(progress.userId), {
        title: risk.title,
        body: risk.body,
        url: '/dashboard/streaks',
        tag: 'super-streak-at-risk',
      }, () => {
        UserProgress.updateOne(
          { userId: progress.userId },
          { $set: { 'lastPushSentAt.superStreakAtRisk': now } },
        ).catch(() => {})
      })
    }
  } catch (err) {
    console.error('super-streak sweep failed:', err)
    results.errors++
  }

  // ── 2.65 Goal nudges (5pm-8pm LOCAL) ──────────────────────────────────────
  // "Where to work on next" per pillar (lib/goals/suggestions) — the SAME rules
  // the Becoming page shows, delivered as a push when they are actionable:
  // behind pace, protein floor missed, logging thin, tight training week, a
  // lift within reach. One goal nudge per member per local day, and the same
  // rule is not repeated within GOAL_NUDGE_KEY_COOLDOWN_DAYS. Never fires for
  // 'good' or 'info' reads — those are the page's job, not a notification's.
  try {
    const goalCandidates = await UserProgress.find({
      'notificationPrefs.goalNudge': { $ne: false },
      timezoneOffset: { $exists: true },
    }).select('userId timezoneOffset timezone lastPushSentAt').lean()

    for (const progress of goalCandidates) {
      const userLocalHour = localHourForUser(now, progress?.timezoneOffset, progress?.timezone)
      if (userLocalHour === null) continue
      if (userLocalHour < GOAL_NUDGE_START_HOUR || userLocalHour > GOAL_NUDGE_END_HOUR) continue
      const userLocalDateKey = localDateKeyForUser(now, progress?.timezoneOffset, progress?.timezone)
      const lastSent = progress?.lastPushSentAt?.goalNudge
      if (lastSent && localDateKeyForUser(new Date(lastSent), progress?.timezoneOffset, progress?.timezone) === userLocalDateKey) continue

      let read
      try {
        read = await computeGoalProgress(String(progress.userId), progress.timezoneOffset ?? 0, now)
      } catch { continue }
      // Actionable only; warnings first; no repeat of the same rule inside the cooldown.
      const pick = pickGoalNudge(
        [read.nutrition.suggestion, read.training.suggestion],
        { key: progress?.lastPushSentAt?.goalNudgeKey, at: progress?.lastPushSentAt?.goalNudgeKeyAt ? new Date(progress.lastPushSentAt.goalNudgeKeyAt).getTime() : null },
        now.getTime(),
        GOAL_NUDGE_KEY_COOLDOWN_DAYS * 86_400_000,
      )
      if (!pick) continue

      await deliver(t.goalNudge, String(progress.userId), {
        title: pick.title,
        body: pick.sub,
        url: pick.url,
        tag: 'goal-nudge',
      }, () => {
        UserProgress.updateOne(
          { userId: progress.userId },
          { $set: { 'lastPushSentAt.goalNudge': now, 'lastPushSentAt.goalNudgeKey': pick.key, 'lastPushSentAt.goalNudgeKeyAt': now } },
        ).catch(() => {})
      })
    }
  } catch (err) {
    console.error('goal-nudge sweep failed:', err)
    results.errors++
  }

  // ── 2.66 Daily check-in reminder (12pm-4pm LOCAL) ─────────────────────────
  // The mood + weight check-in used to be reachable ONLY through the in-app
  // modal, which fires whenever a member happens to open the app — never at a
  // scheduled time. That is exactly why some members reported never seeing it
  // (they simply didn't open the app while it was due) and others reported
  // getting it late at night (whenever they happened to open the app). A
  // dedicated push, restricted to a daytime window like every other reminder
  // here, closes both gaps. Uses the SAME "logged today" / "skipped today"
  // rule as the modal (lib/checkin/todayFacts) so the two channels never
  // disagree about whether today's check-in is done.
  try {
    const checkInCandidates = await UserProgress.find({
      'notificationPrefs.checkInReminder': { $ne: false },
      timezoneOffset: { $exists: true },
    }).select('userId timezoneOffset timezone lastPushSentAt moodHistory weightHistory checkIn').lean()

    for (const progress of checkInCandidates) {
      const userLocalHour = localHourForUser(now, progress?.timezoneOffset, progress?.timezone)
      if (userLocalHour === null) continue
      if (userLocalHour < CHECK_IN_REMINDER_START_HOUR || userLocalHour > CHECK_IN_REMINDER_END_HOUR) continue

      const userLocalDateKey = localDateKeyForUser(now, progress?.timezoneOffset, progress?.timezone)
      const lastSent = progress?.lastPushSentAt?.checkInReminder
      if (lastSent && localDateKeyForUser(new Date(lastSent), progress?.timezoneOffset, progress?.timezone) === userLocalDateKey) continue

      const { moodLoggedToday, weightLoggedToday, skippedToday } = checkInFactsForToday(
        progress,
        userLocalDateKey,
        progress?.timezoneOffset ?? 0,
      )
      if (skippedToday || (moodLoggedToday && weightLoggedToday)) continue

      const body = !moodLoggedToday && !weightLoggedToday
        ? 'A quick mood + weight check-in — takes 10 seconds.'
        : !moodLoggedToday
          ? "You logged your weight — just your mood left for today."
          : "You logged your mood — just today's weight left."

      await deliver(t.checkInReminder, String(progress.userId), {
        title: 'Time for your check-in 📝',
        body,
        url: '/dashboard',
        tag: 'checkin-reminder',
      }, () => {
        UserProgress.updateOne(
          { userId: progress.userId },
          { $set: { 'lastPushSentAt.checkInReminder': now } },
        ).catch(() => {})
      })
    }
  } catch (err) {
    console.error('checkin-reminder sweep failed:', err)
    results.errors++
  }

  // ── 2.7 Program with no schedule (7am-11am LOCAL, weekly) ────────────────
  // An in-progress program with no Schedule document can NEVER produce a workout
  // reminder, and the user's calendar is empty. This was silently true for a real
  // account for three weeks. Count it, and nudge them to pick training days.
  try {
    const withPrograms = await UserProgress.find({
      activePrograms: { $elemMatch: { status: { $in: ['active', 'in-progress'] } } },
    }).select('userId timezoneOffset lastPushSentAt notificationPrefs activePrograms').lean()

    if (withPrograms.length > 0) {
      const scheduledUserIds = new Set(
        (await Schedule.find({ userId: { $in: withPrograms.map((p) => p.userId) } })
          .select('userId')
          .lean()).map((s) => String(s.userId)),
      )
      const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)

      for (const progress of withPrograms) {
        if (scheduledUserIds.has(String(progress.userId))) continue
        results.activeProgramsWithoutSchedule++

        if (progress?.notificationPrefs?.workoutReminder === false) continue
        const userLocalHour = localHourForUser(now, progress?.timezoneOffset, progress?.timezone)
        if (userLocalHour === null) continue
        if (userLocalHour < WORKOUT_REMINDER_START_HOUR || userLocalHour > WORKOUT_REMINDER_END_HOUR) continue

        // Weekly at most — this is a setup nudge, not a daily nag.
        const lastSent = progress?.lastPushSentAt?.scheduleSetup
        if (lastSent && new Date(lastSent) > weekAgo) continue

        await deliver(t.scheduleSetup, String(progress.userId), {
          title: 'Your program has no training days yet 📅',
          body: 'Pick the days you train and we will keep you on track from there.',
          url: '/dashboard/calendar',
          tag: 'schedule-setup',
        }, () => {
          UserProgress.updateOne(
            { userId: progress.userId },
            { $set: { 'lastPushSentAt.scheduleSetup': now } },
          ).catch(() => {})
        })
      }
    }
  } catch (err) {
    console.error('schedule-setup sweep failed:', err)
    results.errors++
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
    await deliver(t.reEngagement, String(u.userId), {
      title: 'We miss you 👋',
      body: 'Come back and keep building your best self.',
      url: '/dashboard',
      tag: 're-engagement',
    }, () => {
      UserProgress.updateOne(
        { userId: u.userId },
        { $set: { 'lastPushSentAt.reEngagement': now } },
      ).catch(() => {})
    })
  }

  // Report qualified/delivered/noSubscription per type. A row that reads
  // `qualified: 19, delivered: 0, noSubscription: 19` is the signal that the
  // pipeline is fine and nobody has push enabled — previously indistinguishable
  // from "nobody qualified".
  return NextResponse.json({ success: true, notifications: t, ...results })
}
