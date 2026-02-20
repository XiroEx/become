import { NextRequest, NextResponse } from 'next/server'
import { verifyToken } from '@/lib/auth'
import dbConnect from '@/lib/mongodb'
import UserProgress from '@/models/UserProgress'
import ProgramModel from '@/models/Program'

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

    const { programId, startDate: startDateStr } = await request.json()
    if (!programId) {
      return NextResponse.json({ error: 'Program ID is required' }, { status: 400 })
    }

    // Accept optional startDate (YYYY-MM-DD string); default to today
    const programStartDate = startDateStr ? new Date(startDateStr + 'T00:00:00.000Z') : new Date()

    await dbConnect()

    // Find the program
    const program = await ProgramModel.findOne({ program_id: programId }).lean()
    if (!program) {
      return NextResponse.json({ error: 'Program not found' }, { status: 404 })
    }

    // Calculate total workouts in the program (workouts per phase × weeks per phase)
    let totalWorkouts = 0
    if (program.phases) {
      for (const phase of program.phases) {
        const workouts = phase.workouts
        const weeksStr = (phase as { weeks?: string }).weeks || '1'
        const weeksMatch = weeksStr.match(/(\d+)\s*[-–]\s*(\d+)/)
        const numWeeks = weeksMatch ? parseInt(weeksMatch[2]) - parseInt(weeksMatch[1]) + 1 : 1
        let workoutsPerWeek = 0
        if (Array.isArray(workouts)) {
          workoutsPerWeek = workouts.length
        } else if (workouts && typeof workouts === 'object') {
          workoutsPerWeek = Object.keys(workouts).length
        }
        totalWorkouts += workoutsPerWeek * numWeeks
      }
    }

    // Check if already enrolled
    const existingProgress = await UserProgress.findOne({
      userId: payload.userId,
      'activePrograms.programId': programId
    })

    if (existingProgress) {
      const activeProgram = existingProgress.activePrograms?.find(
        (p: { programId: string }) => p.programId === programId
      )
      return NextResponse.json({ 
        message: 'Already enrolled in this program',
        alreadyEnrolled: true,
        activeProgram
      })
    }

    // Create or update user progress with new active program
    const activeProgram = {
      programId,
      programName: program.name,
      startDate: programStartDate,
      currentPhase: 1,
      currentDay: 'Day 1',
      completedWorkouts: 0,
      totalWorkouts,
      status: 'in-progress'
    }

    await UserProgress.findOneAndUpdate(
      { userId: payload.userId },
      { 
        $push: { activePrograms: activeProgram },
        $set: { updatedAt: new Date() }
      },
      { upsert: true }
    )

    return NextResponse.json({ 
      message: 'Successfully enrolled in program',
      activeProgram 
    })

  } catch (error) {
    console.error('Error enrolling in program:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
