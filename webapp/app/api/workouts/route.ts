import { NextRequest, NextResponse } from 'next/server'
import { verifyAuth } from '@/lib/auth'
import dbConnect from '@/lib/mongodb'
import UserProgress from '@/models/UserProgress'
import ProgramModel from '@/models/Program'
import Schedule from '@/models/Schedule'
import { calculateNextDay } from '@/app/api/programs/current-workout/route'
import { recordStreakActivity } from '@/lib/streak'
import { bustTilesCache } from '@/lib/redis'
import { readTzOffset, readTzOffsetFromBody, localDateKey, localDayWindowForKey, dateKey } from '@/lib/dayWindow'
import { captureUserTimezone } from '@/lib/captureUserTimezone'
import { formatPRsForLiveWorkout, type IExercisePR } from '@/lib/exercisePRs'
import { maybePersistWorkoutPRs } from '@/lib/persistWorkoutPRs'

interface SetData {
  setNumber: number
  reps?: number       // null for time-only exercises
  weight?: number     // null for bodyweight/cardio
  duration?: number   // seconds — for time / intervals / time_distance
  distance?: number   // meters — for time_distance
  speed?: number      // mph — for time_distance / intervals
  completed: boolean
}

interface ExerciseData {
  name: string
  sets: SetData[]
  // Grouping metadata (optional, passed through from program data)
  groupId?: string
  groupType?: string
}

interface WorkoutSaveRequest {
  programId: string
  phase: number
  day: string
  exercises: ExerciseData[]
  completed: boolean
  duration?: number
  activeSeconds?: number
  notes?: string
  tz?: number
  /** ISO date of the exact Schedule slot this log fulfills (gap 3). */
  scheduledDate?: string
}

interface QuickSessionSaveRequest {
  kind: 'quick'
  sessionId: string
  title?: string
  focus?: string
  exercises: ExerciseData[]
  completed: boolean
  duration?: number
  activeSeconds?: number
  notes?: string
  tz?: number
  /** Optional backdate — ISO string / YYYY-MM-DD for a workout performed earlier. */
  performedAt?: string
}

/**
 * Resolve the date a session is dated to. Accepts an optional client-supplied
 * `performedAt` — a PAST date logs a done session, a FUTURE date plans one — and
 * clamps it to a sane window: a valid date, at most one year in the past or
 * future. Falls back to now on anything invalid or out of range.
 */
function resolvePerformedAt(performedAt: string | undefined, _tzOffset: number): Date {
  const now = new Date()
  if (!performedAt || typeof performedAt !== 'string') return now
  // Bare YYYY-MM-DD → anchor at local noon so it lands on the intended day
  // regardless of tz offset when later bucketed into a local-day window.
  const raw = /^\d{4}-\d{2}-\d{2}$/.test(performedAt) ? `${performedAt}T12:00:00` : performedAt
  const d = new Date(raw)
  if (Number.isNaN(d.getTime())) return now
  const YEAR = 365 * 24 * 60 * 60 * 1000
  if (d.getTime() < now.getTime() - YEAR) return now   // absurdly old → now
  if (d.getTime() > now.getTime() + YEAR) return now   // absurdly far ahead → now
  return d
}

