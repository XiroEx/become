import { NextRequest, NextResponse } from 'next/server'
import { verifyAuth } from '@/lib/auth'
import dbConnect from '@/lib/mongodb'
import UserProgress from '@/models/UserProgress'
import ProgramModel from '@/models/Program'
import Schedule from '@/models/Schedule'
import { calculateNextDay } from '@/app/api/programs/current-workout/route'
import { readTzOffsetFromBody, localDateKey, localDayWindowForKey } from '@/lib/dayWindow'

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
      type RawLog = { programId: string; day: string; completed: boolean; date: Date; exercises: Array<{ name: string; sets: Array<{ setNumber: number; reps: number; weight: number; completed: boolean }> }> }
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

        // Sync the schedule slot so the calendar shows 'completed' not 'missed'
        try {
          const schedule = await Schedule.findOne({ userId: payload.userId, programId }).lean<{
            scheduledWorkouts: { date: Date; dayLabel: string; status: string; completedAt?: Date }[]
          }>()
          if (schedule?.scheduledWorkouts?.length) {
            const staleMs = new Date(staleLog.date).getTime()
            const match = schedule.scheduledWorkouts
              .filter((w) => w.dayLabel === day && (w.status === 'scheduled' || w.status === 'missed'))
              .sort((a, b) => Math.abs(new Date(a.date).getTime() - staleMs) - Math.abs(new Date(b.date).getTime() - staleMs))[0]
            if (match) {
              await Schedule.updateOne(
                { userId: payload.userId, programId },
                { $set: { 'scheduledWorkouts.$[elem].status': 'completed', 'scheduledWorkouts.$[elem].completedAt': new Date() } },
                { arrayFilters: [{ 'elem.date': match.date, 'elem.dayLabel': day, 'elem.status': { $in: ['scheduled', 'missed'] } }] }
              )
            }
          }
        } catch (scheduleError) {
          console.error('Error syncing schedule for counted workout:', scheduleError)
        }
      }
    }

    if (action === 'skip') {
      // Find the stale log date before pulling it (needed for schedule slot match)
      const upForSkip = await UserProgress.findOne({ userId: payload.userId }).lean()
      type SkipLog = { programId: string; day: string; completed: boolean; date: Date }
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

      // Sync the schedule slot to 'skipped' so calendar reflects the decision
      if (skipLog) {
        try {
          const schedule = await Schedule.findOne({ userId: payload.userId, programId }).lean<{
            scheduledWorkouts: { date: Date; dayLabel: string; status: string }[]
          }>()
          if (schedule?.scheduledWorkouts?.length) {
            const skipMs = new Date(skipLog.date).getTime()
            const match = schedule.scheduledWorkouts
              .filter((w) => w.dayLabel === day && (w.status === 'scheduled' || w.status === 'missed'))
              .sort((a, b) => Math.abs(new Date(a.date).getTime() - skipMs) - Math.abs(new Date(b.date).getTime() - skipMs))[0]
            if (match) {
              await Schedule.updateOne(
                { userId: payload.userId, programId },
                { $set: { 'scheduledWorkouts.$[elem].status': 'skipped' } },
                { arrayFilters: [{ 'elem.date': match.date, 'elem.dayLabel': day, 'elem.status': { $in: ['scheduled', 'missed'] } }] }
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
