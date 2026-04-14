import { NextRequest, NextResponse } from 'next/server'
import { verifyToken } from '@/lib/auth'
import dbConnect from '@/lib/mongodb'
import UserProgress from '@/models/UserProgress'
import ProgramModel from '@/models/Program'
import Schedule from '@/models/Schedule'
import { calculateNextDay } from '@/app/api/programs/current-workout/route'
import { recordStreakActivity } from '@/lib/streak'

interface SetData {
  setNumber: number
  reps?: number       // null for time-only exercises
  weight?: number     // null for bodyweight/cardio
  duration?: number   // seconds — for time / intervals / time_distance
  distance?: number   // meters — for time_distance
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
  notes?: string
}

// GET: Fetch today's workout progress for a program
export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization')
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const token = authHeader.split(' ')[1]
    const payload = verifyToken(token)
    if (!payload) {
      return NextResponse.json({ error: 'Invalid token' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const programId = searchParams.get('programId')
    const day = searchParams.get('day')

    if (!programId) {
      return NextResponse.json({ error: 'programId is required' }, { status: 400 })
    }

    await dbConnect()

    const includeHistory = searchParams.get('includeHistory') === 'true'

    // Find today's date range
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const tomorrow = new Date(today)
    tomorrow.setDate(tomorrow.getDate() + 1)

    // Find workout log for today
    const userProgress = await UserProgress.findOne({ userId: payload.userId }).lean()

    if (!userProgress || !userProgress.workoutLogs) {
      return NextResponse.json({ workout: null, isResume: false, exerciseHistory: {} })
    }

    // Build exercise history from past completed workouts (before today)
    let exerciseHistory: Record<string, { weight: number; reps: number; duration?: number; date: string }> = {}
    if (includeHistory) {
      // Get all completed workout logs for this program, sorted newest first
      const pastLogs = userProgress.workoutLogs
        .filter((log: { programId: string; date: Date; completed: boolean }) =>
          log.programId === programId &&
          log.completed &&
          new Date(log.date) < today
        )
        .sort((a: { date: Date }, b: { date: Date }) =>
          new Date(b.date).getTime() - new Date(a.date).getTime()
        )

      // For each exercise, find the most recent completed set with data
      for (const log of pastLogs) {
        for (const exercise of (log.exercises || [])) {
          if (exerciseHistory[exercise.name]) continue // already have most recent

          // Find the best completed set — weighted by type
          type AnySet = { completed: boolean; reps?: number; weight?: number; duration?: number; distance?: number }
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
               logDate < tomorrow
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
    type WorkoutLog = { programId: string; day: string; phase: number; date: Date; completed: boolean; exercises: Array<{ sets: Array<{ completed: boolean }> }> }
    const staleLog = (userProgress.workoutLogs as WorkoutLog[])
      .filter(log =>
        log.programId === programId &&
        !log.completed &&
        new Date(log.date) < today &&
        new Date(log.date) >= staleCutoff
      )
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())[0] ?? null

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
        staleIncomplete
      })
    }

    // No log found for today — return empty so the workout starts fresh
    return NextResponse.json({ workout: null, isResume: false, exerciseHistory, staleIncomplete })

  } catch (error) {
    console.error('Error fetching workout:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization')
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const token = authHeader.split(' ')[1]
    const payload = verifyToken(token)
    if (!payload) {
      return NextResponse.json({ error: 'Invalid token' }, { status: 401 })
    }

    const body: WorkoutSaveRequest = await request.json()
    const { programId, phase, day, exercises, completed, duration, notes } = body

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
      completed,
      duration,
      ...(notes && { notes }),
      exercises
    }

    // Find today's date range for checking if workout already logged today
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const tomorrow = new Date(today)
    tomorrow.setDate(tomorrow.getDate() + 1)

    // Check if workout already logged today for this program/day
    const existingProgress = await UserProgress.findOne({
      userId: payload.userId,
      'workoutLogs': {
        $elemMatch: {
          programId,
          day,
          date: { $gte: today, $lt: tomorrow }
        }
      }
    })

    let wasAlreadyComplete = false

    if (existingProgress) {
      // Check if this workout was already marked complete today
      const existingLog = existingProgress.workoutLogs?.find(
        (log: { programId: string; day: string; date: Date; completed: boolean }) =>
          log.programId === programId &&
          log.day === day &&
          log.date >= today &&
          log.date < tomorrow
      )
      wasAlreadyComplete = existingLog?.completed === true

      // Update existing workout log for today
      await UserProgress.updateOne(
        {
          userId: payload.userId,
          'workoutLogs.programId': programId,
          'workoutLogs.day': day,
          'workoutLogs.date': { $gte: today, $lt: tomorrow }
        },
        {
          $set: {
            'workoutLogs.$.exercises': exercises,
            'workoutLogs.$.completed': completed,
            'workoutLogs.$.duration': duration,
            updatedAt: new Date()
          }
        }
      )
    } else {
      // Build update operations
      const updateOps: Record<string, unknown> = {
        $push: { workoutLogs: workoutLog },
        $set: { updatedAt: new Date() }
      }
      await UserProgress.updateOne(
        { userId: payload.userId },
        updateOps,
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
          scheduledWorkouts: { date: Date; dayLabel: string; status: string }[]
        }>()
        if (schedule?.scheduledWorkouts?.length) {
          const match = schedule.scheduledWorkouts
            .filter((w) => w.dayLabel === day && w.status !== 'completed')
            .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())[0]

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
                    'elem.status': { $ne: 'completed' },
                  },
                ],
              }
            )
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

    // Record streak activity on workout completion
    let streakResult = null
    if (completed) {
      streakResult = await recordStreakActivity(payload.userId, payload.email).catch(() => null)
    }

    return NextResponse.json({
      message: 'Workout saved successfully',
      completed,
      programCompleted,
      ...(programCompleted && { programName }),
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
