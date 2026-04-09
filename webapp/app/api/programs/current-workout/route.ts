import { NextRequest, NextResponse } from 'next/server'
import { verifyToken } from '@/lib/auth'
import dbConnect from '@/lib/mongodb'
import UserProgress from '@/models/UserProgress'
import ProgramModel from '@/models/Program'
import Schedule from '@/models/Schedule'
import { hydrateWorkout } from '@/lib/hydrateExercises'

interface Workout {
  day: string
  title: string
  exercises: Array<{
    exerciseSlug?: string
    name?: string
    type?: string
    sets?: number
    reps?: string
    rest?: string
    details?: string
  }>
}

interface Phase {
  phase: string
  weeks: string
  focus: string
  workouts: Workout[] | Record<string, Omit<Workout, 'day'>>
}

// Helper to normalize workouts from object format to array format
function normalizeWorkouts(workouts: Workout[] | Record<string, Omit<Workout, 'day'>> | undefined | null): Workout[] {
  if (!workouts) {
    return []
  }
  if (Array.isArray(workouts)) {
    return workouts
  }
  // Convert object format { "Day 1": {...}, "Day 2": {...} } to array format
  return Object.entries(workouts).map(([day, workout]) => ({
    day,
    ...workout,
  }))
}

// Calculate the next workout day based on current progress
export function calculateNextDay(
  currentDay: string,
  currentPhase: number,
  phases: Phase[]
): { nextDay: string; nextPhase: number } {
  if (!phases || phases.length === 0) {
    return { nextDay: 'Day 1', nextPhase: 1 }
  }

  const phaseIdx = Math.max(0, currentPhase - 1)
  const phase = phases[phaseIdx]
  
  if (!phase?.workouts) {
    return { nextDay: 'Day 1', nextPhase: 1 }
  }

  const workouts = normalizeWorkouts(phase.workouts)
  const currentDayIdx = workouts.findIndex(w => w.day === currentDay)

  if (currentDayIdx === -1) {
    // Current day not found, start at Day 1
    return { nextDay: workouts[0]?.day || 'Day 1', nextPhase: currentPhase }
  }

  const nextDayIdx = currentDayIdx + 1

  if (nextDayIdx >= workouts.length) {
    // End of phase - check if there's another phase
    const nextPhaseIdx = phaseIdx + 1
    if (nextPhaseIdx < phases.length) {
      const nextPhase = phases[nextPhaseIdx]
      const nextPhaseWorkouts = normalizeWorkouts(nextPhase.workouts)
      return { 
        nextDay: nextPhaseWorkouts[0]?.day || 'Day 1', 
        nextPhase: nextPhaseIdx + 1 
      }
    }
    // Restart from beginning of current phase (program repeating)
    return { nextDay: workouts[0]?.day || 'Day 1', nextPhase: currentPhase }
  }

  return { nextDay: workouts[nextDayIdx].day, nextPhase: currentPhase }
}

