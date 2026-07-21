import { NextRequest, NextResponse } from 'next/server'
import { verifyAuth } from '@/lib/auth'
import dbConnect from '@/lib/mongodb'
import UserProgress from '@/models/UserProgress'
import ProgramModel from '@/models/Program'
import Schedule from '@/models/Schedule'
import { calculateNextDay } from '@/app/api/programs/current-workout/route'
import { readTzOffsetFromBody, localDateKey, localDayWindowForKey } from '@/lib/dayWindow'
import { recordStreakActivity } from '@/lib/streak'

type ResolveAction = 'continue' | 'restart' | 'count' | 'skip'

interface ResolveRequest {
  programId: string
  day: string
  phase: number
  action: ResolveAction
}

export async function POST(request: NextRequest) {
  try {
    const authResult = await verifyAuth(request)
    if (!authResult.success) {
      return NextResponse.json({ error: authResult.error ?? 'Unauthorized' }, { status: 401 })
    }
    const payload = { userId: authResult.userId!, email: authResult.email! }

    const body: ResolveRequest = await request.json()
    const { programId, day, phase, action } = body

    if (!programId || !day || phase === undefined || !action) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    await dbConnect()

    const tz = readTzOffsetFromBody(body as unknown as Record<string, unknown>)
    const todayKey = localDateKey(null, tz)
    const { start: today } = localDayWindowForKey(todayKey, tz)

    if (action === 'continue') {
      // Re-date the stale log to now so GET /api/workouts picks it up as today's in-progress
      await UserProgress.updateOne(
        { userId: payload.userId },
        { $set: { 'workoutLogs.$[elem].date': new Date() } },
        {
          arrayFilters: [
            { 'elem.programId': programId, 'elem.day': day, 'elem.completed': false, 'elem.date': { $lt: today } }
          ]
        }
      )
      return NextResponse.json({ action, nextDay: null, nextPhase: null })
    }

    if (action === 'restart') {
      // Remove the stale incomplete log — workout will start fresh on the same day
      await UserProgress.updateOne(
        { userId: payload.userId },
        {
          $pull: {
            workoutLogs: { programId, day, completed: false, date: { $lt: today } }
          }
        }
      )
      return NextResponse.json({ action, nextDay: null, nextPhase: null })
    }

    // For 'count' and 'skip', both advance to the next day
    const program = await ProgramModel.findOne({ program_id: programId }).lean()
    const { nextDay, nextPhase } = program?.phases
      ? calculateNextDay(day, phase, program.phases as Parameters<typeof calculateNextDay>[2])
      : { nextDay: day, nextPhase: phase }

    if (action === 'count') {
      // Mark the stale log as completed — fill any incomplete sets so it counts
      const userProgress = await UserProgress.findOne({ userId: payload.userId }).lean()
      type RawLog = { programId: string; day: string; completed: boolean; date: Date; scheduledDate?: Date; exercises: Array<{ name: string; sets: Array<{ setNumber: number; reps: number; weight: number; completed: boolean }> }> }
      const staleLog = (userProgress?.workoutLogs as RawLog[] | undefined)
        ?.filter(l => l.programId === programId && l.day === day && !l.completed && new Date(l.date) < today)
        .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())[0]

      if (staleLog) {
        const filledExercises = staleLog.exercises.map(ex => ({
          ...ex,
          sets: ex.sets.map(s => ({ ...s, completed: true, reps: s.reps || 1, weight: s.weight || 0 }))
        }))

        await UserProgress.updateOne(
          { userId: payload.userId },
          {
            $set: {
              'workoutLogs.$[elem].completed': true,
              'workoutLogs.$[elem].exercises': filledExercises,
            }
          },
          {
            arrayFilters: [
              { 'elem.programId': programId, 'elem.day': day, 'elem.completed': false, 'elem.date': { $lt: today } }
            ]
          }
        )

        // Advance progress counters (same logic as completing a workout)
        await UserProgress.updateOne(
          { userId: payload.userId, 'activePrograms.programId': programId },
          {
            $inc: { 'activePrograms.$.completedWorkouts': 1, totalWorkouts: 1 },
            $set: {
              'activePrograms.$.lastWorkoutDate': new Date(staleLog.date),
              'activePrograms.$.currentPhase': nextPhase,
              'activePrograms.$.currentDay': nextDay,
            }
          }
        )

        // Sync the schedule slot so the calendar shows 'completed' not 'missed'.
        // Use index-based positional update rather than arrayFilters with date equality
        // to avoid silent mismatches when the Date object serializes differently.
        try {
          const schedule = await Schedule.findOne({ userId: payload.userId, programId }).lean<{
            scheduledWorkouts: { date: Date; dayLabel: string; status: string; completedAt?: Date }[]
          }>()
          if (schedule?.scheduledWorkouts?.length) {
            const staleMs = new Date(staleLog.date).getTime()
            const WINDOW_MS = 14 * 24 * 60 * 60 * 1000
            // Gap 3: if the log carries the exact slot date, resolve THAT slot.
            const sdKey = staleLog.scheduledDate
              ? new Date(staleLog.scheduledDate).toISOString().split('T')[0]
              : null
            const exactIdx = sdKey
              ? schedule.scheduledWorkouts.findIndex(
                  (w) =>
                    (w.status === 'scheduled' || w.status === 'missed') &&
                    new Date(w.date).toISOString().split('T')[0] === sdKey
                )
              : -1
            const matchIdx = exactIdx >= 0 ? exactIdx : schedule.scheduledWorkouts
              .map((w, i) => ({ w, i }))
              .filter(({ w }) =>
                w.dayLabel === day &&
                (w.status === 'scheduled' || w.status === 'missed') &&
                Math.abs(new Date(w.date).getTime() - staleMs) <= WINDOW_MS
              )
              .sort((a, b) =>
                Math.abs(new Date(a.w.date).getTime() - staleMs) -
                Math.abs(new Date(b.w.date).getTime() - staleMs)
              )[0]?.i ?? -1

            if (matchIdx >= 0) {
              await Schedule.updateOne(
                { userId: payload.userId, programId },
                {
                  $set: {
                    [`scheduledWorkouts.${matchIdx}.status`]: 'completed',
                    [`scheduledWorkouts.${matchIdx}.completedAt`]: new Date(),
                  }
                }
              )
            }
          }
        } catch (scheduleError) {
          console.error('Error syncing schedule for counted workout:', scheduleError)
        }

        // Mirror the normal workout-completion flow: check program completion
        // from the fresh schedule and record streak activity. Without these,
        // counted stale workouts didn't roll up into program-completed status
        // or count toward the user's daily streak.
        try {
          const freshSchedule = await Schedule.findOne(
            { userId: payload.userId, programId },
            { 'scheduledWorkouts.status': 1 }
          ).lean<{ scheduledWorkouts: { status: string }[] }>()
          if (freshSchedule?.scheduledWorkouts?.length) {
            const sessions = freshSchedule.scheduledWorkouts.filter((w) => w.status !== 'rest')
            const completedCount = sessions.filter((w) => w.status === 'completed').length
            const totalCount = sessions.length
            await UserProgress.updateOne(
              { userId: payload.userId, 'activePrograms.programId': programId },
              { $set: { 'activePrograms.$.totalWorkouts': totalCount } }
            )
            if (totalCount > 0 && completedCount >= totalCount) {
              await UserProgress.updateOne(
                { userId: payload.userId, 'activePrograms.programId': programId },
                { $set: { 'activePrograms.$.status': 'completed' } }
              )
            }
          }
        } catch (completionError) {
          console.error('Error checking program completion on count:', completionError)
        }

        await recordStreakActivity(payload.userId, payload.email).catch(() => null)
      }
    }

    if (action === 'skip') {
      // Find the stale log date before pulling it (needed for schedule slot match)
      const upForSkip = await UserProgress.findOne({ userId: payload.userId }).lean()
      type SkipLog = { programId: string; day: string; completed: boolean; date: Date; scheduledDate?: Date }
      const skipLog = (upForSkip?.workoutLogs as SkipLog[] | undefined)
        ?.filter(l => l.programId === programId && l.day === day && !l.completed && new Date(l.date) < today)
        .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())[0]

      // Remove the stale incomplete log and advance day without counting
      await UserProgress.updateOne(
        { userId: payload.userId },
        { $pull: { workoutLogs: { programId, day, completed: false, date: { $lt: today } } } }
      )
      await UserProgress.updateOne(
        { userId: payload.userId, 'activePrograms.programId': programId },
        {
          $set: {
            'activePrograms.$.currentPhase': nextPhase,
            'activePrograms.$.currentDay': nextDay,
          }
        }
      )

      // Sync the schedule slot to 'skipped' so calendar reflects the decision.
      // Use index-based positional update for reliability (same rationale as count action).
      if (skipLog) {
        try {
          const schedule = await Schedule.findOne({ userId: payload.userId, programId }).lean<{
            scheduledWorkouts: { date: Date; dayLabel: string; status: string }[]
          }>()
          if (schedule?.scheduledWorkouts?.length) {
            const skipMs = new Date(skipLog.date).getTime()
            const WINDOW_MS = 14 * 24 * 60 * 60 * 1000
            // Gap 3: exact slot match when the log carries its scheduled date.
            const sdKey = skipLog.scheduledDate
              ? new Date(skipLog.scheduledDate).toISOString().split('T')[0]
              : null
            const exactIdx = sdKey
              ? schedule.scheduledWorkouts.findIndex(
                  (w) =>
                    (w.status === 'scheduled' || w.status === 'missed') &&
                    new Date(w.date).toISOString().split('T')[0] === sdKey
                )
              : -1
            const matchIdx = exactIdx >= 0 ? exactIdx : schedule.scheduledWorkouts
              .map((w, i) => ({ w, i }))
              .filter(({ w }) =>
                w.dayLabel === day &&
                (w.status === 'scheduled' || w.status === 'missed') &&
                Math.abs(new Date(w.date).getTime() - skipMs) <= WINDOW_MS
              )
              .sort((a, b) =>
                Math.abs(new Date(a.w.date).getTime() - skipMs) -
                Math.abs(new Date(b.w.date).getTime() - skipMs)
              )[0]?.i ?? -1

            if (matchIdx >= 0) {
              await Schedule.updateOne(
                { userId: payload.userId, programId },
                { $set: { [`scheduledWorkouts.${matchIdx}.status`]: 'skipped' } }
              )
            }
          }
        } catch (scheduleError) {
          console.error('Error syncing schedule for skipped workout:', scheduleError)
        }
      }
    }

    return NextResponse.json({ action, nextDay, nextPhase })

  } catch (error) {
    console.error('Error resolving incomplete workout:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