// GET: Fetch today's workout progress for a program
export async function GET(request: NextRequest) {
  try {
    const authResult = await verifyAuth(request)
    if (!authResult.success) {
      return NextResponse.json({ error: authResult.error ?? 'Unauthorized' }, { status: 401 })
    }
    const payload = { userId: authResult.userId!, email: authResult.email! }

    const { searchParams } = new URL(request.url)
    const programId = searchParams.get('programId')
    const day = searchParams.get('day')

    if (!programId) {
      return NextResponse.json({ error: 'programId is required' }, { status: 400 })
    }

    await dbConnect()

    const includeHistory = searchParams.get('includeHistory') === 'true'

    // Find today's date range in the user's local timezone
    const tzOffset = readTzOffset(searchParams)
    const todayKey = localDateKey(null, tzOffset)
    const { start: today, end: tomorrow } = localDayWindowForKey(todayKey, tzOffset)

    // Find workout log for today
    const userProgress = await UserProgress.findOne({ userId: payload.userId }).lean()

    if (!userProgress || !userProgress.workoutLogs) {
      return NextResponse.json({ workout: null, isResume: false, exerciseHistory: {} })
    }

    // Build exercise history from past completed workouts (before today).
    // PRs are read from the persisted `exercisePRs` subdoc, populated by the
    // POST save path — no on-the-fly recomputation here.
    const exerciseHistory: Record<string, { weight: number; reps: number; duration?: number; date: string }> = {}
    const exercisePRs: Record<string, { weight: number; reps: number }> = includeHistory
      ? formatPRsForLiveWorkout((userProgress as { exercisePRs?: IExercisePR[] }).exercisePRs)
      : {}
    if (includeHistory) {
      // Get all completed workout logs for this program, sorted newest first
      const pastLogs = userProgress.workoutLogs
        .filter((log: { programId: string; date: Date; completed: boolean }) =>
          log.programId === programId &&
          log.completed &&
          new Date(log.date) < today  // `today` is start of caller's local day (UTC)
        )
        .sort((a: { date: Date }, b: { date: Date }) =>
          new Date(b.date).getTime() - new Date(a.date).getTime()
        )

      type AnySet = { completed: boolean; reps?: number; weight?: number; duration?: number; distance?: number }

      // For each exercise, find the most recent completed set (history only)
      for (const log of pastLogs) {
        for (const exercise of (log.exercises || [])) {
          if (exerciseHistory[exercise.name]) continue
          const completedSets = (exercise.sets || []).filter(
            (s: AnySet) => s.completed && ((s.reps ?? 0) > 0 || (s.duration ?? 0) > 0)
          )
          if (completedSets.length === 0) continue

          // Pick the set with highest weight (or most reps/duration if no weight)
          const bestSet = completedSets.reduce(
            (best: AnySet, s: AnySet) => {
              const bw = best.weight ?? 0, sw = s.weight ?? 0
              const br = best.reps ?? 0, sr = s.reps ?? 0
              const bd = best.duration ?? 0, sd = s.duration ?? 0
              if (sw > bw) return s
              if (sw === bw && sr > br) return s
              if (sw === bw && sr === br && sd > bd) return s
              return best
            },
            completedSets[0]
          )

          exerciseHistory[exercise.name] = {
            weight: bestSet.weight ?? 0,
            reps: bestSet.reps ?? 0,
            duration: bestSet.duration,
            date: new Date(log.date).toISOString()
          }
        }
      }
    }

    // Find today's workout for this program/day
    const todayWorkout = userProgress.workoutLogs.find(
      (log: { programId: string; day: string; date: Date; completed: boolean }) => {
        const logDate = new Date(log.date)
        return log.programId === programId &&
               (!day || log.day === day) &&
               logDate >= today &&
               logDate <= tomorrow
      }
    )

    // Auto-cleanup: delete incomplete logs older than 30 days for this program
    const STALE_CUTOFF_DAYS = 30
    const staleCutoff = new Date(today)
    staleCutoff.setDate(staleCutoff.getDate() - STALE_CUTOFF_DAYS)

    const hasExpiredLogs = (userProgress.workoutLogs as Array<{ programId: string; completed: boolean; date: Date }>)
      .some(log => log.programId === programId && !log.completed && new Date(log.date) < staleCutoff)

    if (hasExpiredLogs) {
      // Fire-and-forget — don't block response
      UserProgress.updateOne(
        { userId: payload.userId },
        { $pull: { workoutLogs: { programId, completed: false, date: { $lt: staleCutoff } } } }
      ).catch(() => {})
    }

    // Find most recent incomplete workout from a previous day (stale, within cutoff window)
    type WorkoutLog = { programId: string; day: string; phase: number; date: Date; completed: boolean; kind?: string; exercises: Array<{ sets: Array<{ completed: boolean }> }> }
    let staleLog: WorkoutLog | null = (userProgress.workoutLogs as WorkoutLog[])
      .filter(log =>
        // Program prompt is program-scoped AND never picks up quick sessions —
        // those live in their own sessionId namespace (no cross-contamination).
        log.kind !== 'quick' &&
        log.programId === programId &&
        !log.completed &&
        new Date(log.date) < today &&
        new Date(log.date) >= staleCutoff
      )
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())[0] ?? null

    // Coordinate with the calendar/home "Skip": if this day was already resolved
    // there (status skipped or completed), the leftover incomplete log is
    // orphaned — don't re-prompt (that was the "asked twice" bug); drop it so the
    // two features agree. Matched by dayLabel within a ±14-day window.
    if (staleLog) {
      const logDay = staleLog.day
      const logMs = new Date(staleLog.date).getTime()
      const RESOLVED_WINDOW_MS = 14 * 24 * 60 * 60 * 1000
      const sched = await Schedule.findOne({ userId: payload.userId, programId })
        .select('scheduledWorkouts')
        .lean<{ scheduledWorkouts?: Array<{ dayLabel: string; date: Date; status: string }> } | null>()
      const alreadyResolved = (sched?.scheduledWorkouts ?? []).some(w =>
        w.dayLabel === logDay &&
        (w.status === 'skipped' || w.status === 'completed') &&
        Math.abs(new Date(w.date).getTime() - logMs) <= RESOLVED_WINDOW_MS
      )
      if (alreadyResolved) {
        UserProgress.updateOne(
          { userId: payload.userId },
          { $pull: { workoutLogs: { programId, day: logDay, completed: false, date: staleLog.date } } }
        ).catch(() => {})
        staleLog = null
      }
    }

    const staleIncomplete = staleLog ? {
      day: staleLog.day,
      phase: staleLog.phase,
      date: new Date(staleLog.date).toISOString(),
      exercises: staleLog.exercises,
      completedExerciseCount: staleLog.exercises.filter(
        (ex) => ex.sets?.some((s) => s.completed)
      ).length,
      totalExerciseCount: staleLog.exercises.length,
    } : null

    if (todayWorkout) {
      return NextResponse.json({
        workout: todayWorkout,
        isResume: !todayWorkout.completed,
        exerciseHistory,
        exercisePRs,
        staleIncomplete
      })
    }

    // No log found for today — return empty so the workout starts fresh
    return NextResponse.json({ workout: null, isResume: false, exerciseHistory, exercisePRs, staleIncomplete })

  } catch (error) {
    console.error('Error fetching workout:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const authResult = await verifyAuth(request)
    if (!authResult.success) {
      return NextResponse.json({ error: authResult.error ?? 'Unauthorized' }, { status: 401 })
    }
    const payload = { userId: authResult.userId!, email: authResult.email! }

    const rawBody = await request.json()

    // Quick (ad-hoc) session path — no program attached. Identified by
    // kind:'quick'. Logged like any workout (feeds streak / PRs / calendar /
    // history) but skips all program-day-advance + schedule-sync logic.
    if (rawBody?.kind === 'quick') {
      return await handleQuickSessionSave(rawBody as QuickSessionSaveRequest, payload)
    }

    const body: WorkoutSaveRequest = rawBody
    const { programId, phase, day, exercises, completed, duration, activeSeconds, notes, scheduledDate } = body

    if (!programId || phase === undefined || !day) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    await dbConnect()

    let programCompleted = false
    let programName = ''

    // Create workout log entry
    const workoutLog = {
      date: new Date(),
      programId,
      phase,
      day,
      ...(scheduledDate && { scheduledDate: new Date(scheduledDate) }),
      completed,
      duration,
      startedAt: new Date(),
      activeSeconds: activeSeconds ?? 0,
      ...(notes && { notes }),
      exercises
    }

    // Find today's date range in the user's local timezone
    const tzOffset = readTzOffsetFromBody(body)
    captureUserTimezone(payload.userId, tzOffset)
    const todayKey = localDateKey(null, tzOffset)
    const { start: today, end: tomorrow } = localDayWindowForKey(todayKey, tzOffset)

    // Atomic update-if-exists: returns the document state BEFORE this update
    // so we can read wasAlreadyComplete without a separate findOne round-trip.
    type ProgressDoc = { workoutLogs: Array<{ programId: string; day: string; date: Date; completed: boolean }> }
    const docBefore = await UserProgress.findOneAndUpdate(
      {
        userId: payload.userId,
        workoutLogs: { $elemMatch: { programId, day, date: { $gte: today, $lte: tomorrow } } }
      },
      {
        $set: {
          'workoutLogs.$[elem].exercises': exercises,
          'workoutLogs.$[elem].completed': completed,
          'workoutLogs.$[elem].duration': duration,
          ...(activeSeconds !== undefined && { 'workoutLogs.$[elem].activeSeconds': activeSeconds }),
          updatedAt: new Date()
        }
      },
      {
        arrayFilters: [{ 'elem.programId': programId, 'elem.day': day, 'elem.date': { $gte: today, $lte: tomorrow } }],
        returnDocument: 'before',
        lean: true
      }
    ) as ProgressDoc | null

    let wasAlreadyComplete = false

    if (docBefore) {
      const oldLog = docBefore.workoutLogs?.find(
        (log) => log.programId === programId && log.day === day && log.date >= today && log.date <= tomorrow
      )
      wasAlreadyComplete = oldLog?.completed === true
    } else {
      // No entry for today — insert only if still absent (guards against concurrent double-tap)
      await UserProgress.updateOne(
        {
          userId: payload.userId,
          workoutLogs: { $not: { $elemMatch: { programId, day, date: { $gte: today, $lte: tomorrow } } } }
        },
        {
          $push: { workoutLogs: workoutLog },
          $set: { updatedAt: new Date() }
        },
        { upsert: true }
      )
    }

    // Handle completion logic once (shared between both branches)
    if (completed && !wasAlreadyComplete) {
      // 1. Advance day counter
      const program = await ProgramModel.findOne({ program_id: programId }).lean()
      const { nextDay, nextPhase } = program?.phases
        ? calculateNextDay(day, phase, program.phases)
        : { nextDay: day, nextPhase: phase }

      await UserProgress.updateOne(
        { userId: payload.userId, 'activePrograms.programId': programId },
        {
          $inc: { 'activePrograms.$.completedWorkouts': 1 },
          $set: {
            'activePrograms.$.lastWorkoutDate': new Date(),
            'activePrograms.$.currentPhase': nextPhase,
            'activePrograms.$.currentDay': nextDay,
          },
        }
      )

      // 2. Sync schedule entry to 'completed' BEFORE checking completion.
      //    ScheduledWorkout subdocs have no _id — match by date+dayLabel using arrayFilters.
      try {
        const schedule = await Schedule.findOne({ userId: payload.userId, programId }).lean<{
          scheduledWorkouts: { date: Date; dayLabel: string; status: string; completedAt?: Date }[]
        }>()
        if (schedule?.scheduledWorkouts?.length) {
          // Guard: if a slot with this dayLabel was already marked completed today
          // (by a prior save/retry in the same session), don't mark a second one.
          const alreadyMarkedToday = schedule.scheduledWorkouts.some(
            (w) =>
              w.dayLabel === day &&
              w.status === 'completed' &&
              w.completedAt &&
              dateKey(new Date(w.completedAt), tzOffset) === todayKey
          )

          if (!alreadyMarkedToday) {
            // Resolve the OLDEST outstanding slot for this day first, so a
            // completion clears the overdue backlog in order and never grabs a
            // FUTURE slot of the same day while an earlier one stays "missed"
            // (the bug: with Day 1 on both an overdue and an upcoming date, a
            // by-absolute-proximity match picked the upcoming one). Falls back
            // to the soonest upcoming slot when the user trains ahead.
            const candidates = schedule.scheduledWorkouts.filter(
              (w) => w.dayLabel === day && (w.status === 'scheduled' || w.status === 'missed')
            )
            const byDateAsc = (a: { date: Date }, b: { date: Date }) =>
              new Date(a.date).getTime() - new Date(b.date).getTime()
            // Gap 3: if the log carries the exact slot date, resolve THAT slot —
            // never a neighbouring same-dayLabel slot. Compare UTC date-portion
            // (slots are stored as UTC-midnight of the intended local day).
            const exact = scheduledDate
              ? candidates.find(
                  (w) => new Date(w.date).toISOString().split('T')[0]
                       === new Date(scheduledDate).toISOString().split('T')[0]
                )
              : undefined
            const overdue = candidates
              .filter((w) => dateKey(new Date(w.date), tzOffset) <= todayKey)
              .sort(byDateAsc)
            const upcoming = candidates
              .filter((w) => dateKey(new Date(w.date), tzOffset) > todayKey)
              .sort(byDateAsc)
            const match = exact ?? overdue[0] ?? upcoming[0]

            if (match) {
              await Schedule.updateOne(
                { userId: payload.userId, programId },
                {
                  $set: {
                    'scheduledWorkouts.$[elem].status': 'completed',
                    'scheduledWorkouts.$[elem].completedAt': new Date(),
                  },
                },
                {
                  arrayFilters: [
                    {
                      'elem.date': match.date,
                      'elem.dayLabel': day,
                      'elem.status': { $in: ['scheduled', 'missed'] },
                    },
                  ],
                }
              )
            }
          }
        }
      } catch (scheduleError) {
        console.error('Error syncing schedule:', scheduleError)
      }

      // 3. Read fresh schedule and count completed sessions to determine if program is done.
      //    This is the source of truth — counters may drift but status fields don't lie.
      const freshSchedule = await Schedule.findOne(
        { userId: payload.userId, programId },
        { 'scheduledWorkouts.status': 1 }
      ).lean<{ scheduledWorkouts: { status: string }[] }>()

      if (freshSchedule?.scheduledWorkouts?.length) {
        const sessions = freshSchedule.scheduledWorkouts.filter((w) => w.status !== 'rest')
        const completedCount = sessions.filter((w) => w.status === 'completed').length
        const totalCount = sessions.length

        // Keep totalWorkouts counter in sync
        await UserProgress.updateOne(
          { userId: payload.userId, 'activePrograms.programId': programId },
          { $set: { 'activePrograms.$.totalWorkouts': totalCount } }
        )

        if (totalCount > 0 && completedCount >= totalCount) {
          const up = await UserProgress.findOne({ userId: payload.userId }).lean()
          const ap = up?.activePrograms?.find((p: { programId: string }) => p.programId === programId)
          await UserProgress.updateOne(
            { userId: payload.userId, 'activePrograms.programId': programId },
            { $set: { 'activePrograms.$.status': 'completed' } }
          )
          programCompleted = true
          programName = ap?.programName || ''
        }
      } else {
        // No schedule — fall back to counter comparison
        const up = await UserProgress.findOne({ userId: payload.userId }).lean()
        const ap = up?.activePrograms?.find((p: { programId: string }) => p.programId === programId)
        if (ap && ap.totalWorkouts > 0 && ap.completedWorkouts >= ap.totalWorkouts) {
          await UserProgress.updateOne(
            { userId: payload.userId, 'activePrograms.programId': programId },
            { $set: { 'activePrograms.$.status': 'completed' } }
          )
          programCompleted = true
          programName = ap.programName || ''
        }
      }
    }

    // Update persisted personal records on first-time completion. Skips re-saves
    // of an already-complete workout (wasAlreadyComplete) so the same sets
    // don't double-trigger newPR notifications. PR errors are swallowed by the
    // helper so a bookkeeping hiccup never blocks the underlying workout save.
    const newPRsAchieved = await maybePersistWorkoutPRs({
      store: {
        readCurrentPRs: async (uid) => {
          const cur = await UserProgress.findOne(
            { userId: uid },
            { exercisePRs: 1 },
          ).lean<{ exercisePRs?: IExercisePR[] } | null>()
          return cur?.exercisePRs ?? []
        },
        writePRs: async (uid, prs) => {
          await UserProgress.updateOne(
            { userId: uid },
            { $set: { exercisePRs: prs } },
          )
        },
      },
      userId: payload.userId,
      exercises,
      date: workoutLog.date,
      programId,
      completed,
      wasAlreadyComplete,
    })

    // Record streak activity on workout completion
    let streakResult = null
    if (completed) {
      streakResult = await recordStreakActivity(payload.userId, payload.email).catch(() => null)
    }

    // Workout logs feed dashboard tiles — invalidate so they show immediately.
    await bustTilesCache(payload.userId)

    return NextResponse.json({
      message: 'Workout saved successfully',
      completed,
      programCompleted,
      ...(programCompleted && { programName }),
      ...(newPRsAchieved.length > 0 && { newPRsAchieved }),
      ...(streakResult && {
        streak: {
          streakDays: streakResult.streakDays,
          streakExtended: streakResult.streakExtended,
          freezeUsed: streakResult.freezeUsed,
          newMilestone: streakResult.newMilestone,
          longestStreak: streakResult.longestStreak,
        },
      }),
    })

  } catch (error) {
    console.error('Error saving workout:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// Save an ad-hoc "quick session" — a workout not attached to any program.
// Incremental saves within one live session share a client-generated
// `sessionId`: the first save inserts the log, subsequent saves update it in
// place (matched by sessionId). No day-advance, no schedule sync — quick
// sessions are standalone. Still feeds streak, PRs, dashboard tiles, calendar
// and history exactly like a program workout.
async function handleQuickSessionSave(
  body: QuickSessionSaveRequest,
  payload: { userId: string; email: string },
) {
  const { sessionId, title, focus, exercises, completed, duration, activeSeconds, notes } = body

  if (!sessionId || !Array.isArray(exercises)) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }

  await dbConnect()

  const tzOffset = readTzOffsetFromBody(body)
  captureUserTimezone(payload.userId, tzOffset)
  // Honor an optional backdate so users can log a session they did earlier.
  const workoutDate = resolvePerformedAt(body.performedAt, tzOffset)

  // Update-if-exists (matched by sessionId), capturing the prior state so we
  // can tell whether this completion is the first one (gates streak/PR side
  // effects, mirroring the program path's wasAlreadyComplete guard).
  type QuickProgressDoc = { workoutLogs: Array<{ sessionId?: string; completed: boolean }> }
  const docBefore = await UserProgress.findOneAndUpdate(
    { userId: payload.userId, workoutLogs: { $elemMatch: { sessionId, kind: 'quick' } } },
    {
      $set: {
        'workoutLogs.$[elem].exercises': exercises,
        'workoutLogs.$[elem].completed': completed,
        'workoutLogs.$[elem].duration': duration,
        ...(title !== undefined && { 'workoutLogs.$[elem].title': title }),
        ...(focus !== undefined && { 'workoutLogs.$[elem].focus': focus }),
        ...(activeSeconds !== undefined && { 'workoutLogs.$[elem].activeSeconds': activeSeconds }),
        ...(notes !== undefined && { 'workoutLogs.$[elem].notes': notes }),
        // Backdate only when the client explicitly sends performedAt — autosaves
        // omit it, so they never disturb the log's date.
        ...(body.performedAt && {
          'workoutLogs.$[elem].date': workoutDate,
          'workoutLogs.$[elem].startedAt': workoutDate,
        }),
        updatedAt: new Date(),
      },
    },
    {
      arrayFilters: [{ 'elem.sessionId': sessionId, 'elem.kind': 'quick' }],
      returnDocument: 'before',
      lean: true,
    },
  ) as QuickProgressDoc | null

  let wasAlreadyComplete = false

  if (docBefore) {
    const oldLog = docBefore.workoutLogs?.find((log) => log.sessionId === sessionId)
    wasAlreadyComplete = oldLog?.completed === true
  } else {
    // First save for this session — insert only if still absent (guards a
    // concurrent double-save from inserting two logs for the same sessionId).
    await UserProgress.updateOne(
      {
        userId: payload.userId,
        workoutLogs: { $not: { $elemMatch: { sessionId, kind: 'quick' } } },
      },
      {
        $push: {
          workoutLogs: {
            date: workoutDate,
            kind: 'quick',
            sessionId,
            ...(title && { title }),
            ...(focus && { focus }),
            completed,
            duration,
            startedAt: workoutDate,
            activeSeconds: activeSeconds ?? 0,
            ...(notes && { notes }),
            exercises,
          },
        },
        $set: { updatedAt: new Date() },
      },
      { upsert: true },
    )
  }

  // Personal records — quick sessions count too (it's still real lifting).
  const newPRsAchieved = await maybePersistWorkoutPRs({
    store: {
      readCurrentPRs: async (uid) => {
        const cur = await UserProgress.findOne({ userId: uid }, { exercisePRs: 1 })
          .lean<{ exercisePRs?: IExercisePR[] } | null>()
        return cur?.exercisePRs ?? []
      },
      writePRs: async (uid, prs) => {
        await UserProgress.updateOne({ userId: uid }, { $set: { exercisePRs: prs } })
      },
    },
    userId: payload.userId,
    exercises,
    date: workoutDate,
    completed,
    wasAlreadyComplete,
  })

  let streakResult = null
  if (completed && !wasAlreadyComplete) {
    streakResult = await recordStreakActivity(payload.userId, payload.email).catch(() => null)
  }

  await bustTilesCache(payload.userId)

  return NextResponse.json({
    message: 'Quick session saved successfully',
    completed,
    ...(newPRsAchieved.length > 0 && { newPRsAchieved }),
    ...(streakResult && {
      streak: {
        streakDays: streakResult.streakDays,
        streakExtended: streakResult.streakExtended,
        freezeUsed: streakResult.freezeUsed,
        newMilestone: streakResult.newMilestone,
        longestStreak: streakResult.longestStreak,
      },
    }),
  })
}