// GET: Get the current workout for a user's active program
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
    const requestedDay = searchParams.get('day')

    if (!programId) {
      return NextResponse.json({ error: 'programId is required' }, { status: 400 })
    }

    await dbConnect()

    // Get user's active program
    const userProgress = await UserProgress.findOne({ userId: payload.userId }).lean()

    if (!userProgress?.activePrograms) {
      return NextResponse.json({ error: 'No active programs' }, { status: 404 })
    }

    const activeProgram = userProgress.activePrograms.find(
      (p: { programId: string; status: string }) => 
        p.programId === programId && (p.status === 'in-progress' || p.status === 'active')
    )

    if (!activeProgram) {
      return NextResponse.json({ error: 'Program not active' }, { status: 404 })
    }

    // Get the program details
    const program = await ProgramModel.findOne({ program_id: programId }).lean()

    if (!program) {
      return NextResponse.json({ error: 'Program not found' }, { status: 404 })
    }

    // Get the current day's workout
    const currentPhase = activeProgram.currentPhase || 1
    const phases = (program.phases || []) as Phase[]

    // Always fetch schedule — used for effective-day lookup and accurate count computation
    const schedule = await Schedule.findOne({ userId: payload.userId, programId }).lean()

    // Compute accurate completedWorkouts/totalWorkouts from schedule + workout logs.
    // Historical sessions done before the schedule-sync fix may still show status='scheduled'
    // in the DB, but are confirmed via workout logs.
    type WorkoutLog = { programId: string; day: string; completed: boolean }
    const workoutLogs = (userProgress.workoutLogs || []) as WorkoutLog[]
    let computedCompleted = 0
    let computedTotal = 0
    if (schedule?.scheduledWorkouts?.length) {
      const sessions = (schedule.scheduledWorkouts as Array<{ status: string; dayLabel: string }>).filter(
        (w) => w.status !== 'rest'
      )
      computedTotal = sessions.length
      computedCompleted = sessions.filter((w) => {
        if (w.status === 'completed') return true
        if (w.status === 'skipped') return false
        return workoutLogs.some(
          (log) => log.programId === programId && log.day === w.dayLabel && log.completed
        )
      }).length
    }

    // Determine effective day: if no ?day= param, prefer the next scheduled workout from Schedule
    let effectiveDay: string
    if (!requestedDay) {
      let scheduledDay: string | null = null
      if (schedule?.scheduledWorkouts?.length) {
        const now = new Date()
        const todayKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
        let earliestKey = ''
        for (const w of schedule.scheduledWorkouts) {
          if (w.status !== 'scheduled') continue
          const wKey = typeof w.date === 'string'
            ? (w.date as string).split('T')[0]
            : new Date(w.date as Date).toISOString().split('T')[0]
          if (wKey < todayKey) continue
          if (!scheduledDay || wKey < earliestKey) {
            scheduledDay = w.dayLabel
            earliestKey = wKey
          }
        }
      }
      effectiveDay = scheduledDay ?? (activeProgram.currentDay || 'Day 1')
    } else {
      effectiveDay = requestedDay
    }

    // Helper: apply permanent exercise swaps to a workout before hydration
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const applyPermanentSwaps = (workout: Record<string, any>) => {
      const swaps = activeProgram.exerciseSwaps as Array<{ originalSlug: string; replacementSlug: string }> | undefined
      if (!swaps?.length || !workout.exercises) return workout
      const result = { ...workout, exercises: [...workout.exercises] }
      for (const swap of swaps) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const idx = result.exercises.findIndex((e: any) => e.exerciseSlug === swap.originalSlug)
        if (idx !== -1) {
          result.exercises[idx] = { ...result.exercises[idx], exerciseSlug: swap.replacementSlug }
        }
      }
      return result
    }

    // If a specific day was requested, try to serve that workout (search current phase first, then others)
    if (requestedDay) {
      const preferredPhaseIdx = Math.max(0, currentPhase - 1)
      const preferredPhase = phases[preferredPhaseIdx]
      const preferredWorkouts = normalizeWorkouts(preferredPhase?.workouts)
      const preferredMatch = preferredWorkouts.find(w => w.day === requestedDay)

      if (preferredMatch) {
        const hydratedWorkout = await hydrateWorkout(applyPermanentSwaps({ ...preferredMatch }));
        return NextResponse.json({
          workout: hydratedWorkout,
          phase: preferredPhaseIdx + 1,
          day: preferredMatch.day,
          phaseInfo: {
            name: preferredPhase?.phase,
            focus: preferredPhase?.focus,
            weeks: preferredPhase?.weeks
          },
          completedWorkouts: computedCompleted,
          totalWorkouts: computedTotal
        })
      }

      const anyPhaseIdx = phases.findIndex(phase => normalizeWorkouts(phase.workouts).some(w => w.day === requestedDay))
      if (anyPhaseIdx !== -1) {
        const phase = phases[anyPhaseIdx]
        const workouts = normalizeWorkouts(phase.workouts)
        const requestedWorkout = workouts.find(w => w.day === requestedDay) || workouts[0]
        if (requestedWorkout) {
          const hydratedWorkout = await hydrateWorkout(applyPermanentSwaps({ ...requestedWorkout }));
          return NextResponse.json({
            workout: hydratedWorkout,
            phase: anyPhaseIdx + 1,
            day: requestedWorkout.day,
            phaseInfo: {
              name: phase.phase,
              focus: phase.focus,
              weeks: phase.weeks
            },
            completedWorkouts: activeProgram.completedWorkouts || 0,
            totalWorkouts: activeProgram.totalWorkouts || 0
          })
        }
      }
    }

    const phaseIdx = Math.max(0, currentPhase - 1)
    const phase = phases[phaseIdx] as Phase | undefined

    if (!phase) {
      return NextResponse.json({ error: 'Phase not found' }, { status: 404 })
    }

    const workouts = normalizeWorkouts(phase.workouts)
    const currentWorkout = workouts.find(w => w.day === effectiveDay)

    if (!currentWorkout) {
      // Fallback to first workout of the phase
      const fallbackWorkout = workouts[0]
      if (!fallbackWorkout) {
        return NextResponse.json({ error: 'No workouts found' }, { status: 404 })
      }
      const hydratedFallback = await hydrateWorkout(applyPermanentSwaps({ ...fallbackWorkout }));
      return NextResponse.json({
        workout: hydratedFallback,
        phase: currentPhase,
        day: fallbackWorkout.day,
        phaseInfo: {
          name: phase.phase,
          focus: phase.focus,
          weeks: phase.weeks
        },
        completedWorkouts: activeProgram.completedWorkouts || 0,
        totalWorkouts: activeProgram.totalWorkouts || 0
      })
    }

    const hydratedCurrent = await hydrateWorkout(applyPermanentSwaps({ ...currentWorkout }));
    return NextResponse.json({
      workout: hydratedCurrent,
      phase: currentPhase,
      day: effectiveDay,
      phaseInfo: {
        name: phase.phase,
        focus: phase.focus,
        weeks: phase.weeks
      },
      completedWorkouts: activeProgram.completedWorkouts || 0,
      totalWorkouts: activeProgram.totalWorkouts || 0
    })

  } catch (error) {
    console.error('Error fetching current workout:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
