import { NextRequest, NextResponse } from 'next/server'
import { verifyToken } from '@/lib/auth'
import dbConnect from '@/lib/mongodb'
import UserProgress from '@/models/UserProgress'
import ProgramModel from '@/models/Program'
import { calculateNextDay } from '@/app/api/programs/current-workout/route'

interface SetData {
  setNumber: number
  reps: number
  weight: number
  completed: boolean
}

interface ExerciseData {
  name: string
  sets: SetData[]
}

interface WorkoutSaveRequest {
  programId: string
  phase: number
  day: string
  exercises: ExerciseData[]
  completed: boolean
  duration?: number
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

    // Find today's date range
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const tomorrow = new Date(today)
    tomorrow.setDate(tomorrow.getDate() + 1)

    // Find workout log for today
    const userProgress = await UserProgress.findOne({ userId: payload.userId }).lean()
    
    if (!userProgress || !userProgress.workoutLogs) {
      return NextResponse.json({ workout: null, isResume: false })
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

    if (!todayWorkout) {
      return NextResponse.json({ workout: null, isResume: false })
    }

    return NextResponse.json({ 
      workout: todayWorkout,
      isResume: !todayWorkout.completed // Resume if workout exists but not completed
    })

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
    const { programId, phase, day, exercises, completed, duration } = body

    if (!programId || phase === undefined || !day) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    await dbConnect()

    // Create workout log entry
    const workoutLog = {
      date: new Date(),
      programId,
      phase,
      day,
      completed,
      duration,
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

    if (existingProgress) {
      // Check if this workout was already marked complete today
      const existingLog = existingProgress.workoutLogs?.find(
        (log: { programId: string; day: string; date: Date; completed: boolean }) => 
          log.programId === programId && 
          log.day === day && 
          log.date >= today && 
          log.date < tomorrow
      )
      const wasAlreadyComplete = existingLog?.completed === true
      
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
      
      // Only increment completedWorkouts if transitioning from incomplete to complete
      if (completed && !wasAlreadyComplete) {
        // Fetch program to calculate next workout day
        const program = await ProgramModel.findOne({ program_id: programId }).lean()
        const { nextDay, nextPhase } = program?.phases 
          ? calculateNextDay(day, phase, program.phases)
          : { nextDay: day, nextPhase: phase }
        
        await UserProgress.updateOne(
          { userId: payload.userId, 'activePrograms.programId': programId },
          {
            $inc: { 'activePrograms.$.completedWorkouts': 1, totalWorkouts: 1 },
            $set: { 
              'activePrograms.$.lastWorkoutDate': new Date(),
              'activePrograms.$.currentPhase': nextPhase,
              'activePrograms.$.currentDay': nextDay
            }
          }
        )
        
        // Check if program is completed
        const userProgress = await UserProgress.findOne({ userId: payload.userId }).lean()
        const activeProgram = userProgress?.activePrograms?.find(
          (p: { programId: string }) => p.programId === programId
        )
        
        if (activeProgram && activeProgram.completedWorkouts >= activeProgram.totalWorkouts) {
          await UserProgress.updateOne(
            { userId: payload.userId, 'activePrograms.programId': programId },
            { $set: { 'activePrograms.$.status': 'completed' } }
          )
        }
      }
    } else {
      // Build update operations
      const updateOps: Record<string, unknown> = {
        $push: { workoutLogs: workoutLog },
        $set: { updatedAt: new Date() }
      }

      // If workout completed, increment total workouts
      if (completed) {
        updateOps.$inc = { totalWorkouts: 1 }
      }

      await UserProgress.updateOne(
        { userId: payload.userId },
        updateOps,
        { upsert: true }
      )

      // Update active program progress if workout completed
      if (completed) {
        // Fetch program to calculate next workout day (reuse if already fetched)
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
              'activePrograms.$.currentDay': nextDay
            }
          }
        )

        // Check if program is completed
        const userProgress = await UserProgress.findOne({ userId: payload.userId }).lean()
        const activeProgram = userProgress?.activePrograms?.find(
          (p: { programId: string }) => p.programId === programId
        )
        
        if (activeProgram && activeProgram.completedWorkouts >= activeProgram.totalWorkouts) {
          await UserProgress.updateOne(
            { userId: payload.userId, 'activePrograms.programId': programId },
            { $set: { 'activePrograms.$.status': 'completed' } }
          )
        }
      }
    }

    return NextResponse.json({ 
      message: 'Workout saved successfully',
      completed
    })

  } catch (error) {
    console.error('Error saving workout:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
