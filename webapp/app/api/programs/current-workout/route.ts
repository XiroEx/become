import { NextRequest, NextResponse } from 'next/server'
import { verifyToken } from '@/lib/auth'
import dbConnect from '@/lib/mongodb'
import UserProgress from '@/models/UserProgress'
import ProgramModel from '@/models/Program'

interface Workout {
  day: string
  title: string
  exercises: Array<{
    name: string
    type: string
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
    const currentDay = activeProgram.currentDay || 'Day 1'
    
    const phaseIdx = Math.max(0, currentPhase - 1)
    const phase = program.phases?.[phaseIdx] as Phase | undefined

    if (!phase) {
      return NextResponse.json({ error: 'Phase not found' }, { status: 404 })
    }

    const workouts = normalizeWorkouts(phase.workouts)
    const currentWorkout = workouts.find(w => w.day === currentDay)

    if (!currentWorkout) {
      // Fallback to first workout of the phase
      const fallbackWorkout = workouts[0]
      if (!fallbackWorkout) {
        return NextResponse.json({ error: 'No workouts found' }, { status: 404 })
      }
      return NextResponse.json({
        workout: fallbackWorkout,
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

    return NextResponse.json({
      workout: currentWorkout,
      phase: currentPhase,
      day: currentDay,
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
